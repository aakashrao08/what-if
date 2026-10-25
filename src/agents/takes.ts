// "What would it take?": Dr Football reads the goal, builds the changes worth trying and explains
// what the search found. Every candidate carries a sentence that the scenario reader turns back
// into exactly the same levers, so "Play it out" in Multiverse always runs the same universe.

import type { League } from '../data/types';
import { table, type Lever } from '../engine/league';
import { score } from '../engine/ratings';
import type { Candidate, Race, TakesResult } from '../engine/takes';
import { drFootball } from './drFootball';
import { ordinal } from './format';
import type { Facts } from './verifier';

export type { Race };
export interface Goal { club: string; race: Race }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const C = (league: League, code: string) => league.clubs.find((c) => c.code === code)!;
const pct = (x: number) => Math.round(x * 100);

export const RACE_LABEL: Record<Race, string> = { title: 'win the league', top4: 'finish in the top four', survive: 'stay up' };
const RACE_CHANCE: Record<Race, string> = { title: 'title chances', top4: 'top-four chances', survive: 'chances of staying up' };

/** The rulebook's reading of a goal. A club with no race named gets the race it's actually in. */
export function parseGoal(league: League, question: string, defaultClub?: string): Goal | { error: string } {
  const q = norm(question);
  const hit = league.clubs
    .map((c) => ({ c, at: Math.min(...[c.name, c.short, c.nickname].filter((n) => n.length > 3).map((n) => { const i = q.indexOf(norm(n)); return i < 0 ? Infinity : i; })) }))
    .filter((x) => x.at < Infinity).sort((a, b) => a.at - b.at)[0];
  const club = hit?.c.code ?? defaultClub;
  if (!club) return { error: 'Which club? Name one from the Meridian League.' };
  const race: Race | null = /\b(win (the )?(league|title)|champions|title)\b/.test(q) ? 'title'
    : /\b(top (four|4)|fourth|top four)\b/.test(q) ? 'top4'
      : /\b(stay up|staying up|survive|survival|avoid (the drop|relegation)|relegat\w*|safe|safety)\b/.test(q) ? 'survive' : null;
  return { club, race: race ?? naturalRace(league, club) };
}

function naturalRace(league: League, club: string): Race {
  const pos = table(league).findIndex((r) => r.code === club) + 1;
  return pos <= 3 ? 'title' : pos <= 10 ? 'top4' : 'survive';
}

/** Clubs in the same race: the ones whose results matter most to this one. */
function rivals(league: League, club: string, race: Race): string[] {
  const rows = table(league);
  const band = race === 'title' ? [0, 4] : race === 'top4' ? [1, 9] : [13, 20];
  return rows.slice(band[0], band[1]).map((r) => r.code).filter((c) => c !== club);
}

const same = (a: Lever[], b: Lever[]) => JSON.stringify(a) === JSON.stringify(b);

export interface Phrased extends Candidate { sentence: string; short: string }

/** Candidate changes for the search, each with a sentence that reads back to the same levers. */
export function candidates(league: League, goal: Goal): Phrased[] {
  const { club } = goal;
  const name = C(league, club).short;
  const out: Phrased[] = [];
  const add = (id: string, sentence: string, levers: Lever[], cost: number, tag: string) => {
    const p = drFootball(league, sentence);
    if (p.ok && same(p.levers, levers)) out.push({ id, sentence, levers, cost, tag, short: p.short });
  };
  // tactics: the same squad, a different approach
  add('t-press', `What if ${name} had pressed higher all season?`, [{ kind: 'tactics', club, style: { press: 0.25, line: 0.1 }, label: 'press higher' }], 2, 'TACTICS');
  add('t-deep', `What if ${name} had sat deeper all season?`, [{ kind: 'tactics', club, style: { line: -0.25, press: -0.15 }, label: 'sit deeper' }], 2, 'TACTICS');
  add('t-line', `What if ${name} had pushed up all season?`, [{ kind: 'tactics', club, style: { line: 0.25 }, label: 'push the line up' }], 2, 'TACTICS');
  add('t-fast', `What if ${name} had played faster all season?`, [{ kind: 'tactics', club, style: { tempo: 0.25 }, label: 'play faster' }], 2, 'TACTICS');
  // a different manager
  for (const m of league.managers.filter((x) => !x.club)) add(`m-${m.name}`, `What if ${m.name} had taken over ${name} in August?`, [{ kind: 'manager', club, manager: m.name }], 3, 'MANAGER');
  // one signing: the two best players in each position from elsewhere
  for (const pos of ['FW', 'MF', 'DF', 'GK'] as const) {
    const best = league.players.filter((p) => p.pos === pos && p.club !== club).sort((a, b) => score(b) - score(a)).slice(0, 2);
    for (const p of best) add(`s-${p.id}`, `What if ${p.name} had joined ${name}?`, [{ kind: 'transfer_add', player: p.id, to: club }], 4, 'SIGNING');
  }
  // one moment this matchweek, in a game that involves them or a rival
  const involved = new Set([club, ...rivals(league, club, goal.race)]);
  for (const f of league.feeds) {
    if (!involved.has(f.home) && !involved.has(f.away)) continue;
    for (const k of f.keyMoments) {
      const e = f.events.find((x) => x.id === k.eventId)!;
      const p = league.players.find((x) => x.id === e.player);
      if (!p) continue;
      const min = ordinal(Math.floor(e.minute));
      const sentence = k.kind === 'penalty_saved' ? `What if ${p.name}’s penalty had gone in?`
        : k.cf.type === 'remove_goal' ? `What if ${p.name}’s goal in the ${min} minute had been ruled out?`
          : `What if ${p.name}’s chance in the ${min} minute had gone in?`;
      add(`k-${k.id}`, sentence, [{ kind: 'moment', momentId: k.id }], 1, 'MOMENT');
    }
  }
  // luck elsewhere: a rival's top scorer misses the season
  for (const r of rivals(league, club, goal.race).slice(0, 3)) {
    const star = league.players.filter((p) => p.club === r).sort((a, b) => b.goals - a.goals)[0];
    if (star) add(`o-${star.id}`, `What if ${star.name} had missed the season?`, [{ kind: 'player_out', player: star.id }], 3, 'ELSEWHERE');
  }
  return out;
}

