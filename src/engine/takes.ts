// "What would it take?": search the levers for the smallest change that gets a club to a goal
// (title, top four, survival). Screen every candidate on a short run that shares one baseline,
// try pairs if nothing works alone, then confirm the shortlist at full size. Also prices the gap
// in league points, as a yardstick. Candidates come from the caller (src/agents/takes.ts) so the
// engine never needs to know how a change is phrased.

import type { League } from '../data/types';
import type { ClubOutlook } from './season';
import { RUNIN_SIMS, realSeason, universe, type Lever } from './league';

export type Race = 'title' | 'top4' | 'survive';
export interface Candidate { id: string; levers: Lever[]; cost: number; tag: string }

export interface TakeOption extends Candidate {
  p: number; lo: number; hi: number; // probability of reaching the goal, 0–1, with a 95% range
  delta: number; // p minus the real season's p
  reaches: boolean;
}

export interface TakesResult {
  club: string;
  race: Race;
  threshold: number; // the next rung of 50 / 75 / 90% at least 8 points above where they are, else 95%
  base: number; baseLo: number; baseHi: number;
  options: TakeOption[]; // the confirmed shortlist: ones that reach the goal first (smallest change first), then the closest
  pointsNeeded: number | null; // points the club would need handed to it to reach the goal; null if more than 30
  screened: number; // universes played in the search
  n: number; // seasons per confirmed universe
  screenN: number;
}

export const SCREEN_SIMS = 1000;

export function raceProb(o: ClubOutlook, race: Race): { p: number; lo: number; hi: number } {
  if (race === 'title') return { p: o.title, lo: o.ci.title.lo, hi: o.ci.title.hi };
  if (race === 'top4') return { p: o.top4, lo: o.ci.top4.lo, hi: o.ci.top4.hi };
  return { p: 1 - o.rel, lo: 1 - o.ci.rel.hi, hi: 1 - o.ci.rel.lo };
}

/** Pairs worth trying: never two moments (the simulator replays one match at a time) or two managers. */
function compatible(a: Candidate, b: Candidate): boolean {
  const kinds = [...a.levers, ...b.levers].map((l) => l.kind);
  if (kinds.filter((k) => k === 'moment').length > 1 || kinds.filter((k) => k === 'manager').length > 1) return false;
  const players = [...a.levers, ...b.levers].flatMap((l) => ('player' in l ? [l.player] : []));
  return new Set(players).size === players.length;
}

export function searchChanges(
  league: League,
  goal: { club: string; race: Race; candidates: Candidate[] },
  onProgress?: (pct: number) => void,
  n = RUNIN_SIMS,
  screenN = SCREEN_SIMS
): TakesResult {
  const { club, race, candidates } = goal;
  const realFull = realSeason(league, n);
  const base = raceProb(realFull[club], race);
  const threshold = [0.5, 0.75, 0.9].find((t) => t >= base.p + 0.08) ?? 0.95;
  const realScreen = realSeason(league, screenN);
  const screenBase = raceProb(realScreen[club], race).p;
  let screened = 0;
  const work = candidates.length + 10 + 6 + 6; // screens, pairs, confirmations, points search (an estimate for the progress bar)
  const tick = () => onProgress?.(Math.min(99, Math.round((++screened / work) * 100)));
  const screen = (levers: Lever[]) => { const u = universe(league, levers, screenN, undefined, realScreen); tick(); return raceProb(u.alt[club], race).p; };

  // 1. every single change, on a short run
  const singles = candidates.map((c) => ({ c, p: screen(c.levers) })).sort((a, b) => b.p - a.p);

  // 2. nothing gets there alone (allowing for screening noise)? try pairs of the five most useful
  let pool = singles;
  if (!singles.some((s) => s.p >= threshold - 0.04)) {
    const top = singles.filter((s) => s.p > screenBase).slice(0, 5);
    const pairs: typeof singles = [];
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const [a, b] = [top[i].c, top[j].c];
      if (!compatible(a, b)) continue;
      const c: Candidate = { id: `${a.id}+${b.id}`, levers: [...a.levers, ...b.levers], cost: a.cost + b.cost, tag: 'COMBINED' };
      pairs.push({ c, p: screen(c.levers) });
    }
    pool = [...singles, ...pairs].sort((a, b) => b.p - a.p);
  }

  // 3. confirm a shortlist at full size: the cheapest that look like reaching it, plus the strongest
  // at most two of each kind, so the answer shows different routes rather than five versions of one
  const varied = (xs: typeof pool, k: number) => {
    const seen: Record<string, number> = {};
    return xs.filter((s) => (seen[s.c.tag] = (seen[s.c.tag] ?? 0) + 1) <= 2).slice(0, k);
  };
  const near = varied(pool.filter((s) => s.p >= threshold - 0.05).sort((a, b) => a.c.cost - b.c.cost || b.p - a.p), 4);
  const shortlist = varied([...near, ...pool].filter((s, i, arr) => arr.findIndex((x) => x.c.id === s.c.id) === i), 6);
  const options: TakeOption[] = shortlist.map(({ c }) => {
    const u = universe(league, c.levers, n, undefined, realFull);
    tick();
    const r = raceProb(u.alt[club], race);
    return { ...c, ...r, delta: r.p - base.p, reaches: r.p >= threshold };
  }).filter((o) => o.delta > 0.005)
    .sort((a, b) => Number(b.reaches) - Number(a.reaches) || (a.reaches ? a.cost - b.cost || b.p - a.p : b.p - a.p))
    .slice(0, 5);

  // 4. the yardstick: how many points is the gap worth? (monotone, so a binary search)
  const reachesWith = (d: number, size: number, real: Record<string, ClubOutlook>) => {
    const u = universe(league, [{ kind: 'points', club, delta: d }], size, undefined, real);
    tick();
    return raceProb(u.alt[club], race).p >= threshold;
  };
  let pointsNeeded: number | null = null;
  if (reachesWith(30, screenN, realScreen)) {
    let lo = 0, hi = 30;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (reachesWith(mid, screenN, realScreen)) hi = mid; else lo = mid; }
    // confirm at full size, nudging up if the short run was lucky
    pointsNeeded = hi;
    while (pointsNeeded < 30 && !reachesWith(pointsNeeded, n, realFull)) pointsNeeded++;
  }
  onProgress?.(100);
  return { club, race, threshold, base: base.p, baseLo: base.lo, baseHi: base.hi, options, pointsNeeded, screened, n, screenN };
}
