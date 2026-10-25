import { describe, expect, it } from 'vitest';
import { league } from '../../data/league';
import { computeGhost, computeTimeline } from '../../engine/demo';
import { demoFinal, finalOf, ripple } from '../../engine/league';
import { ghostCard, multiverse, reel, settleIt, swingCard } from '../pipeline';
import { factsFromText, verify } from '../verifier';
import { CANARY } from '../../data/denylist';
import { drFootball, examples } from '../drFootball';
import { designExperiment, STUDIO_PRESETS } from '../dataScientist';
import { rippleStories } from '../narrator';
import { LANGS, type Persona } from '../format';

const PERSONAS: Persona[] = ['casual', 'home', 'away', 'analyst'];
const timelines = new Map(league.feeds.map((f) => [f.fixtureId, computeTimeline(league, f)]));

describe('Verifier', () => {
  it('passes numbers that come from the facts and flags ones that do not', () => {
    expect(verify('Win chance 71% → 48%.', { a: 71, b: 48 }).ok).toBe(true);
    const bad = verify('Win chance 71% → 47%.', { a: 71, b: 48 });
    expect(bad.ok).toBe(false);
    expect(bad.issues[0].detail).toContain('47');
  });
  it('catches unsupported superlatives but allows them negated', () => {
    expect(verify('He is the best penalty stopper in the league.', { clearlyBest: false }).ok).toBe(false);
    expect(verify('Six is far too few to call him the best.', { clearlyBest: false }).ok).toBe(true);
  });
  it('reads decimal commas in Spanish and Portuguese', () => {
    expect(verify('xG 0,78', { xg: 0.78 }, 'es').ok).toBe(true);
    expect(verify('10,000 seasons', { n: 10000 }).ok).toBe(true);
    expect(verify('1.82 xG a 1,1', { a: 1.82, b: 1.1 }, 'es').ok).toBe(true); // a decimal point in Spanish text is still a decimal
    expect(verify('10.000 temporadas', { n: 10000 }, 'es').ok).toBe(true);
    expect(verify('1.83 xG', { a: 1.82 }, 'es').ok).toBe(false);
    expect(verify('10 000 temporadas simuladas', { n: 10000 }, 'es').ok).toBe(true);
    expect(verify('Ganan 2 de 3', { a: 2, b: 3 }).ok).toBe(true); // ordinary small numbers aren't glued together
  });
});

