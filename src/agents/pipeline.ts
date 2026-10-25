// How the agents work together. Each pipeline: Data Scientist (what to simulate) -> engine ->
// Analyst (facts and context) -> Narrator (draft) -> Verifier (numbers + football sense),
// looping back to the Narrator when the Verifier objects.

import type { League } from '../data/types';
import type { Timeline } from '../engine/demo';
import { cached, run } from '../engine/client';
import type { Experiment } from '../engine/settle';
import { designExperiment, specProblem } from './dataScientist';
import { drFootball, type Parsed, type Rejected } from './drFootball';
import { askAgents, LIVE } from './live';
import { universeView, type SettleView, type UniverseView } from './narrator';
import { experimentSize, passingTemplate, settleText, settleViewFor } from './settleView';
import type { AgentStep, MultiverseReply, SettleReply, TakesReply, TraceEvent } from './contract';
import { candidates, parseGoal, takesView, type Goal, type TakesView } from './takes';
import type { TakesResult } from '../engine/takes';
import { verify, type Verdict } from './verifier';
import type { UniverseResult } from '../engine/league';

export type { AgentName, AgentStep, TraceEvent } from './contract';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
/** Keeps each step on screen long enough to read; the time shown is the real one. */
const pace = (start: number, min = 420) => new Promise((r) => setTimeout(r, Math.max(0, min - (now() - start))));

export { swingCard, ghostCard, reel, type SwingCard, type GhostCard, type ReelItem } from './cards';

// ---------------- Settle It ----------------

export interface SettleResult { ok: true; question: string; view: SettleView; experiment: Experiment; drafts: number; flags: string[]; steps: AgentStep[]; trace?: TraceEvent[]; live?: boolean }
export interface SettleFail { ok: false; question: string; reply: string; steps: AgentStep[]; trace?: TraceEvent[] }

const NO_TEST = 'I can’t design a fair test for that one yet. Settle It can test substitutions, tactical changes, penalties, offside and red-card calls, keepers’ records, finishing against xG, what a clearance was worth, who was man of the match, and whether a result was deserved.';

/**
 * Live mode asks the agent backend first: a Data Scientist with engine tools picks the test, and a
 * Narrator and Verifier loop writes the answer on the server. The browser re-runs the same seeded
 * experiment, so the facts match exactly, and checks the text again. Any failure drops to the
 * template pipeline below.
 */
export async function settleIt(league: League, tl: Timeline, question: string, onStep: (steps: AgentStep[]) => void, opts: { live?: boolean } = {}): Promise<SettleResult | SettleFail> {
  if (LIVE && opts.live !== false) {
    onStep([
      { agent: 'Data Scientist', status: 'working', detail: 'Choosing a test with the engine…', ms: 0 },
      { agent: 'Analyst', status: 'working', detail: 'Waiting', ms: 0 },
      { agent: 'Narrator', status: 'working', detail: 'Waiting', ms: 0 },
      { agent: 'Verifier', status: 'working', detail: 'Waiting', ms: 0 }
    ]);
    const reply = await askAgents<SettleReply>('settle', { question });
    if (reply && !reply.ok) { onStep(reply.steps); return { ok: false, question, reply: reply.reply, steps: reply.steps, trace: reply.trace }; }
    if (reply?.ok && !specProblem(league, reply.spec)) {
      const experiment = await run('experiment', reply.spec);
      let view = passingTemplate(league, experiment, reply.spec, tl.moments);
      const flags = [...reply.flags];
      if (reply.line && reply.script) {
        const written = { ...view, line: reply.line, script: reply.script };
        const check = verify(settleText(written), written.facts);
        if (check.ok) view = written;
        else flags.push(...check.issues.map((i) => `In the browser: ${i.detail}`));
      }
      onStep(reply.steps);
      return { ok: true, question, view, experiment, drafts: reply.drafts, flags, steps: reply.steps, trace: reply.trace, live: true };
    }
  }
  return settleLocal(league, tl, question, onStep);
}

