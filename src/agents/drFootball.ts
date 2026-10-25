// Dr Football: reads a what-if written in plain English, turns it into levers the simulator
// understands, and refuses scenarios that can't happen in the Meridian League.
// One sentence can hold two changes ("...and Vance had taken over"). Mock mode uses the rules
// below; live mode asks a model to rephrase first and still validates its answer here.

import type { League, Player } from '../data/types';
import type { Lever } from '../engine/league';
import { denyMatch } from '../data/denylist';

export type ScenarioKind = 'TRANSFER' | 'MANAGER' | 'MOMENT' | 'INJURY' | 'TACTICS' | 'POINTS' | 'COMBINED';

interface One { lever: Lever; kind: ScenarioKind; short: string; changes: { k: string; v: string }[]; focus: string; other?: string }

export interface Parsed {
  ok: true;
  levers: Lever[];
  kind: ScenarioKind;
  short: string; // "Nettleshaw never joins Northbridge"
  changes: { k: string; v: string }[];
  focus: string; // club code the story is about
  other?: string; // second club in the story
}

export interface Rejected { ok: false; reply: string; suggestions: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sur = (p: Player) => p.name.split(' ').slice(1).join(' ');

/** Example what-ifs, built from the league so they always point at real data. */
export function examples(league: League): { text: string; kind: ScenarioKind }[] {
  const out: { text: string; kind: ScenarioKind }[] = [
    { text: 'What if Kit Nettleshaw had never joined Northbridge?', kind: 'TRANSFER' },
    { text: 'What if Ines Vance had taken over Northbridge in August?', kind: 'MANAGER' },
    { text: 'What if Bobbinford’s penalty against Harbour had gone in?', kind: 'MOMENT' }
  ];
  const rivalStar = [...league.players].filter((p) => p.club !== 'NBR' && p.pos === 'FW').sort((a, b) => b.goals - a.goals)[0];
  out.push({ text: `What if ${rivalStar.name} had joined Northbridge?`, kind: 'TRANSFER' });
  out.push({ text: 'What if Northbridge had pressed higher all season?', kind: 'TACTICS' });
  out.push({ text: 'What if Harbour Athletic had been docked 6 points?', kind: 'POINTS' });
  out.push({ text: 'What if Kit Nettleshaw had missed the season?', kind: 'INJURY' });
  const late = league.feeds.filter((f) => f.source === 'generated').flatMap((f) => f.keyMoments.map((k) => ({ f, k }))).find((x) => x.k.kind === 'late_goal');
  if (late) {
    const ev = late.f.events.find((e) => e.id === late.k.eventId)!;
    const p = league.players.find((x) => x.id === ev.player)!;
    out.push({ text: `What if ${p.name}’s late goal for ${league.clubs.find((c) => c.code === p.club)!.short} had been ruled out?`, kind: 'MOMENT' });
  }
  out.push({ text: 'What if Nettleshaw had never joined Northbridge and Ines Vance had taken over?', kind: 'COMBINED' });
  return out;
}
export const EXAMPLES = ['What if Kit Nettleshaw had never joined Northbridge?', 'What if Ines Vance had taken over Northbridge in August?', 'What if Bobbinford’s penalty against Harbour had gone in?'];


function findPlayers(league: League, q: string): Player[] {
  const hits: { p: Player; score: number; at: number }[] = [];
  for (const p of league.players) {
    const full = norm(p.name);
    const last = full.split(' ').slice(1).join(' ');
    if (q.includes(full)) hits.push({ p, score: 3, at: q.indexOf(full) });
    else if (last.length > 3) { const m = new RegExp(`\\b${last}('s)?\\b`).exec(q); if (m) hits.push({ p, score: 2, at: m.index }); }
  }
  return hits.sort((a, b) => b.score - a.score || a.at - b.at).map((h) => h.p);
}

function findClubs(league: League, q: string): string[] {
  const out: { code: string; at: number }[] = [];
  for (const c of league.clubs) {
    for (const name of [c.name, c.short, c.nickname]) {
      const at = q.indexOf(norm(name));
      if (at >= 0 && name.length > 3) { out.push({ code: c.code, at }); break; }
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.code);
}

const clubName = (league: League, code: string) => league.clubs.find((c) => c.code === code)!.short;
const posWord = { FW: 'forward', MF: 'midfielder', DF: 'defender', GK: 'goalkeeper' } as const;

function parseOne(league: League, clause: string, defaultClub?: string): One | string {
  const q = norm(clause);
  const players = findPlayers(league, q);
  const clubs = findClubs(league, q);
  const manager = league.managers.find((m) => q.includes(norm(m.name)) || new RegExp(`\\b${norm(m.name.split(' ').slice(-1)[0])}\\b`).test(q));

  // points
  const ded = q.match(/(?:docked|deducted|lose|lost|minus) (\d+) points?|(\d+) point deduction/);
  const award = q.match(/(?:given|awarded|gained|handed|extra) (\d+) (?:extra )?points?/);
  if (ded || award) {
    const nPts = Number(ded ? ded[1] ?? ded[2] : award![1]);
    const club = clubs[0] ?? defaultClub;
    if (!club) return 'Which club? Name one from the Meridian League.';
    if (nPts > 30) return 'That’s more points than the rest of their season is worth. Try something under 30.';
    const delta = ded ? -nPts : nPts;
    return {
      lever: { kind: 'points', club, delta }, kind: 'POINTS', short: `${clubName(league, club)} ${delta < 0 ? `docked ${nPts}` : `given ${nPts}`} points`,
      changes: [{ k: 'Change', v: delta < 0 ? 'Points deduction' : 'Points award' }, { k: 'Club', v: clubName(league, club) }, { k: 'Points', v: `${delta > 0 ? '+' : '−'}${nPts}, applied now` }, { k: 'Re-simulated', v: 'Every remaining game' }],
      focus: club
    };
  }

  // tactics
  const tactic = /press(ed|ing)? (higher|harder|more)/.test(q) ? { style: { press: 0.25, line: 0.1 }, label: 'press higher' }
    : /(sat|sit|sitting|played|play) deeper|parked the bus|more defensive|low block/.test(q) ? { style: { line: -0.25, press: -0.15 }, label: 'sit deeper' }
      : /high(er)? (defensive )?line|pushed up/.test(q) ? { style: { line: 0.25 }, label: 'push the line up' }
        : /more direct|faster|quicker|higher tempo/.test(q) ? { style: { tempo: 0.25 }, label: 'play faster' } : null;
  if (tactic && !manager) {
    const club = clubs[0] ?? defaultClub;
    if (!club) return 'Which club changes its approach? Name one from the Meridian League.';
    const c = league.clubs.find((x) => x.code === club)!;
    return {
      lever: { kind: 'tactics', club, style: tactic.style, label: tactic.label }, kind: 'TACTICS', short: `${c.short} ${tactic.label} all season`,
      changes: [{ k: 'Change', v: 'Same manager, new approach' }, { k: 'Club', v: c.short }, ...Object.entries(tactic.style).map(([k, v]) => ({ k: ({ press: 'Pressing', line: 'Defensive line', tempo: 'Tempo' } as Record<string, string>)[k], v: `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}% from ${Math.round((c.style as unknown as Record<string, number>)[k] * 100)}%` })), { k: 'From', v: 'Matchweek 1' }],
      focus: club
    };
  }

  // a different manager
  if (manager && /(took over|take over|taken over|appoint|hired|manag|in charge|replaced|had come|arrived)/.test(q)) {
    const target = clubs.find((c) => c !== manager.club) ?? defaultClub ?? 'NBR';
    if (manager.club === target) return `${manager.name} already manages ${clubName(league, target)}. Pick a different club, or a different manager.`;
    const club = league.clubs.find((c) => c.code === target)!;
    const press = Math.round((manager.style.press - club.style.press) * 100);
    const line = Math.round((manager.style.line - club.style.line) * 10);
    return {
      lever: { kind: 'manager', club: target, manager: manager.name }, kind: 'MANAGER', short: `${manager.name.split(' ').slice(-1)[0]} takes over ${club.short} in August`,
      changes: [
        { k: 'Change', v: 'New manager' },
        { k: 'Manager', v: `${manager.name}${manager.lastClub ? ` · last at ${manager.lastClub}` : manager.club ? ` · from ${clubName(league, manager.club)}` : ''}` },
        { k: 'Pressing', v: `${press >= 0 ? '+' : '−'}${Math.abs(press)}% intensity` },
        { k: 'Defensive line', v: `${Math.abs(line)} m ${line >= 0 ? 'higher' : 'deeper'}` },
        { k: 'From', v: 'Matchweek 1' }
      ],
      focus: target
    };
  }
  if (/(took over|take over|taken over|appoint|hired|in charge)/.test(q) && !manager) {
    return 'I don’t know that manager. The ones out of work right now are Ines Vance, Augustin Peverell and Tamsin Reedwick.';
  }

  // a moment in any matchweek game
  const p0 = players[0];
  const flipGoal = /(disallowed|ruled out|chalked off|hadn't scored|had not scored|never scored|missed|been saved|been cleared|cleared|saved|offside)/.test(q);
  const flipChance = /(gone in|went in|scored|converted|buried|found the net|hit the target)/.test(q);
  const minuteHint = Number(q.match(/(\d{1,2})(?:st|nd|rd|th)? minute/)?.[1] ?? NaN);
  const moments = league.feeds.flatMap((f) => f.keyMoments.map((k) => ({ f, k, e: f.events.find((x) => x.id === k.eventId)! })));
  if (p0 && (flipGoal || flipChance) && /(goal|penalt|header|shot|chance|effort|winner|equaliser|strike|curler)/.test(q)) {
    const mine = moments.filter((m) => m.e.player === p0.id && (Number.isNaN(minuteHint) || Math.floor(m.e.minute) === minuteHint));
    const pick = /penalt/.test(q) ? mine.find((m) => m.k.kind === 'penalty_saved' || (m.e.type === 'goal' && m.k.title.includes('spot')))
      : flipChance && !/(disallowed|ruled out|saved|cleared)/.test(q) ? mine.find((m) => m.e.type !== 'goal') : mine.find((m) => m.e.type === 'goal');
    if (pick) {
      const home = clubName(league, pick.f.home), away = clubName(league, pick.f.away);
      return {
        lever: { kind: 'moment', momentId: pick.k.id }, kind: 'MOMENT',
        short: pick.k.cf.type === 'remove_goal' ? `${sur(p0)}’s ${pick.k.label} goal doesn’t count` : `${sur(p0)} scores at ${pick.k.label}`,
        changes: [
          { k: 'Change', v: 'Moment flipped' },
          { k: 'Match', v: `${home} v ${away} · MW${league.currentMw}` },
          { k: 'Moment', v: `${pick.k.label} ${pick.k.title.charAt(0).toLowerCase() + pick.k.title.slice(1)}` },
          { k: 'Flipped to', v: pick.k.cf.type === 'remove_goal' ? 'No goal' : 'Goal' },
          { k: 'Re-simulated', v: 'Rest of match + every remaining game' }
        ],
        focus: (pick.e.team === 'home' ? pick.f.home : pick.f.away), other: (pick.e.team === 'home' ? pick.f.away : pick.f.home)
      };
    }
    if (mine.length === 0 && moments.some((m) => m.e.other === p0.id)) {
      const m = moments.find((x) => x.e.other === p0.id)!;
      return {
        lever: { kind: 'moment', momentId: m.k.id }, kind: 'MOMENT', short: `${m.k.title}: it goes the other way`,
        changes: [{ k: 'Change', v: 'Moment flipped' }, { k: 'Match', v: `${clubName(league, m.f.home)} v ${clubName(league, m.f.away)} · MW${league.currentMw}` }, { k: 'Moment', v: `${m.k.label} ${m.k.title}` }, { k: 'Re-simulated', v: 'Rest of match + every remaining game' }],
        focus: m.e.team === 'home' ? m.f.away : m.f.home, other: m.e.team === 'home' ? m.f.home : m.f.away
      };
    }
  }
  // flagship-match moments described without a name
  const demo = league.demo;
  const demoRules: { re: RegExp; kind: string }[] = [
    { re: /double save|(either|both) shots?/, kind: 'double_save' },
    { re: /counter.*(not|never|stopped)|kept the ball|didn't lose the ball/, kind: 'counter_goal' },
    { re: /(off the line|clearance).*(not|n't|never|hadn't)/, kind: 'clearance_off_line' }
  ];
  for (const r of demoRules) {
    if (!r.re.test(q)) continue;
    const km = demo.keyMoments.find((k) => k.kind === r.kind)!;
    return {
      lever: { kind: 'moment', momentId: km.id }, kind: 'MOMENT', short: `${km.title}: it goes the other way`,
      changes: [{ k: 'Change', v: 'Moment flipped' }, { k: 'Match', v: `Northbridge v Harbour · MW${league.currentMw}` }, { k: 'Moment', v: `${km.label} ${km.title}` }, { k: 'Re-simulated', v: 'Rest of match + every remaining game' }],
      focus: demo.home, other: demo.away
    };
  }

  if (!p0) {
    const name = clause.match(/what if ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1];
    return name ? `I can’t find ${name} in the Meridian League. Check the spelling, or try one of these.` : 'I couldn’t find a player, club, manager or moment from the Meridian League in that. Try one of these.';
  }

  // a transfer that never happened
  if (/(never|hadn't|had not|didn't|did not) (joined|join|signed|sign|moved|move|come|came)|stayed at|never left/.test(q)) {
    if (!p0.joinedFrom) return `${p0.name} has been at ${clubName(league, p0.club)} all along, so there’s no transfer to undo. Try “What if ${p0.name} had missed the season?”`;
    return {
      lever: { kind: 'transfer_cancel', player: p0.id, from: p0.joinedFrom, to: p0.club }, kind: 'TRANSFER', short: `${sur(p0)} never joins ${clubName(league, p0.club)}`,
      changes: [
        { k: 'Change', v: 'Transfer cancelled' },
        { k: 'Player', v: `${p0.name} · ${posWord[p0.pos]}` },
        { k: 'Stays at', v: clubName(league, p0.joinedFrom) },
        { k: `${clubName(league, p0.club)} play`, v: 'Their next-best option' },
        { k: 'From', v: 'Matchweek 1' }
      ],
      focus: p0.club, other: p0.joinedFrom
    };
  }
  // a player missing the season
  if (/(injur|missed the season|miss the season|without|ruled out for|out for the season|hadn't played|never played|suspended)/.test(q)) {
    return {
      lever: { kind: 'player_out', player: p0.id }, kind: 'INJURY', short: `${clubName(league, p0.club)} without ${sur(p0)}`,
      changes: [{ k: 'Change', v: 'Player out all season' }, { k: 'Player', v: `${p0.name} · ${clubName(league, p0.club)}` }, { k: 'Replaced by', v: 'Best fit on the bench' }, { k: 'From', v: 'Matchweek 1' }],
      focus: p0.club
    };
  }
  // a transfer that did happen
  if (/(signed|sign|joined|join|bought|buy|moved to|move to)/.test(q)) {
    const to = clubs.find((c) => c !== p0.club) ?? (defaultClub !== p0.club ? defaultClub : undefined);
    if (!to) return clubs.includes(p0.club) ? `${p0.name} already plays for ${clubName(league, p0.club)}.` : `Which club should ${p0.name} join? Name one from the Meridian League.`;
    if (p0.pos === 'GK' && /striker|forward|up front/.test(q)) return 'A keeper up front? I’ll allow it in the 94th minute, not for a whole season.';
    return {
      lever: { kind: 'transfer_add', player: p0.id, to }, kind: 'TRANSFER', short: `${sur(p0)} joins ${clubName(league, to)}`,
      changes: [{ k: 'Change', v: 'Transfer added' }, { k: 'Player', v: `${p0.name} · ${posWord[p0.pos]} from ${clubName(league, p0.club)}` }, { k: 'Joins', v: clubName(league, to) }, { k: 'From', v: 'Matchweek 1' }],
      focus: to, other: p0.club
    };
  }
  return `I found ${p0.name}, but not what you want to change. Try “never joined”, “joined [club]”, “missed the season” or “[his] goal had been ruled out”.`;
}

export function drFootball(league: League, prompt: string): Parsed | Rejected {
  const all = examples(league).map((e) => e.text);
  const no = (reply: string): Rejected => ({ ok: false, reply, suggestions: all.slice(0, 4) });
  const q = norm(prompt);
  if (q.length < 8) return no('Give me a full sentence, like the examples below, and I’ll play it out.');
  const outside = denyMatch(prompt); // real clubs, competitions or players, checked against hashes
  if (outside) return no(`I only know the Meridian League, and “${outside}” isn’t in it. Every club and player here is invented, so try one of ours.`);
  if (/\b(1[2-9]|[2-9]\d) (players|men)\b|twelve players/.test(q)) return no('Eleven a side, I’m afraid. I can change who plays, not how many.');
  if (/\b(score[sd]?|scoring) (\d{2,}|a hundred|100)\b|\bwon every\b|\bnever lost\b|\bunbeaten all season\b/.test(q)) return no('That isn’t a what-if, that’s a wish. I can change one thing and play the season out, and the simulator decides how it ends.');

  // two changes in one sentence: try splitting on "and" / "but"
  const parts = prompt.split(/\s+(?:and|but|while|plus)\s+(?=[A-Za-z’']+(?:\s[A-Za-z’']+)?\s+(?:had|was|were|got|never|pressed|sat|joined|took))/i);
  if (parts.length === 2) {
    const a = parseOne(league, parts[0]);
    if (typeof a !== 'string') {
      const b = parseOne(league, parts[1], a.focus);
      if (typeof b !== 'string') {
        if (a.lever.kind === 'moment' && b.lever.kind === 'moment') return no('One flipped moment at a time, please. Pair it with a transfer, a manager or a points change instead.');
        return {
          ok: true, levers: [a.lever, b.lever], kind: 'COMBINED', short: `${a.short}, and ${b.short.charAt(0).toLowerCase()}${b.short.slice(1)}`,
          changes: [...a.changes.map((c) => ({ ...c, k: c.k === 'Change' ? 'Change 1' : c.k })), ...b.changes.filter((c) => c.k !== 'From' && c.k !== 'Re-simulated').map((c) => ({ ...c, k: c.k === 'Change' ? 'Change 2' : c.k }))],
          focus: a.focus, other: a.other ?? (b.focus !== a.focus ? b.focus : b.other)
        };
      }
    }
  }
  const one = parseOne(league, prompt);
  if (typeof one === 'string') return no(one);
  return { ok: true, levers: [one.lever], kind: one.kind, short: one.short, changes: one.changes, focus: one.focus, other: one.other };
}
