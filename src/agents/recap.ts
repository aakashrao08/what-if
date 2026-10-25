// The automated match recap: a headline and four short paragraphs written at full time from what the
// engine found. How the goals went in, the moment that turned it, whether the result was deserved, and
// what it does to both clubs' seasons. Shaped by the kind of match (a late winner reads differently from
// a comeback or a stroll) and by whose side the reader is on. Every number is checked by the Verifier.

import type { DemoMatch, League, MatchEvent, Side } from '../data/types';
import type { Timeline } from '../engine/demo';
import { sideWin } from '../engine/demo';
import type { RippleResult } from '../engine/league';
import type { DeserveExperiment } from '../engine/settle';
import type { ClubOutlook } from '../engine/season';
import { hashSeed } from '../engine/rng';
import { ordinal, type Persona } from './format';
import { verify, type Facts, type Verdict } from './verifier';

export interface Recap { headline: string; paragraphs: string[]; facts: Facts; verdict: Verdict; text: string }

const sur = (league: League, id?: string) => (id ? league.players.find((p) => p.id === id)?.name.split(' ').slice(1).join(' ') ?? '' : '');
const pct = (x: number) => Math.round(x * 100);

type Kind = 'opener' | 'level' | 'ahead' | 'extend' | 'back';
interface Goal { e: MatchEvent; side: Side; h: number; a: number; kind: Kind; minute: number }

function goalsOf(feed: DemoMatch): Goal[] {
  let h = 0, a = 0;
  return feed.events.filter((e) => e.type === 'goal').map((e) => {
    const side = e.team!;
    if (side === 'home') h++; else a++;
    const mine = side === 'home' ? h : a, theirs = side === 'home' ? a : h;
    const kind: Kind = mine === 1 && theirs === 0 ? 'opener' : mine === theirs ? 'level' : mine === theirs + 1 ? 'ahead' : mine > theirs ? 'extend' : 'back';
    return { e, side, h, a, kind, minute: Math.floor(e.minute) };
  });
}

/** The race a result touched most for a club, and by how much. */
function biggestMove(before: ClubOutlook, after: ClubOutlook) {
  const races = (['title', 'top4', 'rel'] as const).map((k) => ({ k, b: pct(before[k]), a: pct(after[k]) })).filter((x) => Math.max(x.b, x.a) >= 3);
  return races.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0] ?? null;
}

