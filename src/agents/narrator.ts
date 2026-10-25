// The Narrator: writes the story from the Analyst's facts, for a given audience.
// Mock mode = templates (templates/*.ts and below). Live mode = a model with the same facts,
// see live.ts. Either way the Verifier reads every draft before anyone else does.

import type { DemoMatch, League } from '../data/types';
import type { ClubOutlook, Row } from '../engine/season';
import { momentById, type RippleResult, type UniverseResult, type Lever } from '../engine/league';
import type { CallExperiment, DeserveExperiment, FinishingExperiment, KeeperExperiment, ReplayExperiment, ValueExperiment, WpaExperiment } from '../engine/settle';
import type { MomentResult } from '../engine/demo';
import { raceRangeFacts, rippleMovers, type ClubMove } from './analyst';
import { ordinal, signed, thousands, type Persona } from './format';
import type { Facts } from './verifier';
import type { Parsed } from './drFootball';
import { finishingVerdict } from './currentAffairs';

const C = (league: League, code: string) => league.clubs.find((c) => c.code === code)!;
const P = (x: number) => Math.round(x * 100);
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const poss = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

// ---------------- Ripple stories ----------------

export interface Story { key: string; tag: string; tone: 'home' | 'away' | 'neutral'; head: string; stat: string; statGood: boolean; body: string; facts: Facts }

type Race = 'title' | 'top4' | 'rel';
const RACE_NAME: Record<Race, string> = { title: 'Title', top4: 'Top four', rel: 'Relegation' };

/** The race a club is really in, judged by where the run-ins put it. */
function raceOf(o: ClubOutlook, b: ClubOutlook): Race | null {
  const live = (x: number, y: number) => (x > 0.02 && x < 0.98) || (y > 0.02 && y < 0.98);
  if (live(o.title, b.title) && Math.max(o.title, b.title) > 0.1) return 'title';
  if (live(o.top4, b.top4)) return 'top4';
  if (live(o.rel, b.rel)) return 'rel';
  return null;
}

export function rippleStories(league: League, r: RippleResult, persona: Persona, feed: DemoMatch = league.demo): Story[] {
  const H = feed.home, A = feed.away;
  const posOf = (t: Row[], c: string) => t.findIndex((x) => x.code === c) + 1;
  const row = (t: Row[], c: string) => t.find((x) => x.code === c)!;
  const games = (c: string) => 38 - row(r.tableAfter, c).p;
  const mv = rippleMovers(league, r, [H, A]);
  const res = r.result.hg > r.result.ag ? 'home' : r.result.hg < r.result.ag ? 'away' : 'draw';
  const stories: Story[] = [];

  for (const [code, side] of [[H, 'home'], [A, 'away']] as const) {
    const name = C(league, code).short;
    const race = raceOf(r.after[code], r.before[code]);
    const pa = posOf(r.tableAfter, code), pb = posOf(r.tableBefore, code);
    const tag = `${name.toUpperCase()} · ${ordinal(pa).toUpperCase()}`;
    const won = res === side, lost = res !== 'draw' && res !== side;
    if (!race) {
      stories.push({ key: code, tag, tone: side, head: `Nothing much changes for ${name}`, stat: `${ordinal(pb)} → ${ordinal(pa)}`, statGood: pa <= pb,
        body: `${won ? 'Three points' : lost ? 'A defeat' : 'A point'}, but with ${pl(games(code), 'game')} left ${name} are settled in mid-table either way.`, facts: { pa, pb, g: games(code) } });
      continue;
    }
    const b = P(r.before[code][race]), a = P(r.after[code][race]);
    const good = race === 'rel' ? a <= b : a >= b;
    let head = '';
    let body = '';
    const t = r.tableAfter;
    const nums: Facts = {};
    if (race === 'rel') {
      const out = pb >= 18 && pa <= 17, into = pb <= 17 && pa >= 18;
      const clear = row(t, code).pts - t[17].pts;
      nums.clear = clear; nums.moved = pb - pa;
      head = out ? `${name} climb out of the bottom three` : into ? `${name} drop into the bottom three` : good ? `${poss(name)} relegation risk falls` : `${name} sink deeper`;
      body = pb !== pa ? `${pb > pa ? 'Up' : 'Down'} ${pl(Math.abs(pb - pa), 'place')}, ${clear > 0 ? `${pl(clear, 'point')} clear of the bottom three` : clear === 0 ? 'level on points with the bottom three' : `${pl(-clear, 'point')} from safety`}.` : `Still ${ordinal(pa)}, ${clear > 0 ? `${pl(clear, 'point')} clear of the bottom three` : `${pl(Math.abs(clear), 'point')} from safety`}.`;
    } else if (race === 'top4') {
      const gap = t[3].pts - row(t, code).pts;
      const chaser = t[pa] ?? t[pa - 2];
      const chaserGap = row(t, code).pts - chaser.pts;
      nums.gap = gap; nums.chaserGap = chaserGap;
      head = good ? `${name} tighten their grip on the top four` : `${poss(name)} top-four chances fall`;
      body = `${gap > 0 ? `${pl(gap, 'point')} behind ${C(league, t[3].code).short}` : gap === 0 ? `Level on points with ${C(league, t[3].code).short}` : `${pl(-gap, 'point')} clear in the top four`} with ${pl(games(code), 'game')} left${chaser.code !== code ? `, and ${C(league, chaser.code).short} ${chaserGap === 0 ? 'level' : `${pl(Math.abs(chaserGap), 'point')} ${chaserGap > 0 ? 'back' : 'ahead'}`}${row(t, chaser.code).p < row(t, code).p ? ' with a game in hand' : ''}` : ''}.`;
    } else {
      const lead = row(t, code).pts - (t[0].code === code ? t[1].pts : t[0].pts);
      nums.lead = lead;
      head = good ? `${name} strengthen their title bid` : `${poss(name)} title hopes take a hit`;
      body = t[0].code === code ? `Top, ${pl(lead, 'point')} clear with ${pl(games(code), 'game')} left.` : `${pl(-lead, 'point')} behind ${C(league, t[0].code).short} with ${pl(games(code), 'game')} left.`;
    }
    stories.push({ key: code, tag, tone: side, head, stat: `${RACE_NAME[race]} ${b}% → ${a}%`, statGood: good, body, facts: { b, a, pa, pb, g: games(code), ...nums } });
  }

  // clubs who didn't play but felt it
  const extra = (m: ClubMove | undefined, race: Race) => {
    if (!m || Math.abs(m.delta) < 2) return;
    const fx = league.fixtures.find((f) => f.mw === league.currentMw && (f.home === m.code || f.away === m.code));
    const unplayed = fx && fx.hg === undefined && fx.id !== league.demo.fixtureId;
    const opp = fx ? (fx.home === m.code ? fx.away : fx.home) : '';
    const gain = race === 'rel' ? m.delta < 0 : m.delta > 0;
    stories.push({
      key: `${m.code}-${race}`, tag: `${C(league, m.code).short.toUpperCase()} · ${unplayed ? 'PLAYS LATER' : 'DIDN’T PLAY IN THIS ONE'}`, tone: 'neutral',
      head: gain ? `${C(league, m.code).short} gain without kicking a ball` : `${C(league, m.code).short} feel it too`,
      stat: `${RACE_NAME[race]} ${m.before}% → ${m.after}%`, statGood: gain,
      body: unplayed && fx ? `Their ${fx.kickoff} kick-off against ${C(league, opp).short} matters ${gain ? 'more' : 'even more'} now.` : `They played earlier. Of the clubs outside this match, nobody’s ${race === 'top4' ? 'top-four' : race === 'rel' ? 'relegation' : 'title'} chances moved more.`,
      facts: { b: m.before, a: m.after, ko: fx?.kickoff ?? '' }
    });
  };
  const top4Move = [mv.top4Gainer, mv.top4Loser].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  extra(top4Move, 'top4');
  const [l1, l2] = mv.relLosers;
  if (l1 && l2 && l1.delta >= 2) {
    stories.push({
      key: 'rel', tag: `${C(league, l1.code).short.toUpperCase()} & ${C(league, l2.code).short.toUpperCase()}`, tone: 'neutral',
      head: 'Two more clubs dragged into the fight', stat: `Relegation ${signed(l1.delta)} / ${signed(l2.delta)}`, statGood: false,
      body: `This result pushes ${C(league, l1.code).short} (${l1.before}% → ${l1.after}%) and ${C(league, l2.code).short} (${l2.before}% → ${l2.after}%) deeper into trouble.`,
      facts: { a1: l1.after, b1: l1.before, a2: l2.after, b2: l2.before, d1: l1.delta, d2: l2.delta }
    });
  } else extra(mv.relGainers[0], 'rel');
  if (stories.length < 4) extra(mv.titleMover, 'title');
  const fanOf = persona === 'home' ? H : persona === 'away' ? A : null;
  const voiced = stories.map((st) => {
    if (persona === 'analyst') return { ...st, body: `${st.body} ${thousands(r.n)} run-ins.`, facts: { ...st.facts, n: r.n } };
    if (!fanOf || st.key !== fanOf) return st;
    const name = C(league, fanOf).short;
    const head = st.head.replace(`${name}’s`, 'Our').replace(new RegExp(`^${name} `), 'We ').replace(new RegExp(`for ${name}$`), 'for us');
    return { ...st, head, tone: st.tone };
  });
  if (persona === 'away') return [voiced[1], voiced[0], ...voiced.slice(2)].slice(0, 4);
  return voiced.slice(0, 4);
}

