// The Analyst: turns engine output into the facts a story can be written from, and works out
// the context behind a number (game state, tactical changes, chance quality).

import type { DemoMatch, KeyMoment, League, Side, StoppedAttack } from '../data/types';
import type { GhostResult, MomentResult, Timeline } from '../engine/demo';
import { sideWin } from '../engine/demo';
import type { RippleResult } from '../engine/league';
import { rangesOverlap, type ClubOutlook } from '../engine/season';
import type { Facts } from './verifier';

const sur = (league: League, id?: string) => (id ? (league.players.find((p) => p.id === id)?.name.split(' ').slice(1).join(' ') ?? '') : '');
const short = (league: League, code: string) => league.clubs.find((c) => c.code === code)!.short;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface MomentFacts extends Facts {
  minute: number; minsLeft: number; n: number;
  hB: number; hA: number; hC: number; aB: number; aA: number; aC: number; dB: number; dA: number; dC: number;
  ptsB: number; ptsA: number; // home chance of taking anything (win or draw)
  // the side that took the shot (T) and the other side (O)
  side: Side; T: string; O: string; H: string; A: string;
  tB: number; tA: number; tC: number; tSw: number; tCf: number;
  oB: number; oA: number; oC: number;
  swing: number; whatIf: number; focus: Side; quiet: boolean; largest: boolean; isGoal: boolean; late: boolean;
  player: string; other: string; xg: number; oneIn: number; dist: number;
  cfScore: string; score: string;
  b5Minute: number; b5Xg: number;
}

export function momentFacts(league: League, feed: DemoMatch, tl: Timeline, km: KeyMoment, mr: MomentResult): MomentFacts {
  const e = feed.events.find((x) => x.id === km.eventId)!;
  const r = (v: number) => Math.round(v);
  const goalsBefore = feed.events.filter((x) => x.type === 'goal' && x.minute <= e.minute);
  const h = goalsBefore.filter((x) => x.team === 'home').length;
  const a = goalsBefore.filter((x) => x.team === 'away').length;
  const cfH = km.cf.type === 'add_goal' && km.cf.team === 'home' ? h + 1 : km.cf.type === 'remove_goal' && e.team === 'home' ? h - 1 : h;
  const cfA = km.cf.type === 'add_goal' && km.cf.team === 'away' ? a + 1 : km.cf.type === 'remove_goal' && e.team === 'away' ? a - 1 : a;
  const shield = feed.shields[0];
  const b5Xg = shield
    ? feed.events.filter((x) => x.team === 'home' && x.minute >= shield.minute && x.minute <= e.minute && x.type !== 'penalty_saved' && x.xg).reduce((s, x) => s + (x.xg ?? 0), 0)
    : 0;
  const maxSwing = Math.max(...tl.moments.map((m) => Math.abs(m.swing)));
  const side = e.team ?? 'home';
  const w = (wp: MomentResult['before'], s: Side) => r(sideWin(wp, s));
  return {
    minute: Math.floor(e.minute), minsLeft: Math.max(0, 90 - Math.floor(e.minute)), n: tl.n,
    hB: r(mr.before.home), hA: r(mr.after.home), hC: r(mr.cf.home),
    aB: r(mr.before.away), aA: r(mr.after.away), aC: r(mr.cf.away),
    dB: r(mr.before.draw), dA: r(mr.after.draw), dC: r(mr.cf.draw),
    ptsB: r(mr.before.home + mr.before.draw), ptsA: r(mr.after.home + mr.after.draw),
    realH: r(mr.after.home) - r(mr.before.home), cfH: r(mr.cf.home) - r(mr.before.home),
    side, T: short(league, side === 'home' ? feed.home : feed.away), O: short(league, side === 'home' ? feed.away : feed.home),
    H: short(league, feed.home), A: short(league, feed.away),
    tB: w(mr.before, side), tA: w(mr.after, side), tC: w(mr.cf, side),
    tSw: w(mr.after, side) - w(mr.before, side), tCf: w(mr.cf, side) - w(mr.before, side),
    oB: w(mr.before, other(side)), oA: w(mr.after, other(side)), oC: w(mr.cf, other(side)),
    swing: mr.swing, whatIf: mr.whatIf, focus: mr.focus, quiet: mr.quiet,
    largest: Math.abs(mr.swing) === maxSwing, isGoal: e.type === 'goal', late: e.minute >= 80,
    player: sur(league, e.player), other: sur(league, e.other),
    xg: e.xg ?? 0, oneIn: e.xg ? Math.round(1 / e.xg) : 0, dist: Math.round(e.detail?.distance ?? 0),
    score: `${h}–${a}`, cfScore: `${cfH}–${cfA}`,
    b5Minute: shield?.minute ?? 0, b5Xg: Math.round(b5Xg * 10) / 10,
    sprint: e.sprint ?? 0,
    ...(e.detail ?? {})
  };
}

