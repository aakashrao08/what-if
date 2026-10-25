// "Ask What If": one question box, routed to the agent team that can answer it. The rulebook here
// handles the common phrasings; in live mode a router agent on Foundry handles the rest and its choice
// is checked against the same destinations. The destination screen then runs its own agents, so the
// hand-off is visible: router -> Data Scientist / Dr Football -> Narrator -> Verifier.

import type { League } from '../data/types';
import { designExperiment } from './dataScientist';
import { drFootball } from './drFootball';
import { parseGoal } from './takes';
import { denyMatch } from '../data/denylist';

export type Destination = 'settle' | 'multiverse' | 'takes' | 'league' | 'squad';
export interface Route { to: Destination; q?: string; club?: string; why: string }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const DESTINATION: Record<Destination, { label: string; path: (r: Route) => string }> = {
  settle: { label: 'Settle It', path: (r) => `/settle?q=${encodeURIComponent(r.q ?? '')}&from=ask` },
  multiverse: { label: 'Multiverse', path: (r) => `/multiverse?q=${encodeURIComponent(r.q ?? '')}&from=ask` },
  takes: { label: 'What would it take?', path: (r) => `/multiverse?mode=takes&q=${encodeURIComponent(r.q ?? '')}&from=ask` },
  league: { label: 'Current Affairs', path: () => '/league?from=ask' },
  squad: { label: 'the squad page', path: (r) => `/league/${r.club}?from=ask` }
};

/** The rulebook's routing. Null when it can't tell, which is when the live router earns its keep. */
export function routeQuestion(league: League, question: string): Route | null {
  const q = norm(question);
  if (q.length < 4) return null;
  if (denyMatch(question)) return { to: 'multiverse', q: question, why: 'It names real-world football, so Dr Football will explain what the simulator can and can’t do.' };
  if (/\bwhat (would|does|will) it take\b|\bwhat do(es)? (\w+ ){1,3}need\b|\bhow (can|could|do) (\w+ ){1,3}(make|reach|get|finish|stay|win)\b/.test(q)) {
    const g = parseGoal(league, question);
    if (!('error' in g)) return { to: 'takes', q: question, why: 'A goal to reach: Dr Football searches every change the simulator can make.' };
  }
  if (/^what if\b/.test(q) && drFootball(league, question).ok) return { to: 'multiverse', q: question, why: 'A change to the season: Dr Football plays it out 10,000 times.' };
  if (designExperiment(league, question)) return { to: 'settle', q: question, why: 'A question about the match: the Data Scientist designs a test for it.' };
  if (/\b(table|standings|league position|top scorer|top of the league|who('s| is) (top|first|bottom)|relegat\w* (battle|zone)|golden|title race|leaderboard)\b/.test(q)) return { to: 'league', why: 'The league as it stands: table, races and leaderboards.' };
  const club = league.clubs.find((c) => [c.name, c.short, c.nickname].some((n) => n.length > 3 && q.includes(norm(n))));
  if (club && q.split(' ').length <= 6) return { to: 'squad', club: club.code, why: `${club.short}: their squad, chances and what stands out.` };
  if (/^what if\b/.test(q)) return { to: 'multiverse', q: question, why: 'A what-if: Dr Football will read it.' };
  return null;
}

export const ASK_EXAMPLES = [
  'Did Northbridge deserve to win?',
  'What if Kit Nettleshaw had missed the season?',
  'What would it take for Harbour to stay up?',
  'Who is top scorer?'
];