/** One line per club for My Dugout: "if it ends like this". */
export function rippleLine(_league: League, r: RippleResult, code: string): string {
  const b4 = P(r.before[code].top4), a4 = P(r.after[code].top4);
  const br = P(r.before[code].rel), ar = P(r.after[code].rel);
  const bt = P(r.before[code].title), at = P(r.after[code].title);
  if (Math.abs(at - bt) >= 2 && (bt > 5 || at > 5)) return `Title chances ${at > bt ? 'up' : 'down'} from ${bt}% to ${at}%.`;
  if (Math.abs(a4 - b4) >= 2 && (b4 > 2 || a4 > 2)) return `Top-four chances ${a4 > b4 ? 'up' : 'down'} from ${b4}% to ${a4}%.`;
  if (Math.abs(ar - br) >= 2 && (br > 2 || ar > 2)) return `Relegation chances ${ar > br ? 'up' : 'down'} from ${br}% to ${ar}%.`;
  if (b4 >= 95) return `No real change. Top four stays at ${a4}%.`;
  if (br >= 95) return `No change. Relegation stays at ${ar}%.`;
  return 'No real change.';
}

// ---------------- Settle It ----------------

export interface SettleView {
  test: string;
  bars?: { label: string; w: number; d: number; l: number; highlight: boolean }[];
  rates?: { label: string; v: number; lo?: number; hi?: number; highlight: boolean }[];
  rangeText?: string;
  table?: { cols: string[]; rows: string[][]; highlight?: number };
  effect: string; effectTone: 'good' | 'neutral' | 'muted'; effectNote: string;
  analyst: string;
  answer: string; line: string;
  gfx: { kicker: string; big: string; sub: string };
  script: string;
  facts: Facts;
}

