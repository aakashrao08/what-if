// Settle It experiments. The Data Scientist agent picks one of these and fills in its parameters;
// every number in a Settle It answer comes from here.

import type { League, Side } from '../data/types';
import { FULL_TIME, playRest, type LiveState } from './match';
import { matchContext, stateAt, type MatchContext } from './demo';
import { hashSeed, mulberry32 } from './rng';
import { wilson } from './ghost';
import type { DemoMatch } from '../data/types';
import { computeGhost, computeTimeline, sideWin, type Timeline } from './demo';

export const SETTLE_SIMS = 1000;

export interface Arm { label: string; home: number; draw: number; away: number } // percentages

export interface ReplayExperiment {
  kind: 'replay';
  from: number; // minute
  n: number;
  asHappened: Arm;
  alternative: Arm;
  focus: Side;
  effect: number; // alternative - asHappened, focus side win %, points
  se: number; // standard error of the effect, points
  significant: boolean;
}

/** Paired replays from a minute: each simulation uses the same random stream in both arms. */
function pairedReplay(ctx: MatchContext, from: number, a: LiveState, b: LiveState, focus: Side, labels: [string, string], n = SETTLE_SIMS): ReplayExperiment {
  const res = [{ h: 0, d: 0 }, { h: 0, d: 0 }];
  let sumD = 0, sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const seed = hashSeed('settle', from, i);
    const ra = playRest(a, ctx.rates, mulberry32(seed));
    const rb = playRest(b, ctx.rates, mulberry32(seed));
    const win = (r: { home: number; away: number }) => (focus === 'home' ? r.home > r.away : r.away > r.home) ? 1 : 0;
    for (const [k, r] of [[0, ra], [1, rb]] as const) {
      if (r.home > r.away) res[k].h++; else if (r.home === r.away) res[k].d++;
    }
    const d = win(rb) - win(ra);
    sumD += d; sumD2 += d * d;
  }
  const arm = (k: number, label: string): Arm => ({ label, home: Math.round((res[k].h / n) * 100), draw: Math.round((res[k].d / n) * 100), away: Math.round(((n - res[k].h - res[k].d) / n) * 100) });
  const asHappened = arm(0, labels[0]);
  const alternative = arm(1, labels[1]);
  const meanD = sumD / n;
  const se = Math.sqrt(Math.max(0, sumD2 / n - meanD * meanD) / n) * 100;
  const pick = (x: Arm) => (focus === 'home' ? x.home : x.away);
  const effect = pick(alternative) - pick(asHappened);
  return { kind: 'replay', from, n, asHappened, alternative, focus, effect, se: Math.round(se * 10) / 10, significant: Math.abs(meanD * 100) > 2 * se };
}

/** "Was the substitution the reason?" Replay from the sub with and without it. */
export function subExperiment(league: League, subMinute: number): ReplayExperiment {
  const ctx = matchContext(league);
  const asHappened = stateAt(ctx, subMinute, true);
  // the same moment, but the substitution's change never happens
  const ctxNoSub: MatchContext = { ...ctx, changes: ctx.changes.filter((c) => !(c.minute === subMinute && (c.homeBoost !== undefined || c.awayBoost !== undefined))) };
  const kept = stateAt(ctxNoSub, subMinute, true);
  const sub = league.demo.subs.find((s) => s.minute === subMinute)!;
  const off = league.players.find((p) => p.id === sub.off)!;
  return pairedReplay(ctx, subMinute, asHappened, kept, sub.side, [`As it happened (${off.short.split(' ').slice(1).join(' ')} off)`, `${off.short.split(' ').slice(1).join(' ')} stays on`]);
}

/** "Would they have won if the penalty went in?" Replay from the penalty. */
export function penaltyExperiment(league: League, momentId: string): ReplayExperiment {
  const ctx = matchContext(league);
  const km = league.demo.keyMoments.find((k) => k.id === momentId)!;
  const ev = league.demo.events.find((e) => e.id === km.eventId)!;
  const side = ev.team!;
  const asHappened = stateAt(ctx, ev.minute, true);
  const scored = stateAt(ctx, ev.minute, true, undefined, side);
  const taker = league.players.find((p) => p.id === ev.player)!;
  const name = taker.short.split(' ').slice(1).join(' ');
  return pairedReplay(ctx, ev.minute, asHappened, scored, side, ['As it happened (saved)', `${name} scores`]);
}

