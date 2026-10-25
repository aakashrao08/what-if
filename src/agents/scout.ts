// The Scout: watches every match you care about on the replay clock and decides what deserves an
// alert at your settings. It merges swings that land within a few minutes of each other, follows
// results elsewhere that move your race (the "Other results that affect you" switch), ranks what it
// found, and writes each alert in your language and from your side. Every alert carries its own
// facts, so the Verifier checks each one; live mode lets a model rewrite them under the same check.

import type { DemoMatch, League, Side } from '../data/types';
import type { GhostResult, Timeline } from '../engine/demo';
import type { RippleResult } from '../engine/league';
import { table } from '../engine/league';
import { raceProb, type Race } from '../engine/takes';
import { verify, type Facts, type Verdict } from './verifier';
import type { Lang } from './format';

export type AlertType = 'SWING' | 'GHOST RUN' | 'RIPPLE' | 'ELSEWHERE';
export interface ScoutAlert { key: string; min: number; label: string; type: AlertType; text: string; facts: Facts; priority: number; pick: boolean; verdict: Verdict }

export interface ScoutInput {
  league: League;
  followed: string[]; // your club first
  threshold: number; // points of win chance
  alerts: { swing: boolean; ghost: boolean; ripple: boolean; others: boolean };
  lang: Lang;
  fan: boolean; // write from your side ("our win chance") rather than about the club
  timelines: Record<string, Timeline | undefined>;
  ghostsBy: Record<string, GhostResult[] | undefined>;
  minuteOf: (f: DemoMatch) => number;
  ripples: Record<string, RippleResult | undefined>; // full-time ripples by fixture
}

interface Bank {
  win: (fan: boolean, club: string, path: string) => string; // path: "40% → 22%" or "22% → 41% → 22%"
  race: (fan: boolean, club: string, r: Race, b: number, a: number) => string;
  ghostFor: (fan: boolean, club: string, label: string, g: number) => string;
  ghostAgainst: (fan: boolean, club: string, label: string, g: number) => string;
  ft: string;
  merged: string;
}

