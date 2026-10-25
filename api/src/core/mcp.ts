// The simulation engine as an MCP server (Model Context Protocol, HTTP transport, stateless JSON
// responses). Any MCP client (GitHub Copilot agent mode, Claude, a Foundry agent) can look up the
// league, run Settle It experiments, play out a what-if over 10,000 seasons, ask "what would it
// take?", or pull a recap or broadcast cues. Read-only, deterministic, no model calls: the same tools
// the app's own agents use, so an outside agent gets exactly the numbers the app shows.

import type { League } from '../../../src/data/types';
import { computeGhost, computeTimeline, type Timeline } from '../../../src/engine/demo';
import { finalOf, ripple, universe } from '../../../src/engine/league';
import { deserveExperiment } from '../../../src/engine/settle';
import { playerImpact, races, standings, type Races, type Standings } from '../../../src/engine/races';
import { searchChanges } from '../../../src/engine/takes';
import { drFootball } from '../../../src/agents/drFootball';
import { candidates, parseGoal, takesView } from '../../../src/agents/takes';
import { matchRecap } from '../../../src/agents/recap';
import { overlayCues } from '../../../src/agents/overlay';
import { clubCard } from '../../../src/agents/currentAffairs';
import type { Persona } from '../../../src/agents/format';
import type { Tool } from './loop';
import { dataScientistTools, drFootballTools, lookupTools, searchPlayersTool } from './tools';

export const MCP_PROTOCOL = '2025-06-18';
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

type Json = Record<string, unknown>;
interface RpcRequest { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Json }

