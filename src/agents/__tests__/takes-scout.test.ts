import { describe, expect, it } from 'vitest';
import { league } from '../../data/league';
import { computeGhost, computeTimeline } from '../../engine/demo';
import { finalOf, ripple, universe, type RippleResult } from '../../engine/league';
import { raceProb, searchChanges } from '../../engine/takes';
import { drFootball } from '../drFootball';
import { candidates, parseGoal, takesView, TAKES_EXAMPLES, type Goal } from '../takes';
import { scoutAlerts } from '../scout';
import { verify } from '../verifier';
import { LANGS } from '../format';

const strip = (g: Goal) => ({ ...g, candidates: candidates(league, g).map(({ id, levers, cost, tag }) => ({ id, levers, cost, tag })) });
const clean = (s: string) => !/undefined|NaN/.test(s);

describe('What would it take?', () => {
  it('reads goals, and falls back to the race a club is actually in', () => {
    expect(parseGoal(league, 'What would it take for Northbridge to finish in the top four?')).toEqual({ club: 'NBR', race: 'top4' });
    expect(parseGoal(league, 'what would it take for harbour athletic to stay up')).toEqual({ club: 'HAR', race: 'survive' });
    expect(parseGoal(league, 'How do we win the title?', 'NBR')).toEqual({ club: 'NBR', race: 'title' });
    expect(parseGoal(league, 'what would it take?')).toHaveProperty('error');
  });

  it('only offers changes the scenario reader turns back into the same levers', () => {
    const c = candidates(league, { club: 'NBR', race: 'top4' });
    expect(c.length).toBeGreaterThan(20);
    expect(new Set(c.map((x) => x.tag))).toEqual(new Set(['TACTICS', 'MANAGER', 'SIGNING', 'MOMENT', 'ELSEWHERE']));
    for (const x of c) {
      const p = drFootball(league, x.sentence);
      expect(p.ok && p.levers, x.sentence).toEqual(x.levers);
    }
  });

  it('confirms every route with the same universe "Play it out" runs', () => {
    const goal: Goal = { club: 'NBR', race: 'top4' };
    const r = searchChanges(league, strip(goal));
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.threshold).toBeGreaterThan(r.base);
    // smallest change first among those that reach the target
    const reaching = r.options.filter((o) => o.reaches);
    for (let i = 1; i < reaching.length; i++) expect(reaching[i].cost).toBeGreaterThanOrEqual(reaching[i - 1].cost);
    const best = r.options[0];
    const u = universe(league, best.levers);
    expect(raceProb(u.alt.NBR, 'top4').p).toBe(best.p);
    expect(raceProb(u.real.NBR, 'top4').p).toBe(r.base);
    // the points yardstick really does get them there
    if (r.pointsNeeded !== null) expect(raceProb(universe(league, [{ kind: 'points', club: 'NBR', delta: r.pointsNeeded }]).alt.NBR, 'top4').p).toBeGreaterThanOrEqual(r.threshold);
  }, 30000);

  it('writes an answer the Verifier passes for every example and club', () => {
    const goals = [
      ...TAKES_EXAMPLES(league).map((q) => parseGoal(league, q) as Goal),
      ...league.clubs.filter((_, i) => i % 4 === 1).map((c) => parseGoal(league, c.name) as Goal)
    ];
    for (const g of goals) {
      const phrased = candidates(league, g);
      const r = searchChanges(league, strip(g), undefined, 2000, 400);
      const v = takesView(league, r, phrased);
      const text = [v.goalLine, v.head, v.sub, ...v.rows.map((x) => x.short)].join(' ');
      expect(clean(text), text).toBe(true);
      const verdict = verify(text, v.facts);
      expect(verdict.issues, `${g.club} ${g.race}: ${text}`).toEqual([]);
    }
  }, 60000);
});