const BANK: Record<Lang, Bank> = {
  en: {
    win: (fan, c, p) => `${fan ? 'Our' : `${c}’s`} win chance: ${p}.`,
    race: (fan, c, r, b, a) => `${fan ? 'Our' : `${c}’s`} ${{ title: 'title', top4: 'top-four', survive: 'survival' }[r]} chances: ${b}% → ${a}%.`,
    ghostFor: (fan, c, l, g) => fan ? `Ghost Run: the attack we lost at ${l} goes on to score ${g}% of the time.` : `Ghost Run: ${c}’s attack stopped at ${l} goes on to score ${g}% of the time.`,
    ghostAgainst: (fan, c, l, g) => fan ? `Let-off at ${l}: that attack scores against us ${g}% of the time in the Ghost Run.` : `${c} got away with one at ${l}: a goal ${g}% of the time in the Ghost Run.`,
    ft: 'Full time.', merged: 'Two swings in quick succession.'
  },
  zh: {
    win: (fan, c, p) => `${fan ? '我们' : c}的胜率：${p}。`,
    race: (fan, c, r, b, a) => `${fan ? '我们' : c}的${{ title: '夺冠', top4: '前四', survive: '保级' }[r]}概率：${b}% → ${a}%。`,
    ghostFor: (fan, c, l, g) => `幽灵推演：${fan ? '我们' : c}在${l}被阻止的进攻，继续下去有${g}%的概率进球。`,
    ghostAgainst: (fan, c, l, g) => fan ? `${l}逃过一劫：那次进攻有${g}%的概率攻破我们的球门。` : `${c}在${l}逃过一劫：幽灵推演中有${g}%的概率失球。`,
    ft: '全场结束。', merged: '短时间内两次大起伏。'
  },
  ms: {
    win: (fan, c, p) => `Peluang ${fan ? 'kita' : c} menang: ${p}.`,
    race: (fan, c, r, b, a) => `Peluang ${fan ? 'kita' : c} ${{ title: 'menjadi juara', top4: 'ke empat teratas', survive: 'kekal di liga' }[r]}: ${b}% → ${a}%.`,
    ghostFor: (fan, c, l, g) => `Ghost Run: serangan ${fan ? 'kita' : c} yang disekat pada ${l} menjadi gol ${g}% daripada masa.`,
    ghostAgainst: (fan, c, l, g) => fan ? `Nasib baik pada ${l}: serangan itu menjadi gol menentang kita ${g}% daripada masa.` : `Nasib baik untuk ${c} pada ${l}: gol ${g}% daripada masa dalam Ghost Run.`,
    ft: 'Tamat perlawanan.', merged: 'Dua perubahan besar dalam masa singkat.'
  },
  ta: {
    win: (fan, c, p) => `${fan ? 'நமது' : `${c} அணியின்`} வெற்றி வாய்ப்பு: ${p}.`,
    race: (fan, c, r, b, a) => `${fan ? 'நமது' : `${c} அணியின்`} ${{ title: 'சாம்பியன் பட்ட', top4: 'முதல் நான்கு இட', survive: 'லீக்கில் நீடிக்கும்' }[r]} வாய்ப்பு: ${b}% → ${a}%.`,
    ghostFor: (fan, c, l, g) => `கோஸ்ட் ரன்: ${l} இல் தடுக்கப்பட்ட ${fan ? 'நமது' : `${c} அணியின்`} தாக்குதல் தொடர்ந்திருந்தால் ${g}% முறை கோல் ஆகியிருக்கும்.`,
    ghostAgainst: (fan, c, l, g) => fan ? `${l} இல் தப்பித்தோம்: அந்தத் தாக்குதல் ${g}% முறை நமக்கு எதிராக கோல் ஆகியிருக்கும்.` : `${l} இல் ${c} தப்பித்தது: கோஸ்ட் ரன்னில் ${g}% முறை கோல்.`,
    ft: 'ஆட்டம் முடிந்தது.', merged: 'குறுகிய நேரத்தில் இரண்டு பெரிய மாற்றங்கள்.'
  },
  hi: {
    win: (fan, c, p) => `${fan ? 'हमारी' : `${c} की`} जीत की संभावना: ${p}।`,
    race: (fan, c, r, b, a) => `${fan ? 'हमारी' : `${c} की`} ${{ title: 'ख़िताब', top4: 'टॉप फ़ोर', survive: 'लीग में बने रहने' }[r]} की संभावना: ${b}% → ${a}%।`,
    ghostFor: (fan, c, l, g) => `घोस्ट रन: ${l} पर रोका गया ${fan ? 'हमारा' : `${c} का`} हमला आगे बढ़ता तो ${g}% बार गोल होता।`,
    ghostAgainst: (fan, c, l, g) => fan ? `${l} पर बच गए: वह हमला ${g}% बार हमारे ख़िलाफ़ गोल बनता।` : `${l} पर ${c} बच गया: घोस्ट रन में ${g}% बार गोल।`,
    ft: 'फ़ुल टाइम।', merged: 'कुछ ही मिनटों में दो बड़े उतार-चढ़ाव।'
  },
  es: {
    win: (fan, c, p) => `${fan ? 'Nuestra probabilidad de victoria' : `Probabilidad de victoria de ${c}`}: ${p}.`,
    race: (fan, c, r, b, a) => `${fan ? 'Nuestras opciones' : `Opciones de ${c}`} de ${{ title: 'ganar la liga', top4: 'acabar entre los cuatro primeros', survive: 'salvarse' }[r]}: ${b}% → ${a}%.`,
    ghostFor: (fan, c, l, g) => `Ghost Run: ${fan ? 'el ataque que nos cortaron' : `el ataque de ${c} cortado`} en el ${l} acaba en gol el ${g}% de las veces.`,
    ghostAgainst: (fan, c, l, g) => fan ? `Nos salvamos en el ${l}: ese ataque acaba en gol en contra el ${g}% de las veces.` : `${c} se salvó en el ${l}: gol el ${g}% de las veces en el Ghost Run.`,
    ft: 'Final del partido.', merged: 'Dos vuelcos seguidos.'
  },
  pt: {
    win: (fan, c, p) => `${fan ? 'Nossa chance de vitória' : `Chance de vitória de ${c}`}: ${p}.`,
    race: (fan, c, r, b, a) => `${fan ? 'Nossas chances' : `Chances de ${c}`} de ${{ title: 'ser campeão', top4: 'terminar entre os quatro primeiros', survive: 'escapar do rebaixamento' }[r]}: ${b}% → ${a}%.`,
    ghostFor: (fan, c, l, g) => `Ghost Run: ${fan ? 'o nosso ataque interrompido' : `o ataque de ${c} interrompido`} aos ${l} termina em gol ${g}% das vezes.`,
    ghostAgainst: (fan, c, l, g) => fan ? `Escapamos aos ${l}: aquele ataque termina em gol contra nós ${g}% das vezes.` : `${c} escapou aos ${l}: gol ${g}% das vezes no Ghost Run.`,
    ft: 'Fim de jogo.', merged: 'Duas viradas seguidas.'
  }
};

const path = (...ps: number[]) => ps.map((x) => `${x}%`).join(' → ');
const winOf = (wp: { home: number; away: number }, s: Side) => Math.round(s === 'home' ? wp.home : wp.away);
const pct = (x: number) => Math.round(x * 100);

/** The race that matters for a club: where they sit in the table. */
export function raceFor(league: League, club: string): Race {
  const pos = table(league).findIndex((r) => r.code === club) + 1;
  return pos <= 3 ? 'title' : pos <= 10 ? 'top4' : 'survive';
}

