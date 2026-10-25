// Current Affairs: the Analyst turns the standings, races and squad numbers into facts, and the
// Narrator writes the short lines that sit beside them. Every line carries its facts so the
// Verifier can check it, the same as everywhere else in the app.

import type { League, Player, Role } from '../data/types';
import type { ClubSummary, PlayerImpact, RaceLine, Races, SquadImpact, Standings } from '../engine/races';
import type { Race } from '../engine/takes';
import { raceProb } from '../engine/takes';
import { finishingExperiment } from '../engine/settle';
import { ordinal } from './format';
import { verify, type Facts, type Verdict } from './verifier';
import { hashSeed } from '../engine/rng';

export interface Line { text: string; facts: Facts; verdict: Verdict }
const line = (text: string, facts: Facts): Line => ({ text, facts, verdict: verify(text, facts) });

const pct = (x: number) => Math.round(x * 100);
const C = (league: League, code: string) => league.clubs.find((c) => c.code === code)!;
const P = (league: League, id: string) => league.players.find((p) => p.id === id)!;
const sur = (p: Player) => p.name.split(' ').slice(1).join(' ');
const pts = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

export const RACE_NAME: Record<Race, string> = { title: 'win the league', top4: 'finish in the top four', survive: 'stay up' };
export const RACE_SHORT: Record<Race, string> = { title: 'Title', top4: 'Top four', survive: 'Stay up' };

/** A share of simulations a fan reads at a glance: "73%", "under 1%", "over 99%", "every run" (10,000 of 10,000). */
export function chance(p: number): string {
  if (p >= 0.9995) return 'every run';
  if (p >= 0.995) return 'over 99%';
  if (p < 0.005) return 'under 1%';
  return `${pct(p)}%`;
}

/** One of a few ways to say the same thing, fixed per club or player so a page reads the same on every visit. */
export const pick = <T,>(key: string, options: T[]): T => options[hashSeed(key) % options.length];

// ---------------- the club card ----------------

export interface ClubCard { headline: Line; luck: Line; run: Line; odds: { label: string; p: number; lo: number; hi: number }[] }

