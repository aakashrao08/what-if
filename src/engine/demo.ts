// Match-level engine for any match with an event feed: win probability through the match, turning points with
// their counterfactual branches, live stats, and the Ghost Run for every stopped attack.
// Inputs are the event log and squads from The Forge; nothing here is hand-tuned per moment.

import type { DemoMatch, KeyMoment, League, MatchEvent, Side, StoppedAttack } from '../data/types';
import { clubRatings, type Ratings } from './ratings';
import { FULL_TIME, PENALTY_XG, matchRates, winProb, withPendingChance, type LiveState, type Outcome, type Rates, type StateChange } from './match';
import { hashSeed } from './rng';
import { dogso, ghostRun, normalCdf, offsideConfidence, wilson, xBlock, xClear, xTackle, xg } from './ghost';

export const SIMS_PER_MOMENT = 500; // ghost runs per stopped attack (win probability itself is exact, not sampled)

/**
 * How much the pre-match rate counts against the xG a side has actually created: a gamma prior worth this many
 * minutes of play. One match of evidence, so a single big chance nudges the rate rather than rewriting it.
 */
export const PRESSURE_PRIOR_MIN = 90;

export interface WP { home: number; draw: number; away: number } // percentages, one decimal

export interface TimelinePoint { minute: number; wp: WP }

export interface MomentResult {
  id: string;
  eventId: string;
  minute: number;
  before: WP;
  after: WP;
  cf: WP; // the branch where it went the other way
  fork: TimelinePoint[]; // the branch for the next few minutes
  focus: Side; // the side whose win chance moved most
  swing: number; // after - before, for the focus side (points)
  whatIf: number; // cf - before, for the focus side
  impact: number; // biggest of |swing| and |cf - after| ... used to rank the reel
  quiet: boolean; // small real swing, big counterfactual
}

export interface Timeline {
  points: TimelinePoint[]; // includes before/after pairs at events
  byMinute: WP[]; // index = minute 0..94
  events: { id: string; minute: number; before: WP; after: WP }[];
  moments: MomentResult[];
  rates: Rates;
  n: number; // 0: computed exactly over every scoreline, no sampling
}

const pct = (o: Outcome): WP => ({ home: Math.round(o.home * 1000) / 10, draw: Math.round(o.draw * 1000) / 10, away: Math.round(o.away * 1000) / 10 });
export const sideWin = (wp: WP, side: Side) => (side === 'home' ? wp.home : wp.away);

const GOAL_TYPES = new Set<MatchEvent['type']>(['goal']);

export function demoRatings(league: League): Ratings {
  return clubRatings(league.clubs, league.players);
}

/** Effect of each substitution on the side's attack and defence, from the squad ratings. */
export function subChanges(league: League, demo: DemoMatch): StateChange[] {
  const out: StateChange[] = [];
  const removed: Record<Side, string[]> = { home: [], away: [] };
  const added: Record<Side, string[]> = { home: [], away: [] };
  for (const s of [...demo.subs].sort((a, b) => a.minute - b.minute)) {
    const code = s.side === 'home' ? demo.home : demo.away;
    const before = clubRatings(league.clubs, league.players, overrideFor(league, code, removed[s.side], added[s.side]))[code];
    removed[s.side].push(s.off);
    added[s.side].push(s.on);
    const after = clubRatings(league.clubs, league.players, overrideFor(league, code, removed[s.side], added[s.side]))[code];
    const attack = after.att / before.att;
    const defence = after.def / before.def; // >1 = concedes more
    out.push(s.side === 'home' ? { minute: s.minute, homeBoost: attack, homeShield: defence } : { minute: s.minute, awayBoost: attack, awayShield: defence });
  }
  return out;
}

function overrideFor(league: League, code: string, remove: string[], add: string[]) {
  const addStarters = add.map((id) => league.players.find((p) => p.id === id)!).filter(Boolean);
  return { [code]: { remove, addStarters } };
}

export interface MatchContext {
  league: League;
  demo: DemoMatch;
  rates: Rates;
  changes: StateChange[]; // all in-match changes, sorted by minute
}