/** The same facts seen from one side: m* = that side's win chance before / after / in the other branch. */
export function forSide(f: MomentFacts, s: Side) {
  const mine = s === f.side;
  return { ...f, mB: mine ? f.tB : f.oB, mA: mine ? f.tA : f.oA, mC: mine ? f.tC : f.oC, mine, S: s === 'home' ? f.H : f.A };
}
export type SideFacts = ReturnType<typeof forSide>;

export interface GhostFacts extends Facts {
  pct: number; goals: number; n: number; p2: number; oneIn: number; lo: number; hi: number;
  attacker: string; stopper: string; red: number; conf: number; margin: number; covering: number; distance: number;
  savedPct: number; widePct: number; stopValue: number; xgAtStop: number;
}

export function ghostFacts(league: League, a: StoppedAttack, g: GhostResult): GhostFacts {
  return {
    pct: g.goalPct, goals: g.out.goal, n: g.n, p2: Math.round((g.out.goal / g.n) * 100) / 100,
    oneIn: Math.max(1, Math.round(100 / Math.max(1, g.goalPct))), lo: g.ci.lo, hi: g.ci.hi,
    attacker: sur(league, a.attacker), stopper: sur(league, a.stopper),
    red: g.redCard ?? 0, redCard: g.redCard, conf: a.stop === 'offside' ? g.stopValue : 0,
    margin: a.stopModel.kind === 'offside' ? a.stopModel.marginM : 0,
    covering: a.covering ?? 0, distance: a.atStop.distance, ghostDist: a.ghost.distance,
    ci: 95, savedPct: Math.round((g.out.saved / g.n) * 100), widePct: Math.round((g.out.wide / g.n) * 100),
    stopValue: g.stopValue, xgAtStop: g.xgAtStop,
    certain: g.goalPct >= 95
  };
}

export interface ClubMove { code: string; before: number; after: number; delta: number }

/** Who the result helped and hurt in each race, beyond the two clubs who played. */
export function rippleMovers(league: League, r: RippleResult, playing: string[]) {
  const codes = league.clubs.map((c) => c.code);
  const race = (k: 'top4' | 'rel' | 'title'): ClubMove[] => codes.map((c) => {
    const b = Math.round(r.before[c][k] * 100), a = Math.round(r.after[c][k] * 100);
    return { code: c, before: b, after: a, delta: a - b };
  });
  const notPlaying = (m: ClubMove) => !playing.includes(m.code);
  const top4 = race('top4'), rel = race('rel'), title = race('title');
  return {
    top4, rel, title,
    top4Gainer: top4.filter(notPlaying).sort((a, b) => b.delta - a.delta)[0],
    top4Loser: top4.filter(notPlaying).sort((a, b) => a.delta - b.delta)[0],
    relLosers: rel.filter(notPlaying).sort((a, b) => b.delta - a.delta).slice(0, 2),
    relGainers: rel.filter(notPlaying).sort((a, b) => a.delta - b.delta).slice(0, 2),
    titleMover: title.filter(notPlaying).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
  };
}

/** Ranges behind a real-vs-alternative comparison in one race: the Verifier blocks "more likely" when they overlap. */
export function raceRangeFacts(real: ClubOutlook, alt: ClubOutlook, race: 'title' | 'top4' | 'rel'): Facts {
  const r = real.ci[race], a = alt.ci[race];
  const P = (x: number) => Math.round(x * 100);
  return { loR: P(r.lo), hiR: P(r.hi), loA: P(a.lo), hiA: P(a.hi), rangesOverlap: rangesOverlap(r, a) };
}
