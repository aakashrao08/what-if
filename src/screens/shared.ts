import type { DemoMatch, Fixture, KeyMoment, PitchFrame, Side } from '../data/types';
import { league, club } from '../data/league';
import type { MomentResult, Timeline, WP } from '../engine/demo';
import { hashSeed, mulberry32 } from '../engine/rng';
import { FULL_TIME } from '../engine/match';

export const kmIn = (feed: DemoMatch, id: string): KeyMoment => feed.keyMoments.find((k) => k.id === id)!;
/** flagship-match shortcut */
export const km = (id: string): KeyMoment => league.feeds.flatMap((f) => f.keyMoments).find((k) => k.id === id)!;

export function band(feed: DemoMatch, mr: MomentResult): { text: string; color: string; kind: string; short: string } {
  const k = kmIn(feed, mr.id);
  const e = feed.events.find((x) => x.id === k.eventId)!;
  const lbl = k.label;
  const name = (s: Side) => club(s === 'home' ? feed.home : feed.away).name.toUpperCase();
  const opp: Side = e.team === 'home' ? 'away' : 'home';
  if (e.type === 'goal') return { text: `Goal · ${lbl}`, color: e.team === 'home' ? '#F2EFE6' : '#7CB8FF', kind: `GOAL · ${name(e.team!)}`, short: `${lbl} Goal` };
  const what: Record<string, [string, string]> = {
    clearance_off_line: ['OFF THE LINE', 'Off the line'], double_save: ['DOUBLE SAVE', 'Double save'], big_save: ['BIG SAVE', 'Big save'],
    big_miss: ['BIG CHANCE MISSED', 'Big miss'], penalty_saved: ['PENALTY SAVED', 'Pen saved']
  };
  const [kind, short] = what[k.kind] ?? ['CHANCE', 'Chance'];
  const actor = k.kind === 'big_miss' ? name(e.team!) : name(opp);
  if (mr.quiet) return { text: `Quiet turning point · ${lbl}`, color: '#CFF05A', kind: `${kind} · ${actor}`, short: `${lbl} ${short}` };
  return { text: `Swing · ${lbl}`, color: '#FF8A4C', kind: `${kind} · ${actor}`, short: `${lbl} ${short}` };
}

/** The win probability on screen at a moment of the replay (event "after" values win ties). */
export function wpAt(tl: Timeline, minute: number): WP {
  let wp = tl.points[0].wp;
  for (const p of tl.points) { if (p.minute <= minute) wp = p.wp; else break; }
  return minute >= FULL_TIME ? tl.byMinute[FULL_TIME] : wp;
}

export const win = (wp: WP, side: Side) => Math.round(side === 'home' ? wp.home : wp.away);

const NBR_BASE: [number, number][] = [[6, 34], [28, 10], [26, 26], [26, 42], [28, 58], [46, 20], [43, 34], [46, 48], [66, 12], [70, 34], [66, 56]];
const HAR_BASE: [number, number][] = [[99, 34], [82, 10], [84, 26], [84, 42], [82, 58], [66, 12], [64, 28], [64, 40], [66, 56], [48, 26], [48, 42]];
export const KICKOFF_FRAME: PitchFrame = {
  dots: [...NBR_BASE.map(([x, y]) => ({ x: x - 8, y, team: 'home' as const })), ...HAR_BASE.map(([x, y]) => ({ x: x + 4, y, team: 'away' as const }))],
  ball: { x: 52.5, y: 34 }, paths: [], tags: [], label: 'Pitch at kick-off. No turning points yet.'
};

/** Goal times for matchweek games without a feed (the 17:30 game), spread deterministically. */
export function scoreAtMinute(f: Fixture, minute: number): { h: number; a: number } {
  if (f.hg === undefined) return { h: 0, a: 0 };
  const rng = mulberry32(hashSeed('goaltimes', f.id));
  const times = (n: number) => Array.from({ length: n }, () => 2 + rng() * 90);
  const h = times(f.hg).filter((t) => t <= minute).length;
  const a = times(f.ag!).filter((t) => t <= minute).length;
  return { h, a };
}

export const matchweek = () => league.fixtures.filter((f) => f.mw === league.currentMw);
export const shortName = (code: string) => club(code).short;
export const pct = (x: number) => Math.round(x * 100);
