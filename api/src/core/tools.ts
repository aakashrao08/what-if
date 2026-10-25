// The agents' tools. Every one is a thin wrapper over code the browser already runs: the league
// data, the rulebook parsers and the seeded simulation engine. Results are compact JSON so a small
// model can read them cheaply. Final tools validate the agent's answer before it is accepted.

import type { League, Player } from '../../../src/data/types';
import type { Timeline } from '../../../src/engine/demo';
import { runJob, type ExperimentSpec } from '../../../src/engine/jobs';
import { table } from '../../../src/engine/league';
import { designExperiment, specProblem } from '../../../src/agents/dataScientist';
import { drFootball, type Parsed } from '../../../src/agents/drFootball';
import { settleViewFor } from '../../../src/agents/settleView';
import type { Goal } from '../../../src/agents/takes';
import type { Tool, Verdict } from './loop';
import { queryPlayers, type Db } from './db';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const S = (description: string) => ({ type: 'string', description });

/** Lower is better: 0 exact, 1 surname/prefix, 2 substring, 3 close spelling. */
function nameScore(name: string, q: string): number {
  const n = norm(name), want = norm(q);
  if (!want) return 9;
  if (n === want) return 0;
  const parts = n.split(' ');
  if (parts.some((p) => p === want) || n.startsWith(want)) return 1;
  if (n.includes(want)) return 2;
  return parts.some((p) => p.length > 3 && editDistance(p, want) <= 2) ? 3 : 9;
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Where the league database is, if there is one (set by the Functions host at start-up). */
let dbProvider: (() => Promise<Db | null>) | null = null;
export const useDatabase = (provider: () => Promise<Db | null>) => { dbProvider = provider; };

const SEARCH_SORTS = ['goals', 'assists', 'xg', 'shots', 'keyPasses', 'progPasses', 'progCarries', 'crosses', 'dribbles', 'tackles', 'interceptions', 'clearances', 'blocks', 'aerials', 'passAcc', 'cleanSheets', 'saves', 'prevented', 'yellow', 'red', 'apps', 'age'];

/** Filter and sort the player database: from Azure Cosmos DB when it's configured, from memory otherwise (same answer). */
export function searchPlayersTool(league: League): Tool {
  return {
    name: 'search_players', description: 'Search the player database: filter by club code, role (GK, CB, FB, DM, CM, AM, W, ST) and minimum appearances, sorted by a stat, e.g. the centre-backs with the most clearances, or Northbridge players by key passes.',
    parameters: obj({ club: S('optional club code'), role: { type: 'string', enum: ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'] }, minApps: { type: 'number' }, sort: { type: 'string', enum: SEARCH_SORTS }, limit: { type: 'number' } }),
    run: async (a) => {
      const q = { club: str(a.club).toUpperCase() || undefined, role: str(a.role) || undefined, minApps: typeof a.minApps === 'number' ? a.minApps : undefined, sort: SEARCH_SORTS.includes(str(a.sort)) ? str(a.sort) : 'goals', limit: typeof a.limit === 'number' ? Math.min(25, a.limit) : 10 };
      const db = dbProvider ? await dbProvider() : null;
      const rows: Record<string, unknown>[] = db
        ? await queryPlayers(db, q)
        : league.players.filter((p) => (!q.club || p.club === q.club) && (!q.role || p.role === q.role) && (!q.minApps || (p.apps ?? 0) >= q.minApps))
          .sort((x, y) => (((y as unknown as Record<string, number>)[q.sort] ?? 0) - ((x as unknown as Record<string, number>)[q.sort] ?? 0))).slice(0, q.limit) as unknown as Record<string, unknown>[];
      return { source: db ? 'Azure Cosmos DB' : 'league snapshot', sort: q.sort, players: rows.map((p) => ({ id: p.id, name: p.name, club: p.club, role: p.role, apps: p.apps, [q.sort]: p[q.sort] })) };
    },
    describe: (a, r) => `search_players(${[str(a.club), str(a.role), str(a.sort)].filter(Boolean).join(', ')}) → ${(r as { players: unknown[] }).players.length} from ${(r as { source: string }).source}`
  };
}

export function lookupTools(league: League): Tool[] {
  const club = (code: string) => league.clubs.find((c) => c.code === code)!;
  const playerRow = (p: Player) => ({ id: p.id, name: p.name, club: club(p.club).short, pos: p.pos, goals: p.goals, starter: p.starter, joinedFrom: p.joinedFrom ? club(p.joinedFrom).short : null });
  const moments = () => league.feeds.flatMap((f) => f.keyMoments.map((k) => {
    const e = f.events.find((x) => x.id === k.eventId)!;
    const who = league.players.find((p) => p.id === e.player);
    return { id: k.id, match: `${club(f.home).short} v ${club(f.away).short}`, fixtureId: f.fixtureId, minute: k.label, kind: k.kind, title: k.title, player: who?.name ?? null, team: who ? club(who.club).short : null, ifFlipped: k.cf.type === 'remove_goal' ? 'goal removed' : 'chance goes in' };
  }));
  return [
    {
      name: 'find_player', description: 'Look up Meridian League players by full name, surname or a misspelling. Returns up to 5 matches.',
      parameters: obj({ name: S('name or part of a name') }, ['name']),
      run: (a) => league.players.map((p) => ({ p, s: nameScore(p.name, str(a.name)) })).filter((x) => x.s < 9).sort((x, y) => x.s - y.s || y.p.goals - x.p.goals).slice(0, 5).map((x) => playerRow(x.p)),
      describe: (a, r) => `find_player("${str(a.name)}") → ${(r as unknown[]).length} match${(r as unknown[]).length === 1 ? '' : 'es'}`
    },
    {
      name: 'find_club', description: 'Look up a club by name, short name or nickname. Returns code, names, manager and current league position.',
      parameters: obj({ name: S('club name or nickname') }, ['name']),
      run: (a) => {
        const rows = table(league);
        return league.clubs.map((c) => ({ c, s: Math.min(nameScore(c.name, str(a.name)), nameScore(c.short, str(a.name)), nameScore(c.nickname, str(a.name))) }))
          .filter((x) => x.s < 9).sort((x, y) => x.s - y.s).slice(0, 3)
          .map(({ c }) => ({ code: c.code, name: c.name, short: c.short, nickname: c.nickname, manager: c.manager, position: rows.findIndex((r) => r.code === c.code) + 1, points: rows.find((r) => r.code === c.code)!.pts }));
      },
      describe: (a, r) => `find_club("${str(a.name)}") → ${(r as { short: string }[]).map((x) => x.short).join(', ') || 'none'}`
    },
    {
      name: 'league_table', description: 'The Meridian League table before the current matchweek: position, club, played, points, goal difference.',
      parameters: obj({}),
      run: () => table(league).map((r, i) => ({ pos: i + 1, club: club(r.code).short, p: r.p, pts: r.pts, gd: r.gf - r.ga })),
      describe: () => 'league_table() → 20 clubs'
    },
    {
      name: 'list_managers', description: 'Managers who could take over a club: the ones out of work, with their style.',
      parameters: obj({}),
      run: () => league.managers.filter((m) => !m.club).map((m) => ({ name: m.name, press: m.style.press, line: m.style.line, tempo: m.style.tempo, bio: m.bio })),
      describe: () => 'list_managers()'
    },
    {
      name: 'list_moments', description: `Turning points in matchweek ${league.currentMw} that can be flipped (a goal removed or a chance scored). Filter by player or club name.`,
      parameters: obj({ player: S('optional player name'), club: S('optional club name') }),
      run: (a) => moments().filter((m) => (!str(a.player) || (m.player && nameScore(m.player, str(a.player)) < 9)) && (!str(a.club) || m.match.toLowerCase().includes(norm(str(a.club))))).slice(0, 12),
      describe: (a, r) => `list_moments(${[str(a.player), str(a.club)].filter(Boolean).join(', ') || 'all'}) → ${(r as unknown[]).length}`
    }
  ];
}

// ---------------- Dr Football ----------------

export const parsedSummary = (p: Parsed) => ({ kind: p.kind, scenario: p.short, changes: p.changes.map((c) => `${c.k}: ${c.v}`) });

export function drFootballTools(league: League): Tool[] {
  return [
    ...lookupTools(league),
    {
      name: 'check_scenario', description: 'Run a candidate sentence through the simulator\'s scenario reader. Returns what it would simulate, or why it can\'t. Use the exact sentence forms from your instructions.',
      parameters: obj({ sentence: S('one what-if sentence') }, ['sentence']),
      run: (a) => { const p = drFootball(league, str(a.sentence)); return p.ok ? { ok: true, ...parsedSummary(p) } : { ok: false, reason: p.reply }; },
      describe: (a, r) => `check_scenario("${str(a.sentence)}") → ${(r as { ok: boolean }).ok ? 'readable' : 'not readable'}`
    },
    {
      name: 'submit_scenario', final: true, description: 'Final answer: the sentence the simulator should play out. It must pass check_scenario.',
      parameters: obj({ sentence: S('the what-if sentence') }, ['sentence']),
      run: (a): Verdict<{ sentence: string; parsed: Parsed }> => {
        const p = drFootball(league, str(a.sentence));
        return p.ok ? { accept: true, value: { sentence: str(a.sentence), parsed: p } } : { accept: false, error: p.reply };
      },
      describe: (a) => `submit_scenario("${str(a.sentence)}")`
    },
    {
      name: 'reject_scenario', final: true, description: 'Final answer when the what-if can\'t be simulated (real clubs or players, impossible rules, wishes rather than changes). One short, friendly reason.',
      parameters: obj({ reason: S('one or two sentences to the fan') }, ['reason']),
      run: (a): Verdict<{ reason: string }> => (str(a.reason).length > 4 ? { accept: true, value: { reason: str(a.reason).slice(0, 300) } } : { accept: false, error: 'Give the fan a reason.' }),
      describe: () => 'reject_scenario()'
    }
  ];
}

// ---------------- Data Scientist ----------------

const SPEC_SCHEMA = {
  type: 'object',
  description: 'One of: {kind:"sub",minute} {kind:"tactic",minute} {kind:"penalty",momentId} {kind:"keepers",keeperId} {kind:"deserve",fixtureId?} {kind:"wpa",fixtureId?} {kind:"finishing",playerId} {kind:"call",attackId} {kind:"value",attackId}',
  properties: {
    kind: { type: 'string', enum: ['sub', 'tactic', 'penalty', 'keepers', 'deserve', 'wpa', 'finishing', 'call', 'value'] },
    minute: { type: 'number' }, momentId: { type: 'string' }, keeperId: { type: 'string' }, fixtureId: { type: 'string' },
    playerId: { type: 'string' }, attackId: { type: 'string' }
  },
  required: ['kind']
};

/** Keep only the fields the chosen kind uses, so a model's extra keys don't leak into the cache key. */
export function cleanSpec(raw: unknown): ExperimentSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v));
  switch (r.kind) {
    case 'sub': case 'tactic': return { kind: r.kind, minute: n(r.minute) };
    case 'penalty': return { kind: 'penalty', momentId: str(r.momentId) };
    case 'keepers': return { kind: 'keepers', keeperId: str(r.keeperId) };
    case 'deserve': case 'wpa': return str(r.fixtureId) ? { kind: r.kind, fixtureId: str(r.fixtureId) } : { kind: r.kind };
    case 'finishing': return { kind: 'finishing', playerId: str(r.playerId) };
    case 'call': case 'value': return { kind: r.kind, attackId: str(r.attackId) };
    default: return null;
  }
}

export function dataScientistTools(league: League, tl: () => Timeline): Tool[] {
  const search = searchPlayersTool(league);
  const club = (code: string) => league.clubs.find((c) => c.code === code)!.short;
  const name = (id?: string) => league.players.find((p) => p.id === id)?.name ?? null;
  const run = (spec: ExperimentSpec) => {
    const problem = specProblem(league, spec);
    if (problem) return { error: problem };
    const e = runJob('experiment', spec);
    const v = settleViewFor(league, e, spec, tl().moments, 3);
    return { test: v.test, answer: v.answer, headline: v.line, effect: `${v.effect} (${v.effectNote})`, facts: v.facts };
  };
  return [
    ...lookupTools(league),
    search,
    {
      name: 'suggest_test', description: 'The studio rulebook\'s suggestion for a question. Fast and reliable for common phrasings; may be null.',
      parameters: obj({ question: S('the fan\'s question') }, ['question']),
      run: (a) => designExperiment(league, str(a.question)) ?? { suggestion: null },
      describe: (_a, r) => `suggest_test → ${(r as { spec?: ExperimentSpec }).spec?.kind ?? 'nothing'}`
    },
    {
      name: 'list_fixtures', description: `Matchweek ${league.currentMw} games with a full event feed (fixtureId, teams, final score).`,
      parameters: obj({}),
      run: () => league.feeds.map((f) => {
        const g = f.events.filter((e) => e.type === 'goal');
        return { fixtureId: f.fixtureId, match: `${club(f.home)} v ${club(f.away)}`, score: `${g.filter((e) => e.team === 'home').length}-${g.filter((e) => e.team === 'away').length}`, flagship: f.fixtureId === league.demo.fixtureId };
      }),
      describe: () => 'list_fixtures()'
    },
    {
      name: 'list_stopped_attacks', description: 'Attacks that were stopped (cleared, blocked, fouled, flagged offside), with ids for "call" and "value" tests.',
      parameters: obj({ club: S('optional club name') }),
      run: (a) => league.feeds.flatMap((f) => f.stoppedAttacks.map((x) => ({ attackId: x.id, match: `${club(f.home)} v ${club(f.away)}`, minute: x.label, stop: x.stop, attacker: name(x.attacker), stopper: name(x.stopper), title: x.title })))
        .filter((x) => !str(a.club) || x.match.toLowerCase().includes(norm(str(a.club)))).slice(0, 15),
      describe: (_a, r) => `list_stopped_attacks() → ${(r as unknown[]).length}`
    },
    {
      name: 'list_changes', description: 'Substitutions and tactical switches in the flagship match (the only match with replayable changes), plus its saved penalty.',
      parameters: obj({}),
      run: () => ({
        subs: league.demo.subs.map((s) => ({ minute: s.minute, side: club(s.side === 'home' ? league.demo.home : league.demo.away), off: name(s.off), on: name(s.on) })),
        tactics: league.demo.shields.map((s) => ({ minute: s.minute, side: club(s.side === 'home' ? league.demo.home : league.demo.away), change: s.label })),
        penalties: league.demo.keyMoments.filter((k) => k.kind === 'penalty_saved').map((k) => ({ momentId: k.id, minute: k.label, title: k.title }))
      }),
      describe: () => 'list_changes()'
    },
    {
      name: 'run_experiment', description: 'Run a test on the simulation engine (seeded, so the studio will show exactly these numbers). Returns the test, the headline and the facts.',
      parameters: obj({ spec: SPEC_SCHEMA }, ['spec']),
      run: (a) => { const spec = cleanSpec(a.spec); return spec ? run(spec) : { error: 'spec.kind is missing or unknown' }; },
      describe: (a, r) => `run_experiment(${cleanSpec(a.spec)?.kind ?? '?'}) → ${(r as { error?: string }).error ? 'refused' : (r as { answer: string }).answer}`
    },
    {
      name: 'choose_test', final: true, description: 'Final answer: the test that best answers the question. Say in one line why it answers it.',
      parameters: obj({ spec: SPEC_SCHEMA, why: S('one line: why this test answers the question') }, ['spec', 'why']),
      run: (a): Verdict<{ spec: ExperimentSpec; why: string }> => {
        const spec = cleanSpec(a.spec);
        if (!spec) return { accept: false, error: 'spec.kind is missing or unknown' };
        const problem = specProblem(league, spec);
        return problem ? { accept: false, error: problem } : { accept: true, value: { spec, why: str(a.why).slice(0, 200) } };
      },
      describe: (a) => `choose_test(${cleanSpec(a.spec)?.kind ?? '?'})`
    },
    {
      name: 'cannot_test', final: true, description: 'Final answer when no test in the studio can fairly answer the question. One short reason.',
      parameters: obj({ reason: S('one or two sentences') }, ['reason']),
      run: (a): Verdict<{ reason: string }> => (str(a.reason).length > 4 ? { accept: true, value: { reason: str(a.reason).slice(0, 300) } } : { accept: false, error: 'Give a reason.' }),
      describe: () => 'cannot_test()'
    }
  ];
}

// ---------------- What would it take? ----------------

export function goalTools(league: League): Tool[] {
  const races = ['title', 'top4', 'survive'];
  return [
    ...lookupTools(league).filter((t) => t.name === 'find_club' || t.name === 'league_table'),
    {
      name: 'submit_goal', final: true, description: 'Final answer: the club (its code from find_club) and the goal to search for.',
      parameters: obj({ club: S('club code, e.g. NBR'), race: { type: 'string', enum: races } }, ['club', 'race']),
      run: (a): Verdict<Goal> => {
        const club = league.clubs.find((c) => c.code === str(a.club).toUpperCase());
        if (!club) return { accept: false, error: `${str(a.club)} is not a club code. Use find_club.` };
        if (!races.includes(str(a.race))) return { accept: false, error: 'race must be title, top4 or survive.' };
        return { accept: true, value: { club: club.code, race: str(a.race) as Goal['race'] } };
      },
      describe: (a) => `submit_goal(${str(a.club)}, ${str(a.race)})`
    },
    {
      name: 'reject_goal', final: true, description: 'Final answer when the question can\'t be searched. One short, friendly reason.',
      parameters: obj({ reason: S('one or two sentences') }, ['reason']),
      run: (a): Verdict<{ reason: string }> => (str(a.reason).length > 4 ? { accept: true, value: { reason: str(a.reason).slice(0, 300) } } : { accept: false, error: 'Give a reason.' }),
      describe: () => 'reject_goal()'
    }
  ];
}

// ---------------- Ask What If: the router ----------------

export function routerTools(league: League, ds: Tool[]): Tool[] {
  const destinations = ['settle', 'multiverse', 'takes', 'league', 'squad'];
  return [
    ...lookupTools(league).filter((t) => t.name === 'find_club' || t.name === 'find_player'),
    ...drFootballTools(league).filter((t) => t.name === 'check_scenario'),
    ...ds.filter((t) => t.name === 'suggest_test'),
    {
      name: 'route_to', final: true, description: 'Final answer: where the question goes, the question to pass on, and (for squad) the club code.',
      parameters: obj({ destination: { type: 'string', enum: destinations }, question: S('the question to hand over'), club: S('club code, for squad only'), why: S('one short line for the fan: why this team') }, ['destination', 'question', 'why']),
      run: (a): Verdict<{ to: string; q: string; club?: string; why: string }> => {
        const to = str(a.destination);
        if (!destinations.includes(to)) return { accept: false, error: 'destination must be one of settle, multiverse, takes, league, squad.' };
        if (to === 'squad' && !league.clubs.some((c) => c.code === str(a.club).toUpperCase())) return { accept: false, error: 'squad needs a club code from find_club.' };
        if (str(a.question).length < 4) return { accept: false, error: 'Pass the question on.' };
        return { accept: true, value: { to, q: str(a.question).slice(0, 300), club: to === 'squad' ? str(a.club).toUpperCase() : undefined, why: str(a.why).slice(0, 160) || 'Routed by the router agent.' } };
      },
      describe: (a) => `route_to(${str(a.destination)})`
    }
  ];
}
