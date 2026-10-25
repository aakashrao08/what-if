// Event feeds for the rest of the matchweek. The flagship match is scripted in demo.ts; every other
// game gets a generated log here: chances with xG, the goals that produced the simulated score,
// big misses and saves, fouls, offsides and blocks (each a Ghost Run), cards, substitutions and the
// pitch geometry for every key moment. Seeded, so the same league always gets the same matches.

import type { ChanceFeatures, Club, DemoMatch, KeyMoment, MatchEvent, PitchDot, PitchFrame, Player, PunditClaim, Side, StoppedAttack, MomentKind } from '../src/data/types';
import { gaussian, hashSeed, mulberry32, poisson, type Rng } from '../src/engine/rng';
import type { Rates } from '../src/engine/match';

const surname = (p: Player) => p.name.split(' ').slice(1).join(' ');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

interface Shot {
  minute: number; side: Side; shooter: Player; assister?: Player; xg: number; distance: number; angle: number; lateral: number;
  header: boolean; goal: boolean; outcome: 'goal' | 'saved' | 'wide' | 'blocked' | 'cleared'; penalty?: boolean; speed: number;
}

const BASE: [number, number][] = [[6, 34], [28, 10], [26, 26], [26, 42], [28, 58], [46, 20], [43, 34], [46, 48], [66, 12], [70, 34], [66, 56]];

/** Both shapes, with the attacking side pushed towards the goal it attacks. Home attacks right. */
function shapes(attack: Side, push: number): PitchDot[] {
  const home = BASE.map(([x, y], i) => ({ x: clamp(x + (attack === 'home' ? push : -push * 0.6) * (i === 0 ? 0.3 : 1), 1.5, 103.5), y, team: 'home' as const }));
  const away = BASE.map(([x, y], i) => ({ x: clamp(105 - x + (attack === 'away' ? -push : push * 0.6) * (i === 0 ? 0.3 : 1), 1.5, 103.5), y: 68 - y, team: 'away' as const }));
  return [...home, ...away];
}

function shotSpot(side: Side, distance: number, lateral: number) {
  const gx = side === 'home' ? 105 : 0;
  const along = Math.sqrt(Math.max(1, distance * distance - lateral * lateral));
  return { x: side === 'home' ? gx - along : gx + along, y: 34 + lateral, gx };
}

function weightedPick<T>(rng: Rng, items: T[], w: (t: T) => number): T {
  const total = items.reduce((a, t) => a + w(t), 0);
  let r = rng() * total;
  for (const t of items) { r -= w(t); if (r <= 0) return t; }
  return items[items.length - 1];
}

export interface FeedInput {
  fixtureId: string; home: Club; away: Club; hg: number; ag: number; kickoff: string; rates: Rates; players: Player[];
}