export function settleReplay(league: League, e: ReplayExperiment, kind: 'sub' | 'penalty' | 'tactic', moments: MomentResult[]): SettleView {
  const pick = (a: { home: number; away: number }) => (e.focus === 'home' ? a.home : a.away);
  const asH = pick(e.asHappened), alt = pick(e.alternative);
  const team = C(league, e.focus === 'home' ? league.demo.home : league.demo.away).short;
  const se2 = Math.round(e.se * 2);
  const bars = [e.asHappened, e.alternative].map((x, i) => ({ label: x.label, w: x.home, d: x.draw, l: x.away, highlight: i === 1 }));
  const facts: Facts = { asH, alt, n: e.n, from: e.from, se2, effect: e.effect, ...Object.fromEntries(bars.flatMap((b, i) => [[`w${i}`, b.w], [`d${i}`, b.d], [`l${i}`, b.l]])) };
  const top = [...moments].sort((a, b) => b.impact - a.impact).slice(0, 2).sort((a, b) => a.minute - b.minute);
  const momentName = (m: MomentResult) => {
    const km = league.demo.keyMoments.find((k) => k.id === m.id)!;
    const e2 = league.demo.events.find((x) => x.id === km.eventId)!;
    const who = league.players.find((p) => p.id === e2.player)?.name.split(' ').slice(1).join(' ');
    facts[`m${m.minute}`] = Math.floor(m.minute);
    return km.kind === 'penalty_saved' ? `the saved penalty at ${Math.floor(m.minute)}′` : km.kind === 'double_save' ? `the double save at ${Math.floor(m.minute)}′` : `${who}’s ${km.kind === 'late_header_winner' ? 'header' : 'goal'} at ${Math.floor(m.minute)}′`;
  };
  if (kind === 'sub') {
    const name = e.alternative.label.replace(' stays on', '');
    const material = Math.abs(e.effect) >= 5 && e.significant;
    facts.decisive = material;
    return {
      test: `Replayed the match from ${e.from}′ ${thousands(e.n)} times with ${name} kept on instead of being substituted. Everything else held the same.`,
      bars, effect: `${signed(e.effect)} PTS (±${se2})`, effectTone: material ? 'good' : 'muted',
      effectNote: material ? 'Big enough to matter.' : e.significant ? 'Real, but too small to have decided the match.' : 'Inside the normal range of random variation.',
      analyst: material ? `Keeping ${name} on would have shifted ${team}’s win chance by ${Math.abs(e.effect)} points. It mattered, but ${momentName(top[0])} and ${momentName(top[1])} still moved the match more.` : `The substitution barely moved anything. What decided this match was ${momentName(top[0])} and ${momentName(top[1])}.`,
      answer: material ? 'Partly.' : 'No.',
      line: material ? `Keeping ${name} on lifts ${team} from ${asH}% to ${alt}% of replays.` : `Keeping ${name} on makes no real difference: ${team} win ${alt}% of replays, against ${asH}% as it happened.`,
      gfx: { kicker: 'WAS IT THE SUB?', big: material ? 'PARTLY' : 'NO', sub: `Win chance with ${name} on ${alt}% · as it happened ${asH}%` },
      script: material ? `Partly. We replayed it ${thousands(e.n)} times with ${name} on the pitch, and ${team} win ${alt}% of those, against ${asH}% with the change.` : `Short answer: no. We replayed it ${thousands(e.n)} times with ${name} on the pitch, and ${team} win ${alt}% of those, against ${asH}% with the change. Bigger moments decided this one.`,
      facts
    };
  }
  if (kind === 'tactic') {
    const worked = e.effect >= 3 && e.significant;
    const big = e.effect >= 6;
    const opp = C(league, e.focus === 'home' ? league.demo.away : league.demo.home).short;
    facts.decisive = worked;
    const oppAsH = e.focus === 'home' ? e.asHappened.away : e.asHappened.home;
    const oppAlt = e.focus === 'home' ? e.alternative.away : e.alternative.home;
    Object.assign(facts, { oppAsH, oppAlt });
    return {
      test: `Replayed the match from ${e.from}′ ${thousands(e.n)} times, with and without ${team}’s switch to a back five. Same score, same players.`,
      bars, effect: `${signed(e.effect)} PTS (±${se2})`, effectTone: worked ? 'good' : 'muted',
      effectNote: worked ? (big ? 'A real effect on the result.' : 'Real, but modest.') : e.significant ? 'Real, but small.' : 'Inside the normal range of random variation.',
      analyst: `Sitting deeper cut ${opp}’s chance of winning from ${oppAsH}% to ${oppAlt}% of replays, and lifted ${team}’s from ${asH}% to ${alt}%.`,
      answer: worked && big ? 'Yes.' : e.effect > 0 ? 'A little.' : 'No.',
      line: `${team} win ${alt}% of replays with the back five and ${asH}% without it.`,
      gfx: { kicker: 'DID THE BACK FIVE WORK?', big: `${signed(e.effect)} PTS`, sub: `${team} win chance with it ${alt}% · without ${asH}%` },
      script: `${worked && big ? 'It did.' : worked ? 'It helped, a little.' : 'Not by much.'} We replayed the last half hour ${thousands(e.n)} times both ways. With five at the back, ${team} win ${alt}% of them; without, ${asH}%.`,
      facts
    };
  }
  const taker = e.alternative.label.replace(' scores', '');
  const word = alt >= 75 ? 'Very likely.' : alt >= 55 ? 'Probably.' : alt >= 40 ? 'Maybe.' : 'Probably not.';
  const xgH = Math.round(league.demo.events.filter((x) => x.team === 'home' && x.minute <= e.from && x.xg && x.type !== 'penalty_saved').reduce((s, x) => s + x.xg!, 0) * 100) / 100;
  const xgA = Math.round(league.demo.events.filter((x) => x.team === 'away' && x.minute <= e.from && x.xg).reduce((s, x) => s + x.xg!, 0) * 100) / 100;
  const minsLeft = 90 - e.from;
  Object.assign(facts, { xgH, xgA, minsLeft, certain: alt >= 95 });
  const mine = e.focus === 'home' ? xgH : xgA, theirs = e.focus === 'home' ? xgA : xgH;
  const oppName = C(league, e.focus === 'home' ? league.demo.away : league.demo.home).short;
  const xgNote = mine > theirs ? `and ${team} had already created more (${mine} xG to ${theirs} before the penalty).` : `and chase it. They had created more until then (${theirs} xG to ${mine}), but`;
  return {
    test: `Replayed the match from ${e.from}′ ${thousands(e.n)} times with the penalty scored, making it 2–1 to ${team}.`,
    bars, effect: `${signed(e.effect)} PTS (±${se2})`, effectTone: e.effect > 0 ? 'good' : 'neutral',
    effectNote: e.significant ? 'Far outside random variation.' : 'Inside the normal range of random variation.',
    analyst: mine > theirs ? `At 2–1 with ${minsLeft} minutes left, ${oppName} would have had to come out, ${xgNote} The lead holds in most replays.` : `At 2–1 with ${minsLeft} minutes left, ${oppName} would have had to come out ${xgNote} the lead holds in most replays.`,
    answer: word, line: `Score the penalty and ${team} win ${alt} times out of 100.`,
    gfx: { kicker: `IF ${taker.toUpperCase()} SCORES`, big: `${alt}%`, sub: `${team} win · ${thousands(e.n)} replays from ${e.from}′` },
    script: `${word} Score that penalty and ${team} win ${alt} times out of 100 in our replays, against ${asH} as it happened. That was the moment this match turned.`,
    facts
  };
}

