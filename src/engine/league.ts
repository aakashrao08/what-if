// League-level engine: the table, run-ins (Ripple) and alternate seasons (Multiverse).

import type { DemoMatch, League, Side, ClubStyle } from '../data/types';
import { clubRatings, type Ratings, type SquadOverride } from './ratings';
import { matchRates, playRest } from './match';
import { buildTable, runIn, type Adjustment, type ClubOutlook, type Pairing, type Result, type Row } from './season';
import { matchContext, stateAt } from './demo';
import { hashSeed } from './rng';

export const RUNIN_SIMS = 10000;

export interface Score { hg: number; ag: number }
export interface FixtureResult extends Score { fixtureId: string }

export const feedOf = (league: League, fixtureId: string): DemoMatch | undefined => league.feeds.find((f) => f.fixtureId === fixtureId);

export function finalOf(feed: DemoMatch): Score {
  let hg = 0, ag = 0;
  for (const e of feed.events) if (e.type === 'goal') { if (e.team === 'home') hg++; else ag++; }
  return { hg, ag };
}
export const demoFinal = (league: League) => finalOf(league.demo);

/** Every result as things stand at full time across the matchweek (the flagship match included). */
function seasonResults(league: League): Map<string, Score> {
  const m = new Map<string, Score>();
  for (const f of league.fixtures) if (f.hg !== undefined) m.set(f.id, { hg: f.hg, ag: f.ag! });
  m.set(league.demo.fixtureId, demoFinal(league));
  return m;
}

/** Results with one fixture set to a score, or left unplayed (null). */
export function playedResults(league: League, override?: { fixtureId: string; score: Score | null }): Result[] {
  const m = seasonResults(league);
  if (override) { if (override.score) m.set(override.fixtureId, override.score); else m.delete(override.fixtureId); }
  return league.fixtures.filter((f) => m.has(f.id)).map((f) => ({ home: f.home, away: f.away, hg: m.get(f.id)!.hg, ag: m.get(f.id)!.ag }));
}

export function remainingPairings(league: League, unplayed: string[] = []): Pairing[] {
  const m = seasonResults(league);
  return league.fixtures.filter((f) => !m.has(f.id) || unplayed.includes(f.id)).map((f) => ({ home: f.home, away: f.away }));
}

/** The table, either as it stands or with one fixture at a given score (null = before it kicked off). */
export function table(league: League, override?: { fixtureId: string; score: Score | null }): Row[] {
  return buildTable(league.clubs.map((c) => c.code), playedResults(league, override ?? { fixtureId: league.demo.fixtureId, score: null }));
}

export interface RippleResult {
  fixtureId: string;
  result: Score;
  before: Record<string, ClubOutlook>; // at kick-off
  after: Record<string, ClubOutlook>; // with this result
  tableBefore: Row[];
  tableAfter: Row[];
  n: number;
}

/** What one result does to every club's season: the run-in before kick-off against the run-in after it. */
export function ripple(league: League, result: Score, n = RUNIN_SIMS, fixtureId = league.demo.fixtureId): RippleResult {
  const codes = league.clubs.map((c) => c.code);
  const ratings = clubRatings(league.clubs, league.players);
  const seed = hashSeed('ripple', fixtureId);
  const before = runIn({ codes, fixed: playedResults(league, { fixtureId, score: null }), remaining: remainingPairings(league, [fixtureId]), ratings, n, seed });
  const after = runIn({ codes, fixed: playedResults(league, { fixtureId, score: result }), remaining: remainingPairings(league), ratings, n, seed });
  return {
    fixtureId, result, before, after, n,
    tableBefore: buildTable(codes, playedResults(league, { fixtureId, score: null })),
    tableAfter: buildTable(codes, playedResults(league, { fixtureId, score: result }))
  };
}

// ---------------- Multiverse ----------------

export type Lever =
  | { kind: 'transfer_cancel'; player: string; from: string; to: string } // player never left `from` for `to`
  | { kind: 'transfer_add'; player: string; to: string } // player joins `to` from matchweek 1
  | { kind: 'player_out'; player: string } // player misses the whole season
  | { kind: 'manager'; club: string; manager: string } // a different manager from matchweek 1
  | { kind: 'tactics'; club: string; style: Partial<ClubStyle>; label: string } // same manager, different approach
  | { kind: 'points'; club: string; delta: number } // a deduction (negative) or an award
  | { kind: 'moment'; momentId: string }; // a key moment in any matchweek game goes the other way

export interface UniverseResult {
  levers: Lever[];
  affected: string[];
  real: Record<string, ClubOutlook>;
  alt: Record<string, ClubOutlook>;
  ratingsReal: Ratings;
  ratingsAlt: Ratings;
  n: number;
  replayedMatches: number;
  /** for moment levers: how the rest of that match ends in the alternate branch */
  flipped?: { fixtureId: string; home: number; draw: number; away: number };
}

export function momentById(league: League, id: string) {
  for (const feed of league.feeds) {
    const km = feed.keyMoments.find((k) => k.id === id);
    if (km) return { feed, km, ev: feed.events.find((e) => e.id === km.eventId)! };
  }
  return null;
}

function mergeOverride(into: Record<string, SquadOverride>, code: string, o: SquadOverride) {
  const cur = into[code] ?? {};
  into[code] = {
    remove: [...(cur.remove ?? []), ...(o.remove ?? [])],
    addStarters: [...(cur.addStarters ?? []), ...(o.addStarters ?? [])],
    style: { ...(cur.style ?? {}), ...(o.style ?? {}) }
  };
}

