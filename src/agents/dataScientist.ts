// The Data Scientist: decides what to simulate. For a live match it picks the turning points
// worth showing; for a studio question it designs the experiment that answers it.

import type { DemoMatch, League, Player } from '../data/types';
import type { ExperimentSpec } from '../engine/jobs';
import type { MomentResult, Timeline } from '../engine/demo';

/** Turning points: big real swings, or quiet moments with a big "what if". */
export function turningPoints(tl: Timeline, upto: number): MomentResult[] {
  return tl.moments.filter((m) => m.minute <= upto && (Math.abs(m.swing) >= 10 || Math.abs(m.whatIf) >= 15));
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

export interface Design { spec: ExperimentSpec; summary: string }

function namedPlayers(league: League, q: string): Player[] {
  return league.players
    .map((p) => ({ p, at: q.indexOf(norm(p.name.split(' ').slice(1).join(' '))) }))
    .filter((x) => x.at >= 0 && x.p.name.split(' ').slice(1).join(' ').length > 3)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.p);
}

function feedFor(league: League, q: string): DemoMatch {
  return league.feeds.find((f) => [f.home, f.away].some((c) => { const club = league.clubs.find((x) => x.code === c)!; return q.includes(norm(club.short)) || q.includes(norm(club.name)); })) ?? league.demo;
}

export function designExperiment(league: League, question: string): Design | null {
  const q = norm(question);
  const players = namedPlayers(league, q);
  const attacks = league.feeds.flatMap((f) => f.stoppedAttacks);

  if (/man of the match|\bmotm\b|best player (on|in)|who (made|had) the (biggest|most)|player of the match/.test(q)) {
    const feed = feedFor(league, q);
    return { spec: { kind: 'wpa', fixtureId: feed.fixtureId }, summary: 'Credit every swing in win probability to the players in it' };
  }
  if (/offside/.test(q)) {
    const a = attacks.find((x) => x.stop === 'offside' && players.some((p) => p.id === x.attacker)) ?? attacks.find((x) => x.stop === 'offside');
    if (a) return { spec: { kind: 'call', attackId: a.id }, summary: `Check the ${a.label} offside call against tracking error` };
  }
  if (/(sent off|red card|\bred\b|should have gone|walked)/.test(q)) {
    const a = attacks.find((x) => x.stop === 'fouled' && players.some((p) => p.id === x.stopper || p.id === x.attacker)) ?? attacks.find((x) => x.stop === 'fouled');
    if (a) return { spec: { kind: 'call', attackId: a.id }, summary: `Run the red-card test on the ${a.label} foul` };
  }
  if (/(worth|value|how much did|saved them|how big was)/.test(q) && /(clear|block|off the line)/.test(q)) {
    const a = attacks.find((x) => (x.stop === 'cleared' || x.stop === 'blocked') && players.some((p) => p.id === x.stopper)) ?? attacks.find((x) => x.stop === 'cleared');
    if (a) return { spec: { kind: 'value', attackId: a.id }, summary: `Price the ${a.label} ${a.stop === 'cleared' ? 'clearance' : 'block'} in expected points` };
  }
  if (/(back five|five at the back|back three|formation|tactical (switch|change))/.test(q)) {
    const s = league.demo.shields[0];
    return { spec: { kind: 'tactic', minute: s.minute }, summary: `Replay from ${s.minute}′ with and without the change` };
  }
  if (/(penalt).*(stopp|sav|keeper)|keeper.*penalt|best.*(keeper|stopper)/.test(q)) {
    const gk = players.find((p) => p.pos === 'GK') ?? league.players.find((p) => p.id === league.demo.events.find((e) => e.type === 'penalty_saved')!.other)!;
    return { spec: { kind: 'keepers', keeperId: gk.id }, summary: `Compare ${gk.name}’s penalty record with every keeper in the league` };
  }
  const shooter = players.find((p) => p.pos !== 'GK');
  if (shooter && /(finish|clinical|over-?perform|under-?perform|scoring more|lucky|above his|below his|than his chances|xg)/.test(q) && !/deserve/.test(q)) {
    return { spec: { kind: 'finishing', playerId: shooter.id }, summary: `Test ${shooter.name}’s goals against his season xG` };
  }
  if (/(sub|substitut|taken off|took off|hooked|replaced)/.test(q)) {
    const sub = league.demo.subs.find((s) => players.some((p) => p.id === s.off)) ?? league.demo.subs.find((s) => s.side === 'home')!;
    return { spec: { kind: 'sub', minute: sub.minute }, summary: `Replay from ${sub.minute}′ with and without the change` };
  }
  if (/penalt/.test(q) && /(scor|gone in|went in|convert|in\b|won)/.test(q)) {
    const km = league.demo.keyMoments.find((k) => k.kind === 'penalty_saved')!;
    return { spec: { kind: 'penalty', momentId: km.id }, summary: `Replay from ${km.minute}′ with the penalty scored` };
  }
  if (/(deserve|fair result|better team|on chances|xg|robbed|lucky)/.test(q)) {
    const feed = feedFor(league, q);
    return { spec: { kind: 'deserve', fixtureId: feed.fixtureId }, summary: 'Replay every shot by its xG' };
  }
  return null;
}