/** Draft 1 echoes the question's superlative; the Verifier is there to catch exactly this. */
export function settleKeepers(_league: League, k: KeeperExperiment, draft: number): SettleView {
  const s = k.subject;
  const surname = s.name.split(' ').slice(1).join(' ');
  const oneIn = Math.round(100 / k.leagueAvg);
  const facts: Facts = { saved: s.saved, faced: s.faced, rate: s.rate, lo: s.lo, hi: s.hi, avg: k.leagueAvg, total: k.totalPenalties, minFaced: k.minFaced, better: k.better.length, oneIn, diff: s.rate - k.leagueAvg, clearlyBest: k.clearlyBest, rank: k.rank, pool: k.pool };
  const answer = k.clearlyBest ? 'Yes.' : k.clearlyAbove ? 'Above average.' : 'Can’t say yet.';
  const eager = draft === 1 && s.rate > k.leagueAvg;
  return {
    test: `Pulled all ${k.totalPenalties} penalties in the league data and compared ${surname} with every keeper who has faced at least ${k.minFaced}.`,
    rates: [
      { label: 'League average', v: k.leagueAvg, highlight: false },
      { label: `${surname} (${s.saved} of ${s.faced} saved)`, v: s.rate, lo: s.lo, hi: s.hi, highlight: true }
    ],
    rangeText: `LIKELY RANGE ${s.lo}–${s.hi}% · ${s.faced} PENALTIES`,
    effect: `${signed(s.rate - k.leagueAvg)} PTS`, effectTone: 'neutral',
    effectNote: k.clearlyAbove ? 'Clearly above average.' : 'Above average, but the range is too wide to rank him.',
    analyst: `${word2(s.saved)} saves from ${s.faced} is a good record, but ${s.faced} penalties is far too few to call him the best. ${k.better.length} keeper${k.better.length === 1 ? ' has a' : 's have'} higher save rate${k.better.length === 1 ? '' : 's'} from bigger samples.`,
    answer: eager ? 'Yes.' : answer,
    line: eager ? `${surname} is the best penalty stopper in the league: ${s.saved} of ${s.faced} saved, well above the ${k.leagueAvg}% average.` : `Above average, but ${s.faced} penalties is too small a sample to call him the best.`,
    gfx: { kicker: `${surname.toUpperCase()} V PENALTIES`, big: `${s.saved} / ${s.faced}`, sub: `Saved · league average about 1 in ${oneIn} · sample too small to rank` },
    script: eager
      ? `Yes. ${surname} is the best penalty stopper in the league, with ${s.saved} saves from ${s.faced}.`
      : `Not yet. ${surname} has saved ${s.saved} of the ${s.faced} penalties he’s faced, which is better than the league average of about 1 in ${oneIn}. But ${s.faced} is a tiny sample, and ${k.better.length} keeper${k.better.length === 1 ? ' has' : 's have'} better records over more penalties.`,
    facts
  };
}
const word2 = (n: number) => ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n);

export function settleDeserve(league: League, d: DeserveExperiment, feed: DemoMatch = league.demo): SettleView {
  const H = C(league, feed.home).short, A = C(league, feed.away).short;
  const homeWonOnChances = d.home >= d.away + 15;
  const actualWinner = d.actual.home > d.actual.away ? 'home' : d.actual.away > d.actual.home ? 'away' : 'draw';
  const deserved = actualWinner === 'home' ? d.home > d.away : actualWinner === 'away' ? d.away > d.home : Math.abs(d.home - d.away) < 15;
  const facts: Facts = { home: d.home, draw: d.draw, away: d.away, xgH: d.xg.home, xgA: d.xg.away, sh: d.shots.home, sa: d.shots.away, n: d.n, ah: d.actual.home, aa: d.actual.away };
  const awayWonOnChances = d.away >= d.home + 15;
  const winnerName = actualWinner === 'home' ? H : actualWinner === 'away' ? A : '';
  const answer = actualWinner !== 'draw' && deserved ? `${winnerName} deserved it.` : homeWonOnChances ? `${H} deserved it.` : awayWonOnChances ? `${A} deserved it.` : actualWinner === 'draw' ? 'A fair draw.' : 'Too close to call.';
  return {
    test: `Replayed every shot of the match ${thousands(d.n)} times, each one going in as often as its xG says.`,
    bars: [{ label: `Replays (${d.xg.home} xG v ${d.xg.away} xG)`, w: d.home, d: d.draw, l: d.away, highlight: true }],
    effect: `xG ${d.xg.home} – ${d.xg.away}`, effectTone: 'neutral', effectNote: `Real score ${d.actual.home}–${d.actual.away}.`,
    analyst: `${H} had ${d.shots.home} shots worth ${d.xg.home} xG; ${A} had ${d.shots.away} worth ${d.xg.away}. On chances, ${H} win ${d.home}% of replays and ${A} ${d.away}%.`,
    answer, line: `On the chances both sides created, ${H} win ${d.home}% of replays, ${A} ${d.away}%.`,
    gfx: { kicker: 'WHO DESERVED IT?', big: `${d.home}%`, sub: `${H} win on chances · ${A} ${d.away}% · draw ${d.draw}%` },
    script: `${answer} Replay every shot by its quality and ${H} win ${d.home}% of the time, ${A} ${d.away}%. ${actualWinner === 'away' ? `${A} took their chances; ${H} didn’t.` : ''}`.trim(),
    facts
  };
}