function leverEffects(league: League, levers: Lever[]) {
  const overrides: Record<string, SquadOverride> = {};
  const affected = new Set<string>();
  const points: Record<string, number> = {};
  const P = (id: string) => league.players.find((p) => p.id === id)!;
  const club = (code: string) => league.clubs.find((c) => c.code === code)!;
  for (const lv of levers) {
    switch (lv.kind) {
      case 'transfer_cancel': {
        const p = P(lv.player);
        mergeOverride(overrides, lv.to, { remove: [p.id] });
        mergeOverride(overrides, lv.from, { addStarters: [{ ...p, club: lv.from }] });
        affected.add(lv.to); affected.add(lv.from);
        break;
      }
      case 'transfer_add': {
        const p = P(lv.player);
        mergeOverride(overrides, lv.to, { addStarters: [{ ...p, club: lv.to }] });
        mergeOverride(overrides, p.club, { remove: [p.id] });
        affected.add(lv.to); affected.add(p.club);
        break;
      }
      case 'player_out':
        mergeOverride(overrides, P(lv.player).club, { remove: [lv.player] });
        affected.add(P(lv.player).club);
        break;
      case 'manager':
        mergeOverride(overrides, lv.club, { style: league.managers.find((m) => m.name === lv.manager)!.style });
        affected.add(lv.club);
        break;
      case 'tactics': {
        const base = { ...club(lv.club).style, ...(overrides[lv.club]?.style ?? {}) };
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        mergeOverride(overrides, lv.club, { style: { press: clamp(base.press + (lv.style.press ?? 0)), line: clamp(base.line + (lv.style.line ?? 0)), tempo: clamp(base.tempo + (lv.style.tempo ?? 0)) } });
        affected.add(lv.club);
        break;
      }
      case 'points':
        points[lv.club] = (points[lv.club] ?? 0) + lv.delta;
        affected.add(lv.club);
        break;
      case 'moment': {
        const m = momentById(league, lv.momentId)!;
        affected.add(m.feed.home); affected.add(m.feed.away);
        break;
      }
    }
  }
  return { overrides, affected: [...affected], points };
}

/** The season as it stands, simulated n times: the "real" column every universe is compared with. */
export function realSeason(league: League, n = RUNIN_SIMS): Record<string, ClubOutlook> {
  const codes = league.clubs.map((c) => c.code);
  return runIn({ codes, fixed: playedResults(league), remaining: remainingPairings(league), ratings: clubRatings(league.clubs, league.players), n, seed: hashSeed('universe') });
}

/** `real` lets a search over many levers reuse one baseline run (it must be realSeason(league, n)). */
export function universe(league: League, levers: Lever[], n = RUNIN_SIMS, onProgress?: (done: number) => void, real: Record<string, ClubOutlook> = realSeason(league, n)): UniverseResult {
  const codes = league.clubs.map((c) => c.code);
  const ratingsReal = clubRatings(league.clubs, league.players);
  const { overrides, affected, points } = leverEffects(league, levers);
  const ratingsAlt = clubRatings(league.clubs, league.players, overrides);
  const seed = hashSeed('universe');

  // a flipped moment replaces that match's result with the rest of the match played out from the moment
  const moment = levers.find((l): l is Extract<Lever, { kind: 'moment' }> => l.kind === 'moment');
  let fixed = playedResults(league);
  const extra: Pairing[] = [];
  let flipped: UniverseResult['flipped'];
  let tally = { hw: 0, dr: 0 };
  if (moment) {
    const { feed, km, ev } = momentById(league, moment.momentId)!;
    const ctx = matchContext(league, feed);
    const state = km.cf.type === 'remove_goal' ? stateAt(ctx, ev.minute, true, ev.id) : stateAt(ctx, ev.minute, true, undefined, km.cf.team);
    fixed = playedResults(league, { fixtureId: feed.fixtureId, score: null });
    extra.push({
      home: feed.home, away: feed.away, play: (rng) => {
        const r = playRest(state, ctx.rates, rng);
        if (r.home > r.away) tally.hw++; else if (r.home === r.away) tally.dr++;
        return r;
      }
    });
    flipped = { fixtureId: feed.fixtureId, home: 0, draw: 0, away: 0 };
  }

  // season-long levers: every played match involving an affected club shifts by (alt - base) draws
  const seasonLevers = levers.some((l) => l.kind !== 'moment' && l.kind !== 'points');
  const adjust: Adjustment[] = seasonLevers
    ? fixed.filter((r) => affected.includes(r.home) || affected.includes(r.away))
      .map((r) => ({ home: r.home, away: r.away, base: matchRates(ratingsReal[r.home], ratingsReal[r.away]), alt: matchRates(ratingsAlt[r.home], ratingsAlt[r.away]) }))
    : [];
  tally = { hw: 0, dr: 0 };
  const alt = runIn({ codes, fixed, remaining: [...extra, ...remainingPairings(league)], ratings: ratingsAlt, n, seed, adjust, points, onProgress });
  if (flipped) flipped = { ...flipped, home: tally.hw / n, draw: tally.dr / n, away: (n - tally.hw - tally.dr) / n };
  return { levers, affected, real, alt, ratingsReal, ratingsAlt, n, replayedMatches: adjust.length + extra.length, flipped };
}

export const sideCode = (feed: DemoMatch, side: Side) => (side === 'home' ? feed.home : feed.away);
