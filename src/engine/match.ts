// Match model: Poisson scoring with game-state effects, used for live win probability,
// counterfactual forks and whole-season simulation. Live win probability is computed exactly by a
// forward pass over the scoreline distribution; playRest samples the same chain for replays.

import { poisson, type Rng } from './rng';
import type { TeamRating } from './ratings';

export const BASE_GOALS = 1.38; // league goals per team per match at average strength
export const HOME_ADV = 1.12;
export const AWAY_ADJ = 0.9;
export const PENALTY_XG = 0.78;

export interface Rates {
  home: number; // expected goals per 90 for the home side
  away: number;
}

export function matchRates(home: TeamRating, away: TeamRating): Rates {
  return {
    home: BASE_GOALS * home.att * away.def * HOME_ADV,
    away: BASE_GOALS * away.att * home.def * AWAY_ADJ
  };
}

export interface LiveState {
  minute: number;
  home: number;
  away: number;
  /** multiplier on the opponent's scoring rate when a side sits deeper (e.g. a back five) */
  homeShield?: number;
  awayShield?: number;
  /** multiplier on a side's own attack (e.g. a substitution) */
  homeBoost?: number;
  awayBoost?: number;
  /** changes that kick in later in the match (a planned back five, a substitution) */
  changes?: StateChange[];
  /** goals fixed in advance (fair credit replays turning points as scheduled events), sorted by minute */
  goals?: { minute: number; side: 'home' | 'away' }[];
}

export interface StateChange {
  minute: number;
  homeShield?: number;
  awayShield?: number;
  homeBoost?: number;
  awayBoost?: number;
}

export interface Outcome {
  home: number; // P(home win)
  draw: number;
  away: number;
}

export const FULL_TIME = 94; // including stoppage time

/** Low-score dependence (Dixon & Coles 1997): real matches end 0-0 and 1-1 more often, and 1-0 / 0-1 less
 * often, than two independent Poisson counts allow. Negative = more low-scoring draws. */
export const DC_RHO = -0.1;

/**
 * The Dixon–Coles correction as a move of probability mass between the four low-score cells. For independent
 * Poisson counts with means lh, la, reweighting by tau gives exactly this: with rho < 0, a 1-0 loses a share
 * -rho*la and a 0-1 a share -rho*lh, and the mass moved splits evenly between 0-0 and 1-1 (rho > 0 runs it the
 * other way). Written as a kernel so sampled and exact paths apply the identical correction.
 */
export function dcMoves(lh: number, la: number, rho = DC_RHO) {
  const c = (x: number) => Math.max(0, Math.min(1, x));
  return rho <= 0
    ? { from10: c(-rho * la), from01: c(-rho * lh), from00: 0, from11: 0 }
    : { from10: 0, from01: 0, from00: c(rho * lh * la), from11: c(rho) };
}

/** Apply the correction to one sampled pair of counts. `u` is drawn only when the pair sits in a cell that can move. */
export function dcAdjust(h: number, a: number, lh: number, la: number, rho: number, u: () => number): { home: number; away: number } {
  if (rho === 0 || h > 1 || a > 1) return { home: h, away: a };
  const mv = dcMoves(lh, la, rho);
  const share = h === 1 && a === 0 ? mv.from10 : h === 0 && a === 1 ? mv.from01 : h === 0 && a === 0 ? mv.from00 : mv.from11;
  if (share === 0) return { home: h, away: a };
  const x = u();
  if (x >= share) return { home: h, away: a };
  const firstHalf = x < share / 2;
  if (rho < 0) return firstHalf ? { home: 0, away: 0 } : { home: 1, away: 1 };
  return firstHalf ? { home: 1, away: 0 } : { home: 0, away: 1 };
}

/** The rates for one 3-minute step: game state matters, trailing sides push, leaders sit. */
interface Step { len: number; level: [number, number]; behind: [number, number]; ahead: [number, number]; forced: [number, number] }