export function settleWpa(league: League, w: WpaExperiment, feed: DemoMatch): SettleView {
  const top = w.rows.slice(0, 5);
  const best = top[0];
  const surname = (n: string) => n.split(' ').slice(1).join(' ');
  const facts: Facts = Object.fromEntries(top.flatMap((r, i) => [[`t${i}`, r.total], [`a${i}`, r.actual], [`p${i}`, r.prevented]]));
  facts.n = w.n;
  feed.events.forEach((e, i) => { facts[`min${i}`] = Math.floor(e.minute); });
  const name = C(league, best.club).short;
  const second = top[1];
  facts.gap = best.total - (second?.total ?? 0);
  return {
    test: `Credited every swing in win probability to the players involved: goals and assists for what they added, saves and clearances for what they prevented, misses for what they cost. Every swing is computed exactly over every scoreline the rest of the match could produce.`,
    table: { cols: ['Player', 'Added', 'Prevented', 'Total'], rows: top.map((r) => [`${r.name} (${r.club})`, signed(r.actual), signed(r.prevented), signed(r.total)]), highlight: 0 },
    effect: `${signed(best.total)} PTS`, effectTone: 'good', effectNote: `${pl(facts.gap as number, 'point')} ahead of ${second ? surname(second.name) : 'anyone else'}.`,
    analyst: `${surname(best.name)}’s case: ${best.actions.slice(0, 3).join(', ')}. ${second ? `${surname(second.name)} is next on ${signed(second.total)}.` : ''}`.trim(),
    answer: `${surname(best.name)}.`,
    line: `${best.name} added ${signed(best.total)} points of win probability for ${name}, more than anyone on the pitch.`,
    gfx: { kicker: 'MAN OF THE MATCH, BY THE NUMBERS', big: surname(best.name).toUpperCase(), sub: `${signed(best.total)} pts of win probability · ${C(league, feed.home).short} v ${C(league, feed.away).short}` },
    script: `By win probability added, it’s ${best.name}: ${signed(best.total)} points for ${name}${second ? `, ahead of ${second.name} on ${signed(second.total)}` : ''}.`,
    facts
  };
}

export function settleFinishing(league: League, f: FinishingExperiment): SettleView {
  const surname = f.name.split(' ').slice(1).join(' ');
  const club = C(league, league.players.find((p) => p.id === f.player)!.club).short;
  const facts: Facts = { goals: f.goals, xg: f.xg, diff: f.diff, pAtLeast: f.pAtLeast, pAtMost: f.pAtMost };
  const above = f.verdict === 'above', below = f.verdict === 'below';
  return {
    test: `Compared ${surname}’s league goals with the expected goals of every chance he had this season, and asked how often a normal finisher would score that many from those chances.`,
    rates: [{ label: 'Expected goals from his chances', v: Math.min(100, f.xg * 3), highlight: false }, { label: `${surname}’s goals (${f.goals})`, v: Math.min(100, f.goals * 3), highlight: true }],
    rangeText: `SCALE: 1 GOAL = 3% OF THE BAR`,
    effect: `${f.diff >= 0 ? '+' : '−'}${Math.abs(f.diff)} GOALS`, effectTone: above ? 'good' : below ? 'neutral' : 'muted',
    effectNote: above ? `An average finisher scores this many from these chances ${f.pAtLeast}% of the time.` : below ? `An average finisher scores this few ${f.pAtMost}% of the time.` : 'Within normal variation for these chances.',
    analyst: above ? `${surname} has ${f.goals} goals from chances worth ${f.xg} xG. Scoring that many by luck alone happens ${f.pAtLeast}% of the time, so his finishing is a real part of ${club}’s season.` : below ? `${surname} has ${f.goals} goals from ${f.xg} xG. Falling that short by chance happens ${f.pAtMost}% of the time.` : `${surname} has ${f.goals} goals from ${f.xg} xG, roughly what an average finisher would score from the same chances.`,
    answer: above ? 'Yes, well above.' : below ? 'No, below.' : f.diff >= 3 ? 'Hot, not freakish.' : f.diff <= -3 ? 'Below par, but normal.' : 'About normal.',
    line: `${f.goals} goals from ${f.xg} xG. ${finishingVerdict(league, f.player).sentence}`,
    gfx: { kicker: `${surname.toUpperCase()} V HIS CHANCES`, big: `${f.goals} / ${f.xg}`, sub: 'Goals / expected goals this season' },
    script: above ? `He is. ${surname} has ${f.goals} league goals from chances worth ${f.xg}, and an average finisher gets that many only ${f.pAtLeast}% of the time.`
      : below ? `He isn’t. ${f.goals} goals from chances worth ${f.xg}: an average finisher falls that short only ${f.pAtMost}% of the time.`
        : f.diff >= 3 ? `A bit, but don’t read too much into it. ${surname} has ${f.goals} goals from chances worth ${f.xg}, and an ordinary finisher would get that many ${f.pAtLeast}% of the time.`
          : `Not really. ${surname} has ${f.goals} goals from chances worth ${f.xg}: about what you’d expect.`,
    facts
  };
}

