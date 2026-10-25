// Fair credit for a match's turning points: exact Shapley values over every combination of
// "as it happened" and "the other way", on the focus side's win probability.

import type { DemoMatch, League, Side } from '../data/types';
import { FULL_TIME, winProb, type LiveState } from './match';
import { matchContext, stateAt } from './demo';

export interface CreditRow {
  id: string;
  eventId: string;
  minute: number;
  /** Shapley value: this moment's fair share of the total, in win-probability points for the focus side */
  shapley: number;
  /** flip only this moment and keep the rest as they happened: the change, in points (as happened minus flipped) */
  solo: number;
}

export interface CreditResult {
  fixtureId: string;
  focus: Side;
  /** the minute the match is evaluated from: just before the first turning point */
  from: number;
  asHappened: number; // focus win %, every moment as it happened
  allFlipped: number; // focus win %, every moment the other way
  total: number; // asHappened - allFlipped; the Shapley values add up to this
  moments: CreditRow[];
  combos: number; // 2^k worlds evaluated
}

export const MAX_CREDIT_MOMENTS = 12;

/**
 * The game: the players are the key moments. In world S, the moments in S happen as they did and the rest go the
 * other way (a goal not scored, a saved chance scored). v(S) is the focus side's final win probability, computed
 * exactly from just before the earliest moment: each moment's outcome in S is a goal scheduled at its minute (or
 * no goal), and the exact match model (match.ts) plays everything around them, game state included. So timing
 * counts (a winner at 87′ leaves less time to answer than an equaliser at 52′) and nothing is sampled.
 * Shapley values split v(all) - v(none) between the moments and credit interactions fairly: two goals that are
 * each worth little alone but decisive together share the credit.
 */
export function momentShapley(league: League, feed: DemoMatch = league.demo, focus?: Side): CreditResult {
  const ctx = matchContext(league, feed);
  const kms = feed.keyMoments.slice(0, MAX_CREDIT_MOMENTS);
  const evs = kms.map((km) => feed.events.find((e) => e.id === km.eventId)!);
  let fh = 0, fa = 0;
  for (const e of feed.events) if (e.type === 'goal') { if (e.team === 'home') fh++; else fa++; }
  const side: Side = focus ?? (fa > fh ? 'away' : 'home');
  const from = Math.max(0, Math.min(FULL_TIME, ...evs.map((e) => e.minute)));
  // the match as it stood just before the first turning point; its goals are already in the score
  const base = stateAt(ctx, from, false);
  // the goal each moment puts on the board, as it happened (bit set) or the other way (bit clear)
  const goalOf = (i: number, asHappened: boolean): Side | null => {
    const km = kms[i];
    if (km.cf.type === 'remove_goal') return asHappened ? (evs[i].team ?? 'home') : null;
    return asHappened ? null : km.cf.team;
  };
  const k = kms.length;
  const v = new Float64Array(1 << k);
  for (let mask = 0; mask < 1 << k; mask++) {
    const goals: NonNullable<LiveState['goals']> = [];
    for (let i = 0; i < k; i++) {
      const g = goalOf(i, (mask & (1 << i)) !== 0);
      if (g) goals.push({ minute: evs[i].minute, side: g });
    }
    goals.sort((a, b) => a.minute - b.minute);
    const o = winProb({ ...base, goals }, ctx.rates);
    v[mask] = (side === 'home' ? o.home : o.away) * 100;
  }
  const fact = [1];
  for (let i = 1; i <= k; i++) fact.push(fact[i - 1] * i);
  const all = (1 << k) - 1;
  const moments: CreditRow[] = kms.map((km, i) => {
    let phi = 0;
    for (let mask = 0; mask <= all; mask++) {
      if (mask & (1 << i)) continue;
      let size = 0;
      for (let b = mask; b; b &= b - 1) size++;
      phi += (fact[size] * fact[k - size - 1] / fact[k]) * (v[mask | (1 << i)] - v[mask]);
    }
    return { id: km.id, eventId: km.eventId, minute: evs[i].minute, shapley: phi, solo: v[all] - v[all & ~(1 << i)] };
  });
  return { fixtureId: feed.fixtureId, focus: side, from, asHappened: v[all], allFlipped: v[0], total: v[all] - v[0], moments, combos: 1 << k };
}
