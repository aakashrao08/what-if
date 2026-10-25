import { describe, expect, it } from 'vitest';
import { league } from '../../data/league';
import { hashSeed, mulberry32 } from '../rng';
import { DC_RHO, fullMatchDraw, matchRates, playMatch, playRest, winProb, type LiveState, type Outcome, type Rates } from '../match';
import { clubRatings } from '../ratings';
import { matchContext, pressure, stateAt } from '../demo';
import { momentShapley } from '../credit';
import { rangesOverlap, runIn } from '../season';
import { playedResults, remainingPairings } from '../league';
import { verify } from '../../agents/verifier';
import type { DemoMatch } from '../../data/types';

const sampled = (s: LiveState, rates: Rates, n: number, seed: number): Outcome => {
  const rng = mulberry32(seed);
  let h = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const r = playRest(s, rates, rng);
    if (r.home > r.away) h++; else if (r.home === r.away) d++;
  }
  return { home: h / n, draw: d / n, away: (n - h - d) / n };
};

describe('exact win probability', () => {
  const ctx = matchContext(league);
  const states: [string, LiveState][] = [
    ['kick-off', stateAt(ctx, 0, true)],
    ['level at 30′', stateAt(ctx, 30, true)],
    ['after the equaliser, with the sub and back five still to come', stateAt(ctx, 52, true)],
    ['level at 80′', stateAt(ctx, 80, true)],
    ['a goal down at 88′', stateAt(ctx, 88, true)],
    ['from 9′ with goals scheduled at 52′ and 87′', { ...stateAt(ctx, 9, false), goals: [{ minute: 52, side: 'away' }, { minute: 87, side: 'away' }] }]
  ];
  for (const [label, s] of states) {
    it(`matches a 20,000-run Monte Carlo within 1 point: ${label}`, () => {
      const exact = winProb(s, ctx.rates);
      const mc = sampled(s, ctx.rates, 20000, hashSeed('mc', label));
      expect(exact.home + exact.draw + exact.away).toBeCloseTo(1, 9);
      expect(Math.abs(exact.home - mc.home)).toBeLessThan(0.01);
      expect(Math.abs(exact.draw - mc.draw)).toBeLessThan(0.01);
      expect(Math.abs(exact.away - mc.away)).toBeLessThan(0.01);
    });
  }
  it('is the same every time and ignores the old sample size and seed', () => {
    const s = stateAt(ctx, 40, true);
    expect(winProb(s, ctx.rates, 10, 1)).toEqual(winProb(s, ctx.rates, 5000, 99));
  });
});

describe('Dixon–Coles draw correction', () => {
  const r = clubRatings(league.clubs, league.players);
  const rates = matchRates(r.NBR, r.HAR);
  it('raises the draw rate over independent Poisson', () => {
    expect(DC_RHO).toBeLessThan(0);
    expect(fullMatchDraw(rates, DC_RHO)).toBeGreaterThan(fullMatchDraw(rates, 0) + 0.01);
  });
  it('sampled full matches hit the corrected joint distribution', () => {
    const rng = mulberry32(7);
    const n = 100000;
    let d = 0, z = 0, one = 0;
    for (let i = 0; i < n; i++) {
      const m = playMatch(rates, rng);
      if (m.home === m.away) d++;
      if (m.home === 0 && m.away === 0) z++;
      if (m.home === 1 && m.away === 0) one++;
    }
    const e = Math.exp(-rates.home - rates.away);
    // tau(0,0) = 1 - rho*lh*la, tau(1,0) = 1 + rho*la
    expect(z / n).toBeCloseTo(e * (1 - DC_RHO * rates.home * rates.away), 2);
    expect(one / n).toBeCloseTo(e * rates.home * (1 + DC_RHO * rates.away), 2);
    expect(d / n).toBeCloseTo(fullMatchDraw(rates, DC_RHO), 2);
  });
  it('raises draws in the exact in-match pass too', () => {
    const s = { minute: 0, home: 0, away: 0 };
    const corrected = winProb(s, rates).draw;
    const sampledNoDc = (() => {
      const rng = mulberry32(3);
      let dr = 0;
      for (let i = 0; i < 20000; i++) { const x = playRest(s, rates, rng, 0); if (x.home === x.away) dr++; }
      return dr / 20000;
    })();
    expect(corrected).toBeGreaterThan(sampledNoDc);
  });
});

