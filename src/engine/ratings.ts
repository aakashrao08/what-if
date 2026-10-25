// Team strength from the squad. Attack is a goals-for multiplier, defence a goals-against
// multiplier (lower is better). 1.0 = league average.

import type { Club, ClubStyle, Player } from '../data/types';

export interface TeamRating {
  att: number;
  def: number;
}

export type Ratings = Record<string, TeamRating>;

export interface SquadOverride {
  /** players to treat as part of this club's starting XI, replacing the weakest in their position */
  addStarters?: Player[];
  /** player ids to remove from this club */
  remove?: string[];
  style?: Partial<ClubStyle>;
}

/** attribute points per e-fold change in goal rate */
export const RATING_SCALE = 22;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function startingXI(players: Player[], code: string, ov?: SquadOverride): Player[] {
  let squad = players.filter((p) => p.club === code && !(ov?.remove ?? []).includes(p.id));
  let starters = squad.filter((p) => p.starter);
  for (const add of ov?.addStarters ?? []) {
    const samePos = starters.filter((p) => p.pos === add.pos);
    if (samePos.length) {
      const weakest = samePos.reduce((w, p) => (score(p) < score(w) ? p : w));
      starters = starters.filter((p) => p.id !== weakest.id);
    }
    starters.push({ ...add, club: code, starter: true });
  }
  // keep an XI if removals left gaps: promote best bench player in that position
  const need: Record<string, number> = { GK: 1, DF: 4, MF: 3, FW: 3 };
  for (const pos of Object.keys(need)) {
    while (starters.filter((p) => p.pos === pos).length < need[pos]) {
      const bench = squad
        .filter((p) => p.pos === pos && !starters.some((s) => s.id === p.id))
        .sort((a, b) => score(b) - score(a))[0];
      if (!bench) break;
      starters.push(bench);
      squad = squad.filter((p) => p.id !== bench.id);
    }
  }
  return starters;
}

export function score(p: Player): number {
  const a = p.attrs;
  switch (p.pos) {
    case 'GK': return a.keeping;
    case 'DF': return a.defending * 0.75 + a.pace * 0.15 + a.passing * 0.1;
    case 'MF': return a.passing * 0.6 + a.defending * 0.2 + a.finishing * 0.2;
    case 'FW': return a.finishing * 0.6 + a.pace * 0.3 + a.passing * 0.1;
  }
}

function rawScores(xi: Player[]) {
  const fw = xi.filter((p) => p.pos === 'FW');
  const mf = xi.filter((p) => p.pos === 'MF');
  const df = xi.filter((p) => p.pos === 'DF');
  const gk = xi.filter((p) => p.pos === 'GK');
  const attack = avg(fw.map((p) => p.attrs.finishing)) * 0.45 + avg(fw.map((p) => p.attrs.pace)) * 0.15 + avg(mf.map((p) => p.attrs.passing)) * 0.4;
  const defence = avg(df.map((p) => p.attrs.defending)) * 0.6 + avg(gk.map((p) => p.attrs.keeping)) * 0.25 + avg(mf.map((p) => p.attrs.defending)) * 0.15;
  return { attack, defence };
}

/** Ratings for every club. Overrides let Multiverse and Settle It change squads or styles. */
export function clubRatings(clubs: Club[], players: Player[], overrides: Record<string, SquadOverride> = {}): Ratings {
  const raw = clubs.map((c) => ({ code: c.code, style: { ...c.style, ...(overrides[c.code]?.style ?? {}) }, ...rawScores(startingXI(players, c.code, overrides[c.code])) }));
  const mA = avg(raw.map((r) => r.attack));
  const mD = avg(raw.map((r) => r.defence));
  const out: Ratings = {};
  for (const r of raw) {
    // ~15 attribute points between top and bottom ≈ 2× goal rate
    let att = Math.exp((r.attack - mA) / RATING_SCALE);
    let def = Math.exp(-(r.defence - mD) / RATING_SCALE);
    // style: pressing and a high line create more but also concede more
    att *= 1 + 0.12 * (r.style.press - 0.5) + 0.06 * (r.style.line - 0.5) + 0.05 * (r.style.tempo - 0.5);
    def *= 1 + 0.06 * (r.style.press - 0.5) + 0.14 * (r.style.line - 0.5);
    out[r.code] = { att, def };
  }
  return out;
}