export function matchContext(league: League, feed: DemoMatch = league.demo): MatchContext {
  const demo = feed;
  const ratings = demoRatings(league);
  const rates = matchRates(ratings[demo.home], ratings[demo.away]);
  const shields: StateChange[] = demo.shields.map((s) => (s.side === 'home'
    ? { minute: s.minute, homeShield: s.factor }
    : { minute: s.minute, awayShield: s.factor }));
  const changes = [...shields, ...subChanges(league, demo)].sort((a, b) => a.minute - b.minute);
  return { league, demo, rates, changes };
}

/** The live state at minute m, with the events at exactly m either included (after) or not (before). */
export function stateAt(ctx: MatchContext, m: number, includeAt: boolean, excludeEvent?: string, extraGoal?: Side): LiveState {
  let home = 0;
  let away = 0;
  for (const e of ctx.demo.events) {
    if (!GOAL_TYPES.has(e.type) || e.id === excludeEvent) continue;
    if (e.minute < m || (includeAt && e.minute === m)) {
      if (e.team === 'home') home++; else away++;
    }
  }
  if (extraGoal === 'home') home++;
  if (extraGoal === 'away') away++;
  // fold changes that have already happened into the base state
  let hb = 1, ab = 1, hs = 1, as = 1;
  const future: StateChange[] = [];
  for (const c of ctx.changes) {
    if (c.minute < m || (includeAt && c.minute === m)) {
      hb *= c.homeBoost ?? 1; ab *= c.awayBoost ?? 1; hs *= c.homeShield ?? 1; as *= c.awayShield ?? 1;
    } else future.push(c);
  }
  const pr = pressure(ctx, m);
  return { minute: Math.min(m, FULL_TIME), home, away, homeBoost: hb * pr.home, awayBoost: ab * pr.away, homeShield: hs, awayShield: as, changes: future };
}

/** Events that are penalties (taken or saved): left out of the pressure signal, which is open play and set pieces. */
function penaltyIds(demo: DemoMatch): Set<string> {
  const ids = new Set(demo.events.filter((e) => e.type === 'penalty_saved').map((e) => e.id));
  for (const km of demo.keyMoments) if (km.pendingFrom) ids.add(km.eventId);
  return ids;
}

/**
 * Pressure: each side's scoring rate updated by the xG it has created before minute m (gamma–Poisson).
 * The multiplier theta on the model's rate has a Gamma(k, k) prior, k = the goals the model expects in
 * PRESSURE_PRIOR_MIN minutes at the pre-match rate. Created xG X over model-expected E gives a posterior mean
 * (k + X) / (k + E). Only events strictly before m count, so a moment's own before/after is its effect on the
 * score and its pressure enters from the next minute. Penalties are left out.
 */
export function pressure(ctx: MatchContext, m: number): { home: number; away: number; xg: { home: number; away: number }; expected: { home: number; away: number } } {
  const t = Math.min(m, FULL_TIME);
  if (t <= 0) return { home: 1, away: 1, xg: { home: 0, away: 0 }, expected: { home: 0, away: 0 } };
  const pens = penaltyIds(ctx.demo);
  const xg = { home: 0, away: 0 };
  for (const e of ctx.demo.events) {
    if (e.minute >= t || !e.team || !e.xg || pens.has(e.id)) continue;
    xg[e.team] += e.xg;
  }
  // what the model expected each side to create so far, with subs and shape changes as they happened
  const expected = { home: 0, away: 0 };
  let hb = 1, ab = 1, hs = 1, as = 1, ci = 0, from = 0;
  const cuts = [...ctx.changes.filter((c) => c.minute < t).map((c) => c.minute), 75, t].filter((x) => x <= t).sort((a, b) => a - b);
  for (const to of cuts) {
    while (ci < ctx.changes.length && ctx.changes[ci].minute <= from) {
      const c = ctx.changes[ci++];
      hb *= c.homeBoost ?? 1; ab *= c.awayBoost ?? 1; hs *= c.homeShield ?? 1; as *= c.awayShield ?? 1;
    }
    const len = Math.max(0, to - from);
    const late = from >= 75 ? 1.12 : 1;
    expected.home += (ctx.rates.home * hb * as * late * len) / 90;
    expected.away += (ctx.rates.away * ab * hs * late * len) / 90;
    from = Math.max(from, to);
  }
  const kh = (ctx.rates.home * PRESSURE_PRIOR_MIN) / 90;
  const ka = (ctx.rates.away * PRESSURE_PRIOR_MIN) / 90;
  return { home: (kh + xg.home) / (kh + expected.home), away: (ka + xg.away) / (ka + expected.away), xg, expected };
}

