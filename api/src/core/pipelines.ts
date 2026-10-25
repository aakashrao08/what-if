// The server-side pipelines. Each one chains agents around the seeded engine:
//   Settle It:   Data Scientist (tools) -> engine -> Analyst (facts) -> Narrator <-> Verifier
//   Multiverse:  Dr Football (tools) -> engine (10,000 seasons) -> Analyst -> Narrator <-> Verifier
// Every model step has a deterministic fallback (the rulebook or the template), so a slow or wrong
// model makes the answer plainer, never wrong.

import type { AgentName, AgentStep, AskReply, TranslateReply, TranslateRequest, MultiverseReply, RecapReply, RecapRequest, ScoutReply, ScoutRequest, SettleReply, TakesReply, TraceEvent, Usage } from '../../../src/agents/contract';
import { matchRecap } from '../../../src/agents/recap';
import { finalOf, ripple } from '../../../src/engine/league';
import { deserveExperiment } from '../../../src/engine/settle';
import type { Persona } from '../../../src/agents/format';
import { LANGS, type Lang } from '../../../src/agents/format';
import { factsFromText, verify, type Facts } from '../../../src/agents/verifier';
import type { League } from '../../../src/data/types';
import { computeTimeline, type Timeline } from '../../../src/engine/demo';
import { runJob, type ExperimentSpec } from '../../../src/engine/jobs';
import { designExperiment } from '../../../src/agents/dataScientist';
import { drFootball, type Parsed } from '../../../src/agents/drFootball';
import { universeView, type UniverseStoryVoices } from '../../../src/agents/narrator';
import { experimentSize, passingTemplate, settleText } from '../../../src/agents/settleView';
import { candidates, parseGoal, takesView, type Goal } from '../../../src/agents/takes';
import type { ChatFn } from './model';
import { addUsage, emptyUsage, runAgent } from './loop';
import { PROMPTS } from './prompts';
import { dataScientistTools, drFootballTools, goalTools, routerTools } from './tools';
import { routeQuestion } from '../../../src/agents/router';
import { parseJson, writeVerified } from './write';
import { LruCache, cacheKey } from './guard';

export interface PipelineDeps { league: League; chat: ChatFn; model: string; budgetMs?: number }

const now = () => performance.now();
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

let timelineMemo: Timeline | null = null;
const demoTimeline = (league: League) => (timelineMemo ??= computeTimeline(league));

/** Agent steps for the studio panel, built from what actually happened. */
function stepFrom(agent: AgentName, trace: TraceEvent[], detail: string, status: AgentStep['status'] = 'done'): AgentStep {
  const mine = trace.filter((e) => e.agent === agent);
  return { agent, status, detail, ms: mine.reduce((a, e) => a + e.ms, 0) };
}

function toolLine(trace: TraceEvent[], agent: AgentName): string {
  const calls = trace.filter((e) => e.agent === agent && e.kind === 'tool').map((e) => e.name);
  const counts = new Map<string, number>();
  for (const c of calls) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ');
}

// ---------------- Settle It ----------------

