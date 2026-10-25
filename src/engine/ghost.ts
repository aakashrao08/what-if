// Ghost Run: continue a stopped attack hundreds of times and count how it ends.
// Plus the chance-quality and defensive-action models behind the numbers panel.

import { gaussian, mulberry32 } from './rng';
import type { ChanceFeatures } from '../data/types';

export type { ChanceFeatures };

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Expected goals for a single shot. Simple logistic model on distance and angle. */
export function xg(f: ChanceFeatures): number {
  if (f.keeperBeaten) return Math.min(0.95, 0.9 - 0.02 * f.distance);
  const z =
    -0.35 - 0.13 * f.distance + 0.03 * f.angle
    - (f.header ? 0.75 : 0) + (f.oneOnOne ? 0.6 : 0)
    - 0.22 * f.defendersNear + (f.keeperSet ? -0.15 : 0.2);
  return sigmoid(z);
}

export interface GhostOutcome {
  n: number;
  goal: number;
  saved: number;
  wide: number;
  blocked: number;
}

/** Continue the play n times with noise in where the shot ends up and who gets there. */
export function ghostRun(f: ChanceFeatures, n = 500, seed = 7): GhostOutcome {
  const rng = mulberry32(seed);
  const out = { n, goal: 0, saved: 0, wide: 0, blocked: 0 };
  for (let i = 0; i < n; i++) {
    const dist = Math.max(2, f.distance + gaussian(rng) * (f.keeperBeaten ? 0.4 : 2.2));
    const ang = Math.max(4, f.angle + gaussian(rng) * 4);
    const defenders = Math.max(0, f.defendersNear + (rng() < 0.25 ? (rng() < 0.5 ? -1 : 1) : 0));
    const blockChance = f.keeperBeaten ? 0 : Math.min(0.5, 0.11 * defenders);
    if (rng() < blockChance) { out.blocked++; continue; }
    const p = xg({ ...f, distance: dist, angle: ang, defendersNear: defenders }) / (1 - blockChance);
    if (rng() < p) { out.goal++; continue; }
    const onTarget = f.keeperBeaten ? 0 : f.keeperSet ? 0.52 : 0.48;
    if (rng() < onTarget) out.saved++; else out.wide++;
  }
  return out;
}

export const pct = (x: number, n: number) => Math.round((x / n) * 100);

// ---- defensive actions ----

/** Chance a recovering defender clears a ball heading for goal. */
export function xClear(recoveryMetres: number, speedKmh: number, secondsAvailable: number): number {
  const reach = (speedKmh / 3.6) * secondsAvailable; // metres he can cover
  return sigmoid((reach - recoveryMetres) * 0.55 - 0.3);
}

/** Chance a fair tackle wins the ball, from closing speed, angle and attacker pace. */
export function xTackle(defenderAngleDeg: number, attackerSpeedKmh: number, defenderSpeedKmh: number): number {
  return sigmoid(0.9 - 0.03 * defenderAngleDeg + 0.09 * (defenderSpeedKmh - attackerSpeedKmh));
}

/** Chance a defender in the shooting lane blocks the shot. */
export function xBlock(laneCoverage: number, metresFromShooter: number): number {
  return sigmoid(2.4 * laneCoverage - 0.12 * metresFromShooter - 1.4);
}

/** Chance the offside call was right, given the measured margin and tracking error (σ, metres). */
export function offsideConfidence(marginMetres: number, sigma = 0.12): number {
  return normalCdf(marginMetres / sigma);
}

/** Probability that a foul meets the bar for denying an obvious goal-scoring opportunity. */
export function dogso(ghostGoal: number, coveringDefenders: number, distance: number): number {
  return sigmoid(4 * ghostGoal - 1.1 * coveringDefenders - 0.06 * distance + 0.4);
}

export function normalCdf(x: number): number {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Wilson score interval for a proportion. */
export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - margin) / denom), hi: Math.min(1, (centre + margin) / denom) };
}

export interface ShotOutcomes {
  n: number;
  topCorner: number;
  bottomCorner: number;
  saved: number;
  blocked: number;
  post: number;
  over: number;
  wide: number;
}

/** One shot replayed n times, with where it ends up. Drives the scoreboard tile on the home page. */
export function shotOutcomes(f: ChanceFeatures, n = 500, seed = 11): ShotOutcomes {
  const run = ghostRun(f, n, seed);
  const rng = mulberry32(seed + 1);
  const out: ShotOutcomes = { n, topCorner: 0, bottomCorner: 0, saved: run.saved, blocked: run.blocked, post: 0, over: 0, wide: 0 };
  for (let i = 0; i < run.goal; i++) if (rng() < 0.42) out.topCorner++; else out.bottomCorner++;
  for (let i = 0; i < run.wide; i++) {
    const r = rng();
    if (r < 0.1) out.post++; else if (r < 0.45) out.over++; else out.wide++;
  }
  return out;
}