async function settleLocal(league: League, tl: Timeline, question: string, onStep: (steps: AgentStep[]) => void): Promise<SettleResult | SettleFail> {
  const steps: AgentStep[] = [
    { agent: 'Data Scientist', status: 'working', detail: 'Designing the test…', ms: 0 },
    { agent: 'Analyst', status: 'working', detail: 'Waiting', ms: 0 },
    { agent: 'Narrator', status: 'working', detail: 'Waiting', ms: 0 },
    { agent: 'Verifier', status: 'working', detail: 'Waiting', ms: 0 }
  ];
  const emit = () => onStep(steps.map((s) => ({ ...s })));
  emit();

  // 1. Data Scientist: design and run the experiment
  let t = now();
  const design = designExperiment(league, question);
  if (!design) {
    steps[0] = { agent: 'Data Scientist', status: 'failed', detail: 'No test fits this question', ms: now() - t };
    emit();
    return { ok: false, question, reply: NO_TEST, steps };
  }
  const experiment = await run('experiment', design.spec);
  await pace(t);
  steps[0] = { agent: 'Data Scientist', status: 'done', detail: `${design.summary} · ${experimentSize(experiment)} · ${secs(now() - t)}`, ms: now() - t };
  steps[1].detail = 'Reading the results…';
  emit();

  // 2. Analyst: facts (inside the view builders) and context
  t = now();
  const build = (draft: number) => settleViewFor(league, experiment, design.spec, tl.moments, draft);
  let view = build(1);
  await pace(t);
  steps[1] = { agent: 'Analyst', status: 'done', detail: `Read the results · ${Object.keys(view.facts).length} facts · ${secs(now() - t)}`, ms: now() - t };
  steps[2].detail = 'Writing the answer…';
  emit();

  // 3 & 4. Narrator drafts, Verifier checks, until it passes (max 3 drafts)
  const flags: string[] = [];
  let drafts = 0;
  let verdict: Verdict = { ok: false, checked: 0, issues: [] };
  const tN = now();
  for (let d = 1; d <= 3; d++) {
    drafts = d;
    t = now();
    view = build(d);
    steps[2] = { agent: 'Narrator', status: 'done', detail: `Wrote the answer and script · ${d} draft${d > 1 ? 's' : ''}`, ms: now() - tN };
    steps[3].detail = 'Checking every number…';
    emit();
    await pace(t, 300);
    t = now();
    verdict = verify(settleText(view), view.facts);
    if (verdict.ok) break;
    flags.push(...verdict.issues.map((i) => i.detail));
  }
  await pace(t, 300);
  steps[3] = {
    agent: 'Verifier', status: drafts > 1 ? 'flagged' : 'done',
    detail: drafts > 1 ? `Flagged draft 1 · passed draft ${drafts} · ${verdict.checked} numbers checked` : `${verdict.checked} numbers checked · passed · ${secs(now() - t)}`,
    ms: now() - t
  };
  emit();
  return { ok: true, question, view, experiment, drafts, flags, steps };
}

// ---------------- Multiverse ----------------

export interface MultiverseResult { ok: true; parsed: Parsed; result: UniverseResult; view: UniverseView; verdict: Verdict; steps: AgentStep[]; trace?: TraceEvent[]; live?: boolean }
export interface MultiverseFail { ok: false; rejected: Rejected; steps: AgentStep[]; trace?: TraceEvent[] }

const storyText = (v: UniverseView) => [v.story.back.head, v.story.back.sub, v.story.report.head, v.story.report.sub, v.story.analyst.head, v.story.analyst.sub].join(' ');

export async function multiverse(league: League, prompt: string, onProgress: (done: number) => void, onStep?: (s: AgentStep[]) => void): Promise<MultiverseResult | MultiverseFail> {
  const steps: AgentStep[] = [];
  let t = now();
  let parsed = drFootball(league, prompt);
  // live: Dr Football reads the question with tools while the browser starts on anything the rulebook already understands
  const pending = LIVE ? askAgents<MultiverseReply>('multiverse', { question: prompt }) : null;
  let reply: MultiverseReply | null = null;
  if (!parsed.ok && pending) {
    reply = await pending;
    if (reply?.ok) parsed = drFootball(league, reply.sentence);
    else if (reply && !reply.ok) return { ok: false, rejected: { ok: false, reply: reply.reply, suggestions: parsed.suggestions }, steps: reply.steps, trace: reply.trace };
  }
  steps.push({ agent: 'Dr Football', status: parsed.ok ? 'done' : 'failed', detail: parsed.ok ? `Read ${parsed.levers.length} change${parsed.levers.length > 1 ? 's' : ''}` : 'Rejected the scenario', ms: now() - t });
  onStep?.(steps);
  if (!parsed.ok) return { ok: false, rejected: parsed, steps };

  t = now();
  const result = await run('universe', { levers: parsed.levers }, onProgress);
  steps.push({ agent: 'Data Scientist', status: 'done', detail: `${result.n.toLocaleString('en-GB')} seasons · ${secs(now() - t)}`, ms: now() - t });
  t = now();
  let view = universeView(league, result, parsed);
  let live = false;
  if (pending) {
    reply = reply ?? await pending;
    // use the live story only if the server played out the same universe and the browser agrees with every number
    if (reply?.ok && reply.story && JSON.stringify(reply.levers) === JSON.stringify(parsed.levers)) {
      const written = { ...view, story: reply.story };
      if (verify(storyText(written), written.facts).ok) { view = written; live = true; }
    }
  }
  const verdict = verify(storyText(view), view.facts);
  if (reply?.ok && live) {
    onStep?.(reply.steps);
    return { ok: true, parsed, result, view, verdict, steps: reply.steps, trace: reply.trace, live };
  }
  steps.push({ agent: 'Narrator', status: 'done', detail: 'Three versions written', ms: now() - t });
  steps.push({ agent: 'Verifier', status: verdict.ok ? 'done' : 'flagged', detail: `${verdict.checked} numbers checked`, ms: 0 });
  onStep?.(steps);
  return { ok: true, parsed, result, view, verdict, steps, trace: reply?.trace };
}