/** Why a spec can't run, or null if the engine can run it. Guards every spec a live model proposes. */
export function specProblem(league: League, spec: ExperimentSpec): string | null {
  const attacks = league.feeds.flatMap((f) => f.stoppedAttacks);
  const isFeed = (id?: string) => id === undefined || league.feeds.some((f) => f.fixtureId === id);
  switch (spec?.kind) {
    case 'sub': return league.demo.subs.some((s) => s.minute === spec.minute) ? null : `No substitution at ${spec.minute}′. Subs: ${league.demo.subs.map((s) => s.minute).join(', ')}.`;
    case 'tactic': return league.demo.shields.some((s) => s.minute === spec.minute) ? null : `No tactical change at ${spec.minute}′. Changes: ${league.demo.shields.map((s) => s.minute).join(', ')}.`;
    case 'penalty': return league.demo.keyMoments.some((k) => k.id === spec.momentId && k.kind === 'penalty_saved') ? null : `${spec.momentId} is not a saved penalty in the flagship match.`;
    case 'keepers': return league.players.some((p) => p.id === spec.keeperId && p.pos === 'GK' && p.penalties) ? null : `${spec.keeperId} is not a keeper with a penalty record.`;
    case 'deserve': case 'wpa': return isFeed(spec.fixtureId) ? null : `${spec.fixtureId} is not a matchweek-${league.currentMw} fixture with a feed.`;
    case 'finishing': return league.players.some((p) => p.id === spec.playerId && p.pos !== 'GK') ? null : `${spec.playerId} is not an outfield player.`;
    case 'call': return attacks.some((a) => a.id === spec.attackId && (a.stop === 'offside' || a.stop === 'fouled')) ? null : `${spec.attackId} is not an offside or foul.`;
    case 'value': return attacks.some((a) => a.id === spec.attackId && (a.stop === 'cleared' || a.stop === 'blocked')) ? null : `${spec.attackId} is not a clearance or block.`;
    default: return 'Unknown test. Use one of: sub, tactic, penalty, keepers, deserve, wpa, finishing, call, value.';
  }
}

export const STUDIO_PRESETS = [
  { short: 'Was it the 55th-minute sub?', text: 'Was the 55th-minute substitution the reason Northbridge lost?' },
  { short: 'If Bobbinford scores, do they win?', text: 'Would Northbridge have won if Bobbinford scored the penalty?' },
  { short: 'Is Tallowby the best at penalties?', text: 'Is Tallowby the best penalty stopper in the league?' },
  { short: 'Did Northbridge deserve it?', text: 'Did Northbridge deserve to win on the chances they created?' },
  { short: 'Man of the match, by the numbers', text: 'Who was man of the match in Northbridge v Harbour, by the numbers?' },
  { short: 'Is Nettleshaw finishing above his chances?', text: 'Is Nettleshaw finishing above his chances this season?' },
  { short: 'Was Bobbinford offside?', text: 'Was Bobbinford really offside before half-time?' },
  { short: 'Should Marrowshaw have gone?', text: 'Should Marrowshaw have been sent off for the foul on Nettleshaw?' },
  { short: 'What was the clearance worth?', text: 'How much was Quillfeather’s clearance off the line worth?' },
  { short: 'Did the back five work?', text: 'Did Harbour’s switch to a back five work?' }
];