const obj = (props: Json, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const S = (description: string) => ({ type: 'string', description });
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const pct = (x: number) => Math.round(x * 1000) / 10;

/** Everything an outside agent can call. Built once per instance; heavy results are memoised. */
export function mcpTools(league: League): Tool[] {
  let st: Standings | null = null;
  let rc: Races | null = null;
  const tls = new Map<string, Timeline>();
  const timeline = (id: string) => { if (!tls.has(id)) tls.set(id, computeTimeline(league, league.feeds.find((f) => f.fixtureId === id)!)); return tls.get(id)!; };
  const feedOf = (id: string) => league.feeds.find((f) => f.fixtureId === id);
  const persona = (v: unknown) => (['casual', 'home', 'away', 'analyst'].includes(str(v)) ? str(v) : 'casual') as Persona;
  const short = (code: string) => league.clubs.find((c) => c.code === code)?.short ?? code;

  const lookups = [...lookupTools(league), searchPlayersTool(league)];
  const fromAgents = [
    ...dataScientistTools(league, () => timeline(league.demo.fixtureId)).filter((t) => ['run_experiment', 'list_fixtures', 'list_stopped_attacks', 'list_changes'].includes(t.name)),
    ...drFootballTools(league).filter((t) => t.name === 'check_scenario')
  ];
  const own: Tool[] = [
    {
      name: 'standings', description: 'The table after this matchweek with each club\'s chance (10,000 simulated run-ins) of winning the league, a top-four finish and relegation, points against what their chances deserved, and form.',
      parameters: obj({}),
      run: () => {
        st ??= standings(league);
        return st.clubs.map((c) => ({ pos: c.pos, club: short(c.code), code: c.code, pts: c.row.pts, gd: c.row.gf - c.row.ga, deserved: c.xpts, form: c.form.join(''), title: pct(c.outlook.title), top4: pct(c.outlook.top4), relegated: pct(c.outlook.rel) }));
      }
    },
    {
      name: 'club_outlook', description: 'One club in depth: where it stands, its chances with 95% ranges, how lucky it has been, and the odds for every game left. Plain-English lines included.',
      parameters: obj({ club: S('club code from find_club, e.g. NBR') }, ['club']),
      run: (a) => {
        st ??= standings(league);
        const code = str(a.club).toUpperCase();
        const c = st.clubs.find((x) => x.code === code);
        if (!c) return { error: 'Unknown club code. Use find_club.' };
        const card = clubCard(league, st, code);
        return { club: short(code), position: c.pos, points: c.row.pts, summary: [card.headline.text, card.luck.text, card.run.text], odds: card.odds.map((o) => ({ ...o, p: pct(o.p), lo: pct(o.lo), hi: pct(o.hi) })), gamesLeft: c.next.map((n) => ({ matchweek: n.mw, opponent: short(n.opp), home: n.home, win: pct(n.home ? n.p.home : n.p.away), draw: pct(n.p.draw) })) };
      }
    },
    {
      name: 'player_races', description: 'Top scorer, top assister and most clean sheets: each contender\'s chance of finishing top and projected total, from 10,000 simulated run-ins.',
      parameters: obj({}),
      run: () => {
        rc ??= races(league);
        const name = (id: string) => league.players.find((p) => p.id === id)!.name;
        const pick = (xs: Races['goals']) => xs.slice(0, 6).map((x) => ({ player: name(x.id), now: x.now, projected: x.mean, range: [x.lo, x.hi], finishesTop: pct(x.top) }));
        return { gamesLeft: rc.games, goals: pick(rc.goals), assists: pick(rc.assists), cleanSheets: pick(rc.cleanSheets) };
      }
    },
    {
      name: 'player_without', description: 'Play the season without one player (his best replacement steps in) and report how his club\'s chance in its race moves.',
      parameters: obj({ player: S('player id from find_player, e.g. NBR-9') }, ['player']),
      run: (a) => {
        if (!league.players.some((p) => p.id === str(a.player))) return { error: 'Unknown player id. Use find_player.' };
        const r = playerImpact(league, str(a.player));
        return { club: short(r.club), race: r.race, with: pct(r.base), without: pct(r.without), change: r.delta, seasons: r.n };
      }
    },
    {
      name: 'play_what_if', description: 'Play out a what-if over 10,000 seasons. Sentence forms: "What if <player> had never joined <club>?", "...had joined <club>?", "...had missed the season?", "What if <manager> had taken over <club> in August?", "What if <club> had pressed higher all season?", "What if <club> had been docked <n> points?", or a moment flipped. Check the sentence with check_scenario first.',
      parameters: obj({ sentence: S('one what-if sentence') }, ['sentence']),
      run: (a) => {
        const p = drFootball(league, str(a.sentence));
        if (!p.ok) return { error: p.reply };
        const u = universe(league, p.levers);
        const clubs = [...new Set([p.focus, p.other, ...u.affected].filter(Boolean) as string[])].slice(0, 4);
        return { scenario: p.short, seasons: u.n, clubs: clubs.map((c) => ({ club: short(c), title: [pct(u.real[c].title), pct(u.alt[c].title)], top4: [pct(u.real[c].top4), pct(u.alt[c].top4)], relegated: [pct(u.real[c].rel), pct(u.alt[c].rel)], avgPoints: [Math.round(u.real[c].avgPts), Math.round(u.alt[c].avgPts)] })), note: 'Each pair is [real season, this universe], in percent.' };
      }
    },
    {
      name: 'what_would_it_take', description: 'Search every change the simulator can make (signings, managers, tactics, single moments, a rival\'s injury, and pairs) for the smallest one that gets a club to a goal. Takes a few seconds.',
      parameters: obj({ question: S('e.g. "What would it take for Northbridge to finish in the top four?"') }, ['question']),
      run: (a) => {
        const g = parseGoal(league, str(a.question));
        if ('error' in g) return { error: g.error };
        const phrased = candidates(league, g);
        const r = searchChanges(league, { ...g, candidates: phrased.map(({ id, levers, cost, tag }) => ({ id, levers, cost, tag })) });
        const v = takesView(league, r, phrased);
        return { goal: v.goalLine, answer: `${v.head} ${v.sub}`, routes: v.rows.map((x) => ({ change: x.short, kind: x.tag, chance: x.p, range: [x.lo, x.hi], reachesTarget: x.reaches, sentence: x.sentence })), pointsNeeded: r.pointsNeeded, universesSearched: r.screened };
      }
    },
    {
      name: 'match_recap', description: 'The full-time recap of a matchweek game, written from the engine\'s results and checked by the Verifier. Persona: casual, home (a fan of the home side), away, analyst.',
      parameters: obj({ fixtureId: S('from list_fixtures'), persona: S('casual | home | away | analyst') }, ['fixtureId']),
      run: (a) => {
        const f = feedOf(str(a.fixtureId));
        if (!f) return { error: 'Unknown fixture. Use list_fixtures.' };
        const r = matchRecap(league, f, timeline(f.fixtureId), ripple(league, finalOf(f), undefined, f.fixtureId), deserveExperiment(league, undefined, undefined, f), persona(a.persona));
        return { headline: r.headline, paragraphs: r.paragraphs, verified: r.verdict.ok, numbersChecked: r.verdict.checked };
      }
    },
    {
      name: 'overlay_cues', description: 'Timed, machine-readable broadcast graphics cues for a match (schema whatif.overlay/1): score updates, win-probability graphics, lower thirds and Ghost Run panels.',
      parameters: obj({ fixtureId: S('from list_fixtures'), persona: S('casual | home | away | analyst') }, ['fixtureId']),
      run: (a) => {
        const f = feedOf(str(a.fixtureId));
        if (!f) return { error: 'Unknown fixture. Use list_fixtures.' };
        return overlayCues(league, f, timeline(f.fixtureId), f.stoppedAttacks.map((x) => computeGhost(x)), persona(a.persona));
      }
    }
  ];
  return [...lookups, ...fromAgents, ...own];
}

const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** One JSON-RPC message in, one response out (null for notifications). */
export async function handleMcp(tools: Tool[], msg: unknown): Promise<unknown> {
  const req = msg as RpcRequest;
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return fail(null, -32600, 'Invalid request');
  const isNotification = req.id === undefined;
  switch (req.method) {
    case 'initialize': {
      const asked = str(req.params?.protocolVersion);
      return ok(req.id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : MCP_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'what-if-engine', title: 'What If? simulation engine', version: '1.0.0' },
        instructions: 'A synthetic football league (the Meridian League; every club and player is invented) and the seeded simulation engine behind the What If? app. Look names up with find_player / find_club before using ids. Results are deterministic: the same question always gives the same numbers.'
      });
    }
    case 'ping': return ok(req.id, {});
    case 'tools/list':
      return ok(req.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } })) });
    case 'tools/call': {
      const name = str(req.params?.name);
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(req.id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.run((req.params?.arguments as Json) ?? {});
        const isError = !!result && typeof result === 'object' && 'error' in (result as Json);
        return ok(req.id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: Array.isArray(result) ? { items: result } : result, isError });
      } catch (err) {
        return ok(req.id, { content: [{ type: 'text', text: `Tool failed: ${String(err).slice(0, 200)}` }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized and friends need no reply
      return fail(req.id, -32601, `Method not found: ${req.method}`);
  }
}