describe('pressure-aware rates', () => {
  const ctx = matchContext(league);
  it('starts neutral and is deterministic', () => {
    expect(pressure(ctx, 0)).toMatchObject({ home: 1, away: 1 });
    expect(pressure(ctx, 60)).toEqual(pressure(ctx, 60));
  });
  it('only uses events before the minute', () => {
    const future: DemoMatch = { ...league.demo, events: league.demo.events.map((e) => (e.minute >= 60 && e.xg ? { ...e, xg: e.xg * 5 } : e)) };
    const fctx = { ...ctx, demo: future };
    expect(pressure(fctx, 60)).toEqual(pressure(ctx, 60));
    expect(pressure(fctx, 80).home).toBeGreaterThan(pressure(ctx, 80).home);
  });
  it('a side creating more than the model expects gets a higher rate, and penalties do not count', () => {
    const p = pressure(ctx, 60);
    expect(p.home).toBeLessThan(1); // Northbridge's open-play xG trails what their ratings expect
    expect(p.xg.home).toBeCloseTo(0.24, 6); // 9′, 38′, 49′ shots; the 61′ penalty is excluded and later anyway
    const s = stateAt(ctx, 60, true);
    expect(s.homeBoost).toBeCloseTo(p.home * (ctx.changes.filter((c) => c.minute < 60).reduce((a, c) => a * (c.homeBoost ?? 1), 1)), 9);
  });
});

describe('fair credit (Shapley)', () => {
  for (const f of league.feeds) {
    it(`values add up to the total effect: ${f.fixtureId}`, () => {
      const c = momentShapley(league, f);
      const sum = c.moments.reduce((a, m) => a + m.shapley, 0);
      expect(sum).toBeCloseTo(c.total, 8);
      expect(c.combos).toBe(1 << f.keyMoments.length);
      for (const m of c.moments) expect(Number.isFinite(m.shapley)).toBe(true);
    });
  }
  it('credits the 87th-minute winner and the penalty save for Harbour', () => {
    const c = momentShapley(league);
    expect(c.focus).toBe('away');
    const by = (id: string) => c.moments.find((m) => m.id === id)!;
    expect(by('km-87').shapley).toBeGreaterThan(10);
    expect(by('km-61').shapley).toBeGreaterThan(5);
    expect(by('km-9').shapley).toBeLessThan(0); // Northbridge's goal worked against Harbour
  });
});

describe('run-in ranges', () => {
  const codes = league.clubs.map((c) => c.code);
  const ratings = clubRatings(league.clubs, league.players);
  const out = runIn({ codes, fixed: playedResults(league), remaining: remainingPairings(league), ratings, n: 4000, seed: 5 });
  it('every range holds its estimate and stays inside 0-100%', () => {
    for (const c of codes) {
      for (const k of ['title', 'top4', 'rel'] as const) {
        const r = out[c].ci[k];
        expect(r.lo).toBeLessThanOrEqual(out[c][k] + 1e-12);
        expect(r.hi).toBeGreaterThanOrEqual(out[c][k] - 1e-12);
        expect(r.lo).toBeGreaterThanOrEqual(0);
        expect(r.hi).toBeLessThanOrEqual(1);
        expect(r.hi - r.lo).toBeLessThan(0.1);
      }
    }
  });
  it('overlap is symmetric and strict about gaps', () => {
    expect(rangesOverlap({ lo: 0.1, hi: 0.2 }, { lo: 0.15, hi: 0.3 })).toBe(true);
    expect(rangesOverlap({ lo: 0.1, hi: 0.2 }, { lo: 0.21, hi: 0.3 })).toBe(false);
    expect(rangesOverlap({ lo: 0.21, hi: 0.3 }, { lo: 0.1, hi: 0.2 })).toBe(false);
  });
});

describe('Verifier: comparisons need separated ranges', () => {
  it('rejects "more likely" when the ranges overlap', () => {
    expect(verify('They are more likely to finish fourth.', { rangesOverlap: true }).ok).toBe(false);
    expect(verify('A better shot at the top four.', { rangesOverlap: true }).ok).toBe(false);
  });
  it('allows it when the ranges are apart, or when no range is involved', () => {
    expect(verify('They are more likely to finish fourth.', { rangesOverlap: false }).ok).toBe(true);
    expect(verify('They are more likely to finish fourth.', {}).ok).toBe(true);
    expect(verify('They are not more likely to finish fourth.', { rangesOverlap: true }).ok).toBe(true);
  });
});