// ---------------- What would it take? ----------------

export interface TakesOk { ok: true; goal: Goal; result: TakesResult; view: TakesView; verdict: Verdict; steps: AgentStep[]; trace?: TraceEvent[]; live?: boolean }
export interface TakesFail { ok: false; reply: string; steps: AgentStep[]; trace?: TraceEvent[] }

const takesText = (v: TakesView) => [v.goalLine, v.head, v.sub, ...v.rows.map((r) => r.short)].join(' ');

/** Dr Football reads the goal, the engine searches the levers, the Narrator explains, the Verifier checks. */
export async function whatItTakes(league: League, question: string, myClub: string, onProgress: (pct: number) => void, onStep?: (s: AgentStep[]) => void): Promise<TakesOk | TakesFail> {
  const steps: AgentStep[] = [];
  let t = now();
  const local = parseGoal(league, question, myClub);
  const pending = LIVE ? askAgents<TakesReply>('whatittakes', { question, club: myClub }) : null;
  let reply: TakesReply | null = null;
  let goal: Goal | null = 'error' in local ? null : local;
  if (!goal && pending) {
    reply = await pending;
    if (reply?.ok) goal = reply.goal;
    else if (reply && !reply.ok) return { ok: false, reply: reply.reply, steps: reply.steps, trace: reply.trace };
  }
  if (!goal) {
    steps.push({ agent: 'Dr Football', status: 'failed', detail: 'No club or goal found', ms: now() - t });
    return { ok: false, reply: 'error' in local ? local.error : 'Name a club and a goal, like “top four” or “stay up”.', steps };
  }
  const phrased = candidates(league, goal);
  steps.push({ agent: 'Dr Football', status: 'done', detail: `Read the goal · ${phrased.length} changes worth trying`, ms: now() - t });
  onStep?.(steps);

  t = now();
  const result = await run('takes', { club: goal.club, race: goal.race, candidates: phrased.map(({ id, levers, cost, tag }) => ({ id, levers, cost, tag })) }, onProgress);
  steps.push({ agent: 'Data Scientist', status: 'done', detail: `${result.screened} universes searched · ${secs(now() - t)}`, ms: now() - t });
  let view = takesView(league, result, phrased);
  let live = false;
  if (pending) {
    reply = reply ?? await pending;
    if (reply?.ok && reply.story && reply.goal.club === goal.club && reply.goal.race === goal.race) {
      const written = { ...view, head: reply.story.head, sub: reply.story.sub };
      if (verify(takesText(written), written.facts).ok) { view = written; live = true; }
    }
  }
  const verdict = verify(takesText(view), view.facts);
  if (reply?.ok && live) { onStep?.(reply.steps); return { ok: true, goal, result, view, verdict, steps: reply.steps, trace: reply.trace, live }; }
  steps.push({ agent: 'Narrator', status: 'done', detail: 'Wrote the answer', ms: 0 });
  steps.push({ agent: 'Verifier', status: verdict.ok ? 'done' : 'flagged', detail: `${verdict.checked} numbers checked`, ms: 0 });
  onStep?.(steps);
  return { ok: true, goal, result, view, verdict, steps, trace: reply?.trace };
}

/** The same universe without progress updates, shared between screens (seeded, so identical). */
export async function universeFor(league: League, prompt: string) {
  const p = drFootball(league, prompt);
  if (!p.ok) return null;
  const r = await cached('universe', { levers: p.levers });
  return { parsed: p, result: r, view: universeView(league, r, p) };
}