export function clubCard(league: League, s: Standings, code: string): ClubCard {
  const c = s.clubs.find((x) => x.code === code)!;
  const o = c.outlook;
  const name = (x: ClubSummary) => C(league, x.code).short;
  const rp = raceProb(o, c.race);
  const p = chance(rp.p);
  const facts: Facts = { pos: c.pos, pts: c.row.pts, p: pct(rp.p), n: s.n };
  const add = (k: string, v: number) => { facts[k] = v; return v; };
  let headline: string;
  if (c.race === 'title') {
    const other = c.pos === 1 ? s.clubs[1] : s.clubs[0];
    const gap = add('gap', Math.abs(other.row.pts - c.row.pts));
    headline = c.pos === 1
      ? gap === 0 ? `Top on goal difference, level with ${name(other)} on ${c.row.pts} points. Champions in ${p} of the simulations.`
        : pick(code, [`Top, ${pts(gap)} clear of ${name(other)}. Champions in ${p} of the simulations.`, `${pts(gap)} clear at the top. The title comes their way in ${p} of the simulations.`])
      : pick(code, [`${ordinal(c.pos)}, ${pts(gap)} behind ${name(other)}. They overhaul them in ${p} of the simulations.`, `Chasing ${name(other)} from ${ordinal(c.pos)}, ${pts(gap)} back. Champions in ${p} of the simulations.`]);
  } else if (c.race === 'top4') {
    const fourth = s.clubs[3], fifth = s.clubs[4];
    if (c.pos <= 4) {
      const gap = add('gap', c.row.pts - fifth.row.pts);
      headline = gap <= 2
        ? `${ordinal(c.pos)}, but only ${pts(gap)} above ${name(fifth)}. They hold on to a top-four place in ${p} of the simulations.`
        : `${ordinal(c.pos)}, ${pts(gap)} clear of fifth. They finish in the top four in ${p} of the simulations.`;
    } else {
      const gap = add('gap', fourth.row.pts - c.row.pts);
      headline = gap <= 3
        ? pick(code, [`${ordinal(c.pos)}, ${pts(gap)} behind ${name(fourth)} in fourth. They get into the top four in ${p} of the simulations.`, `${pts(gap)} off the top four, with ${name(fourth)} the side to catch. They make it in ${p} of the simulations.`])
        : `${ordinal(c.pos)}, ${pts(gap)} off the top four. They close the gap in ${p} of the simulations.`;
    }
  } else {
    const safe = s.clubs[16], drop = s.clubs[17];
    if (c.pos <= 17) {
      const gap = add('gap', c.row.pts - drop.row.pts);
      headline = gap >= 8
        ? `${ordinal(c.pos)}, ${pts(gap)} clear of the bottom three. They stay up in ${p} of the simulations.`
        : pick(code, [`${ordinal(c.pos)}, ${pts(gap)} above the drop zone. They stay up in ${p} of the simulations.`, `Only ${pts(gap)} separate them from ${name(drop)} in the bottom three. They survive in ${p} of the simulations.`]);
    } else {
      const gap = add('gap', safe.row.pts - c.row.pts);
      headline = gap === 0
        ? `In the bottom three on goal difference, level with ${name(safe)}. They escape in ${p} of the simulations.`
        : pick(code, [`${ordinal(c.pos)}, ${pts(gap)} from safety. They escape in ${p} of the simulations.`, `${pts(gap)} adrift of ${name(safe)}. They pull clear in ${p} of the simulations.`]);
    }
  }

  const diff = add('diff', Math.abs(Math.round((c.row.pts - c.xpts) * 10) / 10));
  facts.xpts = c.xpts;
  const over = c.row.pts > c.xpts;
  const margin = (x: ClubSummary) => x.row.pts - x.xpts;
  const extreme = over ? !s.clubs.some((x) => margin(x) > margin(c)) : !s.clubs.some((x) => margin(x) < margin(c));
  const luck = line(diff < 3
    ? pick(code + 'l', [`${c.row.pts} points from chances worth ${c.xpts}: they've got roughly what they deserved.`, `Results have matched the chances: ${c.row.pts} points, against ${c.xpts} expected.`])
    : over
      ? diff >= 8 ? `${c.row.pts} points from chances worth only ${c.xpts}. ${extreme ? 'Nobody has got more out of less' : 'Few sides have got more out of less'}, and that rarely lasts.` : pick(code + 'l', [`${c.row.pts} points from chances worth ${c.xpts}. They've been clinical, or fortunate.`, `About ${Math.round(diff)} points ahead of what their chances deserve.`])
      : diff >= 8 ? `Chances worth ${c.xpts} points have brought only ${c.row.pts}. ${extreme ? 'No side has been unluckier.' : 'The performances deserve a lot more.'}` : pick(code + 'l', [`${c.row.pts} points from chances worth ${c.xpts}. They've been unlucky.`, `About ${Math.round(diff)} points short of what their chances deserve.`]), facts);

  const winOf = (x: ClubSummary['next'][number]) => pct(x.home ? x.p.home : x.p.away);
  const sorted = [...c.next].sort((a, b) => winOf(b) - winOf(a));
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const where = (x: typeof best) => `${C(league, x.opp).short} ${x.home ? 'at home' : 'away'}`;
  const run = !c.next.length ? line('Season over.', {})
    : c.next.length === 1 ? line(`One game left, ${where(best)}, which they win ${winOf(best)}% of the time.`, { w: winOf(best) })
      : line(winOf(worst) >= 50
        ? `${c.next.length} games left and a kind run-in: they're favourites in every one, from ${where(worst)} (${winOf(worst)}%) to ${where(best)} (${winOf(best)}%).`
        : winOf(best) < 35
          ? `${c.next.length} games left and no easy ones. Their best chance of a win is ${where(best)} (${winOf(best)}%).`
          : `${c.next.length} games left. The likeliest win is ${where(best)} (${winOf(best)}%); the hardest test, ${where(worst)} (${winOf(worst)}%).`,
      { left: c.next.length, best: winOf(best), worst: winOf(worst) });

  // probabilities 0–1; the range only means something away from the ends
  const odds = [
    { label: 'Win the league', p: o.title, lo: o.ci.title.lo, hi: o.ci.title.hi },
    { label: 'Top four', p: o.top4, lo: o.ci.top4.lo, hi: o.ci.top4.hi },
    { label: 'Relegated', p: o.rel, lo: o.ci.rel.lo, hi: o.ci.rel.hi }
  ];
  return { headline: line(headline, facts), luck, run, odds };
}