describe('every template the Narrator can produce passes the Verifier', () => {
  it('The Swing: every match, moment, persona, language and point of view', () => {
    let count = 0;
    for (const feed of league.feeds) {
      const tl = timelines.get(feed.fixtureId)!;
      for (const mr of tl.moments) for (const p of PERSONAS) for (const l of LANGS) for (const pov of ['home', 'away'] as const) {
        const c = swingCard(league, feed, tl, mr, p, l.id, pov);
        expect(c.verdict.issues, `${mr.id} ${p} ${l.id} ${pov}: ${c.text} | ${c.whatIf}`).toEqual([]);
        expect(`${c.text} ${c.whatIf}`).not.toMatch(/undefined|NaN/);
        count++;
      }
    }
    expect(count).toBeGreaterThan(1000);
  });
  it('Ghost Run and the reel, every match', () => {
    for (const feed of league.feeds) {
      const tl = timelines.get(feed.fixtureId)!;
      const ghosts = feed.stoppedAttacks.map((a) => computeGhost(a));
      for (const p of PERSONAS) {
        feed.stoppedAttacks.forEach((a, i) => {
          const c = ghostCard(league, a, ghosts[i], p);
          expect(c.verdict.issues, c.text).toEqual([]);
          expect(c.text).not.toMatch(/undefined|NaN/);
        });
        for (const r of reel(league, feed, tl, ghosts, p)) {
          expect(r.verdict.issues, `${feed.fixtureId} ${p}: ${r.text} | ${r.whatIf}`).toEqual([]);
          expect(r.text).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });
  it('Ripple stories for several matches', () => {
    for (const feed of league.feeds.slice(0, 4)) {
      const r = ripple(league, finalOf(feed), 1500, feed.fixtureId);
      for (const p of PERSONAS) for (const s of rippleStories(league, r, p, feed)) {
        expect(verify(`${s.stat} ${s.body}`, s.facts).issues, s.body).toEqual([]);
        expect(s.body).not.toMatch(/undefined|NaN/);
      }
    }
    const r = ripple(league, demoFinal(league), 1500);
    expect(rippleStories(league, r, 'casual').length).toBeGreaterThanOrEqual(3);
  });
});

describe('Settle It', () => {
  it('designs a test for every studio preset', () => {
    for (const p of STUDIO_PRESETS) expect(designExperiment(league, p.text), p.text).not.toBeNull();
  });
  it('answers every preset with numbers the Verifier accepts', async () => {
    const tl = timelines.get(league.demo.fixtureId)!;
    for (const p of STUDIO_PRESETS) {
      const res = await settleIt(league, tl, p.text, () => {});
      expect(res.ok, p.text).toBe(true);
      if (!res.ok) continue;
      expect(res.drafts, `${p.text}: ${res.flags.join('; ')}`).toBeLessThanOrEqual(2);
      expect(`${res.view.line} ${res.view.script} ${res.view.analyst}`).not.toMatch(/undefined|NaN/);
    }
  }, 60000);
  it('sends the superlative draft back and passes the rewrite', async () => {
    const res = await settleIt(league, timelines.get(league.demo.fixtureId)!, 'Is Tallowby the best penalty stopper in the league?', () => {});
    expect(res.ok && res.drafts).toBe(2);
  }, 20000);
});

describe('Dr Football', () => {
  it('reads every example scenario', () => {
    for (const e of examples(league)) {
      const p = drFootball(league, e.text);
      expect(p.ok, `${e.text}: ${!p.ok ? p.reply : ''}`).toBe(true);
      if (p.ok) expect(p.kind).toBe(e.kind);
    }
  });
  it('refuses the impossible and the real world', () => {
    expect(drFootball(league, 'What if Northbridge played with 12 players?').ok).toBe(false);
    expect(drFootball(league, `What if ${CANARY.club} had signed Nettleshaw?`).ok).toBe(false);
    expect(drFootball(league, 'What if Zebedee Smithers had joined Northbridge?').ok).toBe(false);
    expect(drFootball(league, 'What if Harbour had been docked 60 points?').ok).toBe(false);
  });
  it('plays every example universe out and writes three checked versions', async () => {
    for (const e of examples(league)) {
      const res = await multiverse(league, e.text, () => {});
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.verdict.issues, `${e.text}: ${JSON.stringify(res.view.story)}`).toEqual([]);
        expect(JSON.stringify(res.view.story)).not.toMatch(/undefined|NaN/);
      }
    }
  }, 120000);
});

describe('interface dictionary', () => {
  it('has every language for every row, and keeps numbers and placeholders intact', async () => {
    const { DICT } = await import('../../i18n/dict');
    const en = [...DICT.en.keys()];
    for (const lang of ['zh', 'ms', 'ta', 'hi', 'es', 'pt'] as const) {
      for (const k of en) {
        const tr = DICT[lang].get(k);
        expect(tr, `${lang}: ${k}`).toBeTruthy();
        expect(tr!.match(/\{\w+\}/g) ?? [], `${lang}: ${k}`).toEqual(k.match(/\{\w+\}/g) ?? []);
        expect(verify(tr!, factsFromText(k), lang).ok, `${lang}: ${k}`).toBe(true);
      }
    }
  });
});

describe('saved settings', () => {
  it('survive stale or malformed data instead of breaking a screen', async () => {
    const { sanitize } = await import('../../state/prefs');
    for (const junk of [null, 42, 'x', [], { club: 7, players: 'NBR-9', alerts: null, profile: [], universes: {} }]) {
      const p = sanitize(junk);
      expect(p.club).toBe('NBR');
      expect(Array.isArray(p.players) && Array.isArray(p.universes)).toBe(true);
    }
    const p = sanitize({ club: 'GONE', also: ['WYV', 'NOPE', 'WYV'], players: ['NBR-9', 'XXX-1'], focus: 'XXX-1', lang: 'fr', watchAs: 'boss', threshold: 99, profile: { name: 'A'.repeat(500), avatar: 'red;background:url(x)' } });
    expect(p.club).toBe('NBR');
    expect(p.also).toEqual(['WYV']);
    expect(p.players).toEqual(['NBR-9']);
    expect(p.focus).toBe('NBR-9');
    expect(p.lang).toBe('en');
    expect(p.watchAs).toBeNull();
    expect(p.threshold).toBe(15);
    expect(p.profile.name.length).toBeLessThanOrEqual(60);
    expect(p.profile.avatar).toMatch(/^#[0-9A-F]{6}$/i);
    const kept = sanitize({ club: 'HAR', lang: 'ta', depth: 'analyst', threshold: 10, alerts: { swing: false } });
    expect([kept.club, kept.lang, kept.depth, kept.threshold, kept.alerts.swing, kept.alerts.ghost]).toEqual(['HAR', 'ta', 'analyst', 10, false, true]);
  });
});