export function matchRecap(league: League, feed: DemoMatch, tl: Timeline, rip: RippleResult, d: DeserveExperiment, persona: Persona): Recap {
  const club = (s: Side) => league.clubs.find((c) => c.code === (s === 'home' ? feed.home : feed.away))!.short;
  const H = club('home'), A = club('away');
  const goals = goalsOf(feed);
  const hg = goals.filter((g) => g.side === 'home').length, ag = goals.length - hg;
  const fan: Side | null = persona === 'home' ? 'home' : persona === 'away' ? 'away' : null;
  const we = (s: Side) => fan === s; // write this side in the first person
  const name = (s: Side) => (we(s) ? 'we' : club(s));
  const Name = (s: Side) => (we(s) ? 'We' : club(s));
  const poss = (n: string) => (/’s$|'s$/.test(n) ? n : /s$/.test(n) ? `${n}’` : `${n}’s`);
  const their = (s: Side) => (we(s) ? 'our' : poss(club(s)));
  const won = () => `${Math.max(hg, ag)}–${Math.min(hg, ag)}`; // the winner's goals first, the way people say it
  const facts: Facts = { hg, ag, n: rip.n, dn: d.n };
  const pick = <T,>(options: T[]) => options[hashSeed(feed.fixtureId) % options.length];
  const winner: Side | null = hg > ag ? 'home' : ag > hg ? 'away' : null;
  const loser: Side | null = winner ? (winner === 'home' ? 'away' : 'home') : null;
  const score = `${hg}–${ag}`;
  goals.forEach((g, i) => { facts[`g${i}`] = g.minute; facts[`s${i}`] = `${g.h}–${g.a}`; }); // the score after each goal is a fact too

  // ---- headline: what kind of match it was
  const decider = winner ? [...goals].reverse().find((g) => g.side === winner && (g.kind === 'ahead' || g.kind === 'opener') && (winner === 'home' ? g.h - g.a : g.a - g.h) === 1 && goals.slice(goals.indexOf(g) + 1).every((x) => x.side === winner)) : undefined;
  const trailed = winner ? goals.some((g) => (winner === 'home' ? g.h < g.a : g.a < g.h)) : false;
  const last = goals[goals.length - 1];
  let headline: string;
  if (!winner) {
    if (!goals.length) headline = `${H} and ${A} cancel each other out`;
    else if (last.kind === 'level' && last.minute >= 80) headline = we(last.side) ? `${sur(league, last.e.player)} rescues a point for us` : `${sur(league, last.e.player)} rescues a point for ${club(last.side)}`;
    else headline = `${H} and ${A} share the points`;
  } else if (trailed) {
    headline = we(winner) ? `We come from behind to beat ${club(loser!)}` : we(loser!) ? `${club(winner)} turn it round against us` : `${club(winner)} come from behind to beat ${club(loser!)}`;
  } else if (decider && decider.minute >= 80) {
    const who = sur(league, decider.e.player);
    headline = we(winner) ? `${who} wins it late` : we(loser!) ? `${who} breaks our hearts late on` : `${who}’s late goal wins it for ${club(winner)}`;
  } else if (Math.abs(hg - ag) >= 2) {
    headline = we(winner) ? `A comfortable day: ${score} against ${club(loser!)}` : we(loser!) ? `Outplayed by ${club(winner)}` : pick([`${club(winner)} too strong for ${club(loser!)}`, `${club(winner)} ease past ${club(loser!)}`]);
  } else {
    const who = decider ? sur(league, decider.e.player) : '';
    headline = who ? (we(winner) ? `${who} the difference as we edge it` : `${who} the difference as ${club(winner)} edge ${club(loser!)}`) : `${club(winner)} edge ${club(loser!)}`;
  }

  // ---- paragraph 1: how the goals went in
  const when = (g: Goal, i: number) => {
    const left = Math.max(0, 90 - g.minute);
    if (g.minute >= 90) return 'in stoppage time';
    if (g.minute >= 80 && left >= 2) { facts[`left${i}`] = left; return `with ${left} minutes left`; }
    return i % 2 ? `on ${g.minute} minutes` : `in the ${ordinal(g.minute)} minute`;
  };
  const ledBefore = { home: false, away: false };
  const verb = (g: Goal) => {
    const v = g.kind === 'opener' ? 'opened the scoring' : g.kind === 'level' ? 'equalised' : g.kind === 'ahead' ? (ledBefore[g.side] ? 'restored the lead' : 'put them ahead') : g.kind === 'extend' ? `made it ${g.h}–${g.a}` : 'pulled one back';
    if (g.kind === 'opener' || g.kind === 'ahead' || g.kind === 'extend') ledBefore[g.side] = true;
    return v;
  };
  const hat = Object.entries(goals.reduce<Record<string, Goal[]>>((m, g) => { (m[g.e.player!] ??= []).push(g); return m; }, {})).find(([, gs]) => gs.length >= 3);
  let p1: string;
  const result = winner ? (we(winner) ? `We won ${won()}.` : we(loser!) ? `We lost ${won()}.` : `${club(winner)} won ${won()}.`) : `It finished ${score}.`;
  if (!goals.length) p1 = `No goals at ${feed.ground}, and few clear chances to remember.`;
  else if (hat && hat[1].length === goals.length) {
    const g = hat[1], side = g[0].side;
    p1 = `${sur(league, hat[0])} scored all ${g.length}${we(side) ? '' : ` for ${club(side)}`}, on ${g.slice(0, -1).map((x) => x.minute).join(', ')} and ${g[g.length - 1].minute} minutes. ${result}`;
  } else {
    let prev: Side | null = null;
    let prevScorer = '';
    const parts = goals.map((g, i) => {
      const who = sur(league, g.e.player);
      // the same player again straight after: "made it 2–0 on 47 minutes and 3–0 in the 79th"
      if (who === prevScorer && g.kind === 'extend') { verb(g); prev = g.side; return `${g.h}–${g.a} ${when(g, i)}`; }
      prevScorer = who;
      const forWhom = g.side !== prev && !we(g.side) && g.kind !== 'level' ? ` for ${club(g.side)}` : '';
      prev = g.side;
      let v = verb(g);
      if (v === 'put them ahead' || v === 'restored the lead') v = we(g.side) ? (v === 'put them ahead' ? 'put us ahead' : 'restored our lead') : v === 'put them ahead' ? `put ${club(g.side)} ahead` : v;
      return `${who} ${v}${v.includes(club(g.side)) ? '' : forWhom} ${when(g, i)}`;
    });
    // join, folding "X made it 2–0 …" + "3–0 …" into one clause
    const clauses: string[] = [];
    for (const part of parts) { if (/^\d+–\d+ /.test(part) && clauses.length) clauses[clauses.length - 1] += ` and ${part}`; else clauses.push(part); }
    const lastClause = clauses[clauses.length - 1];
    const joined = clauses.length > 1 ? `${clauses.slice(0, -1).join(', ')}${lastClause.includes(' and ') ? ', then' : ' and'} ${lastClause}` : clauses[0];
    p1 = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}. ${result}`;
  }

  // ---- paragraph 2: the moment that mattered most (the biggest change, real or what-if)
  const top = [...tl.moments].sort((x, y) => y.impact - x.impact)[0];
  let p2 = '';
  if (top) {
    const km = feed.keyMoments.find((k) => k.id === top.id)!;
    const f = top.focus;
    const b = Math.round(sideWin(top.before, f)), a = Math.round(sideWin(top.after, f)), c = Math.round(sideWin(top.cf, f));
    Object.assign(facts, { tb: b, ta: a, tc: c, tm: Math.floor(top.minute), title: km.title });
    const isGoal = km.cf.type === 'remove_goal';
    const firstGoal = isGoal && goals[0]?.e.id === km.eventId;
    const lateDecider = isGoal && decider?.e.id === km.eventId && top.minute >= 75;
    if (top.quiet) p2 = `The moment that mattered most didn’t change the score: ${km.title} (${km.label}). Had it gone in, ${name(f)} would have won ${c}% of the time instead of ${a}%.`;
    else if (lateDecider) p2 = `It turned at ${km.label}. ${km.title}, and ${their(f)} chance of winning went from ${b}% to ${a}%.`;
    else if (firstGoal && winner && Math.abs(hg - ag) >= 2) p2 = `The opener at ${km.label} set the tone: ${km.title}, and ${their(f)} chance of winning jumped from ${b}% to ${a}%.`;
    else if (isGoal) p2 = `The biggest swing came at ${km.label}: ${km.title}. ${their(f).charAt(0).toUpperCase() + their(f).slice(1)} chance of winning moved from ${b}% to ${a}%.`;
    else p2 = `The biggest moment was a miss: ${km.title} (${km.label}). Had it gone in, ${name(f)} would have won ${c}% of the time, not ${a}%.`;
  }

  // ---- paragraph 3: was it deserved?
  Object.assign(facts, { xh: d.xg.home, xa: d.xg.away, rh: d.home, ra: d.away, rd: d.draw });
  const chancesFavour: Side | null = d.home >= d.away + 15 ? 'home' : d.away >= d.home + 15 ? 'away' : null;
  const xg = `${d.xg.home} xG to ${d.xg.away}`;
  const share = (s: Side) => (s === 'home' ? d.home : d.away);
  let p3: string;
  if (winner && chancesFavour === winner) p3 = pick([`The result was fair: ${xg}, and replaying every shot by its quality, ${name(winner)} win ${share(winner)}% of the time.`, `No complaints about the result. ${xg}; replay every shot and ${name(winner)} win ${share(winner)}% of the time.`]);
  else if (winner && chancesFavour) p3 = we(chancesFavour) ? `On the chances, we deserved more: ${xg}. Replay every shot and we win ${share(chancesFavour)}% of the time; ${club(winner)} took theirs.` : we(winner) ? `We rode our luck: ${xg}, and replaying every shot, ${club(chancesFavour)} win ${share(chancesFavour)}% of the time.` : `${club(winner)} rode their luck. ${xg}: replay every shot and ${club(chancesFavour)} win ${share(chancesFavour)}% of the time.`;
  else if (winner && Math.abs(hg - ag) >= 2) p3 = `The scoreline flatters ${name(winner)}: ${xg}, and replayed shot by shot, ${H} win ${d.home}%, ${A} ${d.away}%, with ${d.draw}% drawn.`;
  else if (!winner && chancesFavour) p3 = `${Name(chancesFavour)} will feel ${we(chancesFavour) ? 'we' : 'they'} should have won it: ${xg}, and ${share(chancesFavour)}% of replays go ${we(chancesFavour) ? 'our' : 'their'} way.`;
  else p3 = `Little between them on the chances (${xg}): replayed shot by shot, ${H} win ${d.home}%, ${A} ${d.away}%, with ${d.draw}% drawn.`;

  // ---- paragraph 4: what it means for both seasons
  const moveLine = (s: Side) => {
    const code = s === 'home' ? feed.home : feed.away;
    const m = biggestMove(rip.before[code], rip.after[code]);
    if (!m || Math.abs(m.a - m.b) < 2) return null;
    facts[`${s}b`] = m.b; facts[`${s}a`] = m.a;
    const good = m.k === 'rel' ? m.a < m.b : m.a > m.b;
    const race = { title: 'title', top4: 'top-four', rel: 'relegation' }[m.k];
    const subj = we(s) ? 'Our' : poss(club(s));
    return good ? `${subj} ${race} chance ${m.k === 'rel' ? 'drops' : 'rises'} from ${m.b}% to ${m.a}%` : `${subj} ${race} chance ${m.k === 'rel' ? 'rises' : 'falls'} from ${m.b}% to ${m.a}%`;
  };
  const moves = ([moveLine('home'), moveLine('away')].filter(Boolean) as string[]).map((m, i) => (i > 0 && m.startsWith('Our ') ? `our ${m.slice(4)}` : m));
  const p4 = moves.length ? `${moves.join('; ')}, across ${rip.n.toLocaleString('en-GB')} simulated run-ins.` : `Neither side’s season moves much: both are settled with ${38 - league.currentMw} games left.`;
  facts.left = 38 - league.currentMw;

  const paragraphs = [p1, p2, p3, p4].filter(Boolean);
  const text = [headline, ...paragraphs].join(' ');
  return { headline, paragraphs, facts, verdict: verify(text, facts), text };
}
