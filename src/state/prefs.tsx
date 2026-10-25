// My Dugout settings, shared by every screen and kept in this browser.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGS, type Lang, type Persona } from '../agents/format';
import { league } from '../data/league';
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

/** Saved settings are only trusted field by field: anything stale or malformed (a club or player that
 *  no longer exists, an unknown language, a wrong type) falls back to its default instead of breaking a screen. */
export function sanitize(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clubs = new Set(league.clubs.map((c) => c.code));
  const players = new Set(league.players.map((p) => p.id));
  const str = (v: unknown, max: number, d: string) => (typeof v === 'string' && v.length <= max ? v : d);
  const club = typeof r.club === 'string' && clubs.has(r.club) ? r.club : DEFAULTS.club;
  const list = (v: unknown, ok: Set<string>, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.has(x)))].slice(0, max) : null);
  const picked = list(r.players, players, 12) ?? DEFAULTS.players;
  const a = (r.alerts && typeof r.alerts === 'object' ? r.alerts : {}) as Record<string, unknown>;
  const p = (r.profile && typeof r.profile === 'object' ? r.profile : {}) as Record<string, unknown>;
  const universes = Array.isArray(r.universes)
    ? r.universes.filter((u): u is SavedUniverse => !!u && typeof u === 'object' && ['id', 'prompt', 'kind', 'title', 'date'].every((k) => typeof (u as Record<string, unknown>)[k] === 'string')).slice(0, 30)
    : DEFAULTS.universes;
  return {
    club,
    also: (list(r.also, clubs, 6) ?? DEFAULTS.also).filter((c) => c !== club),
    players: picked,
    focus: r.focus === null ? null : typeof r.focus === 'string' && picked.includes(r.focus) ? r.focus : picked.includes(DEFAULTS.focus ?? '') ? DEFAULTS.focus : null,
    depth: (['casual', 'fan', 'analyst'] as const).find((d) => d === r.depth) ?? DEFAULTS.depth,
    lang: LANGS.find((l) => l.id === r.lang)?.id ?? DEFAULTS.lang,
    watchAs: r.watchAs === null ? null : (['casual', 'home', 'away', 'analyst'] as Persona[]).find((x) => x === r.watchAs) ?? null,
    alerts: { swing: typeof a.swing === 'boolean' ? a.swing : DEFAULTS.alerts.swing, ghost: typeof a.ghost === 'boolean' ? a.ghost : DEFAULTS.alerts.ghost, ripple: typeof a.ripple === 'boolean' ? a.ripple : DEFAULTS.alerts.ripple, others: typeof a.others === 'boolean' ? a.others : DEFAULTS.alerts.others },
    threshold: [10, 15, 20].includes(r.threshold as number) ? (r.threshold as number) : DEFAULTS.threshold,
    profile: {
      name: str(p.name, 60, DEFAULTS.profile.name) || DEFAULTS.profile.name,
      username: str(p.username, 60, DEFAULTS.profile.username),
      email: str(p.email, 120, DEFAULTS.profile.email),
      avatar: typeof p.avatar === 'string' && /^#[0-9a-f]{6}$/i.test(p.avatar) ? p.avatar : DEFAULTS.profile.avatar
    },
    universes
  };
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : DEFAULTS;
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