export interface KeeperRow { id: string; name: string; club: string; faced: number; saved: number; rate: number; lo: number; hi: number }

export interface KeeperExperiment {
  kind: 'keepers';
  subject: KeeperRow;
  leagueAvg: number; // percent
  totalPenalties: number;
  minFaced: number;
  better: KeeperRow[]; // higher save rate from more penalties
  rank: number; // by save rate among keepers with >= minFaced
  pool: number;
  clearlyAbove: boolean; // lower bound above league average
  clearlyBest: boolean; // lower bound above every other keeper's rate
}

export function keeperExperiment(league: League, keeperId: string, minFaced = 5): KeeperExperiment {
  const gks = league.players.filter((p) => p.pos === 'GK' && p.penalties);
  const total = gks.reduce((a, p) => a + p.penalties!.faced, 0);
  const saved = gks.reduce((a, p) => a + p.penalties!.saved, 0);
  const row = (p: (typeof gks)[number]): KeeperRow => {
    const w = wilson(p.penalties!.saved, p.penalties!.faced);
    return { id: p.id, name: p.name, club: p.club, faced: p.penalties!.faced, saved: p.penalties!.saved, rate: Math.round((p.penalties!.saved / Math.max(1, p.penalties!.faced)) * 100), lo: Math.round(w.lo * 100), hi: Math.round(w.hi * 100) };
  };
  const pool = gks.filter((p) => p.penalties!.faced >= minFaced).map(row).sort((a, b) => b.rate - a.rate || b.faced - a.faced);
  const subject = row(gks.find((p) => p.id === keeperId)!);
  const leagueAvg = Math.round((saved / total) * 100);
  const better = pool.filter((k) => k.id !== subject.id && k.rate > subject.rate && k.faced > subject.faced);
  const others = pool.filter((k) => k.id !== subject.id);
  return {
    kind: 'keepers', subject, leagueAvg, totalPenalties: total, minFaced, better,
    rank: pool.findIndex((k) => k.id === subject.id) + 1, pool: pool.length,
    clearlyAbove: subject.lo > leagueAvg,
    clearlyBest: others.every((k) => subject.lo > k.rate)
  };
}

export interface DeserveExperiment {
  kind: 'deserve';
  upto: number;
  n: number;
  xg: { home: number; away: number };
  shots: { home: number; away: number };
  home: number; draw: number; away: number; // percent of replays
  actual: { home: number; away: number };
}

/** "Did they deserve it?" Replay every shot up to a minute as a coin weighted by its xG. */
export function deserveExperiment(league: League, upto = FULL_TIME, n = 10000, feed: DemoMatch = league.demo): DeserveExperiment {
  const shots = feed.events.filter((e) => e.minute <= upto && e.xg !== undefined && e.team);
  const rng = mulberry32(hashSeed('deserve', upto));
  let h = 0, d = 0;
  for (let i = 0; i < n; i++) {
    let hg = 0, ag = 0;
    for (const s of shots) {
      const tries = s.type === 'double_save' ? [s.xg! * 0.55, s.xg! * 0.45] : [s.xg!];
      let scored = false;
      for (const x of tries) if (!scored && rng() < x) scored = true;
      if (scored) { if (s.team === 'home') hg++; else ag++; }
    }
    if (hg > ag) h++; else if (hg === ag) d++;
  }
  let ah = 0, aa = 0;
  for (const e of feed.events) if (e.type === 'goal' && e.minute <= upto) { if (e.team === 'home') ah++; else aa++; }
  const sum = (side: Side) => Math.round(shots.filter((s) => s.team === side).reduce((a, s) => a + s.xg!, 0) * 100) / 100;
  return {
    kind: 'deserve', upto, n, xg: { home: sum('home'), away: sum('away') },
    shots: { home: shots.filter((s) => s.team === 'home').length, away: shots.filter((s) => s.team === 'away').length },
    home: Math.round((h / n) * 100), draw: Math.round((d / n) * 100), away: Math.round(((n - h - d) / n) * 100),
    actual: { home: ah, away: aa }
  };
}


