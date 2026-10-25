// Shared data contract between The Forge (generator), the engine, the agents and the UI.
// Everything in the Meridian League is synthetic: no real clubs, players or matches.

export type Position = 'GK' | 'DF' | 'MF' | 'FW';
/** What a player actually does on the pitch. Assigned from his attributes within his squad, never from his shirt number. */
export type Role = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';
export type Side = 'home' | 'away';

export interface Attributes {
  finishing: number; // 1–99
  pace: number;
  passing: number;
  defending: number;
  keeping: number;
  // the detailed profile (The Forge's profile pass, its own random stream): optional so older data still loads
  tackling?: number;
  aerial?: number;
  crossing?: number;
  vision?: number;
  dribbling?: number;
  stamina?: number;
}

export interface Player {
  id: string;
  name: string;
  short: string; // "K. Nettleshaw"
  club: string; // club code
  pos: Position;
  role?: Role;
  number: number; // shirt number: just a number
  age: number;
  attrs: Attributes;
  topSpeed: number; // km/h
  starter: boolean;
  goals: number; // league goals this season
  xg?: number; // expected goals from the chances he had this season
  joinedFrom?: string; // club code, for this season's transfers
  penalties?: { faced: number; saved: number }; // keepers only, league career
  // season stats from The Forge's stats pass (its own random stream, so nothing above changes)
  apps?: number; // league appearances
  assists?: number;
  yellow?: number;
  red?: number;
  cleanSheets?: number; // keepers
  // position stats (a third stream, after the above): what a player at his position is judged on
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  blocks?: number;
  progPasses?: number; // passes that move the ball at least 10 m towards goal
  progCarries?: number;
  keyPasses?: number; // passes that lead to a shot (assists included)
  passAcc?: number; // %
  aerials?: number; // aerial duels won
  crosses?: number; // completed crosses
  dribbles?: number; // successful take-ons
  shots?: number;
  onTarget?: number;
  saves?: number; // keepers
  conceded?: number; // keepers: goals let in while on the pitch
  prevented?: number; // keepers: goals saved beyond what an average keeper saves from the same shots
}

export interface ClubStyle {
  press: number; // 0–1
  line: number; // 0–1, higher = higher defensive line
  tempo: number; // 0–1
}

export interface Club {
  code: string;
  name: string;
  short: string; // "Northbridge"
  nickname: string;
  ground: string;
  founded: number;
  manager: string;
  style: ClubStyle;
  colors: { primary: string; secondary: string };
}

export interface Manager {
  name: string;
  club: string | null; // null = out of work
  lastClub?: string;
  style: ClubStyle;
  bio: string;
}

export interface Fixture {
  id: string;
  mw: number;
  home: string;
  away: string;
  kickoff: string; // "15:00"
  hg?: number; // full-time goals, when played
  ag?: number;
}

export type EventType =
  | 'kickoff' | 'goal' | 'shot_saved' | 'shot_wide' | 'shot_blocked' | 'header_cleared' | 'double_save'
  | 'foul' | 'offside' | 'penalty_awarded' | 'penalty_saved' | 'card' | 'sub' | 'corner'
  | 'tactic' | 'half_time' | 'full_time';

export interface MatchEvent {
  id: string;
  minute: number; // match minute; stoppage-time events use 45.5 / 90+ values
  label: string; // "61'", "HT"
  type: EventType;
  team?: Side;
  player?: string; // player id
  other?: string; // second player id (assister, fouler, blocker, keeper, sub on)
  xg?: number;
  onTarget?: boolean;
  bigChance?: boolean;
  sprint?: number; // km/h, top speed recorded in the action
  detail?: Record<string, number>; // tracking measurements the Analyst can quote (distance, ball speed...)
  text: string; // plain description for the feed
}

export interface PitchDot { x: number; y: number; team: Side; key?: boolean }
export interface PitchPath { d: string; kind: Side | 'ghost'; dashed?: boolean; width?: number }
export interface PitchTag { x: number; y: number; player: string; detail: string; team: Side | 'ghost' }
export interface PitchMark { x: number; y: number; kind: 'stop' | 'target' }
export interface PitchLabel { x: number; y: number; text: string; tone: Side | 'stop' }