/** How a player's goals compare with his xG: one sentence, with the odds behind it. */
export function finishingVerdict(league: League, id: string): { sentence: string; facts: Facts } {
  const f = finishingExperiment(league, id);
  const facts: Facts = { g: f.goals, xg: f.xg, hot: f.pAtLeast, cold: f.pAtMost, diff: Math.abs(f.diff) };
  const sentence = f.verdict === 'above' ? pick(id, [`Finishing that sharp comes up in only ${f.pAtLeast}% of seasons for chances like his.`, `His chances would produce that many goals in just ${f.pAtLeast}% of seasons.`])
    : f.verdict === 'below' ? pick(id, [`Finishing that wasteful happens in only ${f.pAtMost}% of seasons for chances like his.`, `He's left goals out there: a shortfall that big turns up in ${f.pAtMost}% of seasons.`])
      : f.diff >= 3 ? `Hot, but not freakish: chances like his give a run like that in ${f.pAtLeast}% of seasons.`
        : f.diff <= -3 ? `Below par, though within normal variance (${f.pAtMost}% of seasons).`
          : pick(id, ["That's about what his chances deserve.", "He's scoring the chances he should."]);
  return { sentence, facts };
}

export function finishingLine(league: League, id: string): Line {
  const f = finishingExperiment(league, id);
  const v = finishingVerdict(league, id);
  return line(`${f.goals} goals from ${f.xg} xG. ${v.sentence}`, v.facts);
}

// ---------------- roles, stats and league ranks ----------------

