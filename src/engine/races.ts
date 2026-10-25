// Current Affairs: the league as it stands, and where it's heading.
//   standings()  the table after this matchweek, every club's run-in outlook (10,000 seasons, with
//                ranges), points against what the chances deserved, form, and the odds for each
//                remaining fixture
//   races()      the remaining fixtures played 10,000 times with goals and assists handed out the
//                way the season's were: who finishes top scorer, top assister, most clean sheets
//   playerImpact() one player's club, with him missing the season: how far its race moves
//   squadImpact() how far a club's race moves without each of its key players

import type { League, Player } from '../data/types';
import { clubRatings, score } from './ratings';
import { matchRates, playMatch, winProb, type Outcome } from './match';
import { buildTable, type ClubOutlook, type Row } from './season';
import { RUNIN_SIMS, demoFinal, playedResults, realSeason, remainingPairings, table, universe } from './league';
import { raceProb, type Race } from './takes';
import { hashSeed, mulberry32, type Rng } from './rng';

// ---------------- standings ----------------

export interface ClubSummary {
  code: string;
  row: Row; // after this matchweek
  pos: number;
  posBefore: number; // going into this matchweek
  form: ('W' | 'D' | 'L')[]; // last five, oldest first
  home: { w: number; d: number; l: number };
  away: { w: number; d: number; l: number };
  xpts: number; // points the chances deserved: sum of 3·P(win) + P(draw) over games played
  cleanSheets: number;
  outlook: ClubOutlook;
  race: Race;
  next: { mw: number; opp: string; home: boolean; p: Outcome }[]; // remaining fixtures, with exact odds
}

export interface Standings { mw: number; clubs: ClubSummary[]; pending: { home: string; away: string; kickoff: string }[]; n: number }

/** The race that matters for a club, from where it sits. */
export const raceAt = (pos: number): Race => (pos <= 3 ? 'title' : pos <= 10 ? 'top4' : 'survive');

export function standings(league: League, n = RUNIN_SIMS): Standings {
  const codes = league.clubs.map((c) => c.code);
  const results = playedResults(league);
  const rows = buildTable(codes, results);
  const before = table(league); // going into the matchweek (the flagship not yet played)
  const outlook = realSeason(league, n);
  const ratings = clubRatings(league.clubs, league.players);
  const played = league.fixtures.filter((f) => f.hg !== undefined || f.id === league.demo.fixtureId)
    .map((f) => (f.id === league.demo.fixtureId ? { ...f, ...demoFinal(league) } : f))
    .sort((a, b) => a.mw - b.mw);
  const remaining = remainingPairings(league);
  const fixtureMw = new Map(league.fixtures.map((f) => [`${f.home}-${f.away}`, f.mw]));
  const clubs = rows.map((row, i): ClubSummary => {
    const mine = played.filter((f) => f.home === row.code || f.away === row.code);
    const res = (f: (typeof mine)[number]) => {
      const gf = f.home === row.code ? f.hg! : f.ag!, ga = f.home === row.code ? f.ag! : f.hg!;
      return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    };
    const rec = (home: boolean) => {
      const r = { w: 0, d: 0, l: 0 };
      for (const f of mine.filter((x) => (x.home === row.code) === home)) { const o = res(f); if (o === 'W') r.w++; else if (o === 'D') r.d++; else r.l++; }
      return r;
    };
    let xpts = 0;
    for (const f of mine) {
      const o = winProb({ minute: 0, home: 0, away: 0 }, matchRates(ratings[f.home], ratings[f.away]));
      xpts += f.home === row.code ? 3 * o.home + o.draw : 3 * o.away + o.draw;
    }
    const next = remaining.filter((g) => g.home === row.code || g.away === row.code).map((g) => ({
      mw: fixtureMw.get(`${g.home}-${g.away}`) ?? league.currentMw,
      opp: g.home === row.code ? g.away : g.home,
      home: g.home === row.code,
      p: winProb({ minute: 0, home: 0, away: 0 }, matchRates(ratings[g.home], ratings[g.away]))
    })).sort((a, b) => a.mw - b.mw);
    return {
      code: row.code, row, pos: i + 1, posBefore: before.findIndex((r) => r.code === row.code) + 1,
      form: mine.slice(-5).map(res), home: rec(true), away: rec(false),
      xpts: Math.round(xpts * 10) / 10,
      cleanSheets: mine.filter((f) => (f.home === row.code ? f.ag : f.hg) === 0).length,
      outlook: outlook[row.code], race: raceAt(i + 1), next
    };
  });
  const playedIds = new Set(results.length ? league.fixtures.filter((f) => f.hg !== undefined).map((f) => f.id) : []);
  playedIds.add(league.demo.fixtureId);
  const pending = league.fixtures.filter((f) => f.mw === league.currentMw && !playedIds.has(f.id)).map((f) => ({ home: f.home, away: f.away, kickoff: f.kickoff }));
  return { mw: league.currentMw, clubs, pending, n };
}

