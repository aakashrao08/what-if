// The match cards: The Swing, Ghost Run and the Impact Reel. Pure functions over the engine's
// results, shared by the screens, the overlay cues and the agent backend (no browser-only code here).

import type { DemoMatch, League, StoppedAttack } from '../data/types';
import type { GhostResult, MomentResult, Timeline } from '../engine/demo';
import { forSide, ghostFacts, momentFacts, type MomentFacts } from './analyst';
import { GHOST, ghostTiles, ghostVoice, punditCheck, verdictOf, type Tile } from './templates/ghost';
import { swingText, whatIfText } from './templates/swing';
import { familyText, familyWhatIf } from './templates/family';
import { REEL, REEL_WHAT_IF } from './templates/ripple';
import { verify, type Verdict } from './verifier';
import type { Lang, Persona } from './format';

// ---------------- The Swing ----------------

export interface SwingCard { text: string; whatIf: string; facts: MomentFacts; verdict: Verdict; lang: Lang }

export function swingCard(league: League, feed: DemoMatch, tl: Timeline, mr: MomentResult, persona: Persona, lang: Lang, pov: 'home' | 'away'): SwingCard {
  const km = feed.keyMoments.find((k) => k.id === mr.id)!;
  const f = momentFacts(league, feed, tl, km, mr);
  const scripted = feed.source === 'scripted';
  const t = swingText(scripted, km.kind, persona, lang, f, pov);
  const whatIf = whatIfText(scripted, km.kind, pov, lang, f);
  const facts = { ...f, ...forSide(f, pov), ...Object.fromEntries(Object.entries(forSide(f, f.side === 'home' ? 'away' : 'home')).filter(([k]) => /^m[BAC]$/.test(k)).map(([k, v]) => [`x${k}`, v])) };
  return { text: t.text, whatIf, facts: f, verdict: verify(`${t.text} ${whatIf}`, facts, t.lang), lang: t.lang };
}

// ---------------- Ghost Run ----------------

export interface GhostCard { text: string; tiles: Tile[]; check: string; verdictLabel: string; verdict: Verdict }

export function ghostCard(league: League, a: StoppedAttack, g: GhostResult, persona: Persona): GhostCard {
  const f = ghostFacts(league, a, g);
  const text = GHOST[a.stop][ghostVoice(persona, a.team)](f);
  const check = punditCheck(a, f, g.claimHolds);
  return { text, tiles: ghostTiles(a, f, g.stopLabel), check, verdictLabel: verdictOf(g.goalPct), verdict: verify(`${text} ${check}`, f) };
}

// ---------------- Ripple reel ----------------

export interface ReelItem { mr: MomentResult; rank: number; title: string; text: string; whatIf: string; facts: MomentFacts; verdict: Verdict }

export function reel(league: League, feed: DemoMatch, tl: Timeline, ghosts: GhostResult[], persona: Persona): ReelItem[] {
  const sorted = [...tl.moments].sort((a, b) => b.impact - a.impact);
  return sorted.map((mr, i) => {
    const km = feed.keyMoments.find((k) => k.id === mr.id)!;
    const ghostPct = km.ghostId ? ghosts.find((g) => g.id === km.ghostId)?.goalPct : undefined;
    const base = momentFacts(league, feed, tl, km, mr);
    const f = { ...base, rank: i + 1, ghostPct };
    const scripted = feed.source === 'scripted' && REEL[km.kind];
    let text: string, whatIf: string;
    if (scripted) {
      text = REEL[km.kind]![persona](f);
      whatIf = REEL_WHAT_IF[km.kind]!(f);
    } else {
      const side = persona === 'away' ? 'away' : persona === 'home' ? 'home' : base.side;
      const sf = { ...forSide(base, side), kind: km.kind };
      text = familyText(sf, persona === 'casual' ? 'casual' : persona === 'analyst' ? 'analyst' : sf.mine ? 'for' : 'against', 'en');
      whatIf = familyWhatIf({ ...forSide(base, base.focus), kind: km.kind }, 'en');
    }
    const vf = { ...f, ...forSide(base, 'home'), hx: 0, ...Object.fromEntries(Object.entries(forSide(base, 'away')).filter(([k]) => /^m[BAC]$/.test(k)).map(([k, v]) => [`y${k}`, v])) };
    return { mr, rank: i + 1, title: km.title, text, whatIf, facts: f, verdict: verify(`${text} ${whatIf}`, vf) };
  });
}
