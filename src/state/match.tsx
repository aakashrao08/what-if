// The live matchweek: engine output for every match with a feed, plus one replay clock that feeds
// events in as they "happen". 12:30 games are already over; 15:00 games run on the clock.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { league } from '../data/league';
import type { DemoMatch } from '../data/types';
import { cached } from '../engine/client';
import type { GhostResult, Timeline } from '../engine/demo';
import { FULL_TIME } from '../engine/match';

export const SPEEDS = [1, 4, 16] as const;
export type Speed = (typeof SPEEDS)[number];
const SECONDS_PER_MINUTE = 2; // at 1x, one match minute every two seconds

interface Clock { minute: number; playing: boolean; speed: Speed }
interface Ctx {
  clock: Clock;
  play: () => void;
  pause: () => void;
  setSpeed: (s: Speed) => void;
  seek: (minute: number) => void;
  fixtureId: string;
  setFixture: (id: string) => void;
  feed: DemoMatch; // the selected match
  timeline: Timeline | null; // for the selected match
  ghosts: GhostResult[] | null;
  minute: number; // where the selected match is
  live: boolean;
  demoTimeline: Timeline | null; // the flagship match, used by Home, Settle It and My Dugout
  timelines: Record<string, Timeline>;
  ghostsBy: Record<string, GhostResult[]>;
  load: (fixtureId: string) => void;
  minuteOf: (feed: DemoMatch) => number;
}

const MatchContext = createContext<Ctx | null>(null);
export const feedById = (id: string) => league.feeds.find((f) => f.fixtureId === id) ?? league.demo;

export function MatchProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState<Clock>({ minute: league.demo.liveMinute, playing: false, speed: 1 });
  const [fixtureId, setFixtureId] = useState(league.demo.fixtureId);
  const [timelines, setTimelines] = useState<Record<string, Timeline>>({});
  const [ghostsBy, setGhostsBy] = useState<Record<string, GhostResult[]>>({});
  const last = useRef<number | null>(null);
  const requested = useRef(new Set<string>());

  const load = useCallback((id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    cached('timeline', { fixtureId: id }).then((t) => setTimelines((m) => ({ ...m, [id]: t })));
    cached('ghosts', { fixtureId: id }).then((g) => setGhostsBy((m) => ({ ...m, [id]: g })));
  }, []);

  useEffect(() => { load(league.demo.fixtureId); }, [load]);
  useEffect(() => { load(fixtureId); }, [fixtureId, load]);

  useEffect(() => {
    if (!clock.playing) { last.current = null; return; }
    let raf = 0;
    const tick = (ts: number) => {
      if (last.current !== null) {
        const dt = (ts - last.current) / 1000;
        setClock((c) => {
          const minute = Math.min(FULL_TIME, c.minute + (dt / SECONDS_PER_MINUTE) * c.speed);
          return { ...c, minute, playing: minute < FULL_TIME };
        });
      }
      last.current = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock.playing]);

  const value = useMemo<Ctx>(() => {
    const feed = feedById(fixtureId);
    const minuteOf = (f: DemoMatch) => (f.kickoff < '15:00' ? FULL_TIME : clock.minute);
    const minute = minuteOf(feed);
    return {
      clock,
      play: () => setClock((c) => ({ ...c, playing: true, minute: c.minute >= FULL_TIME ? 0 : c.minute })),
      pause: () => setClock((c) => ({ ...c, playing: false })),
      setSpeed: (speed) => setClock((c) => ({ ...c, speed })),
      seek: (m) => setClock((c) => ({ ...c, minute: Math.max(0, Math.min(FULL_TIME, m)) })),
      fixtureId, setFixture: setFixtureId, feed,
      timeline: timelines[fixtureId] ?? null, ghosts: ghostsBy[fixtureId] ?? null,
      minute, live: minute < FULL_TIME,
      demoTimeline: timelines[league.demo.fixtureId] ?? null,
      timelines, ghostsBy, load, minuteOf
    };
  }, [clock, fixtureId, timelines, ghostsBy, load]);

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): Ctx {
  const c = useContext(MatchContext);
  if (!c) throw new Error('useMatch outside MatchProvider');
  return c;
}

export function minuteLabel(m: number): string {
  if (m >= FULL_TIME) return 'FT';
  if (m >= 45 && m < 46) return 'HT';
  if (m > 90) return `90+${Math.floor(m - 90)}'`;
  return `${Math.floor(m)}'`;
}