describe('Scout', () => {
  const timelines = Object.fromEntries(league.feeds.map((f) => [f.fixtureId, computeTimeline(league, f)]));
  const ghostsBy = Object.fromEntries(league.feeds.map((f) => [f.fixtureId, f.stoppedAttacks.map((a) => computeGhost(a))]));
  const ripples: Record<string, RippleResult> = Object.fromEntries(league.feeds.map((f) => [f.fixtureId, ripple(league, finalOf(f), 2000, f.fixtureId)]));
  const base = { league, threshold: 10, alerts: { swing: true, ghost: true, ripple: true, others: true }, timelines, ghostsBy, minuteOf: () => 94, ripples };

  it('writes every alert in every language and voice so the Verifier passes it', () => {
    let count = 0;
    for (const followed of [['NBR', 'WYV'], ['HAR'], [league.feeds[3].home]]) {
      for (const { id: lang } of LANGS) {
        for (const fan of [true, false]) {
          const alerts = scoutAlerts({ ...base, followed, lang, fan });
          expect(alerts.length).toBeGreaterThan(0);
          expect(alerts.filter((a) => a.pick)).toHaveLength(1);
          for (const a of alerts) {
            expect(clean(a.text), a.text).toBe(true);
            expect(a.verdict.issues, `${lang} ${a.key}: ${a.text}`).toEqual([]);
            count++;
          }
        }
      }
    }
    expect(count).toBeGreaterThan(150);
  });

  it('folds quick swings together and shows the path in between', () => {
    const alerts = scoutAlerts({ ...base, followed: ['NBR'], lang: 'en', fan: true });
    const merged = alerts.filter((a) => a.text.startsWith('Two swings'));
    expect(merged.length).toBeGreaterThan(0);
    for (const m of merged) expect(m.text).toMatch(/\d+% → \d+% → \d+%/);
  });

  it('follows results elsewhere only when that switch is on, and respects the threshold', () => {
    const on = scoutAlerts({ ...base, followed: ['NBR'], lang: 'en', fan: true });
    const off = scoutAlerts({ ...base, followed: ['NBR'], lang: 'en', fan: true, alerts: { ...base.alerts, others: false } });
    expect(off.some((a) => a.type === 'ELSEWHERE')).toBe(false);
    expect(on.filter((a) => a.type !== 'ELSEWHERE').length).toBe(off.length);
    const strict = scoutAlerts({ ...base, followed: ['NBR'], lang: 'en', fan: true, threshold: 40 });
    expect(strict.filter((a) => a.type === 'SWING').length).toBeLessThanOrEqual(off.filter((a) => a.type === 'SWING').length);
  });
});

describe('Match recap', () => {
  it('writes a recap for every match and every way of watching that the Verifier passes', async () => {
    const { matchRecap } = await import('../recap');
    const { deserveExperiment } = await import('../../engine/settle');
    for (const f of league.feeds) {
      const tl = computeTimeline(league, f);
      const rp = ripple(league, finalOf(f), 1500, f.fixtureId);
      const d = deserveExperiment(league, undefined, 3000, f);
      for (const persona of ['casual', 'home', 'away', 'analyst'] as const) {
        const r = matchRecap(league, f, tl, rp, d, persona);
        expect(r.paragraphs.length, f.fixtureId).toBeGreaterThanOrEqual(3);
        expect(clean(r.text), r.text).toBe(true);
        expect(r.verdict.issues, `${f.fixtureId} ${persona}: ${r.text}`).toEqual([]);
        if (persona === 'home' || persona === 'away') expect(/\b(we|our|us)\b/i.test(r.text), `${f.fixtureId} ${persona} reads in the first person`).toBe(true);
      }
    }
  }, 60000);
});

describe('Overlay cues', () => {
  it('give every match a time-ordered, verified cue feed a graphics engine can render', async () => {
    const { overlayCues, OVERLAY_SCHEMA } = await import('../overlay');
    for (const f of league.feeds) {
      const tl = computeTimeline(league, f);
      const ghosts = f.stoppedAttacks.map((a) => computeGhost(a));
      for (const persona of ['casual', 'home', 'analyst'] as const) {
        const o = overlayCues(league, f, tl, ghosts, persona, 'en');
        expect(o.schema).toBe(OVERLAY_SCHEMA);
        expect(o.cues.length).toBeGreaterThan(3);
        for (let i = 1; i < o.cues.length; i++) expect(o.cues[i].t).toBeGreaterThanOrEqual(o.cues[i - 1].t);
        for (const c of o.cues) {
          expect(c.clock).toMatch(/^\d{2,3}:\d{2}$/);
          if (c.type === 'lowerThird' || c.type === 'ghostRun') { expect(c.verified, `${f.fixtureId} ${c.id}: ${c.text}`).toBe(true); expect(clean(c.text)).toBe(true); }
        }
        expect(o.cues.filter((c) => c.type === 'lowerThird').length).toBe(tl.moments.length);
        expect(o.cues.filter((c) => c.type === 'score').length).toBe(f.events.filter((e) => e.type === 'goal').length);
      }
    }
  }, 60000);
});

describe('Ask What If router', () => {
  it('sends each kind of question to the team that answers it', async () => {
    const { routeQuestion } = await import('../router');
    const { CANARY } = await import('../../data/denylist');
    expect(routeQuestion(league, 'Was the 55th-minute substitution the reason Northbridge lost?')?.to).toBe('settle');
    expect(routeQuestion(league, 'What if Kit Nettleshaw had missed the season?')?.to).toBe('multiverse');
    expect(routeQuestion(league, 'What would it take for Harbour to stay up?')?.to).toBe('takes');
    expect(routeQuestion(league, 'Who is top scorer?')?.to).toBe('league');
    expect(routeQuestion(league, 'Thistlebury')).toMatchObject({ to: 'squad', club: 'THI' });
    expect(routeQuestion(league, `What if ${CANARY.club} won the league?`)?.to).toBe('multiverse'); // Dr Football explains the limits
    expect(routeQuestion(league, 'tell me something interesting')).toBeNull(); // the live router's job
  });
});