export interface TakesRow { id: string; tag: string; short: string; sentence: string | null; p: number; lo: number; hi: number; delta: number; reaches: boolean }
export interface TakesView { goalLine: string; head: string; sub: string; rows: TakesRow[]; facts: Facts; clubName: string; raceLabel: string }

/** Facts and the house-style write-up of a search. */
export function takesView(league: League, r: TakesResult, phrased: Phrased[]): TakesView {
  const name = C(league, r.club).short;
  const byId = new Map(phrased.map((p) => [p.id, p]));
  const pairShort = (id: string) => id.split('+').map((x) => byId.get(x)?.short ?? '').filter(Boolean).join(', and ');
  const rows: TakesRow[] = r.options.map((o) => {
    const one = byId.get(o.id);
    const short = one?.short ?? pairShort(o.id);
    const both = o.id.includes('+') ? `${o.id.split('+').map((x) => byId.get(x)!.sentence.replace(/\?$/, '')).join(' and ').replace(/ and What if /, ' and ')}?` : null;
    const sentence = one?.sentence ?? (both && drFootball(league, both).ok && same((drFootball(league, both) as { levers: Lever[] }).levers, o.levers) ? both : null);
    return { id: o.id, tag: o.tag, short, sentence, p: pct(o.p), lo: pct(o.lo), hi: pct(o.hi), delta: pct(o.p) - pct(r.base), reaches: o.reaches };
  });
  const best = rows[0];
  const facts: Facts = { base: pct(r.base), baseLo: pct(r.baseLo), baseHi: pct(r.baseHi), threshold: pct(r.threshold), n: r.n, screened: r.screened, reaching: rows.filter((x) => x.reaches).length };
  if (r.pointsNeeded !== null) facts.points = r.pointsNeeded;
  rows.forEach((x, i) => { facts[`p${i}`] = x.p; facts[`lo${i}`] = x.lo; facts[`hi${i}`] = x.hi; facts[`d${i}`] = x.delta; facts[`label${i}`] = x.short; });
  const pts = r.pointsNeeded === null ? 'More than 30 points' : `${r.pointsNeeded} point${r.pointsNeeded === 1 ? '' : 's'}`;
  const goalLine = `${name} to ${RACE_LABEL[r.race]}: ${pct(r.base)}% as things stand. The target is better than ${pct(r.threshold)}%.`;
  let head: string, sub: string;
  const gap = `On points alone, the gap is worth ${pts.toLowerCase()}.`;
  if (r.base >= r.threshold) {
    head = `${name} are as good as there already.`;
    sub = `Their ${RACE_CHANCE[r.race]} are ${pct(r.base)}%. Nothing the simulator can change adds much to that.`;
  } else if (best?.reaches) {
    head = `${best.short}.`;
    sub = `That's the smallest change that takes ${name}'s ${RACE_CHANCE[r.race]} past ${pct(r.threshold)}%: ${best.p}%, up from ${pct(r.base)}%. ${gap}`;
  } else if (best) {
    head = `Nothing on its own gets ${name} there.`;
    sub = `The closest is ${best.short.charAt(0).toLowerCase()}${best.short.slice(1)}, which takes their ${RACE_CHANCE[r.race]} to ${best.p}%. ${gap}`;
  } else {
    head = `Nothing here moves ${name}'s ${RACE_CHANCE[r.race]}.`;
    sub = gap;
  }
  return { goalLine, head, sub, rows, facts, clubName: name, raceLabel: RACE_LABEL[r.race] };
}

export const TAKES_EXAMPLES = (league: League): string[] => {
  const rows = table(league);
  const chaser = C(league, rows[1].code).short;
  const inTrouble = C(league, rows[rows.length - 1].code).short; // bottom of the table
  return [
    'What would it take for Northbridge to finish in the top four?',
    `What would it take for ${inTrouble} to stay up?`,
    `What would it take for ${chaser} to win the league?`
  ];
};
