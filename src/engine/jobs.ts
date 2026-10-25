// Every heavy computation the UI asks for, by name. Runs in a Web Worker (worker.ts) or,
// if workers are unavailable, on the main thread (client.ts).

import { league } from '../data/league';
import { computeGhost, computeTimeline, type GhostResult, type Timeline } from './demo';
import { feedOf, ripple, universe, type Lever, type RippleResult, type Score, type UniverseResult } from './league';
import {
  callExperiment, deserveExperiment, finishingExperiment, keeperExperiment, penaltyExperiment, subExperiment, tacticExperiment,
  valueExperiment, wpaExperiment, type Experiment
} from './settle';
import { shotOutcomes, type ShotOutcomes } from './ghost';
import { momentShapley, type CreditResult } from './credit';
import { searchChanges, type Candidate, type Race, type TakesResult } from './takes';
import { playerImpact, races, squadImpact, standings, type PlayerImpact, type Races, type SquadImpact, type Standings } from './races';
import type { Side } from '../data/types';

export type ExperimentSpec =
  | { kind: 'sub'; minute: number }
  | { kind: 'penalty'; momentId: string }
  | { kind: 'keepers'; keeperId: string }
  | { kind: 'deserve'; fixtureId?: string }
  | { kind: 'wpa'; fixtureId?: string }
  | { kind: 'finishing'; playerId: string }
  | { kind: 'call'; attackId: string }
  | { kind: 'value'; attackId: string }
  | { kind: 'tactic'; minute: number };

export interface JobMap {
  timeline: { args: { fixtureId?: string }; result: Timeline };
  ghosts: { args: { fixtureId?: string }; result: GhostResult[] };
  ripple: { args: Score & { fixtureId?: string }; result: RippleResult };
  universe: { args: { levers: Lever[]; n?: number }; result: UniverseResult };
  experiment: { args: ExperimentSpec; result: Experiment };
  hero: { args: Record<string, never>; result: ShotOutcomes };
  credit: { args: { fixtureId?: string; focus?: Side }; result: CreditResult };
  takes: { args: { club: string; race: Race; candidates: Candidate[] }; result: TakesResult };
  standings: { args: Record<string, never>; result: Standings };
  races: { args: Record<string, never>; result: Races };
  squad: { args: { club: string }; result: SquadImpact };
  impact: { args: { player: string }; result: PlayerImpact };
}

export type JobName = keyof JobMap;

const feed = (id?: string) => (id ? feedOf(league, id) ?? league.demo : league.demo);

export function runJob<J extends JobName>(job: J, args: JobMap[J]['args'], onProgress?: (done: number) => void): JobMap[J]['result'] {
  type R = JobMap[J]['result'];
  switch (job) {
    case 'timeline': return computeTimeline(league, feed((args as JobMap['timeline']['args']).fixtureId)) as R;
    case 'ghosts': return feed((args as JobMap['ghosts']['args']).fixtureId).stoppedAttacks.map((a) => computeGhost(a)) as R;
    case 'ripple': {
      const a = args as JobMap['ripple']['args'];
      return ripple(league, { hg: a.hg, ag: a.ag }, undefined, a.fixtureId ?? league.demo.fixtureId) as R;
    }
    case 'universe': {
      const a = args as JobMap['universe']['args'];
      return universe(league, a.levers, a.n, onProgress) as R;
    }
    case 'experiment': {
      const s = args as ExperimentSpec;
      switch (s.kind) {
        case 'sub': return subExperiment(league, s.minute) as R;
        case 'penalty': return penaltyExperiment(league, s.momentId) as R;
        case 'keepers': return keeperExperiment(league, s.keeperId) as R;
        case 'deserve': return deserveExperiment(league, undefined, undefined, feed(s.fixtureId)) as R;
        case 'wpa': return wpaExperiment(league, feed(s.fixtureId)) as R;
        case 'finishing': return finishingExperiment(league, s.playerId) as R;
        case 'call': return callExperiment(league, s.attackId) as R;
        case 'value': return valueExperiment(league, s.attackId) as R;
        case 'tactic': return tacticExperiment(league, s.minute) as R;
      }
      break;
    }
    case 'standings': return standings(league) as R;
    case 'races': return races(league) as R;
    case 'impact': return playerImpact(league, (args as JobMap['impact']['args']).player) as R;
    case 'squad': return squadImpact(league, (args as JobMap['squad']['args']).club) as R;
    case 'takes': return searchChanges(league, args as JobMap['takes']['args'], onProgress) as R;
    case 'credit': {
      const a = args as JobMap['credit']['args'];
      return momentShapley(league, feed(a.fixtureId), a.focus) as R;
    }
    case 'hero':
      // Nettleshaw's 49th-minute shot that went wide, replayed: the scoreboard tile on the home page
      return shotOutcomes({ distance: 17, angle: 24, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 1, keeperSet: true }, 500, 49) as R;
  }
  throw new Error(`unknown job ${job}`);
}
