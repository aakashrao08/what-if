// The scripted demo fixture: Northbridge v Harbour Athletic, matchweek 34.
// The Forge writes the event log, tracking snapshots and the geometry of each key moment.
// Every probability shown in the app is computed from this log by the engine, not written here.

import type { DemoMatch, KeyMoment, MatchEvent, PitchDot, PitchFrame, StoppedAttack } from '../src/data/types';

// Fixed shirt numbers for the players the story is about. forge.ts gives them these numbers.
export const CAST = {
  NBR: {
    keeper: 'NBR-1', quillfeather: 'NBR-5', pickleworth: 'NBR-6', tumbleton: 'NBR-8', nettleshaw: 'NBR-9',
    bobbinford: 'NBR-10', subOn: 'NBR-18', lateSub: 'NBR-20'
  },
  HAR: {
    tallowby: 'HAR-1', fouler: 'HAR-3', marrowshaw: 'HAR-4', pennywhistle: 'HAR-8', gorseby: 'HAR-9',
    sorrelwick: 'HAR-11', subOff: 'HAR-7', subOn: 'HAR-16'
  }
};

const N = CAST.NBR;
const H = CAST.HAR;

// Base shape at kick-off. Northbridge attack to the right (towards x = 105).
const NBR_BASE: [number, number][] = [[6, 34], [28, 10], [26, 26], [26, 42], [28, 58], [46, 20], [43, 34], [46, 48], [66, 12], [70, 34], [66, 56]];
const HAR_BASE: [number, number][] = [[99, 34], [82, 10], [84, 26], [84, 42], [82, 58], [66, 12], [64, 28], [64, 40], [66, 56], [48, 26], [48, 42]];

const clamp = (v: number) => Math.max(1.5, Math.min(103.5, v));

function shape(
  nbrDx: number, harDx: number,
  ov: { n?: Record<number, [number, number]>; h?: Record<number, [number, number]> },
  keyN: number[], keyH: number[]
): PitchDot[] {
  const nbr = NBR_BASE.map(([x, y], i) => [clamp(x + (i === 0 ? nbrDx * 0.3 : nbrDx)), y] as [number, number]);
  const har = HAR_BASE.map(([x, y], i) => [clamp(x + (i === 0 ? harDx * 0.15 : harDx)), y] as [number, number]);
  for (const [k, v] of Object.entries(ov.n ?? {})) nbr[Number(k)] = v;
  for (const [k, v] of Object.entries(ov.h ?? {})) har[Number(k)] = v;
  return [
    ...nbr.map(([x, y], i) => ({ x, y, team: 'home' as const, key: keyN.includes(i) })),
    ...har.map(([x, y], i) => ({ x, y, team: 'away' as const, key: keyH.includes(i) }))
  ];
}

let n = 0;
const ev = (e: Omit<MatchEvent, 'id'>): MatchEvent => ({ id: `e${++n}`, ...e });

