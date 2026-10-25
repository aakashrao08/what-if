// My Dugout settings, shared by every screen and kept in this browser.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang, Persona } from '../agents/format';
import type { ScenarioKind } from '../agents/drFootball';

export type Depth = 'casual' | 'fan' | 'analyst';

export interface SavedUniverse { id: string; prompt: string; kind: ScenarioKind; title: string; stat: string; date: string }

export interface Prefs {
  club: string;
  also: string[];
  players: string[]; // player ids
  focus: string | null;
  depth: Depth;
  lang: Lang;
  watchAs: Persona | null; // set from The Swing's "Watch as"; null = follow depth and club
  alerts: { swing: boolean; ghost: boolean; ripple: boolean; others: boolean };
  threshold: number;
  profile: { name: string; username: string; email: string; avatar: string };
  universes: SavedUniverse[];
}

const DEFAULTS: Prefs = {
  club: 'NBR',
  also: ['WYV'],
  players: ['NBR-9', 'NBR-5'],
  focus: 'NBR-9',
  depth: 'fan',
  lang: 'en',
  watchAs: null,
  alerts: { swing: true, ghost: true, ripple: true, others: false },
  threshold: 15,
  profile: { name: 'Jordan Lim', username: 'jordanlim', email: 'jordan.lim@example.com', avatar: '#CFF05A' },
  universes: [
    { id: 'u-kit', prompt: 'What if Kit Nettleshaw had never joined Northbridge?', kind: 'TRANSFER', title: 'Nettleshaw never joins Northbridge', stat: '', date: '4 Oct' },
    { id: 'u-vance', prompt: 'What if Ines Vance had taken over Northbridge in August?', kind: 'MANAGER', title: 'Vance takes over Northbridge in August', stat: '', date: '12 Oct' },
    { id: 'u-pen', prompt: 'What if Bobbinford’s penalty against Harbour had gone in?', kind: 'MOMENT', title: 'Bobbinford’s penalty goes in', stat: '', date: '18 Oct' }
  ]
};

const KEY = 'whatif.prefs.v1';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

interface Ctx { prefs: Prefs; set: (patch: Partial<Prefs>) => void; persona: Persona; personaIn: (match: { home: string; away: string }) => Persona }
const PrefsContext = createContext<Ctx | null>(null);

/** The voice the agents write in, from Dugout settings unless the viewer picked one. */
export function personaFor(p: Prefs, match: { home: string; away: string } = { home: 'NBR', away: 'HAR' }): Persona {
  if (p.watchAs) return p.watchAs;
  if (p.depth === 'casual') return 'casual';
  if (p.depth === 'analyst') return 'analyst';
  if (p.club === match.home) return 'home';
  if (p.club === match.away) return 'away';
  if (p.also.includes(match.home)) return 'home';
  if (p.also.includes(match.away)) return 'away';
  return 'casual';
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode: settings last for this visit */ }
  }, [prefs]);
  const value = useMemo<Ctx>(() => ({ prefs, set: (patch) => setPrefs((p) => ({ ...p, ...patch })), persona: personaFor(prefs), personaIn: (m) => personaFor(prefs, m) }), [prefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}

export const PERSONA_LABELS: Record<Persona, string> = { casual: 'Casual', home: 'Northbridge fan', away: 'Harbour fan', analyst: 'Analyst' };

/** "Watch as" labels for a given match: Casual, <home> fan, <away> fan, Analyst. */
export function personaLabels(homeShort: string, awayShort: string): Record<Persona, string> {
  return { casual: 'Casual', home: `${homeShort} fan`, away: `${awayShort} fan`, analyst: 'Analyst' };
}
