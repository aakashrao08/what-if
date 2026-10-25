// Turns a finished Settle It experiment into the view the studio shows (facts, test, answer,
// script). Shared by the browser pipeline and the agent backend, so both narrate from the same facts.

import type { League } from '../data/types';
import type { MomentResult } from '../engine/demo';
import type { ExperimentSpec } from '../engine/jobs';
import type {
  CallExperiment, DeserveExperiment, Experiment, FinishingExperiment, KeeperExperiment, ReplayExperiment, ValueExperiment, WpaExperiment
} from '../engine/settle';
import { settleCall, settleDeserve, settleFinishing, settleKeepers, settleReplay, settleValue, settleWpa, type SettleView } from './narrator';
import { verify } from './verifier';

export function settleViewFor(league: League, experiment: Experiment, spec: ExperimentSpec, moments: MomentResult[], draft = 1): SettleView {
  const feedOf = (id?: string) => league.feeds.find((f) => f.fixtureId === id) ?? league.demo;
  switch (experiment.kind) {
    case 'replay': return settleReplay(league, experiment, spec.kind === 'sub' ? 'sub' : spec.kind === 'tactic' ? 'tactic' : 'penalty', moments);
    case 'keepers': return settleKeepers(league, experiment as KeeperExperiment, draft);
    case 'deserve': return settleDeserve(league, experiment as DeserveExperiment, feedOf((spec as { fixtureId?: string }).fixtureId));
    case 'wpa': return settleWpa(league, experiment as WpaExperiment, feedOf((experiment as WpaExperiment).fixtureId));
    case 'finishing': return settleFinishing(league, experiment as FinishingExperiment);
    case 'call': return settleCall(league, experiment as CallExperiment);
    case 'value': return settleValue(league, experiment as ValueExperiment);
  }
}

/** Everything in a view that a reader sees, joined for the Verifier. */
export const settleText = (v: SettleView) => [v.answer, v.line, v.analyst, v.script, v.gfx.big, v.gfx.sub].join(' ');

/** The first template draft that passes the Verifier: the house-style reference for a live Narrator. */
export function passingTemplate(league: League, experiment: Experiment, spec: ExperimentSpec, moments: MomentResult[]): SettleView {
  let view = settleViewFor(league, experiment, spec, moments, 1);
  for (let d = 1; d <= 3; d++) {
    view = settleViewFor(league, experiment, spec, moments, d);
    if (verify(settleText(view), view.facts).ok) break;
  }
  return view;
}

export function experimentSize(experiment: Experiment): string {
  switch (experiment.kind) {
    case 'keepers': return `${experiment.totalPenalties} penalties`;
    case 'wpa': return `${experiment.rows.length} players`;
    case 'finishing': return 'one season of chances';
    case 'call': return '500 ghost runs';
    case 'value': return '500 ghost runs + 4,000 finishes';
    default: return `${(experiment as ReplayExperiment | DeserveExperiment).n.toLocaleString('en-GB')} runs`;
  }
}