export function buildDemo(fixtureId: string): DemoMatch {
  n = 0;
  const events: MatchEvent[] = [
    ev({ minute: 0, label: "0'", type: 'kickoff', text: 'Kick-off at Northbridge Park' }),
    ev({ minute: 9, label: "9'", type: 'goal', team: 'home', player: N.nettleshaw, other: N.pickleworth, xg: 0.07, onTarget: true, sprint: 27.8, detail: { distance: 22, shotKmh: 96 }, text: 'GOAL, Northbridge. Nettleshaw curls one in from the edge of the box' }),
    ev({ minute: 14, label: "14'", type: 'shot_wide', team: 'away', player: H.sorrelwick, xg: 0.04, text: 'Sorrelwick shoots wide from distance' }),
    ev({ minute: 21, label: "21'", type: 'corner', team: 'home', text: 'Northbridge corner, headed clear' }),
    ev({ minute: 27, label: "27'", type: 'header_cleared', team: 'away', player: H.gorseby, other: N.quillfeather, xg: 0.38, onTarget: true, bigChance: true, sprint: 31.2, detail: { distance: 6.9, recoveryM: 25 }, text: 'Quillfeather clears Gorseby’s header off the line' }),
    ev({ minute: 34, label: "34'", type: 'foul', team: 'home', player: N.nettleshaw, other: H.marrowshaw, text: 'Nettleshaw tripped by Marrowshaw at the edge of the box. Yellow card' }),
    ev({ minute: 38, label: "38'", type: 'shot_saved', team: 'home', player: N.pickleworth, xg: 0.06, onTarget: true, text: 'Pickleworth’s low shot saved by Tallowby' }),
    ev({ minute: 44, label: "44'", type: 'offside', team: 'home', player: N.bobbinford, text: 'Bobbinford through on goal, flagged offside' }),
    ev({ minute: 45.5, label: 'HT', type: 'half_time', text: 'Half-time. Northbridge 1–0 Harbour' }),
    ev({ minute: 49, label: "49'", type: 'shot_wide', team: 'home', player: N.nettleshaw, xg: 0.11, text: 'Nettleshaw drags a shot wide' }),
    ev({ minute: 52, label: "52'", type: 'goal', team: 'away', player: H.sorrelwick, other: H.pennywhistle, xg: 0.41, onTarget: true, bigChance: true, sprint: 32.0, detail: { passM: 41, difficulty: 8.4, turnoverM: 48 }, text: 'GOAL, Harbour. Sorrelwick finishes the counter' }),
    ev({ minute: 55, label: "55'", type: 'sub', team: 'home', player: N.subOn, other: N.tumbleton, text: 'Northbridge change: Tumbleton off' }),
    ev({ minute: 57, label: "57'", type: 'shot_blocked', team: 'away', player: H.sorrelwick, other: N.quillfeather, xg: 0.06, text: 'Sorrelwick’s shot from distance blocked by Quillfeather' }),
    ev({ minute: 58, label: "58'", type: 'tactic', team: 'away', text: 'Harbour switch to a back five' }),
    ev({ minute: 60, label: "60'", type: 'penalty_awarded', team: 'home', player: N.bobbinford, other: H.fouler, text: 'Penalty to Northbridge. Bobbinford fouled in the box' }),
    ev({ minute: 61, label: "61'", type: 'penalty_saved', team: 'home', player: N.bobbinford, other: H.tallowby, xg: 0.78, onTarget: true, bigChance: true, detail: { shotKmh: 88, reaction: 0.42 }, text: 'Penalty saved. Tallowby denies Bobbinford' }),
    ev({ minute: 63, label: "63'", type: 'corner', team: 'home', text: 'Northbridge corner, cleared at the near post' }),
    ev({ minute: 66, label: "66'", type: 'foul', team: 'away', player: H.sorrelwick, other: N.pickleworth, text: 'Sorrelwick breaks and is pulled back by Pickleworth. Yellow card' }),
    ev({ minute: 67, label: "67'", type: 'shot_saved', team: 'home', player: N.bobbinford, xg: 0.09, onTarget: true, text: 'Bobbinford’s header held by Tallowby' }),
    ev({ minute: 70, label: "70'", type: 'sub', team: 'away', player: H.subOn, other: H.subOff, text: 'Harbour change' }),
    ev({ minute: 74, label: "74'", type: 'double_save', team: 'home', player: N.nettleshaw, other: H.tallowby, xg: 0.33, onTarget: true, bigChance: true, sprint: 33.4, detail: { gapS: 1.8 }, text: 'Tallowby saves from Nettleshaw, then the rebound' }),
    ev({ minute: 78, label: "78'", type: 'sub', team: 'home', player: N.lateSub, other: N.pickleworth, text: 'Northbridge change: Pickleworth off' }),
    ev({ minute: 80, label: "80'", type: 'shot_blocked', team: 'home', player: N.bobbinford, other: H.marrowshaw, xg: 0.14, text: 'Bobbinford’s shot blocked by Marrowshaw' }),
    ev({ minute: 82, label: "82'", type: 'shot_wide', team: 'home', player: N.lateSub, xg: 0.05, text: 'Shot from the edge of the box goes over' }),
    ev({ minute: 86, label: "86'", type: 'corner', team: 'away', text: 'Harbour corner' }),
    ev({ minute: 87, label: "87'", type: 'goal', team: 'away', player: H.gorseby, xg: 0.21, onTarget: true, detail: { distance: 5.5 }, text: 'GOAL, Harbour. Gorseby heads in from the corner' }),
    ev({ minute: 90.5, label: "90+1'", type: 'shot_saved', team: 'home', player: N.quillfeather, xg: 0.12, onTarget: true, text: 'Quillfeather’s header from a free kick saved' }),
    ev({ minute: 92.5, label: "90+3'", type: 'shot_wide', team: 'home', player: N.bobbinford, xg: 0.07, text: 'Bobbinford volleys over' }),
    ev({ minute: 94, label: 'FT', type: 'full_time', text: 'Full time. Northbridge 1–2 Harbour Athletic' })
  ];
  const id = (minute: number, type: MatchEvent['type']) => events.find((e) => e.minute === minute && e.type === type)!.id;

  const frame = (f: PitchFrame) => f;

  const keyMoments: KeyMoment[] = [
    {
      id: 'km-9', eventId: id(9, 'goal'), kind: 'goal_long_range', minute: 9, label: "9'", clip: '0:15',
      title: 'Nettleshaw curls one in from the edge of the box', cf: { type: 'remove_goal' },
      frame: frame({
        dots: shape(12, 6, { n: { 9: [80, 24] } }, [9], []), ball: { x: 104.2, y: 29.5 },
        paths: [{ d: 'M66 30 L79 24.5', kind: 'home', dashed: true }, { d: 'M80 24 Q96 15 104.2 29.5', kind: 'home' }],
        tags: [{ x: 80, y: 24, player: N.nettleshaw, detail: 'Shot 96 km/h · xG 0.07', team: 'ghost' }],
        label: 'Pitch at 9 minutes: Nettleshaw curls a shot from the edge of the box into the top corner.'
      })
    },
    {
      id: 'km-27', eventId: id(27, 'header_cleared'), kind: 'clearance_off_line', minute: 27, label: "27'", clip: '0:14',
      title: 'Quillfeather clears Gorseby’s header off the line', cf: { type: 'add_goal', team: 'away' }, ghostId: 'ga-27',
      frame: frame({
        dots: shape(-18, -26, { n: { 2: [1.8, 30], 0: [3, 38] }, h: { 9: [6.4, 33.4], 8: [28, 62] } }, [2], [9]), ball: { x: 16, y: 50 },
        paths: [
          { d: 'M28 62 Q14 52 6.4 33.4', kind: 'away' }, { d: 'M6 33 L1.8 31.4', kind: 'away' },
          { d: 'M24 24 Q12 25 2.6 29.6', kind: 'home', dashed: true }, { d: 'M1.8 31.4 Q10 40 16 50', kind: 'home' }
        ],
        tags: [
          { x: 1.8, y: 30, player: N.quillfeather, detail: '31.2 km/h recovery run', team: 'ghost' },
          { x: 6.4, y: 33.4, player: H.gorseby, detail: 'Header xG 0.38', team: 'away' }
        ],
        label: 'Pitch at 27 minutes: a Harbour cross is headed towards goal and Quillfeather clears it off the line after a recovery sprint.'
      })
    },
    {
      id: 'km-52', eventId: id(52, 'goal'), kind: 'counter_goal', minute: 52, label: "52'", clip: '0:21',
      title: 'Sorrelwick finishes a counter after a midfield turnover', cf: { type: 'remove_goal' },
      frame: frame({
        dots: shape(8, -10, { n: { 6: [59.7, 30] }, h: { 6: [55, 32], 9: [15, 41] } }, [], [9, 6]), ball: { x: 1.2, y: 36 },
        paths: [{ d: 'M55 32 L17 41.6', kind: 'away' }, { d: 'M38 47 Q26 45 16 41.6', kind: 'away', dashed: true }, { d: 'M15 41 L1 36', kind: 'away' }],
        marks: [{ x: 59.7, y: 30, kind: 'stop' }],
        tags: [
          { x: 55, y: 32, player: H.pennywhistle, detail: 'Pass 41 m · difficulty 8.4/10', team: 'away' },
          { x: 15, y: 41, player: H.sorrelwick, detail: '32.0 km/h · xG 0.41', team: 'away' }
        ],
        label: 'Pitch at 52 minutes: Northbridge lose the ball in midfield, Pennywhistle plays a 41 metre pass and Sorrelwick finishes the counter.'
      })
    },
    {
      id: 'km-61', eventId: id(61, 'penalty_saved'), pendingFrom: id(60, 'penalty_awarded'), kind: 'penalty_saved', minute: 61, label: "61'", clip: '0:12',
      title: 'Tallowby saves Bobbinford’s penalty', cf: { type: 'add_goal', team: 'home' },
      frame: frame({
        dots: [
          ...[[30, 34], [84, 18], [82, 28], [83, 40], [84, 50], [80, 24], [81, 46], [85, 33], [86, 44], [94, 34], [86, 24]].map(([x, y], i) => ({ x, y, team: 'home' as const, key: i === 9 })),
          ...[[103.6, 36.6], [85, 20], [84, 30], [82, 36], [85, 48], [83, 22], [86, 38], [81, 31], [84, 44], [60, 30], [70, 40]].map(([x, y], i) => ({ x, y, team: 'away' as const, key: i === 0 }))
        ],
        ball: { x: 103.4, y: 38.6 },
        paths: [{ d: 'M94 34 L103.4 38.4', kind: 'home' }, { d: 'M94 34 L104.2 30.5', kind: 'ghost' }],
        marks: [{ x: 104.2, y: 30.5, kind: 'target' }],
        tags: [
          { x: 94, y: 34, player: N.bobbinford, detail: 'Shot 88 km/h · xG 0.78', team: 'home' },
          { x: 103.6, y: 36.6, player: H.tallowby, detail: 'Reaction 0.42 s', team: 'away' }
        ],
        label: 'Pitch at 61 minutes: Bobbinford’s penalty is saved low to the keeper’s right by Tallowby.'
      })
    },
    {
      id: 'km-74', eventId: id(74, 'double_save'), kind: 'double_save', minute: 74, label: "74'", clip: '0:13',
      title: 'Tallowby’s double save from Nettleshaw', cf: { type: 'add_goal', team: 'home' },
      frame: frame({
        dots: shape(22, 4, { n: { 9: [92, 29], 10: [90, 42] }, h: { 0: [101.5, 32.5], 2: [95, 30], 3: [96, 38] } }, [9], [0]), ball: { x: 99, y: 38 },
        paths: [{ d: 'M92 29 L101 31.5', kind: 'home' }, { d: 'M101 32 L97 37', kind: 'home', dashed: true }, { d: 'M93 31 L98.5 37.5', kind: 'home', dashed: true }, { d: 'M98.5 37.5 L101.5 34.5', kind: 'home' }],
        tags: [
          { x: 92, y: 29, player: N.nettleshaw, detail: 'Two shots · xG 0.33 · 33.4 km/h', team: 'home' },
          { x: 101.5, y: 32.5, player: H.tallowby, detail: 'Two saves in 1.8 s', team: 'away' }
        ],
        label: 'Pitch at 74 minutes: Tallowby saves Nettleshaw’s shot and then the rebound.'
      })
    },
    {
      id: 'km-87', eventId: id(87, 'goal'), kind: 'late_header_winner', minute: 87, label: "87'", clip: '0:16',
      title: 'Gorseby heads the winner from a corner', cf: { type: 'remove_goal' },
      frame: frame({
        dots: shape(-30, -40, { n: { 0: [1.6, 35.5], 2: [6, 29], 3: [7.5, 37] }, h: { 9: [5.5, 31], 10: [8, 40], 6: [10, 27] } }, [], [9]), ball: { x: 0.8, y: 33 },
        paths: [{ d: 'M0.8 66.6 Q9 50 5.5 31.6', kind: 'away' }, { d: 'M5.5 31 L0.8 33', kind: 'away' }],
        tags: [{ x: 5.5, y: 31, player: H.gorseby, detail: 'Near-post header · xG 0.21', team: 'away' }],
        label: 'Pitch at 87 minutes: Gorseby meets a corner at the near post and heads it in.'
      })
    }
  ];

  const stoppedAttacks: StoppedAttack[] = [
    {
      id: 'ga-27', eventId: id(27, 'header_cleared'), minute: 27, label: "27'", team: 'away', attacker: H.gorseby, stopper: N.quillfeather, stop: 'cleared',
      title: 'Gorseby’s header', momentId: 'km-27',
      atStop: { distance: 6.9, angle: 52, header: true, oneOnOne: false, keeperBeaten: false, defendersNear: 1, keeperSet: false },
      ghost: { distance: 6.9, angle: 52, header: true, oneOnOne: false, keeperBeaten: true, defendersNear: 0, keeperSet: false },
      stopModel: { kind: 'clear', recoveryM: 25, speedKmh: 31.2, seconds: 2.67 },
      facts: [{ k: 'Header from', v: '6.9 m' }, { k: 'Keeper beaten', v: 'Yes' }, { k: 'Recovery run', v: '25 m · 31.2 km/h' }],
      claim: { quote: 'That was drifting wide anyway.', test: 'goal_below', threshold: 30 },
      timeline: [[0, 2], [0.6, 4], [1.2, 10], [1.6, 38], [1.9, 61]], duration: 3,
      frame: frame({
        dots: [{ x: 28, y: 62, team: 'away' }, { x: 6.4, y: 33.4, team: 'away', key: true }, { x: 2.4, y: 29.4, team: 'home', key: true }, { x: 3.4, y: 38.2, team: 'home' }],
        paths: [
          { d: 'M28 62 Q14 52 6.4 33.4', kind: 'away' }, { d: 'M6.4 33.4 L2.4 31.8', kind: 'away', width: 0.7 },
          { d: 'M24 24 Q12 25 2.4 29.6', kind: 'home', dashed: true }, { d: 'M2.4 31.8 L0.2 31', kind: 'ghost' }
        ],
        marks: [{ x: 2.4, y: 31.8, kind: 'stop' }, { x: 0.9, y: 31.1, kind: 'target' }],
        labels: [{ x: 8.6, y: 33, text: 'GORSEBY', tone: 'away' }, { x: 4.6, y: 27.6, text: 'QUILLFEATHER', tone: 'home' }],
        tags: [],
        label: 'Gorseby heads towards an empty corner; Quillfeather clears it off the line. The ghost run continues the header into the net.'
      })
    },
    {
      id: 'ga-34', eventId: id(34, 'foul'), minute: 34, label: "34'", team: 'home', attacker: N.nettleshaw, stopper: H.marrowshaw, stop: 'fouled',
      title: 'Nettleshaw tripped at the edge of the box',
      atStop: { distance: 21, angle: 26, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 2, keeperSet: true },
      ghost: { distance: 11, angle: 33, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 1, keeperSet: true },
      stopModel: { kind: 'tackle', angleDeg: 45, attackerKmh: 29.4, defenderKmh: 27 },
      covering: 2,
      facts: [{ k: 'Distance to goal', v: '21 m' }, { k: 'Covering defenders', v: '2 within 4 m' }, { k: 'Nettleshaw speed', v: '29.4 km/h' }],
      claim: { quote: 'Clear goalscoring chance. Should have been red.', test: 'red_card', threshold: 50 },
      timeline: [[0, 1], [0.8, 3], [1.6, 6], [2.2, 9]], duration: 4,
      frame: frame({
        dots: [
          { x: 84, y: 27, team: 'home', key: true }, { x: 85.8, y: 28.8, team: 'away', key: true },
          { x: 95, y: 24.6, team: 'away' }, { x: 96, y: 36.4, team: 'away' }, { x: 103, y: 33, team: 'away' }
        ],
        paths: [{ d: 'M62 30 Q74 26 84 27', kind: 'home' }, { d: 'M84 27 Q88 28 92 29 L104.2 32', kind: 'ghost' }],
        marks: [{ x: 84, y: 25.8, kind: 'stop' }, { x: 104.1, y: 32, kind: 'target' }],
        labels: [{ x: 74, y: 23.6, text: 'NETTLESHAW', tone: 'home' }, { x: 81, y: 33.2, text: 'MARROWSHAW', tone: 'away' }],
        tags: [],
        label: 'Nettleshaw is tripped by Marrowshaw at the edge of the box. The ghost run carries him into the area for a shot with defenders covering.'
      })
    },
    {
      id: 'ga-44', eventId: id(44, 'offside'), minute: 44, label: "44'", team: 'home', attacker: N.bobbinford, stopper: '', stop: 'offside',
      title: 'Bobbinford through on goal',
      atStop: { distance: 10.8, angle: 36, header: false, oneOnOne: true, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      ghost: { distance: 10.8, angle: 36, header: false, oneOnOne: true, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      stopModel: { kind: 'offside', marginM: 0.2, sigma: 0.12 },
      facts: [{ k: 'Offside by', v: '0.2 m' }, { k: 'Situation', v: 'One-on-one' }, { k: 'Typical shot distance', v: '10.8 m' }],
      claim: { quote: 'Tight, and that was a real chance.', test: 'goal_above', threshold: 30 },
      timeline: [[0, 1], [0.7, 4], [1.2, 12], [1.5, 18]], duration: 4,
      frame: frame({
        dots: [
          { x: 50, y: 30, team: 'home' }, { x: 80.3, y: 38, team: 'home', key: true },
          { x: 80, y: 30, team: 'away' }, { x: 79, y: 45, team: 'away' }, { x: 101.6, y: 35, team: 'away' }
        ],
        paths: [{ d: 'M50 30 L80.3 38', kind: 'home' }, { d: 'M80.3 38 Q88 37 95 36 L104.2 35', kind: 'ghost' }],
        marks: [{ x: 104.1, y: 35, kind: 'target' }],
        labels: [{ x: 81.6, y: 41.6, text: 'BOBBINFORD', tone: 'home' }, { x: 81.2, y: 8.4, text: 'OFFSIDE BY 0.2 m', tone: 'stop' }],
        offsideX: 80.1,
        tags: [],
        label: 'Bobbinford runs onto a through ball and is flagged offside by 0.2 metres. The ghost run plays it as onside: one-on-one with the keeper.'
      })
    },
    {
      id: 'ga-57', eventId: id(57, 'shot_blocked'), minute: 57, label: "57'", team: 'away', attacker: H.sorrelwick, stopper: N.quillfeather, stop: 'blocked',
      title: 'Sorrelwick’s shot from distance',
      atStop: { distance: 22, angle: 18, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      ghost: { distance: 22, angle: 18, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      stopModel: { kind: 'block', laneCoverage: 0.6, metres: 8 },
      facts: [{ k: 'Shot from', v: '22 m' }, { k: 'Angle', v: 'Tight, left side' }, { k: 'Keeper', v: 'Set' }],
      claim: { quote: 'That was a certain goal.', test: 'goal_above', threshold: 80 },
      timeline: [[0, 1], [0.8, 3], [1.5, 6], [1.8, 9]], duration: 3,
      frame: frame({
        dots: [{ x: 22, y: 32, team: 'away', key: true }, { x: 13.2, y: 34.6, team: 'home', key: true }, { x: 3, y: 33, team: 'home' }, { x: 16, y: 27, team: 'home' }],
        paths: [{ d: 'M40 30 Q30 31 22 32', kind: 'away' }, { d: 'M22 32 L13.6 33', kind: 'away' }, { d: 'M13.6 33 L0.8 30.6', kind: 'ghost' }],
        marks: [{ x: 13.6, y: 33, kind: 'stop' }, { x: 1, y: 30.7, kind: 'target' }],
        labels: [{ x: 23.4, y: 35.4, text: 'SORRELWICK', tone: 'away' }, { x: 8, y: 38.8, text: 'QUILLFEATHER', tone: 'home' }],
        tags: [],
        label: 'Sorrelwick shoots from 22 metres and Quillfeather blocks it. The ghost run lets the shot through to a set keeper.'
      })
    },
    {
      id: 'ga-66', eventId: id(66, 'foul'), minute: 66, label: "66'", team: 'away', attacker: H.sorrelwick, stopper: N.pickleworth, stop: 'fouled',
      title: 'Sorrelwick pulled back on the break',
      atStop: { distance: 52, angle: 6, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 1, keeperSet: true },
      ghost: { distance: 14, angle: 30, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 2, keeperSet: true },
      stopModel: { kind: 'tackle', angleDeg: 60, attackerKmh: 31.4, defenderKmh: 28.2 },
      covering: 2,
      facts: [{ k: 'Where it stopped', v: 'Halfway line' }, { k: 'Harbour runners', v: '3 against 4' }, { k: 'Sorrelwick speed', v: '31.4 km/h' }],
      claim: { quote: 'Clever foul. Yellow was the right call.', test: 'red_card_below', threshold: 50 },
      timeline: [[0, 1], [0.9, 2], [1.7, 4], [2.3, 5]], duration: 6,
      frame: frame({
        dots: [{ x: 54, y: 40, team: 'away', key: true }, { x: 55.5, y: 41.5, team: 'home', key: true }, { x: 30, y: 30, team: 'home' }, { x: 33, y: 46, team: 'home' }, { x: 6, y: 34, team: 'home' }, { x: 44, y: 24, team: 'away' }],
        paths: [{ d: 'M66 46 Q60 43 54 40', kind: 'away' }, { d: 'M54 40 Q36 38 20 36 L0.8 33.5', kind: 'ghost' }],
        marks: [{ x: 54, y: 38.4, kind: 'stop' }, { x: 0.8, y: 33.5, kind: 'target' }],
        labels: [{ x: 56, y: 37, text: 'SORRELWICK', tone: 'away' }, { x: 57, y: 45, text: 'PICKLEWORTH', tone: 'home' }],
        tags: [],
        label: 'Sorrelwick breaks from halfway and Pickleworth pulls him back. The ghost run lets the counter carry on towards the Northbridge box.'
      })
    },
    {
      id: 'ga-80', eventId: id(80, 'shot_blocked'), minute: 80, label: "80'", team: 'home', attacker: N.bobbinford, stopper: H.marrowshaw, stop: 'blocked',
      title: 'Bobbinford’s shot from the edge of the box',
      atStop: { distance: 17, angle: 24, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      ghost: { distance: 17, angle: 24, header: false, oneOnOne: false, keeperBeaten: false, defendersNear: 0, keeperSet: true },
      stopModel: { kind: 'block', laneCoverage: 0.7, metres: 4 },
      facts: [{ k: 'Shot from', v: '17 m' }, { k: 'Angle', v: 'Central' }, { k: 'Blocker distance', v: '4 m' }],
      claim: { quote: 'If that gets through, it’s 2–1.', test: 'goal_above', threshold: 50 },
      timeline: [[0, 1], [0.8, 4], [1.5, 9], [1.9, 14]], duration: 3,
      frame: frame({
        dots: [{ x: 88, y: 33, team: 'home', key: true }, { x: 92, y: 34, team: 'away', key: true }, { x: 102.8, y: 34, team: 'away' }, { x: 95, y: 29, team: 'away' }, { x: 96, y: 40, team: 'away' }, { x: 84, y: 22, team: 'home' }],
        paths: [{ d: 'M76 28 Q83 31 88 33', kind: 'home' }, { d: 'M88 33 L92 34', kind: 'home' }, { d: 'M92 34 L104.4 35.5', kind: 'ghost' }],
        marks: [{ x: 92, y: 32.6, kind: 'stop' }, { x: 104.2, y: 35.5, kind: 'target' }],
        labels: [{ x: 76, y: 31, text: 'BOBBINFORD', tone: 'home' }, { x: 90, y: 39, text: 'MARROWSHAW', tone: 'away' }],
        tags: [],
        label: 'Bobbinford shoots from the edge of the box and Marrowshaw blocks it. The ghost run lets the shot through to a set keeper.'
      })
    }
  ];

  return {
    fixtureId,
    source: 'scripted',
    home: 'NBR',
    away: 'HAR',
    ground: 'Northbridge Park',
    kickoff: '15:00',
    events,
    keyMoments,
    stoppedAttacks,
    liveMinute: 63,
    shields: [{ minute: 58, side: 'away', factor: 0.72, label: 'Harbour switch to a back five' }],
    subs: [
      { minute: 55, side: 'home', off: N.tumbleton, on: N.subOn },
      { minute: 70, side: 'away', off: H.subOff, on: H.subOn },
      { minute: 78, side: 'home', off: N.pickleworth, on: N.lateSub }
    ],
    trackingStats: [
      { label: 'Possession', home: 58, away: 42, unit: '%' },
      { label: 'Field tilt', home: 64, away: 36, unit: '%' },
      { label: 'Pass accuracy', home: 86, away: 79, unit: '%' },
      { label: 'Avg pass difficulty', home: 5.1, away: 6.3, digits: 1 }
    ]
  };
}