// ---------------- deeper studio questions ----------------


export interface WpaRow { id: string; name: string; club: string; side: Side; actual: number; prevented: number; total: number; actions: string[] }
export interface WpaExperiment { kind: 'wpa'; fixtureId: string; rows: WpaRow[]; n: number }

/** Man of the match by win probability added: every event's swing credited to the players in it. */
export function wpaExperiment(league: League, feed: DemoMatch = league.demo, tl: Timeline = computeTimeline(league, feed)): WpaExperiment {
  const acc = new Map<string, WpaRow>();
  const row = (id: string, side: Side) => {
    if (!acc.has(id)) {
      const p = league.players.find((x) => x.id === id)!;
      acc.set(id, { id, name: p.name, club: p.club, side, actual: 0, prevented: 0, total: 0, actions: [] });
    }
    return acc.get(id)!;
  };
  const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
  for (const e of feed.events) {
    if (!e.team || !e.player) continue;
    const ev = tl.events.find((x) => x.id === e.id);
    if (!ev) continue;
    const d = sideWin(ev.after, e.team) - sideWin(ev.before, e.team);
    const km = feed.keyMoments.find((k) => k.eventId === e.id);
    const mr = km ? tl.moments.find((m) => m.id === km.id) : undefined;
    if (e.type === 'goal' || e.type === 'penalty_awarded') { const r = row(e.player, e.team); r.actual += d; r.actions.push(`${e.label} ${e.type === 'goal' ? 'goal' : 'won a penalty'}`); }
    if (e.type === 'goal' && e.other) { const r = row(e.other, e.team); r.actual += d * 0.3; r.actions.push(`${e.label} assist`); }
    if (e.type === 'penalty_awarded' && e.other) { const r = row(e.other, other(e.team)); r.actual -= d; r.actions.push(`${e.label} gave away a penalty`); }
    if (mr && e.type !== 'goal') {
      if (e.type === 'penalty_saved') {
        // the pending penalty was already priced in: the save is worth the real swing, the miss costs it
        const r = row(e.player, e.team); r.actual += d; r.actions.push(`${e.label} penalty saved`);
        if (e.other) { const k = row(e.other, other(e.team)); k.prevented += -d; k.actions.push(`${e.label} penalty save`); }
      } else {
        // an open-play chance: the defender or keeper banks what the goal would have done, weighted by how likely it was
        const missed = (sideWin(mr.cf, e.team) - sideWin(mr.after, e.team)) * (e.xg ?? 0.3);
        if (e.other) { const k = row(e.other, other(e.team)); k.prevented += missed; k.actions.push(`${e.label} ${e.type === 'header_cleared' ? 'clearance off the line' : 'save'}`); }
        else { const r = row(e.player, e.team); r.actual -= missed; r.actions.push(`${e.label} big chance missed`); }
      }
    }
  }
  const rows = [...acc.values()].map((r) => ({ ...r, actual: Math.round(r.actual), prevented: Math.round(r.prevented), total: Math.round(r.actual + r.prevented) }))
    .sort((a, b) => b.total - a.total);
  return { kind: 'wpa', fixtureId: feed.fixtureId, rows, n: tl.n };
}

export interface FinishingExperiment { kind: 'finishing'; player: string; name: string; goals: number; xg: number; diff: number; pAtLeast: number; pAtMost: number; verdict: 'above' | 'below' | 'normal' }

function poissonCdf(k: number, lambda: number) {
  let p = Math.exp(-lambda), cdf = p;
  for (let i = 1; i <= k; i++) { p *= lambda / i; cdf += p; }
  return cdf;
}