/** The rest of the match as a list of steps, with scheduled changes folded in. Shared by sampled and exact paths. */
function steps(state: LiveState, rates: Rates): Step[] {
  const out: Step[] = [];
  const step = 3;
  let hb = state.homeBoost ?? 1, ab = state.awayBoost ?? 1, hs = state.homeShield ?? 1, as = state.awayShield ?? 1;
  const changes = state.changes ?? [];
  const goals = state.goals ?? [];
  let ci = 0, gi = 0;
  for (let m = state.minute; m < FULL_TIME; m += step) {
    while (ci < changes.length && changes[ci].minute <= m) {
      const c = changes[ci++];
      hb *= c.homeBoost ?? 1; ab *= c.awayBoost ?? 1; hs *= c.homeShield ?? 1; as *= c.awayShield ?? 1;
    }
    const len = Math.min(step, FULL_TIME - m);
    // scheduled goals land at the start of the step they fall in
    const forced: [number, number] = [0, 0];
    while (gi < goals.length && goals[gi].minute < m + len) forced[goals[gi++].side === 'home' ? 0 : 1]++;
    const late = m > 75 ? 1.12 : 1; // matches open up late
    const rh = (rates.home * hb * as * late * len) / 90;
    const ra = (rates.away * ab * hs * late * len) / 90;
    // behind / ahead are from the home side's point of view
    out.push({ len, level: [rh, ra], behind: [rh * 1.18, ra * 1.06], ahead: [rh * 0.92, ra * 1.18], forced });
  }
  // anything scheduled after the last step still counts
  if (gi < goals.length) {
    if (!out.length) out.push({ len: 0, level: [0, 0], behind: [0, 0], ahead: [0, 0], forced: [0, 0] });
    while (gi < goals.length) out[out.length - 1].forced[goals[gi++].side === 'home' ? 0 : 1]++;
  }
  return out;
}

const stepRates = (s: Step, h: number, a: number) => (h < a ? s.behind : h > a ? s.ahead : s.level);

/** Goals each side would expect in the rest of the match at a level score: the means the low-score correction uses. */
function restMeans(st: Step[]): [number, number, number, number] {
  let lh = 0, la = 0, fh = 0, fa = 0;
  for (const s of st) { lh += s.level[0]; la += s.level[1]; fh += s.forced[0]; fa += s.forced[1]; }
  return [lh, la, fh, fa];
}

/** Play out the rest of the match once. Game state matters: trailing sides push, leaders sit. */
export function playRest(state: LiveState, rates: Rates, rng: Rng, rho = DC_RHO): { home: number; away: number } {
  let h = state.home;
  let a = state.away;
  const st = steps(state, rates);
  for (const s of st) {
    h += s.forced[0]; a += s.forced[1];
    const [rh, ra] = stepRates(s, h, a);
    h += poisson(rng, rh);
    a += poisson(rng, ra);
  }
  // the low-score correction acts on the goals the model added, not on scheduled ones
  const [lh, la, fh, fa] = restMeans(st);
  const d = dcAdjust(h - state.home - fh, a - state.away - fa, lh, la, rho, rng);
  return { home: state.home + fh + d.home, away: state.away + fa + d.away };
}

/** Goals either side can still add in the exact pass; the last cell holds "this many or more". */
export const MAX_REST_GOALS = 12;
const MAX_STEP_GOALS = 8;

/** Final-score distribution from a live state: p[i * size + j] = P(home adds i, away adds j). */
export interface ScoreDist { home: number; away: number; size: number; p: Float64Array }

function stepPmf(lambda: number, out: Float64Array): number {
  // truncated Poisson; the last kept cell takes the tail so no mass is lost
  let p = Math.exp(-lambda), cdf = p, k = 0;
  out[0] = p;
  while (k < MAX_STEP_GOALS && 1 - cdf > 1e-15) {
    k++;
    p *= lambda / k;
    out[k] = p;
    cdf += p;
  }
  out[k] += Math.max(0, 1 - cdf);
  return k;
}

/**
 * Exact forward pass over the same Markov chain playRest samples: (home goals, away goals) in 3-minute steps,
 * rates set by score difference, minute and scheduled changes. No sampling noise, and the same answer every time.
 */
