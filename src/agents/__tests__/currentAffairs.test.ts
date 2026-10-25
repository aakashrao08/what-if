import { describe, expect, it } from 'vitest';
import { league } from '../../data/league';
import { races, squadImpact, standings } from '../../engine/races';
import { playedResults } from '../../engine/league';
import { buildTable } from '../../engine/season';
import { ALL_BOARDS, chance, clubCard, impactLine, leaderboard, playerCard, squadInsights } from '../currentAffairs';
import { playerImpact } from '../../engine/races';

const clean = (s: string) => !/undefined|NaN/.test(s);
const s = standings(league, 4000);
const r = races(league, 4000);

describe('season stats from The Forge', () => {
  it('adds up: goals match the results, assists never outnumber goals, clean sheets match the table', () => {
    const rows = buildTable(league.clubs.map((c) => c.code), playedResults(league));
    for (const c of league.clubs) {
      const squad = league.players.filter((p) => p.club === c.code);
      const row = rows.find((x) => x.code === c.code)!;
      const goals = squad.reduce((a, p) => a + p.goals, 0);
      expect(goals, c.code).toBeLessThanOrEqual(row.gf); // own goals and the odd unassigned goal aside
      expect(goals, c.code).toBeGreaterThanOrEqual(row.gf - 3);
      expect(squad.reduce((a, p) => a + (p.assists ?? 0), 0), c.code).toBeLessThanOrEqual(row.gf);
      const cs = squad.reduce((a, p) => a + (p.cleanSheets ?? 0), 0);
      expect(cs, c.code).toBe(s.clubs.find((x) => x.code === c.code)!.cleanSheets);
      for (const p of squad) expect((p.apps ?? 0) <= row.p && (p.yellow ?? 0) >= 0 && (p.red ?? 0) >= 0, p.id).toBe(true);
    }
  });
});

describe('standings and races', () => {
  it('ranks the table, prices every remaining game, and only says "every run" when it is', () => {
    expect(s.clubs.map((c) => c.pos)).toEqual([...Array(20)].map((_, i) => i + 1));
    for (const c of s.clubs) {
      for (const n of c.next) expect(n.p.home + n.p.draw + n.p.away).toBeCloseTo(1, 6);
      expect(c.form.length).toBe(5);
    }
    expect(chance(1)).toBe('every run');
    expect(chance(0.996)).toBe('over 99%');
    expect(chance(0.004)).toBe('under 1%');
  });

  it('gives someone the top spot in every run, and never projects fewer than a player already has', () => {
    for (const board of ['goals', 'assists'] as const) {
      expect(r[board].reduce((a, x) => a + x.top, 0)).toBeGreaterThanOrEqual(0.999);
      for (const x of r[board]) {
        expect(x.mean).toBeGreaterThanOrEqual(x.now);
        expect(x.lo).toBeGreaterThanOrEqual(x.now);
        expect(x.outright).toBeLessThanOrEqual(x.top);
      }
    }
  });
});

describe('Current Affairs text', () => {
  it('writes a club card for every club that the Verifier passes', () => {
    for (const c of league.clubs) {
      const card = clubCard(league, s, c.code);
      for (const l of [card.headline, card.luck, card.run]) {
        expect(clean(l.text), l.text).toBe(true);
        expect(l.verdict.issues, `${c.code}: ${l.text}`).toEqual([]);
      }
    }
  });

  it('writes squad insights for every club, with and without the key-player test', () => {
    const tested = new Set(['NBR', 'HAR']);
    for (const c of league.clubs) {
      const imp = tested.has(c.code) ? squadImpact(league, c.code, 1000) : null;
      const ins = squadInsights(league, s, imp, c.code);
      expect(ins.length, c.code).toBeGreaterThanOrEqual(3);
      if (imp) expect(ins.some((i) => i.tag === 'KEY MAN')).toBe(true);
      for (const i of ins) {
        expect(clean(i.line.text), i.line.text).toBe(true);
        expect(i.line.verdict.issues, `${c.code} ${i.tag}: ${i.line.text}`).toEqual([]);
      }
    }
  }, 30000);

  it('writes a card for every player in the league that the Verifier passes', () => {
    for (const p of league.players) {
      const card = playerCard(league, r, p.id);
      expect(card.tiles.every((x) => clean(x.value)), p.id).toBe(true);
      if (card.race) expect(card.race.line.top >= 0.01 || card.race.line.top3 >= 0.1, `${p.id} shows a race he isn't in`).toBe(true);
      for (const l of card.lines) {
        expect(clean(l.text), l.text).toBe(true);
        expect(l.verdict.issues, `${p.id}: ${l.text}`).toEqual([]);
      }
    }
  });

  it('writes the "without him" line for players across every role', () => {
    const sample = ['NBR-9', 'NBR-1', 'HAR-4', 'THI-2', 'KET-6', 'SAL-11', 'MOS-3', 'OPU-1'];
    for (const id of sample) {
      const l = impactLine(league, playerImpact(league, id, 600));
      expect(clean(l.text), l.text).toBe(true);
      expect(l.verdict.issues, `${id}: ${l.text}`).toEqual([]);
    }
  }, 30000);

  it('builds every leaderboard, ties sharing a rank', () => {
    for (const b of ALL_BOARDS) {
      const rows = leaderboard(league, b.id);
      expect(rows.length, b.id).toBeGreaterThan(0);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].v).toBeLessThanOrEqual(rows[i - 1].v);
        if (rows[i].v === rows[i - 1].v) expect(rows[i].rank).toBe(rows[i - 1].rank);
      }
    }
  });
});