export function settleCall(league: League, c: CallExperiment): SettleView {
  const a = league.feeds.flatMap((f) => f.stoppedAttacks).find((x) => x.id === c.attackId)!;
  const att = league.players.find((p) => p.id === a.attacker)!.name.split(' ').slice(1).join(' ');
  const stp = a.stopper ? league.players.find((p) => p.id === a.stopper)!.name.split(' ').slice(1).join(' ') : '';
  const facts: Facts = { value: c.value, goalPct: c.goalPct, margin: a.stopModel.kind === 'offside' ? a.stopModel.marginM : 0, redCard: c.stop === 'fouled' ? c.value : undefined, minute: a.minute };
  if (c.stop === 'offside') {
    return {
      test: `Measured ${att}’s position at the pass against the last defender, allowed for tracking error of about 0.12 m, and played the move on 500 times as if he were onside.`,
      rates: [{ label: 'Chance the flag was right', v: c.value, highlight: true }, { label: 'Goal if played on', v: c.goalPct, highlight: false }],
      effect: `${facts.margin} M OFFSIDE`, effectTone: c.correct ? 'good' : 'neutral', effectNote: c.correct ? 'Beyond reasonable doubt.' : 'Too close to call with confidence.',
      analyst: `Offside by ${facts.margin} m, so the call is right ${c.value}% of the time once tracking error is allowed for. Onside, ${att} scores ${c.goalPct}% of the time.`,
      answer: c.correct ? 'Right call.' : 'Too close.', line: `${c.value}% sure the flag was right. Onside, it’s a goal ${c.goalPct}% of the time.`,
      gfx: { kicker: `${att.toUpperCase()} · ${a.label}`, big: `${c.value}%`, sub: 'Confidence the offside flag was correct' },
      script: `${c.correct ? 'The flag was right.' : 'Honestly, too close to call.'} ${att} was ${facts.margin} metres off, and our tracking gives the flag a ${c.value}% chance of being right.`,
      facts
    };
  }
  return {
    test: `Ran the red-card test on ${stp}’s foul: how clear the chance was (500 ghost runs), how many defenders were covering, and how far out it was.`,
    rates: [{ label: 'Red-card test', v: c.value, highlight: true }, { label: 'Goal if not fouled', v: c.goalPct, highlight: false }],
    effect: `${c.value}% RED`, effectTone: 'neutral', effectNote: c.correct ? 'A yellow was the right card.' : 'This meets the bar for a red.',
    analyst: `${att} scores ${c.goalPct}% of the time if he isn’t stopped, and the red-card test comes out at ${c.value}%. ${c.correct ? 'A real chance, but not an obvious one.' : 'That is an obvious goalscoring opportunity.'}`,
    answer: c.correct ? 'No, yellow.' : 'Yes, red.', line: `Red-card test ${c.value}%. ${c.correct ? 'Yellow was right.' : 'It should have been red.'}`,
    gfx: { kicker: `${stp.toUpperCase()} ON ${att.toUpperCase()}`, big: c.correct ? 'YELLOW' : 'RED', sub: `Red-card test ${c.value}% · goal if not fouled ${c.goalPct}%` },
    script: `${c.correct ? 'Yellow was right.' : 'That should have been red.'} If ${att} isn’t brought down, he scores ${c.goalPct}% of the time, and the red-card test says ${c.value}%.`,
    facts
  };
}

export function settleValue(league: League, v: ValueExperiment): SettleView {
  const feed = league.feeds.find((f) => f.stoppedAttacks.some((x) => x.id === v.attackId))!;
  const a = feed.stoppedAttacks.find((x) => x.id === v.attackId)!;
  const stp = league.players.find((p) => p.id === a.stopper)!;
  const s = stp.name.split(' ').slice(1).join(' ');
  const team = C(league, stp.club).short;
  const facts: Facts = { goalPct: v.goalPct, winSaved: v.winSaved, pointsSaved: v.pointsSaved, minute: a.minute };
  return {
    test: `Played the attack on 500 times without ${s}’s ${a.stop === 'cleared' ? 'clearance' : 'block'}, then played the rest of the match out 2,000 times from each score.`,
    rates: [{ label: 'Goal without him', v: v.goalPct, highlight: false }, { label: 'Win chance he protected', v: Math.max(0, v.winSaved), highlight: true }],
    effect: `+${v.pointsSaved} PTS`, effectTone: 'good', effectNote: 'Expected league points saved.',
    analyst: `Without ${s}, it’s a goal ${v.goalPct}% of the time. Weighing that by what a goal would have done to the result, the ${a.stop === 'cleared' ? 'clearance' : 'block'} was worth ${v.winSaved} points of ${team}’s win chance, or ${v.pointsSaved} league points.`,
    answer: `${v.pointsSaved} points.`, line: `${s}’s ${a.stop === 'cleared' ? 'clearance' : 'block'} saved ${team} about ${v.pointsSaved} expected league points.`,
    gfx: { kicker: `WHAT ${s.toUpperCase()} SAVED · ${a.label}`, big: `${v.pointsSaved} PTS`, sub: `Goal without him ${v.goalPct}% · win chance protected ${v.winSaved} pts` },
    script: `About ${v.pointsSaved} of a point. Without ${s}, that goes in ${v.goalPct}% of the time.`,
    facts
  };
}

// ---------------- Multiverse ----------------

export interface UniverseStoryVoices { back: { head: string; sub: string }; report: { head: string; sub: string }; analyst: { head: string; sub: string } }

export interface UniverseView {
  metrics: { label: string; real: string; alt: string }[];
  hist: { label: string; real: number; alt: number }[];
  focusName: string;
  stat: string; // headline for the saved Universe
  story: UniverseStoryVoices;
  others: { code: string; name: string; line: string; delta: number; b: number; a: number }[]; // other clubs this universe moves
  facts: Facts;
}

function mode(dist: number[]) { let m = 0; dist.forEach((p, i) => { if (p > dist[m]) m = i; }); return m + 1; }

function describe(league: League, lv: Lever): string {
  const P = (id: string) => league.players.find((p) => p.id === id)!.name;
  switch (lv.kind) {
    case 'transfer_cancel': return `${P(lv.player)} stays at ${C(league, lv.from).short}`;
    case 'transfer_add': return `${P(lv.player)} joins ${C(league, lv.to).short}`;
    case 'player_out': return `${P(lv.player)} misses the season`;
    case 'manager': return `${lv.manager} manages ${C(league, lv.club).short}`;
    case 'tactics': return `${C(league, lv.club).short} ${lv.label}`;
    case 'points': return `${C(league, lv.club).short} ${lv.delta < 0 ? `docked ${-lv.delta}` : `awarded ${lv.delta}`} points`;
    case 'moment': { const m = momentById(league, lv.momentId)!; return `${m.km.title}: it goes the other way`; }
  }
}