function finalOutcome(s: LiveState): Outcome {
  return { home: s.home > s.away ? 1 : 0, draw: s.home === s.away ? 1 : 0, away: s.away > s.home ? 1 : 0 };
}

/** Win probability given the state; at full time it's the result. Pending penalties are weighted in. */
export function wpAt(ctx: MatchContext, m: number, includeAt: boolean, opts: { exclude?: string; extraGoal?: Side; n?: number; seedKey?: string } = {}): WP {
  const s = stateAt(ctx, m, includeAt, opts.exclude, opts.extraGoal);
  if (m >= FULL_TIME) return pct(finalOutcome(s));
  // exact over every scoreline: differences between branches and minutes are real, never sampling noise
  const pending = pendingPenalty(ctx, m, includeAt);
  if (pending && !opts.exclude && !opts.extraGoal) return pct(withPendingChance(s, ctx.rates, PENALTY_XG, pending));
  return pct(winProb(s, ctx.rates));
}

/** A penalty that has been awarded but not yet taken at minute m. */
function pendingPenalty(ctx: MatchContext, m: number, includeAt: boolean): Side | null {
  for (const km of ctx.demo.keyMoments) {
    if (!km.pendingFrom) continue;
    const opened = ctx.demo.events.find((e) => e.id === km.pendingFrom)!;
    const resolved = ctx.demo.events.find((e) => e.id === km.eventId)!;
    const afterOpen = opened.minute < m || (includeAt && opened.minute === m);
    const beforeResolve = resolved.minute > m || (!includeAt && resolved.minute === m);
    if (afterOpen && beforeResolve) return opened.team ?? null;
  }
  return null;
}

export function computeMoment(ctx: MatchContext, km: KeyMoment): MomentResult {
  const e = ctx.demo.events.find((x) => x.id === km.eventId)!;
  const key = 'crn';
  const before = wpAt(ctx, e.minute, false, { seedKey: key });
  const after = wpAt(ctx, e.minute, true, { seedKey: key });
  const cfOpts = km.cf.type === 'remove_goal' ? { exclude: e.id } : { extraGoal: km.cf.team };
  const cf = wpAt(ctx, e.minute, true, { ...cfOpts, seedKey: key });
  const fork: TimelinePoint[] = [{ minute: e.minute, wp: cf }];
  for (const dm of [3, 6, 9]) {
    const m = Math.min(FULL_TIME, e.minute + dm);
    fork.push({ minute: m, wp: wpAt(ctx, m, true, { ...cfOpts, seedKey: key }) });
  }
  const dHome = Math.abs(after.home - before.home) + Math.abs(cf.home - after.home);
  const dAway = Math.abs(after.away - before.away) + Math.abs(cf.away - after.away);
  const focus: Side = dAway > dHome ? 'away' : 'home';
  const b = sideWin(before, focus), a = sideWin(after, focus), c = sideWin(cf, focus);
  const swing = Math.round(a - b);
  const whatIf = Math.round(c - b);
  const quiet = Math.abs(swing) < 8 && Math.abs(c - a) >= 12;
  const impact = Math.round(Math.max(Math.abs(a - b), quiet ? Math.abs(c - b) : Math.abs(c - a) * 0.5));
  return { id: km.id, eventId: km.eventId, minute: e.minute, before, after, cf, fork, focus, swing, whatIf, impact, quiet };
}

export function computeTimeline(league: League, feed: DemoMatch = league.demo): Timeline {
  const ctx = matchContext(league, feed);
  const byMinute: WP[] = [];
  for (let m = 0; m <= FULL_TIME; m++) byMinute.push(wpAt(ctx, m, true));
  const events = ctx.demo.events
    .filter((e) => e.type !== 'kickoff')
    .map((e) => ({ id: e.id, minute: e.minute, before: wpAt(ctx, e.minute, false), after: wpAt(ctx, e.minute, true) }));
  const moments = ctx.demo.keyMoments.map((km) => computeMoment(ctx, km));
  // overwrite the event pair for key moments so the chart and the card agree exactly
  for (const mr of moments) {
    const ev = events.find((x) => x.id === mr.eventId);
    if (ev) { ev.before = mr.before; ev.after = mr.after; }
  }
  const points: TimelinePoint[] = [];
  const evAt = new Map<number, typeof events>();
  for (const e of events) evAt.set(Math.floor(e.minute), [...(evAt.get(Math.floor(e.minute)) ?? []), e]);
  for (let m = 0; m <= FULL_TIME; m++) {
    const evs = evAt.get(m);
    if (evs) for (const e of evs) { points.push({ minute: e.minute, wp: e.before }, { minute: e.minute, wp: e.after }); }
    else points.push({ minute: m, wp: byMinute[m] });
  }
  return { points, byMinute, events, moments, rates: ctx.rates, n: 0 };
}

