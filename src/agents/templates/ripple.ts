// Narrator templates for Ripple: the full-time impact reel and the league stories.

import type { MomentKind } from '../../data/types';
import type { MomentFacts } from '../analyst';
import { signed, type Persona } from '../format';

type T = (f: MomentFacts & { rank: number; ghostPct?: number }) => string;

export const REEL: Partial<Record<MomentKind, Record<Persona, T>>> = {
  late_header_winner: {
    casual: (f) => `A late header from a corner, and the match flips completely.${f.rank === 1 ? ' The biggest moment of the night by far.' : ''}`,
    home: (f) => `${f.minsLeft} minutes from a point and we switch off at a corner. Our chance of taking anything went from ${f.ptsB}% to ${f.ptsA}%.`,
    away: (f) => `${f.player}! A header from a corner and we go from hoping for a draw to ${f.aA}% to win it.`,
    analyst: (f) => `Set-piece header, xG ${f.xg}, at ${f.minute}′. Harbour win ${f.aB}% → ${f.aA}%.`
  },
  counter_goal: {
    casual: () => `Northbridge gave the ball away in midfield and Harbour levelled on the break.`,
    home: (f) => `One loose pass and ${f.player} was gone. That’s where the night started to turn.`,
    away: () => `Won it in midfield, three passes, goal. The equaliser that made the comeback possible.`,
    analyst: (f) => `Turnover at ${f.turnoverM} m, three-pass counter, finish xG ${f.xg}. Northbridge win ${f.hB}% → ${f.hA}%.`
  },
  penalty_saved: {
    casual: () => `A saved penalty kept Harbour level when Northbridge looked set to go ahead.`,
    home: (f) => `Score that and we win ${f.hC}% of the time. Instead, ${f.other} guesses right.`,
    away: (f) => `The save that kept us alive. Without it, we’re losing and down to ${f.aC}%.`,
    analyst: (f) => `Penalty xG ${f.xg} not converted. Northbridge win ${f.hB}% → ${f.hA}%; counterfactual ${f.hC}%.`
  },
  clearance_off_line: {
    casual: () => `Nothing changed on the scoreboard, but if this goes in, it’s a different first half.`,
    home: (f) => `Defending that won us nothing on the night, but it was worth a goal at the time: ${f.player} scores in ${f.ghostPct}% of replays without it.`,
    away: (f) => `So nearly level before half-time. ${f.player}’s header goes in ${f.ghostPct}% of the time without that clearance.`,
    analyst: (f) => `Actual swing ${signed(f.hA - f.hB)} pts; counterfactual ${signed(f.hC - f.hB)} pts. Ghost Run: a goal in ${f.ghostPct}% of continuations without the clearance.`
  },
  goal_long_range: {
    casual: () => `A long-range goal that usually doesn’t go in put Northbridge ahead early.`,
    home: (f) => `What a hit. A one-in-${f.oneIn} shot and it flew in.`,
    away: () => `A shot that rarely goes in, and it did. We weren’t behind on chances, only on the scoreboard.`,
    analyst: (f) => `xG ${f.xg} at ${f.distance} m, ${f.shotKmh} km/h. Northbridge win ${f.hB}% → ${f.hA}%.`
  },
  double_save: {
    casual: () => `Two saves in two seconds kept it level with a quarter of an hour left.`,
    home: (f) => `${f.player} had two goes and ${f.other} stopped both. Score either and we win ${f.hC}% of the time.`,
    away: (f) => `${f.other} again. Two saves in ${f.gapS} seconds, and still level.`,
    analyst: (f) => `Combined xG ${f.xg} across two shots, both saved. Counterfactual swing ${signed(f.hC - f.hB)} pts.`
  }
};

/** The headline "if it had gone the other way" line on the featured clip. */
export const REEL_WHAT_IF: Partial<Record<MomentKind, (f: MomentFacts) => string>> = {
  late_header_winner: (f) => `If it’s cleared, the most likely result is a draw (${f.dC}%).`,
  counter_goal: (f) => `If Northbridge keep the ball, they win ${f.hC}% of the time from there.`,
  penalty_saved: (f) => `If ${f.player} scores, Northbridge win ${f.hC}% of the time.`,
  clearance_off_line: (f) => `If ${f.player}’s header goes in, Northbridge drop to ${f.hC}%.`,
  goal_long_range: (f) => `If it goes wide, Northbridge win ${f.hC}% of the time instead of ${f.hA}%.`,
  double_save: (f) => `If either shot goes in, Northbridge win ${f.hC}% of the time.`
};
