// Narrator templates for Ghost Run and the studio pundit check.

import type { StoppedAttack } from '../../data/types';
import { hashSeed } from '../../engine/rng';
import type { GhostFacts } from '../analyst';
import type { Persona } from '../format';

type T = (f: GhostFacts) => string;

const often = (p: number) => (p >= 60 ? 'most of the time' : p >= 40 ? 'about half the time' : 'some of the time');

type Voice = 'casual' | 'att' | 'def' | 'analyst'; // att = fan of the attacking side, def = fan of the side that stopped it

export const GHOST: Record<StoppedAttack['stop'], Record<Voice, T>> = {
  cleared: {
    casual: (f) => `If ${f.stopper} doesn’t get back, this goes in ${often(f.pct)}. In ${f.n} replays without him, it was a goal ${f.goals} times.`,
    def: (f) => `${f.pct >= 60 ? 'That clearance was worth a goal.' : 'A clearance worth having.'} Without ${f.stopper}, ${f.attacker} scores in ${f.pct}% of the replays.`,
    att: (f) => `We were that close. With nobody on the line, ${f.attacker}’s effort goes in ${f.pct}% of the time.`,
    analyst: (f) => `Conditional on no clearance: P(goal) ${f.p2}, n=${f.n}, 95% interval ${f.lo}–${f.hi}%. The keeper was already beaten; the misses drift past the post.`
  },
  fouled: {
    casual: (f) => `${f.attacker} was through, but not clean through. In the replays he scores about one time in ${f.oneIn}.`,
    att: (f) => `A red? The replays say it was a ${f.pct >= 30 ? 'real' : 'decent'} chance, not a sure thing: a goal ${f.pct}% of the time.`,
    def: (f) => `${f.stopper} took one for the team, and the yellow was ${f.red < 50 ? 'fair' : 'lucky'}. ${f.attacker} only scores in ${f.pct}% of the replays.`,
    analyst: (f) => `P(goal) ${f.p2}, n=${f.n}. Red-card test ${f.red}%: ${f.covering} covering defenders and ${f.distance} m out ${f.red < 50 ? 'argue against' : 'support'} an obvious goalscoring opportunity.`
  },
  offside: {
    casual: (f) => `A ${f.margin < 0.3 ? 'very tight' : 'clear'} offside call. If he’s onside, ${f.attacker} is one-on-one with the keeper and scores ${f.pct}% of the time.`,
    att: (f) => `${f.margin} metres. Onside, ${f.attacker}’s through and scores in ${f.pct}% of the replays. That flag hurt.`,
    def: (f) => `${f.conf >= 90 ? 'Right call, and a big one.' : 'Lucky, and a big one.'} If he’s onside, ${f.attacker} scores ${f.pct}% of the time.`,
    analyst: (f) => `Offside margin ${f.margin} m, call confidence ${f.conf}%. Onside continuation: one-on-one, P(goal) ${f.p2}, n=${f.n}.`
  },
  blocked: {
    casual: (f) => `${f.pct >= 30 ? 'A big block. Without it, this goes in more often than not' : 'It looked dangerous, but even without the block this usually doesn’t go in'}. A goal in ${f.pct}% of replays.`,
    def: (f) => `${f.pct >= 30 ? 'Massive block.' : 'Good block, but not a match-saver.'} ${f.attacker} scores ${f.pct}% of the time without it.`,
    att: (f) => `${f.pct >= 30 ? 'That one hurts.' : 'Frustrating, but the block didn’t cost us much.'} ${f.attacker}’s shot goes in ${f.pct}% of the time.`,
    analyst: (f) => `Unblocked continuation: P(goal) ${f.p2}, n=${f.n}. ${f.distance} m, keeper set: ${f.savedPct}% saved, ${f.widePct}% off target.`
  }
};

export const ghostVoice = (persona: Persona, attackSide: 'home' | 'away'): Voice =>
  persona === 'casual' || persona === 'analyst' ? persona : persona === attackSide ? 'att' : 'def';

export const verdictOf = (pct: number) => (pct >= 30 ? 'Real chance' : pct >= 10 ? 'Half chance' : 'Wouldn’t have scored');