// ---------------- player races ----------------

/** The same shares The Forge used to hand out the season's goals and assists. */
export const scorerWeight = (p: Player) => ({ FW: 3, MF: 1, DF: 0.25, GK: 0 }[p.pos]) * Math.pow(p.attrs.finishing / 70, 3) * (p.starter ? 3 : 1);
export const assistWeight = (p: Player) => ({ FW: 2, MF: 3, DF: 1, GK: 0.05 }[p.pos]) * Math.pow(p.attrs.passing / 70, 3) * (p.starter ? 3 : 1);
const ASSISTED = 0.74;

export interface RaceLine {
  id: string;
  now: number; // goals (or assists) so far
  mean: number; // projected season total
  lo: number; hi: number; // 90% range for the season total
  top: number; // P(finish top, alone or shared)
  outright: number; // P(finish top alone)
  top3: number; // P(finish in the top three by count, ties counted in)
}
export interface Races { goals: RaceLine[]; assists: RaceLine[]; cleanSheets: RaceLine[]; n: number; games: number }

export function races(league: League, n = RUNIN_SIMS, seed = hashSeed('races')): Races {
  const ratings = clubRatings(league.clubs, league.players);
  const games = remainingPairings(league).map((g) => ({ ...g, rates: matchRates(ratings[g.home], ratings[g.away]) }));
  const idx = new Map(league.players.map((p, i) => [p.id, i]));
  const N = league.players.length;
  const squads = new Map<string, { ids: number[]; sw: number[]; aw: number[]; st: number; at: number }>();
  for (const c of league.clubs) {
    const ps = league.players.filter((p) => p.club === c.code);
    const sw = ps.map(scorerWeight), aw = ps.map(assistWeight);
    squads.set(c.code, { ids: ps.map((p) => idx.get(p.id)!), sw, aw, st: sw.reduce((a, b) => a + b, 0), at: aw.reduce((a, b) => a + b, 0) });
  }
  const pick = (rng: Rng, ids: number[], w: number[], total: number) => {
    let r = rng() * total;
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  };
  // clean sheets go to each club's first-choice keeper
  const keeperOf = new Map(league.clubs.map((c) => [c.code, idx.get(league.players.find((p) => p.club === c.code && p.pos === 'GK' && p.starter)!.id)!]));
  const baseC = Float64Array.from(league.players, (p) => (p.pos === 'GK' && p.starter ? p.cleanSheets ?? 0 : 0));
  const baseG = Float64Array.from(league.players, (p) => p.goals);
  const baseA = Float64Array.from(league.players, (p) => p.assists ?? 0);
  // only players within reach of the top can finish there; track the rest cheaply
  const contenders = (base: Float64Array, extra: number) => {
    const best = Math.max(...base);
    return [...base.keys()].filter((i) => base[i] >= best - extra);
  };
  const reach = Math.max(6, Math.ceil(games.length / 2.5));
  const gC = contenders(baseG, reach), aC = contenders(baseA, reach), cC = contenders(baseC, Math.max(4, Math.ceil(games.length / 8)));
  const track = (cands: number[]) => ({ cands, sum: new Float64Array(N), top: new Float64Array(N), out: new Float64Array(N), t3: new Float64Array(N), hist: cands.map(() => new Map<number, number>()) });
  const G = track(gC), A = track(aC), CS = track(cC);
  const g = new Float64Array(N), a = new Float64Array(N), cs = new Float64Array(N);
  const rng = mulberry32(seed);
  const tally = (T: ReturnType<typeof track>, v: Float64Array) => {
    let best = -1, count = 0;
    const vals = T.cands.map((i) => v[i]).sort((x, y) => y - x);
    const third = vals[Math.min(2, vals.length - 1)];
    for (const i of T.cands) { if (v[i] > best) { best = v[i]; count = 1; } else if (v[i] === best) count++; }
    T.cands.forEach((i, k) => {
      T.sum[i] += v[i];
      T.hist[k].set(v[i], (T.hist[k].get(v[i]) ?? 0) + 1);
      if (v[i] === best) { T.top[i]++; if (count === 1) T.out[i]++; }
      if (v[i] >= third) T.t3[i]++;
    });
  };
  for (let s = 0; s < n; s++) {
    g.set(baseG); a.set(baseA); cs.set(baseC);
    for (const game of games) {
      const r = playMatch(game.rates, rng);
      if (r.away === 0) cs[keeperOf.get(game.home)!]++;
      if (r.home === 0) cs[keeperOf.get(game.away)!]++;
      for (const [code, goals] of [[game.home, r.home], [game.away, r.away]] as const) {
        const sq = squads.get(code)!;
        for (let k = 0; k < goals; k++) {
          g[pick(rng, sq.ids, sq.sw, sq.st)]++;
          if (rng() < ASSISTED) a[pick(rng, sq.ids, sq.aw, sq.at)]++;
        }
      }
    }
    tally(G, g); tally(A, a); tally(CS, cs);
  }
  const lines = (T: ReturnType<typeof track>, base: Float64Array): RaceLine[] => T.cands.map((i, k) => {
    const h = [...T.hist[k]].sort((x, y) => x[0] - y[0]);
    const q = (p: number) => { let c = 0; for (const [v, m] of h) { c += m; if (c >= p * n) return v; } return h[h.length - 1][0]; };
    return { id: league.players[i].id, now: base[i], mean: Math.round((T.sum[i] / n) * 10) / 10, lo: q(0.05), hi: q(0.95), top: T.top[i] / n, outright: T.out[i] / n, top3: T.t3[i] / n };
  }).sort((x, y) => y.top - x.top || y.now - x.now);
  return { goals: lines(G, baseG), assists: lines(A, baseA), cleanSheets: lines(CS, baseC), n, games: games.length };
}

