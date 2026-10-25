// The agent backend, driven by a scripted model: real loops, real tools, real engine, no network.
import { describe, expect, it } from 'vitest';
import { league } from '../../../../src/data/league';
import { drFootball } from '../../../../src/agents/drFootball';
import { STUDIO_PRESETS, designExperiment } from '../../../../src/agents/dataScientist';
import { verify } from '../../../../src/agents/verifier';
import type { ChatFn, ChatMessage, ChatResult } from '../model';
import { foundryChat } from '../model';
import { runAgent, type Tool } from '../loop';
import { multiversePipeline, readScout, readTranslate, scoutPipeline, settlePipeline, takesPipeline, translatePipeline } from '../pipelines';
import { PROMPTS } from '../prompts';
import { drFootballTools, lookupTools } from '../tools';
import { LruCache, RateLimiter, readQuestion } from '../guard';
import { CANARY } from '../../../../src/data/denylist';
import { checkWav, hear, readSpeak, speak, speechConfig, ssml } from '../speech';
import { toWav } from '../../../../src/agents/wav';

const usage = { prompt: 120, completion: 40 };
let ids = 0;
const call = (name: string, args: unknown): ChatResult => ({ message: { content: null, tool_calls: [{ id: `c${++ids}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, usage });
const say = (content: string): ChatResult => ({ message: { content }, usage });
const lastTool = (m: ChatMessage[]) => JSON.parse([...m].reverse().find((x) => x.role === 'tool')!.content as string);
const userOf = (m: ChatMessage[]) => (m.find((x) => x.role === 'user')!.content as string);
const templateOf = (m: ChatMessage[]) => JSON.parse(userOf(m).match(/^TEMPLATE: (.*)$/m)![1]);

/** A model that answers by role: each agent gets its own script, called with the conversation so far. */
function scripted(roles: Partial<Record<keyof typeof PROMPTS, (m: ChatMessage[], turn: number) => ChatResult>>): ChatFn & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const fn = (async (messages: ChatMessage[]) => {
    const sys = messages[0].content as string;
    const role = (Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]).find((k) => PROMPTS[k] === sys)!;
    calls[role] = (calls[role] ?? 0) + 1;
    const h = roles[role];
    if (!h) throw new Error(`no script for ${role}`);
    return h(messages, calls[role]);
  }) as ChatFn & { calls: Record<string, number> };
  fn.calls = calls;
  return fn;
}

const passReview = () => say('{"ok": true}');
const echoTemplate = (m: ChatMessage[]) => say(JSON.stringify(templateOf(m)));

describe('agent loop', () => {
  const echo: Tool = { name: 'echo', description: 'echo', parameters: { type: 'object' }, run: (a) => ({ got: a.x }) };
  const done: Tool = { name: 'done', description: 'finish', parameters: { type: 'object' }, final: true, run: (a) => (a.x === 2 ? { accept: true, value: 'two' } : { accept: false, error: 'x must be 2' }) };

  it('feeds tool results back and finishes on an accepted final tool', async () => {
    const seen: unknown[] = [];
    const chat: ChatFn = async (m) => {
      const turn = m.filter((x) => x.role === 'assistant').length;
      if (turn === 0) return call('echo', { x: 1 });
      seen.push(lastTool(m));
      return turn === 1 ? call('done', { x: 1 }) : call('done', { x: 2 });
    };
    const run = await runAgent({ agent: 'Data Scientist', chat, system: 's', user: 'u', tools: [echo, done] });
    expect(seen[0]).toEqual({ got: 1 });
    expect(seen[1]).toEqual({ refused: 'x must be 2' }); // the refusal is explained, and the model retries
    expect(run.final).toEqual({ tool: 'done', value: 'two' });
    expect(run.rounds).toBe(3);
    expect(run.usage.calls).toBe(3);
    expect(run.trace.some((e) => e.kind === 'check' && e.detail.includes('x must be 2'))).toBe(true);
  });

  it('survives unknown tools and bad JSON, and stops at the round limit', async () => {
    const replies: string[] = [];
    const chat: ChatFn = async (m) => {
      if (m.some((x) => x.role === 'tool')) replies.push(lastTool(m).error);
      return { message: { content: null, tool_calls: [{ id: `b${++ids}`, type: 'function', function: { name: replies.length % 2 ? 'nope' : 'echo', arguments: replies.length % 2 ? '{}' : '{oops' } }] }, usage };
    };
    const run = await runAgent({ agent: 'Dr Football', chat, system: 's', user: 'u', tools: [echo, done], maxRounds: 3 });
    expect(run.final).toBeNull();
    expect(replies).toEqual(['Arguments were not valid JSON.', 'No tool called nope.']);
    expect(run.trace.at(-1)!.detail).toMatch(/No answer after 3 rounds/);
  });
});

describe('lookup tools', () => {
  const tools = new Map(drFootballTools(league).map((t) => [t.name, t]));
  it('finds players through misspellings', () => {
    const hits = tools.get('find_player')!.run({ name: 'Nettlshaw' }) as { name: string }[];
    expect(hits[0].name).toBe('Kit Nettleshaw');
  });
  it('checks a sentence with the same rulebook the browser uses', () => {
    const ok = tools.get('check_scenario')!.run({ sentence: 'What if Kit Nettleshaw had never joined Northbridge?' }) as { ok: boolean; kind: string };
    expect(ok).toMatchObject({ ok: true, kind: 'TRANSFER' });
    const no = tools.get('submit_scenario')!.run({ sentence: `What if ${CANARY.club} had signed him?` }) as { accept: boolean };
    expect(no.accept).toBe(false);
  });
  it('keeps every tool result small', () => {
    for (const t of lookupTools(league)) expect(JSON.stringify(t.run({})).length).toBeLessThan(4000);
  });
});

describe('Settle It pipeline', () => {
  const q = STUDIO_PRESETS[2].text; // "Is Tallowby the best penalty stopper in the league?"
  const rules = designExperiment(league, q)!;

  it('chooses a test with tools, and the Verifier sends back a draft with an invented number', async () => {
    const chat = scripted({
      datascientist: (m, turn) => turn === 1 ? call('suggest_test', { question: q })
        : turn === 2 ? call('run_experiment', { spec: lastTool(m).spec })
          : call('choose_test', { spec: rules.spec, why: 'Compares his record with every keeper' }),
      narrator: (m, turn) => {
        const t = templateOf(m);
        return turn === 1 ? say(JSON.stringify({ line: t.line, script: `${t.script} He saves 73.4% of them.` })) : say(JSON.stringify(t));
      },
      verifier: passReview
    });
    const r = await settlePipeline({ league, chat, model: 'test' }, q);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec).toEqual(rules.spec);
    expect(r.drafts).toBe(2);
    expect(r.flags.some((f) => f.includes('73.4'))).toBe(true);
    expect(r.line).toBeTruthy();
    expect(r.steps.map((s) => s.agent)).toEqual(['Data Scientist', 'Analyst', 'Narrator', 'Verifier']);
    expect(r.steps[3].status).toBe('flagged');
    expect(r.trace.filter((e) => e.agent === 'Data Scientist' && e.kind === 'tool').map((e) => e.name)).toEqual(['suggest_test', 'run_experiment', 'choose_test']);
    expect(r.usage.calls).toBe(3 + 2 + 1); // three Data Scientist rounds, two drafts, one football-sense review
  });

  it('refuses a bad spec, and the model corrects itself', async () => {
    const chat = scripted({
      datascientist: (_m, turn) => turn === 1 ? call('choose_test', { spec: { kind: 'sub', minute: 12 }, why: 'x' }) : call('choose_test', { spec: { kind: 'sub', minute: league.demo.subs[0].minute }, why: 'the sub' }),
      narrator: echoTemplate, verifier: passReview
    });
    const r = await settlePipeline({ league, chat, model: 'test' }, 'Did the substitution matter?');
    expect(r.ok && r.spec).toEqual({ kind: 'sub', minute: league.demo.subs[0].minute });
    expect(r.trace.some((e) => e.kind === 'check' && /No substitution at 12/.test(e.detail))).toBe(true);
  });

  it('falls back to the rulebook and the template when the model is down', async () => {
    const chat: ChatFn = async () => { throw new Error('Foundry 503'); };
    const r = await settlePipeline({ league, chat, model: 'test' }, q);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec).toEqual(rules.spec);
    expect(r.line).toBeNull(); // the browser keeps its template
    expect(r.trace.some((e) => e.name === 'rulebook')).toBe(true);
  });

  it('says no when nothing can answer the question', async () => {
    const chat = scripted({ datascientist: () => call('cannot_test', { reason: 'The engine can’t see next season.' }) });
    const r = await settlePipeline({ league, chat, model: 'test' }, 'Who will win the league in 2031?');
    expect(r).toMatchObject({ ok: false, reply: 'The engine can’t see next season.' });
  });

  it('every live draft it accepts passes the browser Verifier with the browser\'s facts', async () => {
    for (const p of STUDIO_PRESETS) {
      const spec = designExperiment(league, p.text)!.spec;
      const chat = scripted({ datascientist: () => call('choose_test', { spec, why: 'preset' }), narrator: echoTemplate, verifier: passReview });
      const r = await settlePipeline({ league, chat, model: 'test' }, p.text);
      expect(r.ok, p.text).toBe(true);
      if (r.ok) expect(r.line, p.text).toBeTruthy();
    }
  });
});

describe('Multiverse pipeline', () => {
  it('resolves a misspelled name with tools and returns a verified story for the same universe', async () => {
    const fan = 'what if nettlshaw never signed for the bridge';
    expect(drFootball(league, fan).ok).toBe(false); // the rulebook alone can't read it
    const sentence = 'What if Kit Nettleshaw had never joined Northbridge?';
    const chat = scripted({
      drfootball: (m, turn) => turn === 1 ? call('find_player', { name: 'nettlshaw' })
        : turn === 2 ? call('check_scenario', { sentence: `What if ${lastTool(m)[0].name} had never joined Northbridge?` })
          : call('submit_scenario', { sentence }),
      narrator: echoTemplate, verifier: passReview
    });
    const r = await multiversePipeline({ league, chat, model: 'test' }, fan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sentence).toBe(sentence);
    const local = drFootball(league, r.sentence);
    expect(local.ok && local.levers).toEqual(r.levers); // the browser re-reads the sentence to the same levers
    expect(r.story).not.toBeNull();
    expect(r.steps[0].detail).toMatch(/find_player, check_scenario, submit_scenario/);
  });

  it('passes on a friendly rejection', async () => {
    const chat = scripted({ drfootball: () => call('reject_scenario', { reason: 'Real clubs aren’t in the Meridian League.' }) });
    const r = await multiversePipeline({ league, chat, model: 'test' }, `What if ${CANARY.club} had signed our striker?`);
    expect(r).toMatchObject({ ok: false, reply: 'Real clubs aren’t in the Meridian League.' });
  });

  it('keeps the template when every draft overclaims', async () => {
    const chat = scripted({
      drfootball: () => call('submit_scenario', { sentence: 'What if Kit Nettleshaw had missed the season?' }),
      narrator: (m) => { const t = templateOf(m); return say(JSON.stringify({ ...t, back: { head: 'Definitely relegated', sub: t.back.sub } })); },
      verifier: passReview
    });
    const r = await multiversePipeline({ league, chat, model: 'test' }, 'What if Kit Nettleshaw had missed the season?');
    expect(r.ok && r.story).toBeNull();
    expect(r.ok && r.flags.every((f) => /certain/.test(f))).toBe(true);
    expect(verify('Definitely relegated', {}).ok).toBe(false);
  });
});

describe('What would it take? pipeline', () => {
  it('finds the club from a nickname-ish phrase, then searches and writes a verified answer', async () => {
    const chat = scripted({
      goal: (m, turn) => turn === 1 ? call('find_club', { name: 'the bridge' }) : call('submit_goal', { club: lastTool(m)[0].code, race: 'top4' }),
      narrator: echoTemplate, verifier: passReview
    });
    const r = await takesPipeline({ league, chat, model: 'test' }, 'what does the bridge need to get into the top 4', { club: 'HAR' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.goal).toEqual({ club: 'NBR', race: 'top4' });
    expect(r.story).not.toBeNull();
    expect(r.steps.map((s) => s.agent)).toEqual(['Dr Football', 'Data Scientist', 'Narrator', 'Verifier']);
  }, 30000);

  it('refuses a bad club code and uses the visitor\'s club when the question names none', async () => {
    const chat = scripted({
      goal: (m, turn) => turn === 1 ? call('submit_goal', { club: 'XYZ', race: 'title' }) : call('submit_goal', { club: userOf(m).match(/MY CLUB: (\w+)/)![1], race: 'survive' }),
      narrator: echoTemplate, verifier: passReview
    });
    const r = await takesPipeline({ league, chat, model: 'test' }, 'what would it take for us to stay up?', { club: 'HAR' });
    expect(r.ok && r.goal).toEqual({ club: 'HAR', race: 'survive' });
    expect(r.trace.some((e) => e.kind === 'check' && /XYZ is not a club code/.test(e.detail))).toBe(true);
  }, 30000);
});

describe('Scout pipeline', () => {
  const alerts = [
    { key: 'a', type: 'SWING', facts: { b: 55, a: 79, label: "9'" }, template: 'Our win chance: 55% → 79%.' },
    { key: 'b', type: 'GHOST RUN', facts: { g: 47, n: 500, label: "44'" }, template: 'Ghost Run: the attack we lost at 44\' goes on to score 47% of the time.' }
  ];

  it('redrafts only the alerts the Verifier rejects, in the requested language', async () => {
    const seen: string[] = [];
    const chat = scripted({
      scout: (m, turn) => {
        seen.push(userOf(m));
        return turn === 1
          ? say(JSON.stringify({ alerts: [{ key: 'a', text: 'Nuestra probabilidad de victoria sube del 55% al 79%.' }, { key: 'b', text: 'El ataque que nos cortaron acaba en gol el 52% de las veces.' }] }))
          : say(JSON.stringify({ alerts: [{ key: 'b', text: 'El ataque que nos cortaron en el 44\' acaba en gol el 47% de las veces.' }] }));
      }
    });
    const req = readScout({ lang: 'es', fan: true, club: 'NBR', alerts }, league);
    expect('error' in req).toBe(false);
    const r = await scoutPipeline({ league, chat, model: 'test' }, req as Exclude<typeof req, { error: string }>);
    expect(r.ok && Object.keys(r.texts).sort()).toEqual(['a', 'b']);
    expect(r.ok && r.drafts).toBe(2);
    expect(seen[1]).toMatch(/FEEDBACK: b: 52 isn’t in the simulation output/);
    expect(seen[1]).not.toMatch(/"key":"a"/); // the passing alert isn't sent again
  });

  it('rejects malformed requests', () => {
    expect(readScout({ lang: 'xx', fan: true, club: 'NBR', alerts }, league)).toHaveProperty('error');
    expect(readScout({ lang: 'en', fan: true, club: 'NOPE', alerts }, league)).toHaveProperty('error');
    expect(readScout({ lang: 'en', fan: true, club: 'NBR', alerts: Array(13).fill(alerts[0]) }, league)).toHaveProperty('error');
    expect(readScout({ lang: 'en', fan: true, club: 'NBR', alerts: [{ ...alerts[0], facts: { x: Infinity } }] }, league)).toHaveProperty('error');
  });
});

describe('guards and model client', () => {
  it('limits each visitor and the whole day', () => {
    const rl = new RateLimiter(2, 60_000, 3);
    expect([rl.check('a', 0), rl.check('a', 1), rl.check('a', 2)].map(Boolean)).toEqual([false, false, true]);
    expect(rl.check('b', 3)).toBeNull();
    expect(rl.check('c', 4)).toMatch(/quota/);
  });
  it('validates questions and evicts the oldest cache entry', () => {
    expect(readQuestion({ question: 'hi' })).toHaveProperty('error');
    expect(readQuestion({ question: 'x'.repeat(301) })).toHaveProperty('error');
    expect(readQuestion({ question: '  Was it offside?  ' })).toEqual({ question: 'Was it offside?' });
    const c = new LruCache<number>(2);
    c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
    expect([c.get('a'), c.get('b'), c.get('c')]).toEqual([1, undefined, 3]);
  });
  it('switches to max_completion_tokens when a reasoning model rejects max_tokens', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fake = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if ('max_tokens' in body) return new Response('{"error":{"message":"Unsupported parameter: max_tokens"}}', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const chat = foundryChat({ url: 'https://x.services.ai.azure.com/models/chat/completions', key: 'k', model: 'm' }, fake);
    const r = await chat([{ role: 'user', content: 'hi' }]);
    expect(r.message.content).toBe('ok');
    expect(bodies[1]).toMatchObject({ max_completion_tokens: 600 });
    expect(bodies[1]).not.toHaveProperty('temperature');
  });
});

describe('MCP server', () => {
  it('initialises, lists read-only tools and answers calls with the engine\'s numbers', async () => {
    const { handleMcp, mcpTools } = await import('../mcp');
    const tools = mcpTools(league);
    const init = (await handleMcp(tools, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })) as { result: { protocolVersion: string; capabilities: { tools: object } } };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(await handleMcp(tools, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list = (await handleMcp(tools, { jsonrpc: '2.0', id: 2, method: 'tools/list' })) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    const names = list.result.tools.map((t) => t.name);
    for (const n of ['find_player', 'search_players', 'standings', 'club_outlook', 'run_experiment', 'play_what_if', 'what_would_it_take', 'match_recap', 'overlay_cues']) expect(names).toContain(n);
    expect(list.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(names.some((n) => n.startsWith('submit_') || n.startsWith('choose_'))).toBe(false); // the agents' final tools stay private
    const call = (await handleMcp(tools, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'find_player', arguments: { name: 'Nettlshaw' } } })) as { result: { content: { text: string }[]; isError: boolean } };
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0].text)[0].name).toBe('Kit Nettleshaw');
    const recap = (await handleMcp(tools, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'match_recap', arguments: { fixtureId: league.demo.fixtureId, persona: 'home' } } })) as { result: { structuredContent: { verified: boolean } } };
    expect(recap.result.structuredContent.verified).toBe(true);
    const bad = (await handleMcp(tools, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } })) as { error: { code: number } };
    expect(bad.error.code).toBe(-32602);
  }, 30000);
});

describe('Ask pipeline', () => {
  it('lets the router agent pick a destination, refusing one that does not exist', async () => {
    const { askPipeline } = await import('../pipelines');
    const chat = scripted({ router: (_m, turn) => turn === 1 ? call('route_to', { destination: 'somewhere', question: 'x', why: 'x' }) : call('route_to', { destination: 'takes', question: 'What would it take for Northbridge to finish in the top four?', why: 'A goal to reach.' }) });
    const r = await askPipeline({ league, chat, model: 'test' }, 'how do the bridge get into the top 4');
    expect(r.ok && r.route).toMatchObject({ to: 'takes' });
    expect(r.trace.some((e) => e.kind === 'check' && /destination must be/.test(e.detail))).toBe(true);
  });
  it('falls back to the rulebook when the model is down', async () => {
    const { askPipeline } = await import('../pipelines');
    const r = await askPipeline({ league, chat: async () => { throw new Error('down'); }, model: 'test' }, 'Who is top scorer?');
    expect(r.ok && r.route.to).toBe('league');
  });
});

describe('Player database search', () => {
  it('filters and sorts players (from the league snapshot when no database is configured)', async () => {
    const { searchPlayersTool } = await import('../tools');
    const r = await searchPlayersTool(league).run({ role: 'CB', sort: 'clearances', minApps: 10, limit: 5 }) as { source: string; players: { role: string; clearances: number }[] };
    expect(r.source).toBe('league snapshot');
    expect(r.players).toHaveLength(5);
    expect(r.players.every((p) => p.role === 'CB')).toBe(true);
    for (let i = 1; i < r.players.length; i++) expect(r.players[i].clearances).toBeLessThanOrEqual(r.players[i - 1].clearances);
  });
});

describe('Translate pipeline', () => {
  const itemsOf = (m: ChatMessage[]) => JSON.parse(userOf(m).match(/^ITEMS: (.*)$/m)![1]) as { key: string; text: string }[];

  it('keeps lines whose numbers match the English and sends the rest back once', async () => {
    const chat = scripted({
      translator: (m, turn) => {
        const items = itemsOf(m);
        if (turn === 1) return say(JSON.stringify({ items: [{ key: 'a', text: 'Northbridge, 62 % de probabilidad.' }, { key: 'b', text: 'Ganó 3 partidos de 4.' }] }));
        expect(userOf(m)).toMatch(/FEEDBACK: b:/);
        expect(items.map((i) => i.key)).toEqual(['b']);
        return say(JSON.stringify({ items: [{ key: 'b', text: 'Ganó 2 partidos de 5.' }] }));
      }
    });
    const res = await translatePipeline({ league, chat, model: 'test' }, { lang: 'es', items: [{ key: 'a', text: 'Northbridge, 62% chance.' }, { key: 'b', text: 'Won 2 of 5 games.' }] });
    expect(res.ok).toBe(true);
    expect(res.ok && res.texts).toEqual({ a: 'Northbridge, 62 % de probabilidad.', b: 'Ganó 2 partidos de 5.' });
    expect(chat.calls.translator).toBe(2);
  });

  it('drops a line that never passes, and answers repeats from the cache', async () => {
    const chat = scripted({ translator: () => say(JSON.stringify({ items: [{ key: 'x', text: 'Gana 99 de cada 100.' }] })) });
    const req = { lang: 'pt' as const, items: [{ key: 'x', text: 'Wins 7 in 10 of these.' }] };
    const res = await translatePipeline({ league, chat, model: 'test' }, req);
    expect(res.ok && res.texts).toEqual({});
    expect(chat.calls.translator).toBe(2);
    const ok = scripted({ translator: () => say(JSON.stringify({ items: [{ key: 'y', text: 'Vence 7 em cada 10 destes.' }] })) });
    await translatePipeline({ league, chat: ok, model: 'test' }, { lang: 'pt', items: [{ key: 'y', text: 'Wins 7 in 10 of these.' }] });
    const again = scripted({});
    const cached = await translatePipeline({ league, chat: again, model: 'test' }, { lang: 'pt', items: [{ key: 'z', text: 'Wins 7 in 10 of these.' }] });
    expect(cached.ok && cached.texts).toEqual({ z: 'Vence 7 em cada 10 destes.' });
    expect(again.calls.translator).toBeUndefined();
  });

  it('validates requests', () => {
    expect(readTranslate({ lang: 'en', items: [{ key: 'a', text: 'x' }] })).toHaveProperty('error');
    expect(readTranslate({ lang: 'zh', items: [] })).toHaveProperty('error');
    expect(readTranslate({ lang: 'zh', items: Array.from({ length: 41 }, (_, i) => ({ key: `k${i}`, text: 'x' })) })).toHaveProperty('error');
    expect(readTranslate({ lang: 'zh', items: [{ key: 'a', text: 'x'.repeat(801) }] })).toHaveProperty('error');
    expect(readTranslate({ lang: 'zh', items: [{ key: 'a', text: 'The table' }] })).toEqual({ lang: 'zh', items: [{ key: 'a', text: 'The table' }] });
  });
});

describe('Speech', () => {
  const cfg = { key: 'k', region: 'southeastasia' };
  const wavOf = (seconds: number, rate = 48000) => toWav([new Float32Array(rate * seconds).map((_, i) => Math.sin(i / 20) * 0.5)], rate);

  it('reads config only when key and a plain region are set', () => {
    expect(speechConfig({ SPEECH_KEY: 'k', SPEECH_REGION: 'southeastasia' })).toEqual(cfg);
    expect(speechConfig({ SPEECH_KEY: 'k' })).toBeNull();
    expect(speechConfig({ SPEECH_KEY: 'k', SPEECH_REGION: 'evil.example.com/' })).toBeNull();
  });

  it('builds SSML in the reader’s voice and escapes the text', () => {
    const s = ssml('Northbridge <win> & “draw”', 'ta');
    expect(s).toContain('ta-IN-ValluvarNeural');
    expect(s).toContain('Northbridge &lt;win&gt; &amp;');
  });

  it('speaks through the regional endpoint once per line, then from the cache', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => { urls.push(url); return new Response(new Uint8Array([1, 2, 3])); }) as unknown as typeof fetch;
    const a = await speak(cfg, 'A one-off line for the cache test.', 'en', f);
    const b = await speak(cfg, 'A one-off line for the cache test.', 'en', f);
    expect([...a]).toEqual([1, 2, 3]);
    expect(b).toBe(a);
    expect(urls).toEqual(['https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1']);
  });

  it('turns a recording into words, or nothing', async () => {
    const ok = (async () => new Response(JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'Who is top of the league? ' }))) as unknown as typeof fetch;
    const miss = (async () => new Response(JSON.stringify({ RecognitionStatus: 'NoMatch' }))) as unknown as typeof fetch;
    expect(await hear(cfg, wavOf(1), 'en', ok)).toBe('Who is top of the league?');
    expect(await hear(cfg, wavOf(1), 'en', miss)).toBe('');
  });

  it('checks requests: short text in a known language, short 16 kHz mono WAV', () => {
    expect(readSpeak({ text: 'Hello', lang: 'hi' }, ['en', 'hi'])).toEqual({ text: 'Hello', lang: 'hi' });
    expect(readSpeak({ text: 'x'.repeat(1601), lang: 'en' }, ['en'])).toHaveProperty('error');
    expect(readSpeak({ text: 'Hello', lang: 'fr' }, ['en'])).toHaveProperty('error');
    const wav = wavOf(2);
    expect(wav.length).toBe(44 + 16000 * 2 * 2);
    expect(checkWav(wav)).toBeNull();
    expect(checkWav(wavOf(16))).toMatch(/15 seconds/);
    expect(checkWav(new Uint8Array(100))).toMatch(/WAV/);
  });
});