/** Is a player scoring more than his chances say? Goals against season xG, as a Poisson test. */
export function finishingExperiment(league: League, playerId: string): FinishingExperiment {
  const p = league.players.find((x) => x.id === playerId)!;
  const xg = p.xg ?? 0;
  const pAtLeast = 1 - poissonCdf(p.goals - 1, xg);
  const pAtMost = poissonCdf(p.goals, xg);
  const verdict = pAtLeast < 0.05 ? 'above' : pAtMost < 0.05 ? 'below' : 'normal';
  return { kind: 'finishing', player: p.id, name: p.name, goals: p.goals, xg, diff: Math.round((p.goals - xg) * 10) / 10, pAtLeast: Math.round(pAtLeast * 1000) / 10, pAtMost: Math.round(pAtMost * 1000) / 10, verdict };
}

export interface CallExperiment { kind: 'call'; attackId: string; stop: 'offside' | 'fouled'; value: number; goalPct: number; correct: boolean; label: string }

/** Was the offside flag right, or should the foul have been a red? From the Ghost Run models. */
export function callExperiment(league: League, attackId: string): CallExperiment {
  const a = league.feeds.flatMap((f) => f.stoppedAttacks).find((x) => x.id === attackId)!;
  const g = computeGhost(a);
  if (a.stop === 'offside') return { kind: 'call', attackId, stop: 'offside', value: g.stopValue, goalPct: g.goalPct, correct: g.stopValue >= 50, label: a.label };
  return { kind: 'call', attackId, stop: 'fouled', value: g.redCard ?? 0, goalPct: g.goalPct, correct: (g.redCard ?? 0) < 50, label: a.label };
}

export interface ValueExperiment { kind: 'value'; attackId: string; goalPct: number; winSaved: number; pointsSaved: number; label: string }

/** What a clearance or block was worth: chance it would have gone in, times what that goal would have done. */
export function valueExperiment(league: League, attackId: string): ValueExperiment {
  const feed = league.feeds.find((f) => f.stoppedAttacks.some((x) => x.id === attackId))!;
  const a = feed.stoppedAttacks.find((x) => x.id === attackId)!;
  const g = computeGhost(a);
  const ctx = matchContext(league, feed);
  const def: Side = a.team === 'home' ? 'away' : 'home';
  const outcome = (extra?: Side) => {
    const s = stateAt(ctx, a.minute, true, undefined, extra);
    const n = 2000;
    let w = 0, d = 0;
    for (let i = 0; i < n; i++) {
      const r = playRest(s, ctx.rates, mulberry32(hashSeed('value', a.id, i)));
      const mine = def === 'home' ? r.home - r.away : r.away - r.home;
      if (mine > 0) w++; else if (mine === 0) d++;
    }
    return { win: w / n, pts: (3 * w + d) / n };
  };
  const kept = outcome();
  const conceded = outcome(a.team);
  const p = g.goalPct / 100;
  return { kind: 'value', attackId, goalPct: g.goalPct, winSaved: Math.round(p * (kept.win - conceded.win) * 100), pointsSaved: Math.round(p * (kept.pts - conceded.pts) * 100) / 100, label: a.label };
}

/** Did a tactical change work? Replay from the change with and without it. */
export function tacticExperiment(league: League, minute: number): ReplayExperiment {
  const ctx = matchContext(league);
  const shield = league.demo.shields.find((s) => s.minute === minute)!;
  const withIt = stateAt(ctx, minute, true);
  const ctxWithout: MatchContext = { ...ctx, changes: ctx.changes.filter((c) => !(c.minute === minute && c.homeBoost === undefined && c.awayBoost === undefined)) };
  const without = stateAt(ctxWithout, minute, true);
  const side = shield.side;
  const team = league.clubs.find((c) => c.code === (side === 'home' ? league.demo.home : league.demo.away))!.short;
  return pairedReplay(ctx, minute, without, withIt, side, [`Without the change`, `${team} switch to a back five`]);
}

export type Experiment = ReplayExperiment | KeeperExperiment | DeserveExperiment | WpaExperiment | FinishingExperiment | CallExperiment | ValueExperiment;