export const ROLE_NAME: Record<Role, string> = { GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker' };
const ROLE_PLURAL: Record<Role, string> = { GK: 'keepers', CB: 'centre-backs', FB: 'full-backs', DM: 'defensive midfielders', CM: 'central midfielders', AM: 'attacking midfielders', W: 'wingers', ST: 'strikers' };
export const roleOf = (p: Player): Role => p.role ?? ({ GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' } as const)[p.pos];

export type StatKey = 'goals' | 'assists' | 'xg' | 'overxg' | 'shots' | 'onTargetPct' | 'keyPasses' | 'progPasses' | 'progCarries' | 'crosses' | 'dribbles'
  | 'tackles' | 'interceptions' | 'clearances' | 'blocks' | 'aerials' | 'passAcc' | 'cleanSheets' | 'saves' | 'savePct' | 'prevented' | 'yellow' | 'red' | 'apps';

export const STAT: Record<StatKey, { label: string; unit: string; get: (p: Player) => number; digits?: number }> = {
  apps: { label: 'Apps', unit: 'appearances', get: (p) => p.apps ?? 0 },
  goals: { label: 'Goals', unit: 'goals', get: (p) => p.goals },
  assists: { label: 'Assists', unit: 'assists', get: (p) => p.assists ?? 0 },
  xg: { label: 'xG', unit: 'xG', get: (p) => p.xg ?? 0, digits: 1 },
  overxg: { label: 'Goals − xG', unit: 'goals above xG', get: (p) => Math.round((p.goals - (p.xg ?? 0)) * 10) / 10, digits: 1 },
  shots: { label: 'Shots', unit: 'shots', get: (p) => p.shots ?? 0 },
  onTargetPct: { label: 'On target', unit: '% on target', get: (p) => ((p.shots ?? 0) ? Math.round(((p.onTarget ?? 0) / p.shots!) * 100) : 0) },
  keyPasses: { label: 'Key passes', unit: 'key passes', get: (p) => p.keyPasses ?? 0 },
  progPasses: { label: 'Prog. passes', unit: 'progressive passes', get: (p) => p.progPasses ?? 0 },
  progCarries: { label: 'Prog. carries', unit: 'progressive carries', get: (p) => p.progCarries ?? 0 },
  crosses: { label: 'Crosses', unit: 'completed crosses', get: (p) => p.crosses ?? 0 },
  dribbles: { label: 'Dribbles', unit: 'successful dribbles', get: (p) => p.dribbles ?? 0 },
  tackles: { label: 'Tackles', unit: 'tackles', get: (p) => p.tackles ?? 0 },
  interceptions: { label: 'Interceptions', unit: 'interceptions', get: (p) => p.interceptions ?? 0 },
  clearances: { label: 'Clearances', unit: 'clearances', get: (p) => p.clearances ?? 0 },
  blocks: { label: 'Blocks', unit: 'blocks', get: (p) => p.blocks ?? 0 },
  aerials: { label: 'Aerials won', unit: 'aerial duels won', get: (p) => p.aerials ?? 0 },
  passAcc: { label: 'Pass %', unit: '% pass accuracy', get: (p) => p.passAcc ?? 0, digits: 1 },
  cleanSheets: { label: 'Clean sheets', unit: 'clean sheets', get: (p) => p.cleanSheets ?? 0 },
  saves: { label: 'Saves', unit: 'saves', get: (p) => p.saves ?? 0 },
  savePct: { label: 'Save %', unit: '% of shots on target saved', get: (p) => ((p.saves ?? 0) + (p.conceded ?? 0) ? Math.round(((p.saves ?? 0) / ((p.saves ?? 0) + (p.conceded ?? 0))) * 100) : 0) },
  prevented: { label: 'Goals prevented', unit: 'goals prevented', get: (p) => p.prevented ?? 0, digits: 1 },
  yellow: { label: 'Yellow', unit: 'yellow cards', get: (p) => p.yellow ?? 0 },
  red: { label: 'Red', unit: 'red cards', get: (p) => p.red ?? 0 }
};

/** The numbers a player in each role is judged on, most telling first. */
export const ROLE_STATS: Record<Role, StatKey[]> = {
  GK: ['cleanSheets', 'saves', 'savePct', 'prevented', 'passAcc'],
  CB: ['clearances', 'aerials', 'interceptions', 'tackles', 'progPasses'],
  FB: ['tackles', 'interceptions', 'crosses', 'progCarries', 'keyPasses'],
  DM: ['tackles', 'interceptions', 'progPasses', 'passAcc', 'keyPasses'],
  CM: ['progPasses', 'keyPasses', 'assists', 'passAcc', 'tackles'],
  AM: ['keyPasses', 'assists', 'goals', 'dribbles', 'progCarries'],
  W: ['goals', 'assists', 'dribbles', 'crosses', 'keyPasses'],
  ST: ['goals', 'xg', 'shots', 'onTargetPct', 'aerials']
};

/** Rank among players in the same role with ten or more appearances, or among everyone in the league (ties share a rank). */
export function leagueRank(league: League, p: Player, key: StatKey, scope: 'role' | 'league' = 'role'): { rank: number; of: number } | null {
  const pool = scope === 'league' ? league.players : league.players.filter((x) => (x.apps ?? 0) >= 10 && roleOf(x) === roleOf(p));
  if (!pool.includes(p)) return null;
  const v = STAT[key].get(p);
  return { rank: 1 + pool.filter((x) => STAT[key].get(x) > v).length, of: pool.length };
}

export interface StatTile { key: StatKey; label: string; value: string; rank?: { rank: number; of: number } }

export function statTiles(league: League, p: Player): StatTile[] {
  const fmt = (k: StatKey) => { const v = STAT[k].get(p); return STAT[k].digits ? v.toFixed(STAT[k].digits) : String(v); };
  const keys = ROLE_STATS[roleOf(p)];
  return [{ key: 'apps' as StatKey, label: 'Apps', value: fmt('apps') }, ...keys.map((k) => ({ key: k, label: STAT[k].label, value: fmt(k), rank: leagueRank(league, p, k) ?? undefined }))];
}

/** Bookings in context: where he sits in the whole league, against the average in his role. */
export function disciplineLine(league: League, p: Player, subject?: string): Line | null {
  const y = p.yellow ?? 0, r = p.red ?? 0;
  if (y < 5 && r === 0) return null;
  const who = ROLE_PLURAL[roleOf(p)];
  const peers = league.players.filter((x) => roleOf(x) === roleOf(p) && (x.apps ?? 0) >= 10);
  const avg = Math.round((peers.reduce((a, x) => a + (x.yellow ?? 0), 0) / Math.max(1, peers.length)) * 10) / 10;
  const rank = leagueRank(league, p, 'yellow', 'league')!;
  const cards = `${y} yellow${y === 1 ? '' : 's'}${r ? ` and ${r} red${r === 1 ? '' : 's'}` : ''}`;
  const lead = subject ? `${subject} has ${cards}` : cards;
  const ratio = y / Math.max(0.1, avg);
  const scale = ratio >= 1.8 ? 'about twice' : ratio >= 1.3 ? 'well above' : 'a little above';
  const facts: Facts = { y, r, rank: rank.rank, avg, more: rank.rank - 1 };
  if (rank.rank === 1) return line(`${lead}, more than anyone in the league (${who} average ${avg}).`, facts);
  if (rank.rank <= 10) return line(pick(p.id + 'd', [`${lead}, ${ordinal(rank.rank)} most in the league; ${who} average ${avg}.`, `${lead}, ${scale} the ${avg} ${who} average. Only ${rank.rank - 1} player${rank.rank === 2 ? ' has' : 's have'} more.`]), facts);
  if (y < 5) return line(`${lead}: rarely booked, but sent off ${r === 1 ? 'once' : `${r} times`}.`, facts);
  return line(`${lead}, ${scale} the ${avg} that ${who} average.`, facts);
}

// ---------------- the squad page ----------------

export interface SquadInsight { tag: string; line: Line; player?: string }

export function squadInsights(league: League, s: Standings, imp: SquadImpact | null, code: string): SquadInsight[] {
  const c = s.clubs.find((x) => x.code === code)!;
  const squad = league.players.filter((p) => p.club === code);
  const regulars = squad.filter((p) => (p.apps ?? 0) >= 10);
  const out: SquadInsight[] = [];
  const base = pct(raceProb(c.outlook, c.race).p);
  const race = RACE_NAME[c.race];
  // "3rd among the league's centre-backs": the rank goes into that line's facts so the Verifier can see it
  const among = (p: Player, k: StatKey, facts: Facts) => {
    const r = leagueRank(league, p, k);
    if (!r || r.rank > 5) return '';
    facts.rk = r.rank;
    const who = ROLE_PLURAL[roleOf(p)];
    return r.rank === 1 ? pick(p.id + k, [`, more than any of the league's ${who}`, `, top among the league's ${who}`]) : `, ${ordinal(r.rank)} among the league's ${who}`;
  };

  if (imp?.impacts.length) {
    const k = imp.impacts[0];
    const p = P(league, k.id);
    const w = pct(k.without), d = -k.delta;
    const facts = { d, base, w };
    if (d >= 25) out.push({ tag: 'KEY MAN', player: p.id, line: line(pick(code + 'k', [`${sur(p)} is the one they can't lose. Without him all season, their chance to ${race} falls from ${base}% to ${w}%.`, `Everything runs through ${sur(p)}: take him out for the season and their chance to ${race} drops from ${base}% to ${w}%.`]), facts) });
    else if (d >= 8) out.push({ tag: 'KEY MAN', player: p.id, line: line(`${sur(p)} matters most. A season without him takes ${d} points off their chance to ${race}.`, facts) });
    else if (d >= 2) out.push({ tag: 'DEPTH', player: p.id, line: line(`No one player carries them. The biggest loss would be ${sur(p)}, and even that costs only ${d} points off their chance to ${race}.`, facts) });
  }

  const scorer = [...squad].sort((a, b) => b.goals - a.goals)[0];
  if (scorer.goals > 0) {
    const share = Math.round((scorer.goals / Math.max(1, c.row.gf)) * 100);
    const v = finishingVerdict(league, scorer.id);
    const lead = share >= 35 ? `${sur(scorer)} has ${scorer.goals} of their ${c.row.gf} goals (${share}%), from ${scorer.xg ?? 0} xG.` : pick(code + 'g', [`${sur(scorer)} is top scorer with ${scorer.goals}, from ${scorer.xg ?? 0} xG.`, `The goals are shared around; ${sur(scorer)} leads with ${scorer.goals} from ${scorer.xg ?? 0} xG.`]);
    out.push({ tag: 'GOALS', player: scorer.id, line: line(`${lead} ${v.sentence}`, { ...v.facts, gf: c.row.gf, share }) });
  }

  const creator = [...regulars].sort((a, b) => (b.keyPasses ?? 0) - (a.keyPasses ?? 0))[0];
  if (creator && (creator.keyPasses ?? 0) > 0) {
    const kp = creator.keyPasses ?? 0, a = creator.assists ?? 0;
    // how often his key passes become assists, against the league's creators
    const creators = league.players.filter((x) => (x.keyPasses ?? 0) >= 20);
    const norm = creators.reduce((s2, x) => s2 + (x.assists ?? 0), 0) / Math.max(1, creators.reduce((s2, x) => s2 + (x.keyPasses ?? 0), 0));
    const ratio = kp >= 20 ? a / kp / norm : 1;
    const facts: Facts = { kp, a };
    const rk = among(creator, 'keyPasses', facts);
    out.push({ tag: 'CREATOR', player: creator.id, line: line(ratio <= 0.5
      ? pick(code + 'c', [`${sur(creator)} makes the most chances (${kp} key passes${rk}), but only ${a} have become assists. His teammates haven't been finishing them.`, `${sur(creator)} has created ${kp} chances${rk}, yet has just ${a} assists to show for it.`])
      : ratio >= 1.4
        ? `${sur(creator)} creates the most, and his chances get finished: ${a} assists from ${kp} key passes${rk}.`
        : `${sur(creator)} creates the most: ${kp} key passes and ${a} assists${rk}.`, facts) });
  }

  const defender = [...regulars].filter((p) => ['CB', 'FB', 'DM'].includes(roleOf(p)))
    .sort((a, b) => ((b.tackles ?? 0) + (b.interceptions ?? 0) + (b.clearances ?? 0) / 2) - ((a.tackles ?? 0) + (a.interceptions ?? 0) + (a.clearances ?? 0) / 2))[0];
  if (defender) {
    const t = defender.tackles ?? 0, i = defender.interceptions ?? 0, cl = defender.clearances ?? 0, ae = defender.aerials ?? 0;
    const role = roleOf(defender);
    const facts: Facts = { t, i, cl, ae };
    const text = role === 'CB' ? `${sur(defender)} holds the back line together: ${cl} clearances and ${ae} aerial duels won${among(defender, 'clearances', facts)}.`
      : role === 'FB' ? `${sur(defender)} does the most defending, from full-back: ${t} tackles and ${i} interceptions${among(defender, 'tackles', facts)}.`
        : `${sur(defender)} screens the defence: ${t} tackles and ${i} interceptions${among(defender, 'tackles', facts)}.`;
    out.push({ tag: 'DEFENCE', player: defender.id, line: line(text, facts) });
  }

  const keeper = squad.find((p) => p.pos === 'GK' && p.starter);
  if (keeper && keeper.prevented !== undefined) {
    const r = leagueRank(league, keeper, 'prevented');
    const g = Math.abs(keeper.prevented), cs = keeper.cleanSheets ?? 0;
    const rank = r ? ` (${ordinal(r.rank)} of ${r.of} keepers)` : '';
    const text = keeper.prevented >= 4 ? `${sur(keeper)} has kept them in games: ${g} goals saved above what an average keeper manages from the same shots${rank}.`
      : keeper.prevented >= 1 ? `${sur(keeper)} is a little above average in goal, ${g} goals better than expected from the shots he's faced${rank}.`
        : keeper.prevented <= -2 ? `Goalkeeping is costing them: ${sur(keeper)} has let in ${g} more than an average keeper would from the same shots${rank}.`
          : `${sur(keeper)} saves roughly what an average keeper would, so his ${cs} clean sheets owe more to the defence in front of him.`;
    out.push({ tag: 'KEEPER', player: keeper.id, line: line(text, { g, rank: r?.rank ?? 0, of: r?.of ?? 0, cs }) });
  }

  const booked = [...squad].sort((a, b) => (b.yellow ?? 0) - (a.yellow ?? 0) || (b.red ?? 0) - (a.red ?? 0))[0];
  const d = disciplineLine(league, booked, sur(booked));
  if (d && (leagueRank(league, booked, 'yellow', 'league')?.rank ?? 99) <= 25) out.push({ tag: 'DISCIPLINE', player: booked.id, line: d });
  return out;
}

// ---------------- leaderboards and the player card ----------------

export interface BoardDef { id: StatKey; label: string; pool?: (p: Player) => boolean }
/** On show by default. */
export const BOARDS: BoardDef[] = [
  { id: 'goals', label: 'Goals' },
  { id: 'assists', label: 'Assists' },
  { id: 'overxg', label: 'Beating xG', pool: (p) => p.goals >= 5 },
  { id: 'yellow', label: 'Yellow cards' },
  { id: 'red', label: 'Red cards' }
];
/** Behind "More stats": what defenders, creators and keepers are judged on. */
export const MORE_BOARDS: { group: string; boards: BoardDef[] }[] = [
  { group: 'Creating', boards: [{ id: 'keyPasses', label: 'Key passes' }, { id: 'progPasses', label: 'Progressive passes' }, { id: 'dribbles', label: 'Dribbles' }] },
  { group: 'Defending', boards: [{ id: 'tackles', label: 'Tackles' }, { id: 'interceptions', label: 'Interceptions' }, { id: 'clearances', label: 'Clearances' }, { id: 'aerials', label: 'Aerial duels won' }] },
  { group: 'Keeping', boards: [{ id: 'cleanSheets', label: 'Clean sheets', pool: (p) => p.pos === 'GK' }, { id: 'prevented', label: 'Goals prevented', pool: (p) => p.pos === 'GK' && (p.apps ?? 0) >= 10 }, { id: 'savePct', label: 'Save %', pool: (p) => p.pos === 'GK' && (p.apps ?? 0) >= 10 }] }
];
export const ALL_BOARDS = [...BOARDS, ...MORE_BOARDS.flatMap((g) => g.boards)];

export function leaderboard(league: League, b: StatKey, size = 10): { p: Player; v: number; rank: number }[] {
  const def = ALL_BOARDS.find((x) => x.id === b);
  const pool = league.players.filter((p) => def?.pool?.(p) ?? true);
  const sorted = pool.map((p) => ({ p, v: STAT[b].get(p) })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v || x.p.name.localeCompare(y.p.name)).slice(0, size);
  return sorted.map((x) => ({ ...x, rank: sorted.findIndex((y) => y.v === x.v) + 1 }));
}

export type RaceBoard = 'goals' | 'assists' | 'cleanSheets';
export const RACE_LABEL: Record<RaceBoard, string> = { goals: 'TOP SCORER RACE', assists: 'ASSISTS RACE', cleanSheets: 'CLEAN SHEETS RACE' };

export interface PlayerCard { role: Role; tiles: StatTile[]; lines: Line[]; race?: { board: RaceBoard; line: RaceLine } }

/** A race is only shown where the player is genuinely in it. */
const contender = (l?: RaceLine) => !!l && (l.top >= 0.01 || l.top3 >= 0.1);

export function playerCard(league: League, r: Races | null, id: string): PlayerCard {
  const p = P(league, id);
  const role = roleOf(p);
  const lines: Line[] = [];
  const find = (b: RaceBoard) => r?.[b]?.find((x) => x.id === id);
  const order: RaceBoard[] = role === 'GK' ? ['cleanSheets'] : role === 'ST' || role === 'W' ? ['goals', 'assists'] : role === 'AM' || role === 'CM' ? ['assists', 'goals'] : ['goals', 'assists'];
  const board = order.find((b) => contender(find(b)));
  const race = board ? { board, line: find(board)! } : undefined;
  // the one or two things worth saying about this player, by role
  if (role === 'GK' && p.prevented !== undefined && (p.apps ?? 0) >= 5) {
    const rk = leagueRank(league, p, 'prevented');
    const g = Math.abs(p.prevented);
    const rank = rk ? `${ordinal(rk.rank)} of ${rk.of} keepers` : '';
    lines.push(line(p.prevented >= 1 ? `${g} goals saved beyond what an average keeper would manage from the same shots${rank ? `: ${rank}` : ''}.`
      : p.prevented <= -1 ? `${g} more goals conceded than an average keeper would let in from the same shots${rank ? ` (${rank})` : ''}.`
        : 'Saves roughly what an average keeper would from the shots he faces.', { g, rank: rk?.rank ?? 0, of: rk?.of ?? 0 }));
  } else if (p.goals >= 3) lines.push(finishingLine(league, id));
  if (role !== 'GK') {
    const best = ROLE_STATS[role].map((k) => ({ k, r: leagueRank(league, p, k) })).filter((x) => x.r && x.r.rank <= 5).sort((a, b) => a.r!.rank - b.r!.rank)[0];
    if (best) {
      const v = STAT[best.k].get(p);
      const value = (STAT[best.k].digits ? v.toFixed(STAT[best.k].digits) : String(v)) + (STAT[best.k].unit.startsWith('%') ? '' : ' ');
      const who = ROLE_PLURAL[role];
      const facts = { v, rank: best.r!.rank, of: best.r!.of };
      lines.push(line(best.r!.rank === 1
        ? pick(id + best.k, [`No ${who.replace(/s$/, '')} in the league has more than his ${value}${STAT[best.k].unit}.`, `${value}${STAT[best.k].unit}, the most of the league's ${best.r!.of} ${who}.`])
        : `${value}${STAT[best.k].unit}, ${ordinal(best.r!.rank)} of the league's ${best.r!.of} ${who}.`, facts));
    }
  }
  const disc = disciplineLine(league, p);
  if (disc) lines.push(disc);
  if (!lines.length) lines.push(line(`${sur(p)} has played ${p.apps ?? 0} league games this season.`, { apps: p.apps ?? 0 }));
  return { role, tiles: statTiles(league, p), lines, race };
}

/** "Without him": his club's race chance with him out for the season. */
export function impactLine(league: League, imp: PlayerImpact): Line {
  const p = P(league, imp.id);
  const club = C(league, p.club).short;
  const b = pct(imp.base), w = pct(imp.without), d = Math.abs(imp.delta);
  const what = RACE_NAME[imp.race];
  const facts = { b, w, d };
  if (d < 1) return line(pick(imp.id + 'i', [`${club} would barely notice a season without him: their chance to ${what} stays around ${b}%.`, `Losing him for the season wouldn't move ${club}'s chance to ${what} (about ${b}%).`]), facts);
  if (imp.delta > 0) return line(`${club}'s chance to ${what} actually rises without him (${b}% → ${w}%): the model rates the player who'd replace him slightly higher.`, facts);
  if (d >= 35) return line(`Without him all season, ${club}'s chance to ${what} collapses from ${b}% to ${w}%.`, facts);
  if (d >= 15) return line(pick(imp.id + 'i', [`Without him all season, ${club}'s chance to ${what} falls sharply, from ${b}% to ${w}%.`, `${club} would feel his absence: their chance to ${what} drops from ${b}% to ${w}% without him.`]), facts);
  return line(`A season without him takes ${club}'s chance to ${what} from ${b}% to ${w}%.`, facts);
}

export const clubOf = (s: Standings, code: string): ClubSummary => s.clubs.find((c) => c.code === code)!;
