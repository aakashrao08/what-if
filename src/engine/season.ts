// League table and Monte Carlo run-ins: the engine behind Ripple and Multiverse.

import { DC_RHO, dcAdjust, matchRates, playMatch, type Rates } from './match';
import { gaussian, hashSeed, mulberry32, poissonInv, type Rng } from './rng';
import type { Ratings } from './ratings';

export interface Result { home: string; away: string; hg: number; ag: number }
export interface Pairing { home: string; away: string; play?: (rng: Rng) => { home: number; away: number } }

export interface Row {
  code: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
}

export function buildTable(codes: string[], results: Result[]): Row[] {
  const rows = new Map<string, Row>(codes.map((c) => [c, { code: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const r of results) {
    const h = rows.get(r.home)!;
    const a = rows.get(r.away)!;
    h.p++; a.p++;
    h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    if (r.hg > r.ag) { h.w++; a.l++; h.pts += 3; }
    else if (r.hg < r.ag) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...rows.values()].sort(
    (x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.code.localeCompare(y.code)
  );
}

/** A probability range (0-1). */
export interface Range { lo: number; hi: number }

/** Spread of each club's attack and defence ratings between simulated seasons: how sure we are of the ratings. */
export const RATING_SIGMA = 0.06;
/** Seasons are split into this many batches; the spread of the batch estimates gives each range. */
export const RANGE_BATCHES = 20;

export interface ClubOutlook {
  title: number;
  top4: number;
  rel: number;
  /** 95% ranges for title / top four / relegation: batch means over the simulated seasons, never narrower than Wilson */
  ci: { title: Range; top4: Range; rel: Range };
  avgPos: number;
  avgPts: number;
  avgGF: number;
  avgGA: number;
  ptsSd: number;
  dist: number[]; // P(finish in position i+1)
}

/** A played match whose result shifts by (alt draw - base draw) in each simulated season. */
export interface Adjustment { home: string; away: string; base: Rates; alt: Rates }

export interface RunInOptions {
  codes: string[];
  fixed: Result[];
  remaining: Pairing[];
  ratings: Ratings;
  n: number;
  seed: number;
  relegated?: number;
  adjust?: Adjustment[];
  points?: Record<string, number>; // deductions or awards
  onProgress?: (done: number) => void;
}

export function runIn(o: RunInOptions): Record<string, ClubOutlook> {
  const N = o.codes.length;
  const idx = new Map(o.codes.map((c, i) => [c, i]));
  const relN = o.relegated ?? 3;
  const basePts = new Float64Array(N);
  const baseGF = new Float64Array(N);
  const baseGA = new Float64Array(N);
  for (const r of o.fixed) {
    const h = idx.get(r.home)!;
    const a = idx.get(r.away)!;
    baseGF[h] += r.hg; baseGA[h] += r.ag; baseGF[a] += r.ag; baseGA[a] += r.hg;
    if (r.hg > r.ag) basePts[h] += 3; else if (r.hg < r.ag) basePts[a] += 3; else { basePts[h]++; basePts[a]++; }
  }
  for (const [code, d] of Object.entries(o.points ?? {})) basePts[idx.get(code)!] += d;
  const games = o.remaining.map((g) => ({
    h: idx.get(g.home)!,
    a: idx.get(g.away)!,
    rates: matchRates(o.ratings[g.home], o.ratings[g.away]),
    play: g.play
  }));

  const rng = mulberry32(o.seed);
  // rating uncertainty from its own stream, so runs with the same seed (before/after, real/alt) share it
  const paramRng = mulberry32(hashSeed('ratings', o.seed));
  const attN = new Float64Array(N).fill(1);
  const defN = new Float64Array(N).fill(1);
  const B = Math.max(1, Math.min(RANGE_BATCHES, o.n));
  const batchOf = (s: number) => Math.min(B - 1, Math.floor((s * B) / o.n));
  const batchSize = new Float64Array(B);
  const hits = { title: Array.from({ length: N }, () => new Float64Array(B)), top4: Array.from({ length: N }, () => new Float64Array(B)), rel: Array.from({ length: N }, () => new Float64Array(B)) };
  const pos = Array.from({ length: N }, () => new Float64Array(N));
  const sumPts = new Float64Array(N);
  const sumGF = new Float64Array(N);
  const sumGA = new Float64Array(N);
  const sumPts2 = new Float64Array(N);
  const pts = new Float64Array(N);
  const gf = new Float64Array(N);
  const ga = new Float64Array(N);
  const order = Array.from({ length: N }, (_, i) => i);
  const jitter = new Float64Array(N);

  const adj = (o.adjust ?? []).map((a) => ({ h: idx.get(a.home)!, a: idx.get(a.away)!, base: a.base, alt: a.alt }));
  const award = (h: number, a: number, hg: number, ag: number, sign: number) => {
    gf[h] += sign * hg; ga[h] += sign * ag; gf[a] += sign * ag; ga[a] += sign * hg;
    if (hg > ag) pts[h] += 3 * sign; else if (hg < ag) pts[a] += 3 * sign; else { pts[h] += sign; pts[a] += sign; }
  };

  for (let s = 0; s < o.n; s++) {
    pts.set(basePts); gf.set(baseGF); ga.set(baseGA);
    // this season's ratings: lognormal noise around each club's attack and defence, mean 1
    for (let i = 0; i < N; i++) {
      attN[i] = Math.exp(RATING_SIGMA * gaussian(paramRng) - (RATING_SIGMA * RATING_SIGMA) / 2);
      defN[i] = Math.exp(RATING_SIGMA * gaussian(paramRng) - (RATING_SIGMA * RATING_SIGMA) / 2);
    }
    const noisy = (h: number, a: number, r: Rates): Rates => ({ home: r.home * attN[h] * defN[a], away: r.away * attN[a] * defN[h] });
    for (const x of adj) {
      // coupled draws: the same luck (and the same rating noise) under both ratings, so only the lever's effect remains
      const u1 = rng(), u2 = rng(), u3 = rng();
      const alt = noisy(x.h, x.a, x.alt), base = noisy(x.h, x.a, x.base);
      const ra = dcAdjust(poissonInv(u1, alt.home), poissonInv(u2, alt.away), alt.home, alt.away, DC_RHO, () => u3);
      const rb = dcAdjust(poissonInv(u1, base.home), poissonInv(u2, base.away), base.home, base.away, DC_RHO, () => u3);
      award(x.h, x.a, ra.home, ra.away, 1);
      award(x.h, x.a, rb.home, rb.away, -1);
    }
    for (const g of games) {
      const r = g.play ? g.play(rng) : playMatch(noisy(g.h, g.a, g.rates), rng);
      gf[g.h] += r.home; ga[g.h] += r.away; gf[g.a] += r.away; ga[g.a] += r.home;
      if (r.home > r.away) pts[g.h] += 3; else if (r.home < r.away) pts[g.a] += 3; else { pts[g.h]++; pts[g.a]++; }
    }
    for (let i = 0; i < N; i++) jitter[i] = rng();
    order.sort((x, y) => pts[y] - pts[x] || gf[y] - ga[y] - (gf[x] - ga[x]) || gf[y] - gf[x] || jitter[y] - jitter[x]);
    for (let p = 0; p < N; p++) pos[order[p]][p]++;
    const b = batchOf(s);
    batchSize[b]++;
    for (let p = 0; p < N; p++) {
      const c = order[p];
      if (p === 0) hits.title[c][b]++;
      if (p < 4) hits.top4[c][b]++;
      if (p >= N - relN) hits.rel[c][b]++;
    }
    for (let i = 0; i < N; i++) { sumPts[i] += pts[i]; sumPts2[i] += pts[i] * pts[i]; sumGF[i] += gf[i]; sumGA[i] += ga[i]; }
    if (o.onProgress && (s + 1) % 1000 === 0) o.onProgress(s + 1);
  }

  const out: Record<string, ClubOutlook> = {};
  o.codes.forEach((c, i) => {
    const dist = Array.from(pos[i], (v) => v / o.n);
    out[c] = {
      title: dist[0],
      top4: dist.slice(0, 4).reduce((a, b) => a + b, 0),
      rel: dist.slice(N - relN).reduce((a, b) => a + b, 0),
      avgPos: dist.reduce((a, p, k) => a + p * (k + 1), 0),
      avgPts: sumPts[i] / o.n,
      avgGF: sumGF[i] / o.n,
      avgGA: sumGA[i] / o.n,
      ptsSd: Math.sqrt(Math.max(0, sumPts2[i] / o.n - (sumPts[i] / o.n) ** 2)),
      dist,
      ci: { title: range(hits.title[i], batchSize, o.n), top4: range(hits.top4[i], batchSize, o.n), rel: range(hits.rel[i], batchSize, o.n) }
    };
  });
  return out;
}

/** Student t, 97.5th percentile (Cornish–Fisher; within 0.001 for df >= 5). */
function t975(df: number): number {
  const z = 1.959964;
  if (df <= 0) return z;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}

/** 95% range from batch means; widened to the Wilson interval when the batches can't show any spread. */
function range(hit: Float64Array, size: Float64Array, n: number): Range {
  const B = hit.length;
  let total = 0;
  for (let b = 0; b < B; b++) total += hit[b];
  const p = total / Math.max(1, n);
  let lo = p, hi = p;
  if (B > 1) {
    let ss = 0;
    for (let b = 0; b < B; b++) ss += (hit[b] / Math.max(1, size[b]) - p) ** 2;
    const half = t975(B - 1) * Math.sqrt(ss / (B - 1) / B);
    lo = p - half; hi = p + half;
  }
  const z = 1.959964, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lo: Math.max(0, Math.min(lo, c - w)), hi: Math.min(1, Math.max(hi, c + w)) };
}

/** Whether two ranges overlap: if they do, the simulations can't tell the two chances apart. */
export const rangesOverlap = (a: Range, b: Range) => a.lo <= b.hi && b.lo <= a.hi;

/** Double round-robin, 38 rounds for 20 clubs (circle method). */
export function roundRobin(codes: string[]): { mw: number; home: string; away: string }[] {
  const teams = [...codes];
  const n = teams.length;
  const rounds: { mw: number; home: string; away: string }[] = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const t1 = arr[i];
      const t2 = arr[n - 1 - i];
      const flip = (r + i) % 2 === 0;
      rounds.push({ mw: r + 1, home: flip ? t1 : t2, away: flip ? t2 : t1 });
    }
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((g) => ({ mw: g.mw + (n - 1), home: g.away, away: g.home }));
  return [...rounds, ...second];
}