export function scoreDist(state: LiveState, rates: Rates, rho = DC_RHO): ScoreDist {
  const S = MAX_REST_GOALS + 1;
  let cur = new Float64Array(S * S);
  let next = new Float64Array(S * S);
  cur[0] = 1;
  const ph = new Float64Array(MAX_STEP_GOALS + 1);
  const pa = new Float64Array(MAX_STEP_GOALS + 1);
  const st = steps(state, rates);
  for (const s of st) {
    if (s.forced[0] || s.forced[1]) {
      next.fill(0);
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) next[Math.min(i + s.forced[0], S - 1) * S + Math.min(j + s.forced[1], S - 1)] += cur[i * S + j];
      [cur, next] = [next, cur];
    }
    next.fill(0);
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        const p = cur[i * S + j];
        if (p < 1e-16) continue;
        const [rh, ra] = stepRates(s, state.home + i, state.away + j);
        const kh = stepPmf(rh, ph);
        const ka = stepPmf(ra, pa);
        for (let x = 0; x <= kh; x++) {
          const px = p * ph[x];
          const row = Math.min(i + x, S - 1) * S;
          for (let y = 0; y <= ka; y++) next[row + Math.min(j + y, S - 1)] += px * pa[y];
        }
      }
    }
    [cur, next] = [next, cur];
  }
  const [lh, la, fh, fa] = restMeans(st);
  if (rho !== 0 && fh + 1 < S && fa + 1 < S) {
    // low-score cells of the goals the model added, offset past any scheduled ones
    const mv = dcMoves(lh, la, rho);
    const c00 = fh * S + fa, c01 = c00 + 1, c10 = c00 + S, c11 = c00 + S + 1;
    const p00 = cur[c00], p01 = cur[c01], p10 = cur[c10], p11 = cur[c11];
    const out = p10 * mv.from10 + p01 * mv.from01 + p00 * mv.from00 + p11 * mv.from11;
    cur[c10] -= p10 * mv.from10; cur[c01] -= p01 * mv.from01; cur[c00] -= p00 * mv.from00; cur[c11] -= p11 * mv.from11;
    if (rho < 0) { cur[c00] += out / 2; cur[c11] += out / 2; } else { cur[c10] += out / 2; cur[c01] += out / 2; }
  }
  return { home: state.home, away: state.away, size: S, p: cur };
}

/** Result probabilities from a final-score distribution. */
export function outcomeOf(d: ScoreDist): Outcome {
  let hw = 0, dr = 0, tot = 0;
  const S = d.size;
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < S; j++) {
      const p = d.p[i * S + j];
      tot += p;
      const diff = d.home + i - (d.away + j);
      if (diff > 0) hw += p; else if (diff === 0) dr += p;
    }
  }
  return { home: hw / tot, draw: dr / tot, away: Math.max(0, tot - hw - dr) / tot };
}

/**
 * Win probability from a live state, computed exactly over every scoreline the rest of the match can produce.
 * `n` and `seed` are accepted for compatibility with the sampled version and no longer used.
 */
export function winProb(state: LiveState, rates: Rates, _n = 0, _seed = 1): Outcome {
  return outcomeOf(scoreDist(state, rates));
}

/** Win probability while a near-certain chance (a penalty) is pending. */
export function withPendingChance(state: LiveState, rates: Rates, p: number, side: 'home' | 'away', n = 0, seed = 1): Outcome {
  const scored = winProb({ ...state, [side]: state[side] + 1 }, rates, n, seed);
  const missed = winProb(state, rates, n, seed);
  return {
    home: p * scored.home + (1 - p) * missed.home,
    draw: p * scored.draw + (1 - p) * missed.draw,
    away: p * scored.away + (1 - p) * missed.away
  };
}

/** One full match from kick-off, for season simulation: independent Poisson goals with the low-score correction. */
export function playMatch(rates: Rates, rng: Rng, rho = DC_RHO): { home: number; away: number } {
  return dcAdjust(poisson(rng, rates.home), poisson(rng, rates.away), rates.home, rates.away, rho, rng);
}

/** P(draw) for a full match, exactly, with or without the low-score correction (used by tests and docs). */
export function fullMatchDraw(rates: Rates, rho = DC_RHO): number {
  const pois = (k: number, l: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
  let d = 0;
  for (let k = 0; k <= 15; k++) d += pois(k, rates.home) * pois(k, rates.away);
  const mv = dcMoves(rates.home, rates.away, rho);
  const p10 = pois(1, rates.home) * pois(0, rates.away), p01 = pois(0, rates.home) * pois(1, rates.away);
  const p00 = pois(0, rates.home) * pois(0, rates.away), p11 = pois(1, rates.home) * pois(1, rates.away);
  const moved = p10 * mv.from10 + p01 * mv.from01;
  return rho <= 0 ? d + moved : d - p00 * mv.from00 - p11 * mv.from11;
}
