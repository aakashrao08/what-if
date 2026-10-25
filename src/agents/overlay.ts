// Overlay cues: the match intelligence as a timed, machine-readable feed a broadcast graphics engine
// can render over the live picture. Score updates, a win-probability graphic at every event, a lower
// third for each turning point and a panel for each Ghost Run, each with its match time, how long to
// hold it, and the Verifier's result for any text. Same facts and templates as the screens, so the
// on-air graphic and the app always agree.

import type { DemoMatch, League } from '../data/types';
import type { GhostResult, Timeline } from '../engine/demo';
import type { Lang, Persona } from './format';
import { ghostCard, swingCard } from './cards';

export const OVERLAY_SCHEMA = 'whatif.overlay/1';

interface CueBase {
  id: string;
  t: number; // match minute (decimal; stoppage time runs past 45 and 90)
  clock: string; // "61:00", what a broadcast clock shows
  hold: number; // seconds to keep it on screen; 0 = until replaced
  priority: 1 | 2 | 3; // 1 interrupts, 3 can wait for a gap
}
export type Cue =
  | (CueBase & { type: 'score'; home: number; away: number; scorer: string })
  | (CueBase & { type: 'winprob'; home: number; draw: number; away: number; event: string })
  | (CueBase & { type: 'lowerThird'; headline: string; text: string; stat: string; side: 'home' | 'away'; verified: boolean; numbersChecked: number })
  | (CueBase & { type: 'ghostRun'; headline: string; text: string; goalPct: number; verdict: string; verified: boolean; numbersChecked: number });

export interface OverlayFeed {
  schema: typeof OVERLAY_SCHEMA;
  fixture: { id: string; home: string; away: string; kickoff: string; ground: string };
  audience: { persona: Persona; lang: Lang };
  cues: Cue[];
}

const clock = (m: number) => `${String(Math.floor(m)).padStart(2, '0')}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;

export function overlayCues(league: League, feed: DemoMatch, tl: Timeline, ghosts: GhostResult[], persona: Persona = 'casual', lang: Lang = 'en'): OverlayFeed {
  const short = (code: string) => league.clubs.find((c) => c.code === code)!.short;
  const cues: Cue[] = [];
  let h = 0, a = 0;
  for (const e of feed.events) {
    if (e.type !== 'goal') continue;
    if (e.team === 'home') h++; else a++;
    const p = league.players.find((x) => x.id === e.player);
    cues.push({ id: `score-${e.id}`, type: 'score', t: e.minute, clock: clock(e.minute), hold: 0, priority: 1, home: h, away: a, scorer: p?.name ?? '' });
  }
  for (const ev of tl.events) {
    const e = feed.events.find((x) => x.id === ev.id)!;
    if (Math.abs(ev.after.home - ev.before.home) < 3 && Math.abs(ev.after.away - ev.before.away) < 3) continue; // only when the graphic would visibly move
    cues.push({ id: `wp-${ev.id}`, type: 'winprob', t: ev.minute, clock: clock(ev.minute), hold: 0, priority: 2, home: Math.round(ev.after.home), draw: Math.round(ev.after.draw), away: Math.round(ev.after.away), event: e.text });
  }
  const pov: 'home' | 'away' = persona === 'away' ? 'away' : 'home';
  for (const mr of tl.moments) {
    const km = feed.keyMoments.find((k) => k.id === mr.id)!;
    const card = swingCard(league, feed, tl, mr, persona, lang, pov);
    const side = mr.focus;
    const code = side === 'home' ? feed.home : feed.away;
    const b = Math.round(side === 'home' ? mr.before.home : mr.before.away), af = Math.round(side === 'home' ? mr.after.home : mr.after.away);
    cues.push({
      id: `lt-${mr.id}`, type: 'lowerThird', t: mr.minute + 0.25, clock: clock(mr.minute + 0.25), hold: 8, priority: Math.abs(mr.swing) >= 25 ? 1 : 2,
      headline: km.title, text: card.text, stat: `${short(code).toUpperCase()} WIN ${b}% → ${af}%`, side, verified: card.verdict.ok, numbersChecked: card.verdict.checked
    });
  }
  for (const g of ghosts) {
    const att = feed.stoppedAttacks.find((x) => x.id === g.id);
    if (!att || g.goalPct < 15) continue;
    const card = ghostCard(league, att, g, persona);
    cues.push({
      id: `gr-${g.id}`, type: 'ghostRun', t: att.minute + 0.5, clock: clock(att.minute + 0.5), hold: 10, priority: 3,
      headline: att.title, text: card.text, goalPct: g.goalPct, verdict: card.verdictLabel, verified: card.verdict.ok, numbersChecked: card.verdict.checked
    });
  }
  cues.sort((x, y) => x.t - y.t || x.priority - y.priority);
  return {
    schema: OVERLAY_SCHEMA,
    fixture: { id: feed.fixtureId, home: short(feed.home), away: short(feed.away), kickoff: feed.kickoff, ground: feed.ground },
    audience: { persona, lang },
    cues
  };
}