export interface PitchFrame {
  dots: PitchDot[];
  ball?: { x: number; y: number };
  paths: PitchPath[];
  tags: PitchTag[];
  marks?: PitchMark[];
  labels?: PitchLabel[];
  offsideX?: number;
  label: string; // accessible description
}

export type MomentKind =
  | 'goal' | 'goal_long_range' | 'late_goal' | 'counter_goal' | 'late_header_winner' // goals: the branch removes them
  | 'big_miss' | 'big_save' | 'clearance_off_line' | 'double_save' | 'penalty_saved'; // chances: the branch scores them

/** How to build the "if it had gone the other way" branch for a key moment. */
export type Counterfactual =
  | { type: 'remove_goal' } // the goal doesn't happen
  | { type: 'add_goal'; team: Side }; // the chance goes in

export interface KeyMoment {
  id: string;
  eventId: string; // the event that resolves the moment
  pendingFrom?: string; // event that opened it (penalty awarded)
  kind: MomentKind;
  minute: number;
  label: string;
  title: string;
  clip: string; // clip length for the reel
  cf: Counterfactual;
  ghostId?: string; // a Ghost Run exists for it
  frame: PitchFrame;
}

export interface ChanceFeatures {
  distance: number; // metres to goal centre
  angle: number; // degrees of goal mouth visible
  header: boolean;
  oneOnOne: boolean;
  keeperBeaten: boolean;
  defendersNear: number;
  keeperSet: boolean;
}

export type StopModel =
  | { kind: 'clear'; recoveryM: number; speedKmh: number; seconds: number }
  | { kind: 'tackle'; angleDeg: number; attackerKmh: number; defenderKmh: number }
  | { kind: 'offside'; marginM: number; sigma: number }
  | { kind: 'block'; laneCoverage: number; metres: number };

export interface PunditClaim {
  quote: string;
  test: 'goal_below' | 'goal_above' | 'red_card' | 'red_card_below';
  threshold: number; // percent
}

export interface StoppedAttack {
  id: string;
  eventId: string;
  minute: number;
  label: string;
  team: Side; // attacking side
  attacker: string;
  stopper: string;
  stop: 'cleared' | 'fouled' | 'offside' | 'blocked';
  title: string;
  atStop: ChanceFeatures; // the shot if taken where the attack was stopped
  ghost: ChanceFeatures; // the shot the continued attack reaches
  stopModel: StopModel;
  covering?: number; // defenders covering, for the red-card test
  facts: { k: string; v: string }[];
  claim: PunditClaim;
  timeline: [number, number][]; // seconds → goal chance % during the real attack, up to the stop
  duration: number; // seconds shown on the chart
  momentId?: string;
  frame: PitchFrame;
}

export interface StatLine { label: string; home: number; away: number; unit?: string; digits?: number }

/** A match with a full event feed. The flagship demo is scripted; the rest of the matchweek is generated by The Forge. */
export interface DemoMatch {
  fixtureId: string;
  source: 'scripted' | 'generated';
  home: string;
  away: string;
  ground: string;
  kickoff: string;
  events: MatchEvent[];
  keyMoments: KeyMoment[];
  stoppedAttacks: StoppedAttack[];
  liveMinute: number; // where the broadcast is when the app opens
  shields: { minute: number; side: Side; factor: number; label: string }[]; // tactical changes the engine applies
  subs: { minute: number; side: Side; off: string; on: string }[];
  /** possession, pass accuracy etc. that the event log can't give us: values at full time, eased in */
  trackingStats: { label: string; home: number; away: number; unit?: string; digits?: number }[];
}

export interface League {
  name: string;
  season: string;
  seed: number;
  generatedAt: string;
  clubs: Club[];
  players: Player[];
  managers: Manager[];
  fixtures: Fixture[];
  currentMw: number;
  demo: DemoMatch; // the flagship match (also in feeds)
  feeds: DemoMatch[]; // every matchweek fixture with an event feed
}

export type MatchFeed = DemoMatch;