// ---------------- squad impact ----------------

export interface Impact { id: string; without: number; delta: number } // race chance without him, change in points (percentage)
export interface SquadImpact { club: string; race: Race; base: number; impacts: Impact[]; n: number }

const realCache = new Map<number, Record<string, ClubOutlook>>();
/** The real season at n runs, computed once per worker: every "without him" test compares against it. */
const realAt = (league: League, n: number) => { if (!realCache.has(n)) realCache.set(n, realSeason(league, n)); return realCache.get(n)!; };
const raceOf = (league: League, club: string) => raceAt(buildTable(league.clubs.map((c) => c.code), playedResults(league)).findIndex((r) => r.code === club) + 1);

/** The club's race chance with each of its key starters missing the season. */
export function squadImpact(league: League, club: string, n = 2000): SquadImpact {
  const race = raceOf(league, club);
  const real = realAt(league, n);
  const base = raceProb(real[club], race).p;
  const key = league.players.filter((p) => p.club === club && p.starter).sort((x, y) => score(y) - score(x)).slice(0, 6);
  const impacts = key.map((p) => {
    const u = universe(league, [{ kind: 'player_out', player: p.id }], n, undefined, real);
    const without = raceProb(u.alt[club], race).p;
    return { id: p.id, without, delta: Math.round((without - base) * 100) };
  }).sort((x, y) => x.delta - y.delta);
  return { club, race, base, impacts, n };
}

export interface PlayerImpact { id: string; club: string; race: Race; base: number; without: number; delta: number; n: number }

/** One player out for the season (his best replacement promoted): his club's race chance before and after. */
export function playerImpact(league: League, id: string, n = 2000): PlayerImpact {
  const p = league.players.find((x) => x.id === id)!;
  const race = raceOf(league, p.club);
  const real = realAt(league, n);
  const base = raceProb(real[p.club], race).p;
  const without = raceProb(universe(league, [{ kind: 'player_out', player: id }], n, undefined, real).alt[p.club], race).p;
  return { id, club: p.club, race, base, without, delta: Math.round((without - base) * 100), n };
}
