import { describe, expect, it } from 'vitest';
import { league } from '../../data/league';
import { hashSeed, mulberry32, poisson, poissonInv } from '../rng';
import { winProb, matchRates } from '../match';
import { clubRatings } from '../ratings';
import { computeGhost, computeTimeline, liveStats } from '../demo';
import { demoFinal, ripple, table, universe } from '../league';
import { keeperExperiment, penaltyExperiment } from '../settle';
import { offsideConfidence, wilson, xg } from '../ghost';
import { isBlocked } from '../../../forge/names';
import { CANARY, DENY_SIZES } from '../../data/denylist';

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    expect(hashSeed('x', 1)).toBe(hashSeed('x', 1));
  });
  it('poisson samplers agree on the mean', () => {
    const r = mulberry32(1);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 20000; i++) { s1 += poisson(r, 1.4); s2 += poissonInv(r(), 1.4); }
    expect(s1 / 20000).toBeCloseTo(1.4, 1);
    expect(s2 / 20000).toBeCloseTo(1.4, 1);
  });
});

describe('the Meridian League', () => {
  it('has 20 clubs of 25 players and a full double round-robin', () => {
    expect(league.clubs).toHaveLength(20);
    expect(league.players).toHaveLength(500);
    expect(league.fixtures).toHaveLength(380);
    for (const c of league.clubs) expect(league.fixtures.filter((f) => f.home === c.code)).toHaveLength(19);
  });
  it('uses no blocklisted real names', () => {
    for (const p of league.players) expect(isBlocked(p.name), p.name).toBe(false);
    expect(isBlocked(CANARY.player)).toBe(true);
    expect(DENY_SIZES.players).toBeGreaterThan(50);
  });
  it('sets up the demo story', () => {
    const t = table(league);
    const pos = (c: string) => t.findIndex((r) => r.code === c) + 1;
    expect(pos('NBR')).toBe(5);
    expect(pos('HAR')).toBe(18);
    expect(demoFinal(league)).toEqual({ hg: 1, ag: 2 });
  });
});

describe('match engine', () => {
  const r = clubRatings(league.clubs, league.players);
  it('gives the stronger home side the edge at kick-off', () => {
    const o = winProb({ minute: 0, home: 0, away: 0 }, matchRates(r.NBR, r.HAR), 2000, 3);
    expect(o.home).toBeGreaterThan(o.away);
    expect(o.home + o.draw + o.away).toBeCloseTo(1, 6);
  });
  it('a lead late on is worth more than a lead early', () => {
    const rates = matchRates(r.NBR, r.HAR);
    const early = winProb({ minute: 10, home: 1, away: 0 }, rates, 2000, 4).home;
    const late = winProb({ minute: 80, home: 1, away: 0 }, rates, 2000, 4).home;
    expect(late).toBeGreaterThan(early);
  });
});

describe('The Swing', () => {
  const tl = computeTimeline(league);
  it('ends at the real result', () => {
    expect(tl.byMinute[94]).toEqual({ home: 0, draw: 0, away: 100 });
  });
  it('finds the penalty save as a big swing against Northbridge', () => {
    const m = tl.moments.find((x) => x.id === 'km-61')!;
    expect(m.focus).toBe('home');
    expect(m.swing).toBeLessThan(-15);
    expect(m.cf.home).toBeGreaterThan(m.after.home + 30);
  });
  it('flags the clearance off the line as a quiet turning point', () => {
    const m = tl.moments.find((x) => x.id === 'km-27')!;
    expect(m.quiet).toBe(true);
    expect(m.whatIf).toBeLessThan(-15);
  });
  it('builds live stats from the event log', () => {
    const s = liveStats(league, 63);
    expect(s.find((x) => x.label === 'Big chances')!.home).toBe('1');
  });
});

describe('Ghost Run', () => {
  it('scores the header with the keeper beaten far more often than the long shot', () => {
    const g = league.demo.stoppedAttacks.map((a) => computeGhost(a));
    const header = g.find((x) => x.id === 'ga-27')!;
    const longShot = g.find((x) => x.id === 'ga-57')!;
    expect(header.goalPct).toBeGreaterThan(60);
    expect(longShot.goalPct).toBeLessThan(15);
    expect(header.ci.lo).toBeLessThanOrEqual(header.goalPct);
  });
  it('models', () => {
    expect(xg({ distance: 11, angle: 33, header: false, oneOnOne: true, keeperBeaten: false, defendersNear: 0, keeperSet: true })).toBeGreaterThan(xg({ distance: 25, angle: 15, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 2, keeperSet: true }));
    expect(offsideConfidence(0.2)).toBeGreaterThan(0.9);
    expect(offsideConfidence(0)).toBeCloseTo(0.5, 2);
    const w = wilson(2, 6);
    expect(w.lo).toBeLessThan(0.33);
    expect(w.hi).toBeGreaterThan(0.33);
  });
});

describe('Ripple and Multiverse', () => {
  it('every matchweek feed reproduces its simulated score', () => {
    for (const f of league.feeds) {
      const fx = league.fixtures.find((x) => x.id === f.fixtureId)!;
      if (f.source === 'scripted') continue;
      const goals = f.events.filter((e) => e.type === 'goal');
      expect(goals.filter((e) => e.team === 'home').length).toBe(fx.hg);
      expect(goals.filter((e) => e.team === 'away').length).toBe(fx.ag);
      const tl = computeTimeline(league, f);
      expect(tl.byMinute[94].home + tl.byMinute[94].away + tl.byMinute[94].draw).toBe(100);
    }
  });
  it('a points deduction and a tactic change both run', () => {
    const d = universe(league, [{ kind: 'points', club: 'HAR', delta: -6 }], 2000);
    expect(d.alt.HAR.rel).toBeGreaterThan(d.real.HAR.rel);
    const t = universe(league, [{ kind: 'tactics', club: 'NBR', style: { press: 0.25 }, label: 'press higher' }, { kind: 'player_out', player: 'NBR-9' }], 2000);
    expect(t.levers).toHaveLength(2);
  });
  it('a Harbour win lowers their relegation risk', () => {
    const r = ripple(league, demoFinal(league), 3000);
    expect(r.after.HAR.rel).toBeLessThan(r.before.HAR.rel);
    expect(r.after.NBR.top4).toBeLessThan(r.before.NBR.top4);
  });
  it('removing the top scorer costs Northbridge points', () => {
    const u = universe(league, [{ kind: 'transfer_cancel', player: 'NBR-9', from: 'FEN', to: 'NBR' }], 3000);
    expect(u.alt.NBR.avgPts).toBeLessThan(u.real.NBR.avgPts);
    expect(u.alt.FEN.avgPts).toBeGreaterThan(u.real.FEN.avgPts);
  });
});

describe('Settle It', () => {
  it('a scored penalty makes a Northbridge win likely', () => {
    const e = penaltyExperiment(league, 'km-61');
    expect(e.alternative.home).toBeGreaterThan(65);
    expect(e.significant).toBe(true);
  });
  it('six penalties are not enough to call a keeper the best', () => {
    const k = keeperExperiment(league, 'HAR-1');
    expect(k.subject.faced).toBe(6);
    expect(k.clearlyBest).toBe(false);
  });
});
