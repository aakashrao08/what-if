// Azure Cosmos DB: the league's database, and the agents' run log.
//   whatif/clubs     one document per club (partition /code)
//   whatif/players   every player with all attributes, role and season stats (partition /club)
//   whatif/fixtures  the 380-game schedule and results (partition /mw)
//   whatif/feeds     each matchweek game's event feed (partition /fixtureId)
//   whatif/runs      one document per agent run: agents, tool calls, tokens, latency, fallbacks (partition /day)
// Switched on by COSMOS_ENDPOINT and COSMOS_KEY. Seeded from the forged league on first use, and again
// only when the league changes. The engine keeps using the bundled snapshot so every number stays
// deterministic; the database serves look-ups, search and the run log.

import { CosmosClient, type Container, type Database } from '@azure/cosmos';
import type { League } from '../../../src/data/types';
import type { TraceEvent, Usage } from '../../../src/agents/contract';

export interface Db { db: Database; clubs: Container; players: Container; fixtures: Container; feeds: Container; runs: Container; meta: Container }

let ready: Promise<Db | null> | null = null;

/** The league's identity: when this changes, the database is reseeded. */
export const leagueVersion = (league: League) => `${league.seed}:${league.players.length}:${league.generatedAt}:${Object.keys(league.players[0]).length}`;

export function getDb(league: League, env: Record<string, string | undefined> = process.env): Promise<Db | null> {
  if (!env.COSMOS_ENDPOINT || !env.COSMOS_KEY) return Promise.resolve(null);
  ready ??= (async () => {
    try {
      const client = new CosmosClient({ endpoint: env.COSMOS_ENDPOINT!, key: env.COSMOS_KEY! });
      // shared database throughput keeps all six containers inside the free tier
      const { database } = await client.databases.createIfNotExists({ id: env.COSMOS_DATABASE || 'whatif', throughput: 400 });
      const make = async (id: string, key: string) => (await database.containers.createIfNotExists({ id, partitionKey: { paths: [key] } })).container;
      const db: Db = {
        db: database,
        clubs: await make('clubs', '/code'), players: await make('players', '/club'), fixtures: await make('fixtures', '/mw'),
        feeds: await make('feeds', '/fixtureId'), runs: await make('runs', '/day'), meta: await make('meta', '/id')
      };
      void seed(db, league); // in the background: requests don't wait for it
      return db;
    } catch {
      ready = null; // try again on the next request
      return null;
    }
  })();
  return ready;
}

let seeding: Promise<void> | null = null;
async function seed(db: Db, league: League) {
  seeding ??= (async () => {
    const version = leagueVersion(league);
    const current = await db.meta.item('league', 'league').read<{ version: string }>().catch(() => null);
    if (current?.resource?.version === version) return;
    const put = async (c: Container, docs: Record<string, unknown>[]) => {
      for (let i = 0; i < docs.length; i += 20) await Promise.all(docs.slice(i, i + 20).map((d) => c.items.upsert(d)));
    };
    await put(db.clubs, league.clubs.map((c) => ({ id: c.code, ...c })));
    await put(db.players, league.players.map((p) => ({ ...p, id: p.id })));
    await put(db.fixtures, league.fixtures.map((f) => ({ ...f, id: f.id })));
    await put(db.feeds, league.feeds.map((f) => ({ id: f.fixtureId, fixtureId: f.fixtureId, home: f.home, away: f.away, kickoff: f.kickoff, events: f.events, keyMoments: f.keyMoments.map(({ frame: _frame, ...k }) => k) })));
    await db.meta.items.upsert({ id: 'league', version, seededAt: new Date().toISOString(), counts: { clubs: league.clubs.length, players: league.players.length, fixtures: league.fixtures.length, feeds: league.feeds.length } });
  })().catch(() => { seeding = null; });
  return seeding;
}

/** Whether the database holds the current league (for /api/health). */
export async function dbStatus(league: League): Promise<{ configured: boolean; seeded?: boolean; counts?: unknown }> {
  const db = await getDb(league);
  if (!db) return { configured: !!process.env.COSMOS_ENDPOINT };
  const m = await db.meta.item('league', 'league').read<{ version: string; counts: unknown }>().catch(() => null);
  return { configured: true, seeded: m?.resource?.version === leagueVersion(league), counts: m?.resource?.counts };
}

export interface PlayerQuery { club?: string; role?: string; pos?: string; minApps?: number; sort?: string; limit?: number }
const SORTABLE = new Set(['goals', 'assists', 'xg', 'shots', 'keyPasses', 'progPasses', 'progCarries', 'crosses', 'dribbles', 'tackles', 'interceptions', 'clearances', 'blocks', 'aerials', 'passAcc', 'cleanSheets', 'saves', 'prevented', 'yellow', 'red', 'apps', 'age']);

/** The same search over the database, as parameterised SQL (no string building from user input). */
export async function queryPlayers(db: Db, q: PlayerQuery): Promise<Record<string, unknown>[]> {
  const where: string[] = [];
  const parameters: { name: string; value: string | number }[] = [];
  if (q.club) { where.push('p.club = @club'); parameters.push({ name: '@club', value: q.club }); }
  if (q.role) { where.push('p.role = @role'); parameters.push({ name: '@role', value: q.role }); }
  if (q.pos) { where.push('p.pos = @pos'); parameters.push({ name: '@pos', value: q.pos }); }
  if (q.minApps) { where.push('p.apps >= @apps'); parameters.push({ name: '@apps', value: q.minApps }); }
  const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'goals';
  const limit = Math.max(1, Math.min(25, q.limit ?? 10));
  const query = `SELECT TOP ${limit} * FROM p${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.${sort} DESC`;
  const { resources } = await db.players.items.query({ query, parameters }).fetchAll();
  return resources;
}

export interface RunLog { pipeline: string; model: string; ok: boolean; cached: boolean; ms: number; usage?: Usage; trace?: TraceEvent[]; fallbacks: number }

/** One row per agent run, no personal data: what ran, how long, what it cost, whether anything fell back. */
export async function logRun(league: League, run: RunLog) {
  const db = await getDb(league);
  if (!db) return;
  const at = new Date();
  const doc = {
    id: `${at.getTime()}-${Math.random().toString(36).slice(2, 8)}`, day: at.toISOString().slice(0, 10), at: at.toISOString(),
    pipeline: run.pipeline, model: run.model, ok: run.ok, cached: run.cached, ms: run.ms, fallbacks: run.fallbacks,
    calls: run.usage?.calls ?? 0, promptTokens: run.usage?.promptTokens ?? 0, completionTokens: run.usage?.completionTokens ?? 0,
    agents: [...new Set((run.trace ?? []).map((e) => e.agent))], tools: (run.trace ?? []).filter((e) => e.kind === 'tool').map((e) => e.name)
  };
  await db.runs.items.create(doc).catch(() => undefined);
}