// ---- live stats ----

export interface LiveStat { label: string; home: string; away: string; hw: number; aw: number }

export function liveStats(league: League, minute: number, feed: DemoMatch = league.demo): LiveStat[] {
  const d = feed;
  const seen = d.events.filter((e) => e.minute <= minute);
  const sum = (side: Side, f: (e: MatchEvent) => number) => seen.filter((e) => e.team === side).reduce((a, e) => a + f(e), 0);
  const isShot = (e: MatchEvent) => ['goal', 'shot_saved', 'shot_wide', 'shot_blocked', 'header_cleared', 'double_save', 'penalty_saved'].includes(e.type);
  const shots = (s: Side) => sum(s, (e) => (isShot(e) ? (e.type === 'double_save' ? 2 : 1) : 0));
  const onT = (s: Side) => sum(s, (e) => (isShot(e) && e.onTarget ? (e.type === 'double_save' ? 2 : 1) : 0));
  const xgS = (s: Side) => sum(s, (e) => e.xg ?? 0);
  const big = (s: Side) => sum(s, (e) => (e.bigChance ? 1 : 0));
  const sprint = (s: Side) => Math.max(0, ...seen.filter((e) => e.team === s).map((e) => e.sprint ?? 0));
  const ease = Math.min(1, minute / 90);
  const line = (label: string, h: number, a: number, fmt: (v: number) => string, scale = 1): LiveStat => ({ label, home: fmt(h), away: fmt(a), hw: Math.max(0.01, h * scale), aw: Math.max(0.01, a * scale) });
  const stats: LiveStat[] = [
    line('Expected goals', xgS('home'), xgS('away'), (v) => v.toFixed(2), 100),
    line('Big chances', big('home'), big('away'), (v) => String(v)),
    { label: 'Shots (on target)', home: `${shots('home')} (${onT('home')})`, away: `${shots('away')} (${onT('away')})`, hw: Math.max(0.01, shots('home')), aw: Math.max(0.01, shots('away')) }
  ];
  for (const t of d.trackingStats) {
    // tracking values settle towards their full-time numbers as the match goes on
    const h = 50 + (t.home - 50) * (0.6 + 0.4 * ease);
    const a = t.unit === '%' && t.label !== 'Pass accuracy' ? 100 - h : 50 + (t.away - 50) * (0.6 + 0.4 * ease);
    const fmt = (v: number) => (t.digits ? v.toFixed(t.digits) : `${Math.round(v)}${t.unit ?? ''}`);
    const hv = t.digits ? t.home : h;
    const av = t.digits ? t.away : a;
    stats.push({ label: t.label, home: fmt(hv), away: fmt(av), hw: hv, aw: av });
  }
  stats.push(line('Top sprint', sprint('home'), sprint('away'), (v) => (v ? `${v.toFixed(1)} km/h` : '–')));
  return stats;
}

export function scoreAt(league: League, minute: number, feed: DemoMatch = league.demo): { home: number; away: number; scorers: { side: Side; player: string; label: string }[] } {
  let home = 0, away = 0;
  const scorers: { side: Side; player: string; label: string }[] = [];
  for (const e of feed.events) {
    if (e.type !== 'goal' || e.minute > minute) continue;
    if (e.team === 'home') home++; else away++;
    scorers.push({ side: e.team!, player: e.player!, label: e.label });
  }
  return { home, away, scorers };
}

// ---- Ghost Run ----