export async function settlePipeline(deps: PipelineDeps, question: string): Promise<SettleReply> {
  const { league, chat } = deps;
  const deadline = now() + (deps.budgetMs ?? 26000);
  const trace: TraceEvent[] = [];
  let usage: Usage = emptyUsage();
  const t0 = now();

  // 1. Data Scientist chooses a test, with the engine and the league data as tools
  let spec: ExperimentSpec | null = null;
  let why = '';
  let refused: string | null = null;
  try {
    const run = await runAgent({
      agent: 'Data Scientist', chat, system: PROMPTS.datascientist, user: `QUESTION: ${question}`,
      tools: dataScientistTools(league, () => demoTimeline(league)), maxRounds: 6, deadline: deadline - 9000
    });
    trace.push(...run.trace); usage = addUsage(usage, run.usage);
    if (run.final?.tool === 'choose_test') ({ spec, why } = run.final.value as { spec: ExperimentSpec; why: string });
    if (run.final?.tool === 'cannot_test') refused = (run.final.value as { reason: string }).reason;
  } catch (err) {
    trace.push({ agent: 'Data Scientist', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
  }
  const rules = designExperiment(league, question);
  if (!spec && rules) {
    // the rulebook can answer it even if the model couldn't (or wouldn't): trust the rulebook
    spec = rules.spec; why = rules.summary;
    trace.push({ agent: 'Data Scientist', kind: 'note', name: 'rulebook', detail: `Used the studio rulebook: ${rules.summary}`, ms: 0 });
  }
  const dsMs = Math.round(now() - t0);
  if (!spec) {
    const reply = refused ?? 'I can’t design a fair test for that one yet. Settle It can test substitutions, tactical changes, penalties, offside and red-card calls, keepers’ records, finishing against xG, what a clearance was worth, who was man of the match, and whether a result was deserved.';
    return { ok: false, reply, steps: [stepFrom('Data Scientist', trace, `No fair test · ${secs(dsMs)}`, 'failed')], trace, usage, model: deps.model };
  }

  // 2. Engine + Analyst: the experiment, then facts and a passing template
  let t = now();
  const experiment = runJob('experiment', spec);
  const tl = demoTimeline(league);
  const template = passingTemplate(league, experiment, spec, tl.moments);
  const analystMs = Math.round(now() - t);
  trace.push({ agent: 'Analyst', kind: 'tool', name: 'facts', detail: `${experimentSize(experiment)} · ${Object.keys(template.facts).length} facts`, ms: analystMs });

  // 3 & 4. Narrator and Verifier
  t = now();
  const written = await writeVerified({
    chat, question, facts: template.facts, deadline,
    task: `Answer the studio question from the experiment. Test run: ${template.test}`,
    format: '{"line": "the one-sentence answer for the presenter", "script": "two or three sentences the presenter reads on air"}',
    template: { line: template.line, script: template.script },
    read: (raw) => {
      const r = raw as { line?: unknown; script?: unknown } | null;
      return r && typeof r.line === 'string' && typeof r.script === 'string' && r.line.length > 8 && r.script.length > 20 ? { line: r.line.trim(), script: r.script.trim() } : null;
    },
    text: (v) => settleText({ ...template, line: v.line, script: v.script })
  }).catch((err) => ({ value: null, drafts: 0, flags: [`Narrator unavailable: ${String(err).slice(0, 120)}`], trace: [] as TraceEvent[], usage: emptyUsage() }));
  trace.push(...written.trace); usage = addUsage(usage, written.usage);
  const writeMs = Math.round(now() - t);
  const checked = Number([...written.trace].reverse().find((e) => e.name === 'numbers')?.detail.match(/^(\d+) numbers/)?.[1] ?? 0);

  const tools = toolLine(trace, 'Data Scientist');
  const steps: AgentStep[] = [
    stepFrom('Data Scientist', trace, `${why || 'Chose a test'} · ${tools ? `${tools} · ` : ''}${secs(dsMs)}`),
    stepFrom('Analyst', trace, `Read the results · ${experimentSize(experiment)} · ${plural(Object.keys(template.facts).length, 'fact')}`),
    stepFrom('Narrator', trace, written.value ? `Wrote the answer · ${plural(written.drafts, 'draft')} · ${secs(writeMs)}` : 'Kept the house template'),
    stepFrom('Verifier', trace,
      written.value ? (written.drafts > 1 ? `Sent back ${plural(written.drafts - 1, 'draft')} · passed draft ${written.drafts}` : `${plural(checked, 'number')} checked + football sense · passed`) : `Rejected every live draft · template shown`,
      written.drafts > 1 || !written.value ? 'flagged' : 'done')
  ];
  return {
    ok: true, spec, summary: why, line: written.value?.line ?? null, script: written.value?.script ?? null,
    drafts: written.drafts, flags: written.flags, steps, trace, usage, model: deps.model
  };
}

// ---------------- Multiverse ----------------

const VOICES = ['back', 'report', 'analyst'] as const;
const storyText = (s: UniverseStoryVoices) => VOICES.map((v) => `${s[v].head} ${s[v].sub}`).join(' ');

export async function multiversePipeline(deps: PipelineDeps, question: string): Promise<MultiverseReply> {
  const { league, chat } = deps;
  const deadline = now() + (deps.budgetMs ?? 26000);
  const trace: TraceEvent[] = [];
  let usage: Usage = emptyUsage();
  const t0 = now();

  // 1. Dr Football reads the question, looking names up and checking the sentence with the simulator
  let picked: { sentence: string; parsed: Parsed } | null = null;
  let refused: string | null = null;
  try {
    const run = await runAgent({ agent: 'Dr Football', chat, system: PROMPTS.drfootball, user: `FAN: ${question}`, tools: drFootballTools(league), maxRounds: 6, deadline: deadline - 9000 });
    trace.push(...run.trace); usage = addUsage(usage, run.usage);
    if (run.final?.tool === 'submit_scenario') picked = run.final.value as { sentence: string; parsed: Parsed };
    if (run.final?.tool === 'reject_scenario') refused = (run.final.value as { reason: string }).reason;
  } catch (err) {
    trace.push({ agent: 'Dr Football', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
  }
  const rules = drFootball(league, question);
  if (!picked && rules.ok) {
    picked = { sentence: question, parsed: rules };
    trace.push({ agent: 'Dr Football', kind: 'note', name: 'rulebook', detail: 'Read it with the rulebook', ms: 0 });
  }
  const dfMs = Math.round(now() - t0);
  if (!picked) {
    const reply = refused ?? (rules.ok ? '' : rules.reply);
    return { ok: false, reply, steps: [stepFrom('Dr Football', trace, `Rejected the scenario · ${secs(dfMs)}`, 'failed')], trace, usage, model: deps.model };
  }
  const { parsed, sentence } = picked;

  // 2. Engine: the same seeded universe the browser will run
  let t = now();
  const result = runJob('universe', { levers: parsed.levers });
  const simMs = Math.round(now() - t);
  trace.push({ agent: 'Data Scientist', kind: 'tool', name: 'universe', detail: `${result.n.toLocaleString('en-GB')} seasons × 2 · ${plural(result.replayedMatches, 'played match')} replayed`, ms: simMs });

  // 3. Analyst + Narrator + Verifier
  const view = universeView(league, result, parsed);
  t = now();
  const voice = { type: 'object', head: 'string', sub: 'string' };
  const written = await writeVerified({
    chat, question, facts: view.facts, deadline,
    task: `Write the alternate season "${parsed.short}" for ${view.focusName} in three voices: "back" (a back-page headline and one-line standfirst), "report" (a news report headline and sentence), "analyst" (numbers first, plain).`,
    format: `{"back": ${JSON.stringify(voice)}, "report": ${JSON.stringify(voice)}, "analyst": ${JSON.stringify(voice)}} with real strings in head and sub`,
    template: view.story,
    read: (raw) => {
      const r = raw as Record<string, { head?: unknown; sub?: unknown }> | null;
      if (!r || !VOICES.every((v) => typeof r[v]?.head === 'string' && typeof r[v]?.sub === 'string' && (r[v].head as string).length > 3)) return null;
      return Object.fromEntries(VOICES.map((v) => [v, { head: String(r[v].head).trim(), sub: String(r[v].sub).trim() }])) as unknown as UniverseStoryVoices;
    },
    text: storyText
  }).catch((err) => ({ value: null, drafts: 0, flags: [`Narrator unavailable: ${String(err).slice(0, 120)}`], trace: [] as TraceEvent[], usage: emptyUsage() }));
  trace.push(...written.trace); usage = addUsage(usage, written.usage);
  const writeMs = Math.round(now() - t);

  const tools = toolLine(trace, 'Dr Football');
  const steps: AgentStep[] = [
    stepFrom('Dr Football', trace, `Read ${plural(parsed.levers.length, 'change')}${tools ? ` · ${tools}` : ''} · ${secs(dfMs)}`),
    stepFrom('Data Scientist', trace, `${result.n.toLocaleString('en-GB')} seasons · ${secs(simMs)}`),
    stepFrom('Narrator', trace, written.value ? `Three versions · ${plural(written.drafts, 'draft')} · ${secs(writeMs)}` : 'Kept the house template'),
    stepFrom('Verifier', trace, written.value ? (written.drafts > 1 ? `Sent back ${plural(written.drafts - 1, 'draft')} · passed draft ${written.drafts}` : 'Every number + football sense · passed') : 'Rejected every live draft · template shown', written.drafts > 1 || !written.value ? 'flagged' : 'done')
  ];
  return { ok: true, sentence, levers: parsed.levers, story: written.value, drafts: written.drafts, flags: written.flags, steps, trace, usage, model: deps.model };
}

// ---------------- What would it take? ----------------

export async function takesPipeline(deps: PipelineDeps, question: string, body: { club?: unknown } = {}): Promise<TakesReply> {
  const { league, chat } = deps;
  const deadline = now() + (deps.budgetMs ?? 26000);
  const trace: TraceEvent[] = [];
  let usage: Usage = emptyUsage();
  const t0 = now();
  const myClub = typeof body.club === 'string' && league.clubs.some((c) => c.code === body.club) ? body.club : undefined;

  // 1. Dr Football pins down the club and the goal
  let goal: Goal | null = null;
  let refused: string | null = null;
  try {
    const run = await runAgent({ agent: 'Dr Football', chat, system: PROMPTS.goal, user: `FAN: ${question}${myClub ? `\nMY CLUB: ${myClub}` : ''}`, tools: goalTools(league), maxRounds: 4, deadline: deadline - 12000 });
    trace.push(...run.trace); usage = addUsage(usage, run.usage);
    if (run.final?.tool === 'submit_goal') goal = run.final.value as Goal;
    if (run.final?.tool === 'reject_goal') refused = (run.final.value as { reason: string }).reason;
  } catch (err) {
    trace.push({ agent: 'Dr Football', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
  }
  const rules = parseGoal(league, question, myClub);
  if (!goal && !refused && !('error' in rules)) {
    goal = rules;
    trace.push({ agent: 'Dr Football', kind: 'note', name: 'rulebook', detail: 'Read the goal with the rulebook', ms: 0 });
  }
  const dfMs = Math.round(now() - t0);
  if (!goal) {
    const reply = refused ?? ('error' in rules ? rules.error : 'Name a club and a goal.');
    return { ok: false, reply, steps: [stepFrom('Dr Football', trace, `No goal to search · ${secs(dfMs)}`, 'failed')], trace, usage, model: deps.model };
  }

  // 2. Engine: the same search the browser runs
  let t = now();
  const phrased = candidates(league, goal);
  const result = runJob('takes', { club: goal.club, race: goal.race, candidates: phrased.map(({ id, levers, cost, tag }) => ({ id, levers, cost, tag })) });
  const simMs = Math.round(now() - t);
  trace.push({ agent: 'Data Scientist', kind: 'tool', name: 'search', detail: `${phrased.length} changes · ${result.screened} universes · ${plural(result.options.length, 'route')} confirmed`, ms: simMs });

  // 3. Narrator and Verifier
  const view = takesView(league, result, phrased);
  t = now();
  const text = (v: { head: string; sub: string }) => [view.goalLine, v.head, v.sub, ...view.rows.map((r) => r.short)].join(' ');
  const written = await writeVerified({
    chat, question, facts: view.facts, deadline,
    task: `Explain what it would take. ${view.goalLine} Routes found (label, chance %, reaches target): ${view.rows.map((r) => `${r.short} ${r.p}% ${r.reaches ? 'yes' : 'no'}`).join('; ') || 'none'}.`,
    format: '{"head": "a short headline naming the smallest change that works (or that nothing does)", "sub": "two sentences: the numbers, and the points yardstick if FACTS has points"}',
    template: { head: view.head, sub: view.sub },
    read: (raw) => { const r = raw as { head?: unknown; sub?: unknown } | null; return r && typeof r.head === 'string' && typeof r.sub === 'string' && r.head.length > 3 && r.sub.length > 20 ? { head: r.head.trim(), sub: r.sub.trim() } : null; },
    text
  }).catch((err) => ({ value: null, drafts: 0, flags: [`Narrator unavailable: ${String(err).slice(0, 120)}`], trace: [] as TraceEvent[], usage: emptyUsage() }));
  trace.push(...written.trace); usage = addUsage(usage, written.usage);
  const writeMs = Math.round(now() - t);

  const tools = toolLine(trace, 'Dr Football');
  const steps: AgentStep[] = [
    stepFrom('Dr Football', trace, `Read the goal${tools ? ` · ${tools}` : ''} · ${secs(dfMs)}`),
    stepFrom('Data Scientist', trace, `${result.screened} universes searched · ${secs(simMs)}`),
    stepFrom('Narrator', trace, written.value ? `Wrote the answer · ${plural(written.drafts, 'draft')} · ${secs(writeMs)}` : 'Kept the house template'),
    stepFrom('Verifier', trace, written.value ? (written.drafts > 1 ? `Sent back ${plural(written.drafts - 1, 'draft')} · passed draft ${written.drafts}` : 'Every number + football sense · passed') : 'Rejected every live draft · template shown', written.drafts > 1 || !written.value ? 'flagged' : 'done')
  ];
  return { ok: true, goal, story: written.value, drafts: written.drafts, flags: written.flags, steps, trace, usage, model: deps.model };
}

// ---------------- Scout ----------------

/** Everything the browser sends, checked: the Scout only ever writes from facts of the right shape. */
export function readScout(body: unknown, league: League): ScoutRequest | { error: string } {
  const b = body as Partial<ScoutRequest> | null;
  if (!b || !LANGS.some((l) => l.id === b.lang)) return { error: 'Unknown language.' };
  if (typeof b.club !== 'string' || !league.clubs.some((c) => c.code === b.club)) return { error: 'Unknown club.' };
  if (!Array.isArray(b.alerts) || b.alerts.length === 0 || b.alerts.length > 12) return { error: 'Send 1 to 12 alerts.' };
  const alerts: ScoutRequest['alerts'] = [];
  for (const a of b.alerts) {
    if (!a || typeof a.key !== 'string' || a.key.length > 80 || typeof a.type !== 'string' || typeof a.template !== 'string' || a.template.length > 300) return { error: 'Bad alert.' };
    const facts = Object.entries(a.facts ?? {});
    if (facts.length > 16 || !facts.every(([k, v]) => k.length <= 20 && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length <= 160)))) return { error: 'Bad facts.' };
    alerts.push({ key: a.key, type: a.type.slice(0, 12), facts: Object.fromEntries(facts), template: a.template });
  }
  return { lang: b.lang!, fan: b.fan === true, club: b.club, alerts };
}

export async function scoutPipeline(deps: PipelineDeps, req: ScoutRequest): Promise<ScoutReply> {
  const { chat } = deps;
  const deadline = now() + (deps.budgetMs ?? 20000);
  const trace: TraceEvent[] = [];
  const usage = emptyUsage();
  const lang = req.lang as Lang;
  const texts: Record<string, string> = {};
  const feedback: Record<string, string[]> = {};
  const flags: string[] = [];
  let drafts = 0;
  for (let d = 1; d <= 3 && now() < deadline; d++) {
    const todo = req.alerts.filter((a) => !texts[a.key]);
    if (!todo.length) break;
    drafts = d;
    const fb = todo.filter((a) => feedback[a.key]?.length).map((a) => `${a.key}: ${feedback[a.key].join('; ')}`);
    const user = [
      `LANG: ${lang}`, `VOICE: ${req.fan ? 'fan' : 'neutral'}`, `MY CLUB: ${req.club}`,
      `ALERTS: ${JSON.stringify(todo.map((a) => ({ key: a.key, type: a.type, facts: a.facts, template: a.template })))}`,
      fb.length ? `FEEDBACK: ${fb.join(' | ')}` : ''
    ].filter(Boolean).join('\n');
    const t = now();
    let res;
    try {
      res = await chat([{ role: 'system', content: PROMPTS.scout }, { role: 'user', content: user }], { json: true, maxTokens: 120 + 70 * todo.length, temperature: 0.5 });
    } catch (err) {
      trace.push({ agent: 'Scout', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
      break;
    }
    usage.calls++; usage.promptTokens += res.usage.prompt; usage.completionTokens += res.usage.completion;
    const got = (parseJson(res.message.content) as { alerts?: { key?: unknown; text?: unknown }[] } | null)?.alerts ?? [];
    trace.push({ agent: 'Scout', kind: 'model', name: `draft ${d}`, detail: `wrote ${got.length} of ${todo.length} alerts`, ms: Math.round(now() - t), tokens: res.usage.prompt + res.usage.completion });
    let passed = 0;
    for (const a of todo) {
      const text = got.find((g) => g.key === a.key)?.text;
      if (typeof text !== 'string' || text.length < 8 || text.length > 260) { feedback[a.key] = ['missing or the wrong length']; continue; }
      const v = verify(text, a.facts as Facts, lang);
      if (v.ok) { texts[a.key] = text.trim(); passed++; } else { feedback[a.key] = v.issues.map((i) => i.detail); flags.push(...v.issues.map((i) => `${a.key}: ${i.detail}`)); }
    }
    trace.push({ agent: 'Verifier', kind: 'check', name: 'numbers', detail: `${passed} of ${todo.length} passed`, ms: 0 });
  }
  const n = Object.keys(texts).length;
  const steps: AgentStep[] = [
    stepFrom('Scout', trace, `Wrote ${n} of ${plural(req.alerts.length, 'alert')} in ${lang} · ${plural(drafts, 'draft')}`, n ? 'done' : 'failed'),
    stepFrom('Verifier', trace, `Checked every number · ${req.alerts.length - n} kept as templates`, req.alerts.length - n ? 'flagged' : 'done')
  ];
  return { ok: true, texts, drafts, flags, steps, trace, usage, model: deps.model };
}

// ---------------- Match recap ----------------

const LANG_NAME: Record<string, string> = { en: 'English', zh: 'Simplified Chinese', ms: 'Malay', ta: 'Tamil', hi: 'Hindi', es: 'Spanish', pt: 'Portuguese' };

export function readRecap(body: unknown, league: League): RecapRequest | { error: string } {
  const b = body as Partial<RecapRequest> | null;
  if (!b || !league.feeds.some((f) => f.fixtureId === b.fixtureId)) return { error: 'Unknown match.' };
  if (!['casual', 'home', 'away', 'analyst'].includes(String(b.persona))) return { error: 'Unknown persona.' };
  if (!LANG_NAME[String(b.lang)]) return { error: 'Unknown language.' };
  return { fixtureId: b.fixtureId!, persona: b.persona!, lang: b.lang! };
}

/** The recap built from the server's own engine run (never from the browser's numbers), rewritten by the Narrator in the reader's language. */
export async function recapPipeline(deps: PipelineDeps, req: RecapRequest): Promise<RecapReply> {
  const { league, chat } = deps;
  const deadline = now() + (deps.budgetMs ?? 24000);
  const trace: TraceEvent[] = [];
  let usage: Usage = emptyUsage();
  const feed = league.feeds.find((f) => f.fixtureId === req.fixtureId)!;
  let t = now();
  const tl = feed.fixtureId === league.demo.fixtureId ? demoTimeline(league) : computeTimeline(league, feed);
  const rip = ripple(league, finalOf(feed), undefined, feed.fixtureId);
  const d = deserveExperiment(league, undefined, undefined, feed);
  const template = matchRecap(league, feed, tl, rip, d, req.persona as Persona);
  trace.push({ agent: 'Analyst', kind: 'tool', name: 'recap facts', detail: `timeline, ${rip.n.toLocaleString('en-GB')} run-ins, ${d.n.toLocaleString('en-GB')} shot replays · ${plural(Object.keys(template.facts).length, 'fact')}`, ms: Math.round(now() - t) });
  t = now();
  const lang = req.lang as Lang;
  const shape = { headline: template.headline, paragraphs: template.paragraphs };
  const written = await writeVerified({
    chat, facts: template.facts, deadline, lang,
    task: `Write the full-time match recap in ${LANG_NAME[lang]}, ${req.persona === 'home' || req.persona === 'away' ? 'as a fan of the side the template calls "we"' : req.persona === 'analyst' ? 'for an analyst: precise, numbers first' : 'for a casual fan: plain and lively'}. Keep the template's facts and its verdicts; four short paragraphs: the goals, the moment that mattered, whether it was deserved, what it means for both seasons.`,
    format: `{"headline": "short headline", "paragraphs": ["${template.paragraphs.length} strings, one per paragraph"]}`,
    template: shape,
    read: (raw) => {
      const r = raw as { headline?: unknown; paragraphs?: unknown } | null;
      return r && typeof r.headline === 'string' && Array.isArray(r.paragraphs) && r.paragraphs.length >= 3 && r.paragraphs.every((x) => typeof x === 'string' && x.length > 20)
        ? { headline: r.headline.trim(), paragraphs: (r.paragraphs as string[]).map((x) => x.trim()) } : null;
    },
    text: (v) => [v.headline, ...v.paragraphs].join(' ')
  }).catch((err) => ({ value: null, drafts: 0, flags: [`Narrator unavailable: ${String(err).slice(0, 120)}`], trace: [] as TraceEvent[], usage: emptyUsage() }));
  trace.push(...written.trace); usage = addUsage(usage, written.usage);
  const steps: AgentStep[] = [
    stepFrom('Analyst', trace, `Read the match · ${plural(Object.keys(template.facts).length, 'fact')}`),
    stepFrom('Narrator', trace, written.value ? `Wrote the recap in ${LANG_NAME[lang]} · ${plural(written.drafts, 'draft')} · ${secs(Math.round(now() - t))}` : 'Kept the house recap'),
    stepFrom('Verifier', trace, written.value ? 'Every number + football sense · passed' : 'Rejected every live draft · house recap shown', written.value ? 'done' : 'flagged')
  ];
  return { ok: true, headline: written.value?.headline ?? null, paragraphs: written.value?.paragraphs ?? null, drafts: written.drafts, flags: written.flags, steps, trace, usage, model: deps.model };
}

// ---------------- Ask What If ----------------

/** The router agent picks the team for a free-form question; the rulebook steps in if the model can't. */
export async function askPipeline(deps: PipelineDeps, question: string): Promise<AskReply> {
  const { league, chat } = deps;
  const trace: TraceEvent[] = [];
  let usage: Usage = emptyUsage();
  const t0 = now();
  let route: { to: string; q?: string; club?: string; why: string } | null = null;
  try {
    const run = await runAgent({ agent: 'Router', chat, system: PROMPTS.router, user: `FAN: ${question}`, tools: routerTools(league, dataScientistTools(league, () => demoTimeline(league))), maxRounds: 4, deadline: now() + 12000 });
    trace.push(...run.trace); usage = addUsage(usage, run.usage);
    if (run.final?.tool === 'route_to') route = run.final.value as typeof route;
  } catch (err) {
    trace.push({ agent: 'Router', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
  }
  if (!route) {
    route = routeQuestion(league, question);
    if (route) trace.push({ agent: 'Router', kind: 'note', name: 'rulebook', detail: 'Routed with the rulebook', ms: 0 });
  }
  const ms = Math.round(now() - t0);
  if (!route) return { ok: false, reply: 'I can’t tell which part of the app answers that. Try a question about a match, a what-if, or the table.', steps: [stepFrom('Router', trace, `No route · ${secs(ms)}`, 'failed')], trace, usage, model: deps.model };
  const tools = toolLine(trace, 'Router');
  return { ok: true, route: route as Extract<AskReply, { ok: true }>['route'], steps: [stepFrom('Router', trace, `Handed to ${route.to}${tools ? ` · ${tools}` : ''} · ${secs(ms)}`)], trace, usage, model: deps.model };
}

// ---------------- Translation ----------------

export function readTranslate(body: unknown): TranslateRequest | { error: string } {
  const b = body as Partial<TranslateRequest> | null;
  if (!b || !LANGS.some((l) => l.id === b.lang) || b.lang === 'en') return { error: 'Unknown language.' };
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 40) return { error: 'Send 1 to 40 items.' };
  const items: TranslateRequest['items'] = [];
  for (const it of b.items) {
    if (!it || typeof it.key !== 'string' || it.key.length > 64 || typeof it.text !== 'string' || !it.text.trim() || it.text.length > 800) return { error: 'Bad item.' };
    items.push({ key: it.key, text: it.text });
  }
  return { lang: b.lang!, items };
}

const translations = new LruCache<string>(4000); // line by line, so a line is only ever translated once per language

/** Batch translation by the Narrator, every line checked: it may contain only the numbers its English source has. */
export async function translatePipeline(deps: PipelineDeps, req: TranslateRequest): Promise<TranslateReply> {
  const { chat } = deps;
  const lang = req.lang as Lang;
  const trace: TraceEvent[] = [];
  const usage = emptyUsage();
  const texts: Record<string, string> = {};
  const lineKey = (text: string) => cacheKey('tr', deps.model, lang, text);
  for (const it of req.items) { const hit = translations.get(lineKey(it.text)); if (hit) texts[it.key] = hit; }
  const feedback: Record<string, string[]> = {};
  for (let round = 1; round <= 2; round++) {
    const todo = req.items.filter((it) => !texts[it.key]);
    if (!todo.length) break;
    const fb = todo.filter((it) => feedback[it.key]).map((it) => `${it.key}: ${feedback[it.key].join('; ')}`);
    const t = now();
    let res;
    try {
      res = await chat([{ role: 'system', content: PROMPTS.translator }, { role: 'user', content: [`LANG: ${LANG_NAME[lang]} (${lang})`, `ITEMS: ${JSON.stringify(todo.map((it) => ({ key: it.key, text: it.text })))}`, fb.length ? `FEEDBACK: ${fb.join(' | ')}` : ''].filter(Boolean).join('\n') }], { json: true, maxTokens: Math.min(4000, 200 + todo.reduce((a, it) => a + it.text.length, 0)), temperature: 0.2 });
    } catch (err) {
      trace.push({ agent: 'Narrator', kind: 'note', name: 'model error', detail: String(err).slice(0, 160), ms: 0 });
      break;
    }
    usage.calls++; usage.promptTokens += res.usage.prompt; usage.completionTokens += res.usage.completion;
    const got = (parseJson(res.message.content) as { items?: { key?: unknown; text?: unknown }[] } | null)?.items ?? [];
    let passed = 0;
    for (const it of todo) {
      const text = got.find((g) => g.key === it.key)?.text;
      if (typeof text !== 'string' || !text.trim()) { feedback[it.key] = ['missing']; continue; }
      const v = verify(text, factsFromText(it.text), lang);
      if (v.ok) { texts[it.key] = text.trim(); translations.set(lineKey(it.text), text.trim()); passed++; } else feedback[it.key] = v.issues.map((i) => i.detail);
    }
    trace.push({ agent: 'Narrator', kind: 'model', name: `translation ${round}`, detail: `${passed} of ${todo.length} lines passed the Verifier`, ms: Math.round(now() - t), tokens: res.usage.prompt + res.usage.completion });
  }
  const n = Object.keys(texts).length;
  return { ok: true, texts, steps: [stepFrom('Narrator', trace, `Translated ${n} of ${plural(req.items.length, 'line')} into ${LANG_NAME[lang]}`, n ? 'done' : 'failed')], trace, usage, model: deps.model };
}