export function universeView(league: League, u: UniverseResult, parsed: Parsed): UniverseView {
  const F = parsed.focus;
  const O = parsed.other;
  const name = C(league, F).short;
  const r = u.real[F], a = u.alt[F];
  const facts: Facts = { n: u.n, mw: league.currentMw };
  const add = (k: string, v: number) => { facts[k] = v; return v; };
  const pts = add('pts', Math.round((a.avgPts - r.avgPts) * 10) / 10);
  add('sd', Math.round(a.ptsSd * 10) / 10);
  add('t4r', P(r.top4)); add('t4a', P(a.top4)); add('t4d', P(a.top4) - P(r.top4));
  add('relR', P(r.rel)); add('relA', P(a.rel)); add('relD', P(a.rel) - P(r.rel));
  add('titR', P(r.title)); add('titA', P(a.title)); add('titD', P(a.title) - P(r.title));
  add('posR', Math.round(r.avgPos * 10) / 10); add('posA', Math.round(a.avgPos * 10) / 10);
  add('ptsR', Math.round(r.avgPts)); add('ptsA', Math.round(a.avgPts));
  add('gfR', Math.round(r.avgGF)); add('gfA', Math.round(a.avgGF)); add('gaR', Math.round(r.avgGA)); add('gaA', Math.round(a.avgGA));
  add('gfD', Math.round(a.avgGF) - Math.round(r.avgGF)); add('gaD', Math.round(a.avgGA) - Math.round(r.avgGA));
  add('modeA', mode(a.dist)); add('modeR', mode(r.dist));

  // which race matters for this club decides the headline numbers
  const race: 'title' | 'top4' | 'rel' = Math.max(r.title, a.title) > 0.1 ? 'title' : Math.max(r.top4, a.top4) > 0.03 ? 'top4' : 'rel';
  const raceLabel = { title: 'win the league', top4: 'top four', rel: 'relegated' }[race];
  const raceNoun = { title: 'title', top4: 'top-four', rel: 'relegation' }[race];
  const rv = P(r[race]), av = P(a[race]);

  const centre = Math.round((r.avgPos + a.avgPos) / 2);
  const start = Math.max(1, Math.min(20 - 7, centre - 3));
  const hist = Array.from({ length: 8 }, (_, i) => ({ label: ordinal(start + i), real: P(r.dist[start + i - 1]), alt: P(a.dist[start + i - 1]) }));

  const metrics: UniverseView['metrics'] = [
    { label: `${name} average finish`, real: (Math.round(r.avgPos * 10) / 10).toFixed(1), alt: (Math.round(a.avgPos * 10) / 10).toFixed(1) },
    { label: `${name} ${raceLabel}`, real: `${rv}%`, alt: `${av}%` },
    { label: `${name} points`, real: String(Math.round(r.avgPts)), alt: String(Math.round(a.avgPts)) }
  ];
  if (O) {
    const ro = u.real[O], ao = u.alt[O];
    const oRace: 'title' | 'top4' | 'rel' = Math.max(ro.title, ao.title) > 0.1 ? 'title' : Math.max(ro.top4, ao.top4) > 0.03 ? 'top4' : 'rel';
    facts.oNoun = { title: 'title', top4: 'top-four', rel: 'relegation' }[oRace];
    add('oR', P(ro[oRace])); add('oA', P(ao[oRace])); add('oD', P(ao[oRace]) - P(ro[oRace])); add('oPos', Math.round(ao.avgPos));
    metrics.push({ label: `${C(league, O).short} ${{ title: 'win the league', top4: 'top four', rel: 'relegated' }[oRace]}`, real: `${P(ro[oRace])}%`, alt: `${P(ao[oRace])}%` });
  }
  const stat = `${name} ${raceLabel} ${av}%`;

  // everyone else this universe moves, beyond the clubs in the sentence
  const others = league.clubs.filter((c) => c.code !== F && c.code !== O).map((c) => {
    const ro = u.real[c.code], ao = u.alt[c.code];
    const cand = (['title', 'top4', 'rel'] as const).map((k) => ({ k, d: P(ao[k]) - P(ro[k]), b: P(ro[k]), a: P(ao[k]) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    return { code: c.code, name: c.short, delta: cand.d, b: cand.b, a: cand.a, line: `${{ title: 'Title', top4: 'Top four', rel: 'Relegation' }[cand.k]} ${cand.b}% → ${cand.a}%` };
  }).filter((x) => Math.abs(x.delta) >= 2).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 5);
  others.forEach((o, i) => { facts[`o${i}`] = o.delta; facts[`ob${i}`] = o.b; facts[`oa${i}`] = o.a; });

  const changes = u.levers.map((l) => describe(league, l));
  const lv = u.levers[0];
  const better = a.avgPts > r.avgPts;
  const verb = better ? 'climb' : 'slip';
  let story: UniverseStoryVoices;

  if (u.levers.length > 1) {
    story = {
      back: { head: `${changes.length} CHANGES, ONE SEASON`, sub: `${changes.join('; ')}. ${name} ${verb} from ${ordinal(mode(r.dist))} to ${ordinal(mode(a.dist))} most often.` },
      report: { head: `${name} in a different season`, sub: `With ${changes.map((c) => c.charAt(0).toLowerCase() + c.slice(1)).join(' and ')}, ${name} average ${Math.round(a.avgPts)} points against ${Math.round(r.avgPts)} in the real season, and their ${raceNoun} chance moves from ${rv}% to ${av}%.` },
      analyst: { head: `Combined effect ${signed(pts)} points`, sub: `${changes.length} levers applied together from matchweek 1. ${raceNoun[0].toUpperCase() + raceNoun.slice(1)} ${signed(av - rv)} pts. ${thousands(u.n)} seasons.` }
    };
  } else if (lv.kind === 'transfer_cancel' || lv.kind === 'player_out' || lv.kind === 'transfer_add') {
    const p = league.players.find((x) => x.id === lv.player)!;
    const s = p.name.split(' ').slice(1).join(' ');
    const lostGoals = Math.round(r.avgGF) - Math.round(a.avgGF);
    add('lostGoals', lostGoals);
    const otherName = O ? C(league, O).short : '';
    story = lv.kind === 'transfer_add'
      ? {
        back: { head: `${s.toUpperCase()} SIGNS FOR ${name.toUpperCase()}`, sub: `${name} most often finish ${ordinal(mode(a.dist))} with him, against ${ordinal(mode(r.dist))} without.` },
        report: { head: `${name} with ${s}`, sub: `${better ? 'A better' : 'A worse'} season by ${Math.abs(pts)} points on average, and ${Math.abs(Number(facts.gfD))} ${Number(facts.gfD) >= 0 ? 'more' : 'fewer'} goals.` },
        analyst: { head: `${s} adds ${signed(pts)} points`, sub: `${raceNoun[0].toUpperCase() + raceNoun.slice(1)} ${signed(av - rv)} pts${O ? `; ${otherName} ${signed(Number(facts.oD))} pts without him` : ''}. ${thousands(u.n)} seasons.` }
      }
      : {
        back: lv.kind === 'transfer_cancel'
          ? { head: `${s.toUpperCase()} STAYS, ${name.toUpperCase()} ${better ? 'SHRUG' : 'STALL'}`, sub: `${otherName} keep their star and finish ${ordinal(Number(facts.oPos))} on average, while ${name} ${better ? 'barely notice' : `slip from ${ordinal(mode(r.dist))} to ${ordinal(mode(a.dist))}`}.` }
          : { head: `NO ${s.toUpperCase()}, NO PARTY`, sub: `${name} without him most often finish ${ordinal(mode(a.dist))}, against ${ordinal(mode(r.dist))} in the real season.` },
        report: { head: `A season without ${s}`, sub: `${name} ${lostGoals > 0 ? `score ${lostGoals} fewer league goals` : 'score about as many goals'} and most often finish ${ordinal(mode(a.dist))}, against ${ordinal(mode(r.dist))} in the real season.` },
        analyst: { head: `${s} is worth about ${Math.abs(Math.round(pts))} points`, sub: `Without him, ${name} average ${signed(pts)} points (season spread ±${facts.sd}). ${raceNoun[0].toUpperCase() + raceNoun.slice(1)} ${signed(av - rv)} pts${O ? `; ${otherName} ${signed(Number(facts.oD))} pts` : ''}. ${thousands(u.n)} seasons.` }
      };
  } else if (lv.kind === 'manager' || lv.kind === 'tactics') {
    const who = lv.kind === 'manager' ? lv.manager.split(' ').slice(-1)[0] : name;
    const both = a.avgGF > r.avgGF + 1 && a.avgGA > r.avgGA + 1;
    Object.assign(facts, raceRangeFacts(r, a, 'top4'));
    story = {
      back: { head: lv.kind === 'manager' ? (both ? `${who.toUpperCase()} BRINGS THE CHAOS` : `${who.toUpperCase()}’S ${name.toUpperCase()}`) : `${name.toUpperCase()} ${lv.label.toUpperCase()}`, sub: both ? `More goals at both ends${a.top4 > r.top4 && !facts.rangesOverlap ? ', and a better shot at the top four' : ', and not much else'}.` : `${name} finish ${ordinal(mode(a.dist))} most often.` },
      report: { head: lv.kind === 'manager' ? `${name} under ${who}` : `${name}, ${lv.label}`, sub: `They concede ${Math.abs(Number(facts.gaD))} ${Number(facts.gaD) >= 0 ? 'more' : 'fewer'} and score ${Math.abs(Number(facts.gfD))} ${Number(facts.gfD) >= 0 ? 'more' : 'fewer'}, and finish ${ordinal(mode(a.dist))} most often.` },
      analyst: { head: `Net ${signed(pts)} points`, sub: `Goals for ${facts.gfR} → ${facts.gfA}, against ${facts.gaR} → ${facts.gaA} per season. ${raceNoun[0].toUpperCase() + raceNoun.slice(1)} ${signed(av - rv)} pts. ${thousands(u.n)} seasons.` }
    };
  } else if (lv.kind === 'points') {
    add('delta', Math.abs(lv.delta));
    story = {
      back: { head: `${name.toUpperCase()} ${lv.delta < 0 ? `DOCKED ${-lv.delta}` : `HANDED ${lv.delta}`}`, sub: `${name} ${lv.delta < 0 ? 'fall' : 'rise'} to ${ordinal(mode(a.dist))} most often, and their ${raceNoun} chance moves from ${rv}% to ${av}%.` },
      report: { head: `A ${Math.abs(lv.delta)}-point ${lv.delta < 0 ? 'deduction' : 'award'}`, sub: `With ${pl(add('left', league.fixtures.filter((f) => (f.home === F || f.away === F) && f.hg === undefined && f.id !== league.demo.fixtureId).length), 'game')} to play, the rest of the league has a say: ${others.length ? `${others[0].name} move most (${others[0].line}).` : 'nobody else moves much.'}` },
      analyst: { head: `${raceNoun[0].toUpperCase() + raceNoun.slice(1)} ${signed(av - rv)} pts`, sub: `Average finish ${facts.posR} → ${facts.posA}. ${thousands(u.n)} run-ins of the remaining fixtures.` }
    };
  } else {
    const m = momentById(league, lv.momentId)!;
    const who = league.players.find((p) => p.id === m.ev.player)!.name.split(' ').slice(1).join(' ');
    const fl = u.flipped!;
    const win = add('win', Math.round((F === m.feed.home ? fl.home : fl.away) * 100));
    add('minute', Math.floor(m.ev.minute));
    const Oname = O ? C(league, O).short : '';
    story = {
      back: { head: m.km.kind === 'penalty_saved' ? 'ONE KICK, TWO SEASONS' : 'ONE MOMENT, TWO SEASONS', sub: `${who}’s moment at ${m.km.label} swings ${name}’s season${O ? `, and ${Oname}’s` : ''}.` },
      report: { head: m.km.kind === 'penalty_saved' ? `If ${who} scores` : 'If it goes the other way', sub: `${name} win ${win}% of the time from there, and their ${raceNoun} chance moves from ${rv}% to ${av}%${O ? `; ${Oname}’s ${facts.oNoun} chance goes from ${facts.oR}% to ${facts.oA}%` : ''}.` },
      analyst: { head: `${Math.abs(av - rv)} points of ${raceNoun} chance${O ? `, ${Math.abs(Number(facts.oD))} of ${Oname}’s ${facts.oNoun} chance` : ''}`, sub: `One moment at ${m.km.label} flipped, the rest of the match replayed, then ${thousands(u.n)} run-ins of the remaining fixtures.` }
    };
  }
  for (const h of hist) { facts[`hr${h.label}`] = h.real; facts[`ha${h.label}`] = h.alt; }
  return { metrics, hist, focusName: name, stat, story, others, facts };
}

export type { ClubOutlook };