export interface GhostResult {
  id: string;
  n: number;
  out: { goal: number; saved: number; wide: number; blocked: number };
  goalPct: number;
  ci: { lo: number; hi: number }; // percent
  xgAtStop: number;
  xgGhost: number;
  stopValue: number; // xClear / xTackle / call confidence / xBlock, as a percent
  stopLabel: 'xCLEAR' | 'xTACKLE' | 'CALL CONFIDENCE' | 'xBLOCK';
  redCard?: number; // percent, fouls only
  goalsPrevented?: number;
  claimHolds: boolean;
  claimValue: number; // the number the claim was tested against
  chart: { actual: [number, number][]; ghost: [number, number][]; duration: number };
}

export function computeGhost(a: StoppedAttack, n = SIMS_PER_MOMENT): GhostResult {
  const out = ghostRun(a.ghost, n, hashSeed('ghost', a.id));
  const goalPct = Math.round((out.goal / n) * 100);
  const w = wilson(out.goal, n);
  const xgAtStop = Math.round(xg(a.atStop) * 100) / 100;
  const xgGhost = Math.round(xg(a.ghost) * 100) / 100;
  let stopValue = 0;
  let stopLabel: GhostResult['stopLabel'] = 'xCLEAR';
  const m = a.stopModel;
  if (m.kind === 'clear') { stopValue = xClear(m.recoveryM, m.speedKmh, m.seconds); stopLabel = 'xCLEAR'; }
  if (m.kind === 'tackle') { stopValue = xTackle(m.angleDeg, m.attackerKmh, m.defenderKmh); stopLabel = 'xTACKLE'; }
  if (m.kind === 'offside') { stopValue = offsideConfidence(m.marginM, m.sigma); stopLabel = 'CALL CONFIDENCE'; }
  if (m.kind === 'block') { stopValue = xBlock(m.laneCoverage, m.metres); stopLabel = 'xBLOCK'; }
  const res: GhostResult = {
    id: a.id, n, out, goalPct, ci: { lo: Math.round(w.lo * 100), hi: Math.round(w.hi * 100) },
    xgAtStop, xgGhost, stopValue: Math.round(stopValue * 100), stopLabel,
    claimHolds: false, claimValue: goalPct,
    chart: { actual: a.timeline, ghost: [], duration: a.duration }
  };
  if (a.stop === 'fouled') res.redCard = Math.round(dogso(out.goal / n, a.covering ?? 0, a.atStop.distance) * 100);
  if (a.stop === 'cleared' || a.stop === 'blocked') res.goalsPrevented = Math.round((out.goal / n) * 100) / 100;
  // pundit check
  const c = a.claim;
  if (c.test === 'red_card') { res.claimValue = res.redCard ?? 0; res.claimHolds = res.claimValue >= c.threshold; }
  if (c.test === 'red_card_below') { res.claimValue = res.redCard ?? 0; res.claimHolds = res.claimValue < c.threshold; }
  if (c.test === 'goal_below') res.claimHolds = goalPct < c.threshold;
  if (c.test === 'goal_above') res.claimHolds = goalPct >= c.threshold;
  // ghost line on the chart: from the stop to the end of the clip, ending at the ghost goal chance
  const last = a.timeline[a.timeline.length - 1];
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const t = last[0] + ((a.duration * 0.92 - last[0]) * i) / steps;
    const p = last[1] + (goalPct - last[1]) * (1 - Math.pow(1 - i / steps, 2));
    res.chart.ghost.push([Math.round(t * 100) / 100, Math.round(p)]);
  }
  return res;
}

export { normalCdf };

// ---- momentum ----

export interface MomentumPoint { minute: number; home: number; away: number } // xG created in the window ending at this minute

/** Who is on top, minute by minute: each side's non-penalty xG over a rolling window (control vs chaos). */
export function momentum(feed: DemoMatch, window = 10, step = 2): MomentumPoint[] {
  const shots = feed.events.filter((e) => e.xg && e.type !== 'penalty_saved' && !(e.type === 'goal' && /penalty|spot/i.test(e.text)));
  const out: MomentumPoint[] = [];
  for (let m = step; m <= FULL_TIME; m += step) {
    const inWin = shots.filter((e) => e.minute > m - window && e.minute <= m);
    const sum = (s: Side) => Math.round(inWin.filter((e) => e.team === s).reduce((a, e) => a + (e.xg ?? 0), 0) * 100) / 100;
    out.push({ minute: m, home: sum('home'), away: sum('away') });
  }
  return out;
}