export function generateFeed(inp: FeedInput): DemoMatch {
  const rng = mulberry32(hashSeed('feed', inp.fixtureId));
  const id = inp.fixtureId;
  const xi = (code: string) => inp.players.filter((p) => p.club === code && p.starter);
  const bench = (code: string) => inp.players.filter((p) => p.club === code && !p.starter && p.pos !== 'GK');
  const keeper = (side: Side) => xi(side === 'home' ? inp.home.code : inp.away.code).find((p) => p.pos === 'GK')!;
  const clubOf = (side: Side) => (side === 'home' ? inp.home : inp.away);
  const shooterWeight = (p: Player) => (p.pos === 'FW' ? 3 : p.pos === 'MF' ? 1.2 : p.pos === 'DF' ? 0.35 : 0) * Math.pow(p.attrs.finishing / 70, 2);

  // 1. chances
  const shots: Shot[] = [];
  const newShot = (side: Side, minute: number, forceGoal = false): Shot => {
    const squad = xi(clubOf(side).code);
    const shooter = weightedPick(rng, squad, shooterWeight);
    const u = rng();
    let xg = u < 0.68 ? 0.02 + rng() * 0.1 : u < 0.9 ? 0.12 + rng() * 0.18 : 0.3 + rng() * 0.35;
    if (forceGoal && xg < 0.06) xg = 0.06 + rng() * 0.25;
    const header = rng() < 0.18;
    const distance = r1(clamp(26 - xg * 50 + gaussian(rng) * 2.5, 4.5, 30));
    const lateral = r1(clamp(gaussian(rng) * distance * 0.35, -16, 16));
    const angle = Math.round(clamp(48 - distance * 1.2 - Math.abs(lateral) * 0.8, 8, 60));
    const others = squad.filter((p) => p.id !== shooter.id && p.pos !== 'GK');
    return {
      minute, side, shooter, assister: rng() < 0.7 ? weightedPick(rng, others, (p) => p.attrs.passing) : undefined,
      xg: r2(xg), distance, angle, lateral, header, goal: false, outcome: 'wide', speed: Math.round(header ? 45 + rng() * 20 : 70 + rng() * 40)
    };
  };
  const minuteNow = () => Math.round((1 + rng() * 92) * 10) / 10;
  for (const side of ['home', 'away'] as Side[]) {
    const n = 4 + poisson(rng, (side === 'home' ? inp.rates.home : inp.rates.away) * 4.5);
    for (let i = 0; i < n; i++) shots.push(newShot(side, Math.floor(minuteNow())));
  }
  // 2. the goals that produced the simulated score, chosen among each side's chances by xG
  for (const [side, goals] of [['home', inp.hg], ['away', inp.ag]] as [Side, number][]) {
    for (let g = 0; g < goals; g++) {
      let pool = shots.filter((s) => s.side === side && !s.goal);
      if (!pool.length) { shots.push(newShot(side, Math.floor(minuteNow()), true)); pool = shots.filter((s) => s.side === side && !s.goal); }
      const s = weightedPick(rng, pool, (x) => x.xg + 0.02);
      s.goal = true; s.outcome = 'goal';
    }
  }
  // occasional penalty: one big chance becomes a penalty, scored or saved to match the result
  if (rng() < 0.28) {
    const s = shots[Math.floor(rng() * shots.length)];
    s.penalty = true; s.xg = 0.78; s.distance = 11; s.lateral = 0; s.angle = 36; s.header = false; s.assister = undefined;
    s.shooter = [...xi(clubOf(s.side).code)].filter((p) => p.pos === 'FW').sort((a, b) => b.attrs.finishing - a.attrs.finishing)[0];
  }
  for (const s of shots) {
    if (s.goal) continue;
    const big = s.xg >= 0.28;
    const r = rng();
    s.outcome = big && r < 0.12 && !s.penalty ? 'cleared' : s.penalty ? 'saved' : r < 0.42 ? 'saved' : r < 0.8 ? 'wide' : 'blocked';
  }
  shots.sort((a, b) => a.minute - b.minute);
  // two events can't share a minute and side: nudge
  const used = new Set<string>();
  for (const s of shots) { while (used.has(`${s.minute}`)) s.minute = Math.min(93, s.minute + 1); used.add(`${s.minute}`); }

  // 3. events
  const events: MatchEvent[] = [];
  let n = 0;
  const ev = (e: Omit<MatchEvent, 'id'>) => { const x = { id: `${id}:e${++n}`, ...e }; events.push(x); return x; };
  const label = (m: number) => (m > 90 ? `90+${Math.ceil(m - 90)}'` : `${Math.floor(m)}'`);
  ev({ minute: 0, label: "0'", type: 'kickoff', text: `Kick-off at ${inp.home.ground}` });
  const shotEvent = new Map<Shot, MatchEvent>();
  let hg = 0, ag = 0;
  for (const s of shots) {
    const club = clubOf(s.side).short;
    const opp = s.side === 'home' ? 'away' : 'home';
    const gk = keeper(opp);
    const name = surname(s.shooter);
    if (s.penalty) ev({ minute: s.minute - 1, label: label(s.minute - 1), type: 'penalty_awarded', team: s.side, player: s.shooter.id, text: `Penalty to ${club}. ${name} brought down in the box` });
    const detail = { distance: s.distance, shotKmh: s.speed };
    const base = { minute: s.minute, label: label(s.minute), team: s.side, player: s.shooter.id, xg: s.xg, detail, bigChance: s.xg >= 0.3 };
    let e: MatchEvent;
    if (s.goal) {
      if (s.side === 'home') hg++; else ag++;
      e = ev({ ...base, type: 'goal', other: s.assister?.id, onTarget: true, text: `GOAL, ${club}. ${name} ${s.penalty ? 'scores the penalty' : s.header ? 'heads in' : s.distance >= 20 ? `scores from ${Math.round(s.distance)} metres` : 'finishes'}` });
    } else if (s.penalty) {
      e = ev({ ...base, type: 'penalty_saved', other: gk.id, onTarget: true, text: `Penalty saved. ${surname(gk)} denies ${name}` });
    } else if (s.outcome === 'saved') {
      e = ev({ ...base, type: 'shot_saved', other: gk.id, onTarget: true, text: `${surname(gk)} saves ${name}’s ${s.header ? 'header' : 'shot'}` });
    } else if (s.outcome === 'cleared') {
      const def = weightedPick(rng, xi(clubOf(opp).code).filter((p) => p.pos === 'DF'), (p) => p.attrs.defending);
      e = ev({ ...base, type: 'header_cleared', other: def.id, onTarget: true, sprint: def.topSpeed, detail: { ...detail, recoveryM: Math.round(8 + rng() * 18) }, text: `${surname(def)} clears ${name}’s ${s.header ? 'header' : 'shot'} off the line` });
    } else if (s.outcome === 'blocked') {
      const def = weightedPick(rng, xi(clubOf(opp).code).filter((p) => p.pos === 'DF' || p.pos === 'MF'), (p) => p.attrs.defending);
      e = ev({ ...base, type: 'shot_blocked', other: def.id, text: `${name}’s shot blocked by ${surname(def)}` });
    } else {
      e = ev({ ...base, type: 'shot_wide', text: `${name} ${s.header ? 'heads' : 'shoots'} ${s.distance > 20 ? 'over from distance' : 'wide'}` });
    }
    shotEvent.set(s, e);
  }
  if (hg !== inp.hg || ag !== inp.ag) throw new Error(`feed ${id} scored ${hg}-${ag}, expected ${inp.hg}-${inp.ag}`);

  // fouls and offsides that stopped attacks, plus subs and cards
  const stopped: { minute: number; side: Side; stop: 'fouled' | 'offside'; attacker: Player; stopper?: Player }[] = [];
  const nStops = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < nStops; i++) {
    const side: Side = rng() < 0.5 ? 'home' : 'away';
    const opp: Side = side === 'home' ? 'away' : 'home';
    let minute = Math.floor(5 + rng() * 85);
    while (used.has(`${minute}`)) minute = Math.min(92, minute + 1);
    used.add(`${minute}`);
    const attacker = weightedPick(rng, xi(clubOf(side).code), shooterWeight);
    if (rng() < 0.55) {
      const stopper = weightedPick(rng, xi(clubOf(opp).code).filter((p) => p.pos === 'DF' || p.pos === 'MF'), (p) => p.attrs.defending);
      stopped.push({ minute, side, stop: 'fouled', attacker, stopper });
      ev({ minute, label: label(minute), type: 'foul', team: side, player: attacker.id, other: stopper.id, text: `${surname(attacker)} brought down by ${surname(stopper)} outside the box. Yellow card` });
    } else {
      stopped.push({ minute, side, stop: 'offside', attacker });
      ev({ minute, label: label(minute), type: 'offside', team: side, player: attacker.id, text: `${surname(attacker)} through on goal, flagged offside` });
    }
  }
  const subs: DemoMatch['subs'] = [];
  for (const side of ['home', 'away'] as Side[]) {
    const code = clubOf(side).code;
    const outs = xi(code).filter((p) => p.pos !== 'GK' && p.pos !== 'DF').sort(() => rng() - 0.5).slice(0, 2);
    const ins = bench(code).sort(() => rng() - 0.5).slice(0, 2);
    outs.forEach((o, k) => {
      let minute = Math.floor(58 + rng() * 25);
      while (used.has(`${minute}`)) minute++;
      used.add(`${minute}`);
      subs.push({ minute, side, off: o.id, on: ins[k].id });
      ev({ minute, label: label(minute), type: 'sub', team: side, player: ins[k].id, other: o.id, text: `${clubOf(side).short} change: ${surname(o)} off` });
    });
  }
  ev({ minute: 45.5, label: 'HT', type: 'half_time', text: `Half-time. ${inp.home.short} ${shots.filter((s) => s.goal && s.side === 'home' && s.minute <= 45).length}–${shots.filter((s) => s.goal && s.side === 'away' && s.minute <= 45).length} ${inp.away.short}` });
  ev({ minute: 94, label: 'FT', type: 'full_time', text: `Full time. ${inp.home.short} ${inp.hg}–${inp.ag} ${inp.away.short}` });
  events.sort((a, b) => a.minute - b.minute || (a.type === 'penalty_awarded' ? -1 : 0));

  // 4. key moments: every goal (what if it doesn't go in?) and every big chance that didn't (what if it does?)
  const keyMoments: KeyMoment[] = [];
  let score = { home: 0, away: 0 };
  for (const s of shots) {
    const e = shotEvent.get(s)!;
    const before = { ...score };
    if (s.goal) score = { ...score, [s.side]: score[s.side] + 1 };
    const spot = shotSpot(s.side, s.distance, s.lateral);
    const opp: Side = s.side === 'home' ? 'away' : 'home';
    const gkSpot = { x: s.side === 'home' ? 103.4 : 1.6, y: 34 + clamp(s.lateral * 0.15, -2, 2) };
    if (!s.goal && s.xg < 0.28 && !s.penalty) continue;
    let kind: MomentKind;
    if (s.goal) {
      const lead = (sc: typeof score) => Math.sign(sc.home - sc.away);
      const late = s.minute >= 80 && lead(before) !== lead(score);
      kind = late ? 'late_goal' : s.distance >= 20 ? 'goal_long_range' : 'goal';
    } else kind = s.penalty ? 'penalty_saved' : s.outcome === 'cleared' ? 'clearance_off_line' : s.outcome === 'saved' ? 'big_save' : 'big_miss';
    const target = s.goal ? { x: spot.gx === 105 ? 104.4 : 0.6, y: 34 + clamp(s.lateral * 0.12 + gaussian(rng) * 1.5, -2.8, 2.8) }
      : s.outcome === 'saved' ? gkSpot
        : s.outcome === 'cleared' ? { x: s.side === 'home' ? 104 : 1, y: 34 + (rng() < 0.5 ? -1.5 : 1.5) }
          : { x: spot.gx === 105 ? 104.8 : 0.2, y: 34 + (rng() < 0.5 ? -1 : 1) * (5 + rng() * 4) };
    const dots = shapes(s.side, 20);
    const shooterIdx = s.side === 'home' ? 9 : 20;
    dots[shooterIdx] = { x: spot.x, y: spot.y, team: s.side, key: true };
    const gkIdx = s.side === 'home' ? 11 : 0;
    dots[gkIdx] = { ...gkSpot, team: opp, key: s.outcome === 'saved' };
    const paths: PitchFrame['paths'] = [];
    if (s.assister && !s.penalty) {
      const from = { x: clamp(spot.x + (s.side === 'home' ? -14 : 14), 2, 103), y: clamp(spot.y + (rng() - 0.5) * 24, 4, 64) };
      paths.push({ d: `M${r1(from.x)} ${r1(from.y)} L${r1(spot.x)} ${r1(spot.y)}`, kind: s.side, dashed: true });
    }
    paths.push({ d: `M${r1(spot.x)} ${r1(spot.y)} L${r1(target.x)} ${r1(target.y)}`, kind: s.side });
    if (!s.goal) paths.push({ d: `M${r1(spot.x)} ${r1(spot.y)} L${s.side === 'home' ? 104.6 : 0.4} 34`, kind: 'ghost' });
    const gk = keeper(opp);
    const tags: PitchFrame['tags'] = [{ x: spot.x, y: spot.y, player: s.shooter.id, detail: `${s.penalty ? 'Penalty' : s.header ? 'Header' : 'Shot'} · xG ${s.xg.toFixed(2)} · ${Math.round(s.distance)} m`, team: s.side }];
    if (s.outcome === 'saved' || s.penalty) tags.push({ x: gkSpot.x, y: gkSpot.y, player: gk.id, detail: `Save · ${(0.3 + rng() * 0.25).toFixed(2)} s reaction`, team: opp });
    if (s.outcome === 'cleared' && e.other) tags.push({ x: target.x, y: target.y, player: e.other, detail: `${e.sprint} km/h recovery run`, team: 'ghost' });
    const verb = s.goal ? (s.header ? 'heads in' : s.distance >= 18 ? 'scores from distance' : 'scores') : s.penalty ? 'has his penalty saved' : s.outcome === 'saved' ? 'is denied by the keeper' : s.outcome === 'cleared' ? 'sees his effort cleared off the line' : 'misses a big chance';
    const title = s.goal ? `${surname(s.shooter)} ${s.penalty ? 'scores from the spot' : s.header ? 'heads in' : s.distance >= 18 ? `scores from ${Math.round(s.distance)} metres` : 'finishes'}${kind === 'late_goal' ? ' late on' : ''}`
      : s.penalty ? `${surname(gk)} saves ${surname(s.shooter)}’s penalty` : s.outcome === 'saved' ? `${surname(gk)} denies ${surname(s.shooter)}` : s.outcome === 'cleared' ? `${surname(inp.players.find((p) => p.id === e.other)!)} clears ${surname(s.shooter)}’s effort off the line` : `${surname(s.shooter)} misses a big chance`;
    const pendingFrom = s.penalty ? events.find((x) => x.type === 'penalty_awarded' && x.player === s.shooter.id && x.minute === s.minute - 1)?.id : undefined;
    keyMoments.push({
      id: `${id}:km-${s.minute}`, eventId: e.id, pendingFrom, kind, minute: s.minute, label: label(s.minute), clip: `0:${String(10 + Math.floor(rng() * 12)).padStart(2, '0')}`,
      title, cf: s.goal ? { type: 'remove_goal' } : { type: 'add_goal', team: s.side },
      frame: { dots, ball: target, paths, tags, marks: s.goal ? [] : [{ x: s.side === 'home' ? 104.6 : 0.4, y: 34, kind: 'target' }], label: `Pitch at ${label(s.minute)}: ${surname(s.shooter)} ${verb}.` }
    });
  }

  // 5. stopped attacks: blocked shots, off-the-line clearances, fouls and offsides, each with a Ghost Run
  const stoppedAttacks: StoppedAttack[] = [];
  const PUNDITS: Record<'cleared' | 'blocked' | 'fouled' | 'offside', PunditClaim[]> = {
    cleared: [{ quote: 'That was drifting wide anyway.', test: 'goal_below' , threshold: 30 }, { quote: 'If he doesn’t clear that, it’s in.', test: 'goal_above' , threshold: 60 }],
    blocked: [{ quote: 'That was a certain goal.', test: 'goal_above' , threshold: 80 }, { quote: 'Brave block, but it wasn’t going in.', test: 'goal_below' , threshold: 15 }],
    fouled: [{ quote: 'Clear goalscoring chance. Should have been red.', test: 'red_card' , threshold: 50 }, { quote: 'Clever foul. Yellow was the right call.', test: 'red_card_below' , threshold: 50 }],
    offside: [{ quote: 'Tight, and that was a real chance.', test: 'goal_above' , threshold: 30 }, { quote: 'Even onside, he wasn’t scoring that.', test: 'goal_below' , threshold: 25 }]
  };
  const pick = <T,>(arr: T[], key: string) => arr[hashSeed(key) % arr.length];
  const ghostFrame = (side: Side, from: { x: number; y: number }, stopAt: { x: number; y: number }, names: { att: string; def?: string }, offsideX?: number): PitchFrame => {
    const gx = side === 'home' ? 104.2 : 0.8;
    const opp: Side = side === 'home' ? 'away' : 'home';
    const ghostEnd = { x: side === 'home' ? stopAt.x + (gx - stopAt.x) * 0.55 : stopAt.x - (stopAt.x - gx) * 0.55, y: 34 + (stopAt.y - 34) * 0.5 };
    return {
      dots: [
        { x: stopAt.x, y: stopAt.y, team: side, key: true },
        { x: stopAt.x + (side === 'home' ? 1.8 : -1.8), y: stopAt.y + 1.6, team: opp, key: !!names.def },
        { x: side === 'home' ? 102.8 : 2.2, y: 34, team: opp },
        { x: ghostEnd.x + (side === 'home' ? -3 : 3), y: ghostEnd.y + 5, team: opp }
      ],
      paths: [{ d: `M${r1(from.x)} ${r1(from.y)} L${r1(stopAt.x)} ${r1(stopAt.y)}`, kind: side }, { d: `M${r1(stopAt.x)} ${r1(stopAt.y)} L${r1(ghostEnd.x)} ${r1(ghostEnd.y)} L${gx} 34`, kind: 'ghost' }],
      marks: [{ x: stopAt.x, y: stopAt.y - 1.4, kind: 'stop' }, { x: gx, y: 34, kind: 'target' }],
      labels: [{ x: stopAt.x + (side === 'home' ? -10 : 2), y: stopAt.y - 3, text: names.att.toUpperCase(), tone: side }, ...(names.def ? [{ x: stopAt.x + 2, y: stopAt.y + 5.5, text: names.def.toUpperCase(), tone: opp }] : [])],
      offsideX, tags: [], label: `${names.att}’s attack is stopped; the ghost run carries it on to a shot.`
    };
  };
  const blockedKeep = new Set(shots.filter((s) => s.outcome === 'blocked').sort((a, b) => b.xg - a.xg).slice(0, 2));
  for (const s of shots) {
    if (s.outcome !== 'cleared' && !blockedKeep.has(s)) continue;
    const e = shotEvent.get(s)!;
    const def = inp.players.find((p) => p.id === e.other)!;
    const spot = shotSpot(s.side, s.distance, s.lateral);
    const feat: ChanceFeatures = { distance: s.distance, angle: s.angle, header: s.header, oneOnOne: false, keeperBeaten: s.outcome === 'cleared', defendersNear: 0, keeperSet: s.outcome !== 'cleared' };
    const kind = s.outcome === 'cleared' ? 'cleared' : 'blocked';
    stoppedAttacks.push({
      id: `${id}:ga-${s.minute}`, eventId: e.id, minute: s.minute, label: label(s.minute), team: s.side, attacker: s.shooter.id, stopper: def.id, stop: kind,
      title: `${surname(s.shooter)}’s ${s.header ? 'header' : 'shot'}`, momentId: keyMoments.find((k) => k.eventId === e.id)?.id,
      atStop: { ...feat, keeperBeaten: false, defendersNear: 1 }, ghost: feat,
      stopModel: kind === 'cleared' ? { kind: 'clear', recoveryM: e.detail?.recoveryM ?? 15, speedKmh: def.topSpeed, seconds: 1.4 + rng() * 1.2 } : { kind: 'block', laneCoverage: r2(0.4 + rng() * 0.4), metres: r1(3 + rng() * 8) },
      facts: [{ k: 'Shot from', v: `${s.distance} m` }, { k: 'Chance quality', v: `xG ${s.xg.toFixed(2)}` }, { k: kind === 'cleared' ? 'Recovery run' : 'Blocked by', v: kind === 'cleared' ? `${e.detail?.recoveryM} m · ${def.topSpeed} km/h` : def.name }],
      claim: pick(PUNDITS[kind], e.id), timeline: [[0, 1], [0.7, 3], [1.3, Math.round(s.xg * 60)], [1.8, Math.round(s.xg * 100)]], duration: 3,
      frame: ghostFrame(s.side, { x: spot.x + (s.side === 'home' ? -16 : 16), y: clamp(spot.y + 8, 4, 64) }, spot, { att: surname(s.shooter), def: surname(def) })
    });
  }
  for (const st of stopped) {
    const e = events.find((x) => x.minute === st.minute && (x.type === 'foul' || x.type === 'offside'))!;
    const dist = st.stop === 'fouled' ? r1(18 + rng() * 7) : r1(9 + rng() * 6);
    const lateral = r1(gaussian(rng) * 6);
    const spot = shotSpot(st.side, st.stop === 'fouled' ? dist : dist + 9, lateral);
    const ghost: ChanceFeatures = st.stop === 'fouled'
      ? { distance: r1(10 + rng() * 5), angle: Math.round(26 + rng() * 12), header: false, oneOnOne: rng() < 0.25, keeperBeaten: false, defendersNear: Math.floor(rng() * 3), keeperSet: true }
      : { distance: dist, angle: Math.round(30 + rng() * 10), header: false, oneOnOne: true, keeperBeaten: false, defendersNear: 0, keeperSet: true };
    const margin = r2(0.05 + rng() * 0.5);
    const covering = Math.floor(rng() * 3);
    const offX = st.side === 'home' ? spot.x - margin * 4 : spot.x + margin * 4;
    stoppedAttacks.push({
      id: `${id}:ga-${st.minute}`, eventId: e.id, minute: st.minute, label: label(st.minute), team: st.side, attacker: st.attacker.id, stopper: st.stopper?.id ?? '', stop: st.stop,
      title: st.stop === 'fouled' ? `${surname(st.attacker)} brought down outside the box` : `${surname(st.attacker)} through on goal`,
      atStop: { distance: st.stop === 'fouled' ? dist : dist + 9, angle: Math.round(22 + rng() * 10), header: false, oneOnOne: false, keeperBeaten: false, defendersNear: covering + 1, keeperSet: true },
      ghost,
      stopModel: st.stop === 'fouled' ? { kind: 'tackle', angleDeg: Math.round(25 + rng() * 40), attackerKmh: r1(st.attacker.topSpeed - 3), defenderKmh: r1((st.stopper?.topSpeed ?? 30) - 4) } : { kind: 'offside', marginM: margin, sigma: 0.12 },
      covering,
      facts: st.stop === 'fouled'
        ? [{ k: 'Distance to goal', v: `${dist} m` }, { k: 'Covering defenders', v: `${covering} within 4 m` }, { k: `${surname(st.attacker)} speed`, v: `${r1(st.attacker.topSpeed - 3)} km/h` }]
        : [{ k: 'Offside by', v: `${margin} m` }, { k: 'Situation', v: 'One-on-one' }, { k: 'Shot distance', v: `${dist} m` }],
      claim: pick(PUNDITS[st.stop], e.id), timeline: [[0, 1], [0.8, 3], [1.5, 7], [2.1, 10]], duration: 4,
      frame: ghostFrame(st.side, { x: spot.x + (st.side === 'home' ? -22 : 22), y: clamp(spot.y - 10, 4, 64) }, spot, { att: surname(st.attacker), def: st.stopper ? surname(st.stopper) : undefined }, st.stop === 'offside' ? r1(offX) : undefined)
    });
  }
  stoppedAttacks.sort((a, b) => a.minute - b.minute);

  const poss = Math.round(clamp(50 + (inp.rates.home - inp.rates.away) * 9 + gaussian(rng) * 4, 34, 68));
  return {
    fixtureId: id, source: 'generated', home: inp.home.code, away: inp.away.code, ground: inp.home.ground, kickoff: inp.kickoff,
    events, keyMoments, stoppedAttacks, liveMinute: 0, shields: [], subs,
    trackingStats: [
      { label: 'Possession', home: poss, away: 100 - poss, unit: '%' },
      { label: 'Field tilt', home: Math.round(clamp(poss + gaussian(rng) * 6, 25, 78)), away: 0, unit: '%' },
      { label: 'Pass accuracy', home: Math.round(76 + rng() * 12), away: Math.round(74 + rng() * 12), unit: '%' },
      { label: 'Avg pass difficulty', home: r1(4.8 + rng() * 1.6), away: r1(4.8 + rng() * 1.6), digits: 1 }
    ].map((t) => (t.label === 'Field tilt' ? { ...t, away: 100 - t.home } : t))
  };
}