/** What the numbers make of the pundit's claim, and how firmly: the further from the line, the plainer the verdict. */
export function punditCheck(a: StoppedAttack, f: GhostFacts, holds: boolean): string {
  const two = (x: string, y: string) => (hashSeed(a.id) % 2 ? x : y);
  switch (a.claim.test) {
    case 'red_card_below': // the pundit says a yellow was right
      return holds
        ? f.red < 20 ? two(`Right call. ${f.red}% on the red-card test is nowhere near a sending-off.`, `Fair. The red-card test says ${f.red}%: a yellow all day.`) : `Right, just. ${f.red}% on the red-card test is under the line for a red.`
        : `Too lenient. At ${f.red}% on the red-card test, that’s a red.`;
    case 'red_card': // the pundit says it should have been red
      return holds
        ? `The pundit has a point: ${f.red}% on the red-card test, over the line for a red.`
        : f.red < 20 ? `Not a red. A ${f.pct}% chance, and only ${f.red}% on the red-card test: too much cover for an obvious goal chance.` : two(`Overstated. A real chance (${f.pct}%), but ${f.red}% on the red-card test falls short of a red.`, `Close, but no: ${f.red}% on the red-card test, under the bar for a red.`);
    case 'goal_below': // the pundit says it wasn't much of a chance
      return holds ? two(`True enough: only ${f.pct}% of these end in a goal.`, `Fair. It goes in just ${f.pct}% of the time.`) : f.pct >= 40 ? `Underrated. That ends in a goal ${f.pct}% of the time.` : `More dangerous than that: ${f.pct}% of these go in.`;
    case 'goal_above': // the pundit says it was a big chance
      return holds ? (f.pct >= 40 ? `Fair assessment. A genuine chance: ${f.pct}% go in.` : `Fair, if generous: ${f.pct}% go in, better than most.`) : two(`Overrated. Only ${f.pct}% of these go in.`, `Not as big as it looked: ${f.pct}% end in a goal.`);
  }
}

export interface Tile { k: string; v: string; s: string; x?: boolean }

export function ghostTiles(a: StoppedAttack, f: GhostFacts, stopLabel: string): Tile[] {
  const ghost: Tile = { k: 'GHOST GOAL', v: `${f.pct}%`, s: a.stop === 'offside' ? 'Played on as onside.' : a.stop === 'fouled' ? 'Carrying into the box, then shooting.' : a.stop === 'blocked' ? 'If the shot gets through.' : 'With nobody on the line.' };
  switch (a.stop) {
    case 'cleared':
      return [
        { k: 'xG OF THE CHANCE', v: f.xgAtStop.toFixed(2), s: `From ${f.distance} m, before the keeper was beaten.` },
        { k: stopLabel, v: `${f.stopValue}%`, s: 'How often a defender gets back to clear one like this.', x: true },
        ghost,
        { k: 'GOALS PREVENTED', v: f.p2.toFixed(2), s: `What ${f.stopper}’s clearance was worth.` }
      ];
    case 'fouled':
      return [
        { k: 'xG FROM THE FOUL SPOT', v: f.xgAtStop.toFixed(2), s: f.distance > 35 ? 'Too far out to shoot from where he was stopped.' : `If he’d shot from where he went down, ${f.distance} m out.` },
        { k: stopLabel, v: `${f.stopValue}%`, s: 'How often a fair tackle wins the ball here.', x: true },
        ghost,
        { k: 'RED CARD TEST', v: `${f.red}%`, s: 'Chance this meets the bar for denying an obvious goal chance.' }
      ];
    case 'offside':
      return [
        { k: 'xG OF THE CHANCE', v: f.xgAtStop.toFixed(2), s: `One-on-one from about ${Math.round(f.distance)} m.` },
        { k: 'OFFSIDE MARGIN', v: `${f.margin} m`, s: 'Player tracking is accurate to about 0.1 m.', x: true },
        { k: stopLabel, v: `${f.conf}%`, s: 'How sure the model is that the flag was right.' },
        ghost
      ];
    case 'blocked':
      return [
        { k: 'xG OF THE SHOT', v: f.xgAtStop.toFixed(2), s: `${f.distance} m out, keeper set.` },
        { k: stopLabel, v: `${f.stopValue}%`, s: 'How often a defender in that spot blocks it.', x: true },
        ghost,
        { k: 'GOALS PREVENTED', v: f.p2.toFixed(2), s: f.p2 < 0.15 ? 'A good block, but not a big one.' : 'A block that mattered.' }
      ];
  }
}