export function scoutAlerts(s: ScoutInput): ScoutAlert[] {
  const { league } = s;
  const B = BANK[s.lang];
  const short = (code: string) => league.clubs.find((c) => c.code === code)!.short;
  const out: Omit<ScoutAlert, 'pick' | 'verdict'>[] = [];
  const myFeeds = league.feeds.filter((f) => s.followed.includes(f.home) || s.followed.includes(f.away));

  for (const f of myFeeds) {
    const t = s.timelines[f.fixtureId];
    if (!t) continue;
    const m = s.minuteOf(f);
    for (const side of (['home', 'away'] as const).filter((x) => s.followed.includes(x === 'home' ? f.home : f.away))) {
      const code = side === 'home' ? f.home : f.away;
      const fan = s.fan && code === s.followed[0];
      const name = short(code);

      if (s.alerts.swing) {
        // big swings, with any that land within four minutes of the previous one folded into it
        type Ev = Timeline['events'][number];
        const big: Ev[] = t.events.filter((ev) => ev.minute <= m && Math.abs(winOf(ev.after, side) - winOf(ev.before, side)) >= s.threshold);
        const groups: Ev[][] = [];
        for (const ev of big) {
          const g = groups[groups.length - 1];
          if (g && ev.minute - g[g.length - 1].minute <= 4) g.push(ev); else groups.push([ev]);
        }
        for (const g of groups) {
          const first = g[0], last = g[g.length - 1];
          const e = f.events.find((x) => x.id === last.id)!;
          const b = winOf(first.before, side), a = winOf(last.after, side);
          const facts: Facts = { b, a, minute: Math.floor(last.minute), label: e.label };
          let text = B.win(fan, name, path(b, a));
          if (g.length > 1) {
            // show where it went in between: the furthest point from the start
            const mid = g.slice(0, -1).map((x) => winOf(x.after, side)).reduce((m, v) => (Math.abs(v - b) > Math.abs(m - b) ? v : m));
            facts.mid = mid;
            text = `${B.merged} ${B.win(fan, name, path(b, mid, a))}`;
          }
          else if (s.lang === 'en') { text = `${text} ${e.text}.`; facts.event = e.text; }
          out.push({ key: `sw-${last.id}-${side}`, min: last.minute, label: e.label, type: 'SWING', text, facts, priority: Math.abs(a - b) });
        }
      }

      if (s.alerts.ghost) {
        for (const g of s.ghostsBy[f.fixtureId] ?? []) {
          const a = f.stoppedAttacks.find((x) => x.id === g.id)!;
          if (a.minute > m || g.goalPct < 20) continue;
          const ours = a.team === side;
          const text = ours ? B.ghostFor(fan, name, a.label, g.goalPct) : B.ghostAgainst(fan, name, a.label, g.goalPct);
          out.push({ key: `gr-${g.id}-${side}`, min: a.minute, label: a.label, type: 'GHOST RUN', text, facts: { g: g.goalPct, n: g.n, label: a.label }, priority: g.goalPct / 3 });
        }
      }

      const rip = s.ripples[f.fixtureId];
      if (s.alerts.ripple && m >= 94 && rip) {
        const race = raceFor(league, code);
        const b = pct(raceProb(rip.before[code], race).p), a = pct(raceProb(rip.after[code], race).p);
        out.push({ key: `rp-${f.fixtureId}-${side}`, min: 94, label: 'FT', type: 'RIPPLE', text: `${B.ft} ${B.race(fan, name, race, b, a)}`, facts: { b, a, hg: rip.result.hg, ag: rip.result.ag }, priority: Math.abs(a - b) * 1.5 });
      }
    }
  }

  // results elsewhere that move your club's race
  if (s.alerts.others) {
    const me = s.followed[0];
    const race = raceFor(league, me);
    for (const f of league.feeds) {
      if (s.followed.includes(f.home) || s.followed.includes(f.away) || s.minuteOf(f) < 94) continue;
      const rip = s.ripples[f.fixtureId];
      if (!rip) continue;
      const b = pct(raceProb(rip.before[me], race).p), a = pct(raceProb(rip.after[me], race).p);
      if (Math.abs(a - b) < 2) continue;
      const score = `${short(f.home)} ${rip.result.hg}–${rip.result.ag} ${short(f.away)}.`;
      out.push({ key: `el-${f.fixtureId}`, min: 94, label: 'FT', type: 'ELSEWHERE', text: `${score} ${B.race(s.fan, short(me), race, b, a)}`, facts: { b, a, hg: rip.result.hg, ag: rip.result.ag }, priority: Math.abs(a - b) * 1.5 });
    }
  }

  out.sort((x, y) => y.min - x.min || y.priority - x.priority);
  const top = out.reduce<(typeof out)[number] | null>((best, x) => (!best || x.priority > best.priority ? x : best), null);
  return out.map((x) => ({ ...x, pick: x === top, verdict: verify(x.text, x.facts, s.lang) }));
}
