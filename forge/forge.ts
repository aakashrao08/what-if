// The Forge: builds the synthetic Meridian League and writes src/data/league.json.
//
//   npm run forge            -> default seed
//   npm run forge -- 4242    -> another league
//
// 1. Squads: 20 invented clubs x 25 invented players, attributes drawn from each club's tier.
// 2. Schedule: double round-robin, with Northbridge v Harbour Athletic moved to matchweek 34.
// 3. Season: matchweeks 1-33 (and the early MW34 games) are simulated with the same match
//    engine the app uses. The Forge searches simulation seeds until the table sets up the
//    demo story: Northbridge chasing the top four, Harbour in the bottom three.
// 4. The demo fixture's event log comes from demo.ts.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Club, Fixture, League, Manager, Player, Position, Role } from '../src/data/types';
import { gaussian, hashSeed, mulberry32, poisson, type Rng } from '../src/engine/rng';
import { clubRatings } from '../src/engine/ratings';
import { matchRates, type Rates } from '../src/engine/match';
import { buildTable, roundRobin, type Result } from '../src/engine/season';
import { CLUBS, FREE_AGENT_MANAGERS } from './clubs';
import { playerName, shortName } from './names';
import { buildDemo } from './demo';
import { generateFeed } from './feedgen';

const SEED = Number(process.argv[2] ?? 2026);

/**
 * The match model the league was forged with: independent Poisson goals. The app's forecasting
 * engine has moved on (draw correction), but the season that already happened must not change,
 * so the Forge keeps its own copy.
 */
const playMatch = (rates: Rates, rng: Rng) => ({ home: poisson(rng, rates.home), away: poisson(rng, rates.away) });
const DEMO_MW = 34;
const DEMO_ID = `MW${DEMO_MW}-NBR-HAR`;

const NUMBERS: Record<Position, number[]> = {
  GK: [1, 13, 31],
  DF: [2, 3, 4, 5, 12, 14, 15, 22],
  MF: [6, 7, 8, 16, 17, 18, 20, 23],
  FW: [9, 10, 11, 19, 21, 24]
};
const STARTER_NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

// The players the demo story is about. Everyone else is generated.
type Named = { name: string; age: number; attrs: Partial<Player['attrs']>; topSpeed?: number; joinedFrom?: string; penalties?: Player['penalties'] };
const NAMED: Record<string, Named> = {
  'NBR-9': { name: 'Kit Nettleshaw', age: 24, attrs: { finishing: 86, pace: 82, passing: 72, defending: 31 }, topSpeed: 33.4, joinedFrom: 'FEN' },
  'NBR-10': { name: 'Dex Bobbinford', age: 27, attrs: { finishing: 79, pace: 76, passing: 71, defending: 34 }, topSpeed: 32.6 },
  'NBR-5': { name: 'Tobias Quillfeather', age: 26, attrs: { defending: 82, pace: 80, passing: 66, finishing: 38 }, topSpeed: 31.2 },
  'NBR-8': { name: 'Wilf Tumbleton', age: 33, attrs: { passing: 74, defending: 66, finishing: 58, pace: 61 } },
  'NBR-6': { name: 'Arlo Pickleworth', age: 22, attrs: { passing: 78, defending: 64, finishing: 62, pace: 72 } },
  'HAR-1': { name: 'Rufus Tallowby', age: 29, attrs: { keeping: 74 }, penalties: { faced: 6, saved: 2 } },
  'HAR-9': { name: 'Ferdie Gorseby', age: 30, attrs: { finishing: 74, pace: 66, passing: 60, defending: 40 } },
  'HAR-11': { name: 'Jonty Sorrelwick', age: 23, attrs: { finishing: 72, pace: 81, passing: 64, defending: 33 }, topSpeed: 32.0 },
  'HAR-8': { name: 'Ezra Pennywhistle', age: 28, attrs: { passing: 79, defending: 58, finishing: 55, pace: 66 } },
  'HAR-4': { name: 'Gus Marrowshaw', age: 31, attrs: { defending: 70, pace: 63, passing: 58, finishing: 30 } }
};

const clampA = (v: number) => Math.max(20, Math.min(95, Math.round(v)));

function attrsFor(rng: Rng, pos: Position, q: number): Player['attrs'] {
  const g = () => gaussian(rng) * 4;
  const low = () => 25 + rng() * 15;
  switch (pos) {
    case 'GK': return { keeping: clampA(q + g()), defending: clampA(low()), passing: clampA(q - 18 + g()), pace: clampA(low() + 15), finishing: clampA(low() - 5) };
    case 'DF': return { defending: clampA(q + g()), pace: clampA(q - 5 + g()), passing: clampA(q - 8 + g()), finishing: clampA(low() + 10), keeping: 10 };
    case 'MF': return { passing: clampA(q + g()), defending: clampA(q - 8 + g()), finishing: clampA(q - 10 + g()), pace: clampA(q - 4 + g()), keeping: 10 };
    case 'FW': return { finishing: clampA(q + g()), pace: clampA(q - 2 + g()), passing: clampA(q - 10 + g()), defending: clampA(low()), keeping: 10 };
  }
}

function buildSquads(rng: Rng): Player[] {
  const used = new Set(Object.values(NAMED).map((n) => n.name));
  // keep generated players clearly distinct from the demo cast (no second Kit, no Gorsewick next to Gorseby)
  const castFirst = new Set(Object.values(NAMED).map((n) => n.name.split(' ')[0]));
  const castStems = Object.values(NAMED).map((n) => n.name.split(' ')[1].slice(0, 5).toLowerCase());
  const avoid = (full: string) => {
    const [first, ...rest] = full.split(' ');
    const surname = rest.join(' ').toLowerCase();
    return castFirst.has(first) || castStems.some((s) => surname.startsWith(s));
  };
  const players: Player[] = [];
  for (const c of CLUBS) {
    for (const pos of ['GK', 'DF', 'MF', 'FW'] as Position[]) {
      for (const number of NUMBERS[pos]) {
        const id = `${c.code}-${number}`;
        const starter = STARTER_NUMBERS.has(number);
        const q = 56 + c.tier * 16 + (starter ? 3 : -3);
        const named = NAMED[id];
        const attrs = { ...attrsFor(rng, pos, q), ...(named?.attrs ?? {}) };
        const name = named?.name ?? playerName(rng, used, avoid);
        const age = named?.age ?? Math.round(19 + rng() * 15);
        const p: Player = {
          id, name, short: shortName(name), club: c.code, pos, number, age, attrs,
          topSpeed: named?.topSpeed ?? Math.round((27.5 + (attrs.pace / 99) * 6 + gaussian(rng) * 0.4) * 10) / 10,
          starter, goals: 0
        };
        if (named?.joinedFrom) p.joinedFrom = named.joinedFrom;
        if (pos === 'GK') {
          const faced = named?.penalties?.faced ?? Math.round(starter ? 3 + rng() * 11 : rng() * 4);
          const pSave = 0.19 + (attrs.keeping - 70) / 400;
          let saved = 0;
          for (let i = 0; i < faced; i++) if (rng() < pSave) saved++;
          p.penalties = named?.penalties ?? { faced, saved };
        }
        players.push(p);
      }
    }
  }
  return players;
}

function buildClubs(): Club[] {
  return CLUBS.map(({ tier: _tier, ...c }) => c);
}

function schedule(rng: Rng): Fixture[] {
  const codes = CLUBS.map((c) => c.code);
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  const games = roundRobin(codes);
  const demoMw = games.find((g) => g.home === 'NBR' && g.away === 'HAR')!.mw;
  const relabel = (mw: number) => (mw === demoMw ? DEMO_MW : mw === DEMO_MW ? demoMw : mw);
  const KO = ['12:30', '15:00', '15:00', '15:00', '15:00', '17:30', '20:00'];
  return games
    .map((g) => ({ ...g, mw: relabel(g.mw) }))
    .sort((a, b) => a.mw - b.mw)
    .map((g) => ({ id: `MW${g.mw}-${g.home}-${g.away}`, mw: g.mw, home: g.home, away: g.away, kickoff: KO[Math.floor(rng() * KO.length)] }));
}

interface SeasonPick { seed: number; fixtures: Fixture[]; score: number; notes: string }

/** Simulate the season so far and score how well the table sets up the demo story. */
function trySeason(base: Fixture[], ratings: ReturnType<typeof clubRatings>, simSeed: number): SeasonPick {
  const rng = mulberry32(simSeed);
  const codes = CLUBS.map((c) => c.code);
  const fixtures = base.map((f) => ({ ...f }));
  const play = (f: Fixture) => {
    const r = playMatch(matchRates(ratings[f.home], ratings[f.away]), rng);
    f.hg = r.home; f.ag = r.away;
  };
  for (const f of fixtures) if (f.mw < DEMO_MW) play(f);
  const res = (): Result[] => fixtures.filter((f) => f.hg !== undefined).map((f) => ({ home: f.home, away: f.away, hg: f.hg!, ag: f.ag! }));

  // the club just behind Northbridge plays late on MW34, so its game is still to come
  const t33 = buildTable(codes, res());
  const nbrPos33 = t33.findIndex((r) => r.code === 'NBR');
  const chaser = t33[Math.min(nbrPos33 + 1, t33.length - 1)].code;
  let early = 0;
  for (const f of fixtures.filter((x) => x.mw === DEMO_MW)) {
    if (f.id === DEMO_ID) { f.kickoff = '15:00'; continue; }
    if (f.home === chaser || f.away === chaser) { f.kickoff = '17:30'; continue; }
    f.kickoff = early++ < 2 ? '12:30' : '15:00';
    play(f);
  }

  const t = buildTable(codes, res());
  const pos = (c: string) => t.findIndex((r) => r.code === c) + 1;
  const pts = (i: number) => t[i - 1].pts;
  const nbr = pos('NBR');
  const har = pos('HAR');
  let score = 0;
  score += Math.abs(nbr - 5) * 10;
  score += Math.abs(har - 18) * 10;
  const gap4 = pts(4) - pts(5);
  if (nbr === 5 && (gap4 < 1 || gap4 > 3)) score += 6;
  if (nbr === 5 && pts(5) - pts(6) > 2) score += 4;
  const harPts = t[har - 1].pts;
  if (har === 18 && !(harPts + 3 > pts(16))) score += 6;
  if (har === 18 && harPts <= pts(19)) score += 3;
  if (pts(1) < 66 || pts(1) > 84) score += 5;
  if (pts(20) > 30) score += 3;
  return { seed: simSeed, fixtures, score, notes: `NBR ${nbr} (gap to 4th ${gap4}), HAR ${har}, top ${pts(1)} pts` };
}

function assignGoals(rng: Rng, players: Player[], fixtures: Fixture[], ratings: ReturnType<typeof clubRatings>) {
  const byClub = new Map<string, Player[]>();
  for (const p of players) byClub.set(p.club, [...(byClub.get(p.club) ?? []), p]);
  const weight = (p: Player) => {
    const base = p.pos === 'FW' ? 3 : p.pos === 'MF' ? 1 : p.pos === 'DF' ? 0.25 : 0;
    return base * Math.pow(p.attrs.finishing / 70, 3) * (p.starter ? 3 : 1);
  };
  const xgShare = (code: string, xg: number) => {
    const squad = byClub.get(code)!;
    const ws = squad.map(weight);
    const total = ws.reduce((a, b) => a + b, 0);
    squad.forEach((p, i) => { p.xg = (p.xg ?? 0) + (xg * ws[i]) / total; });
  };
  const score = (code: string, goals: number) => {
    const squad = byClub.get(code)!;
    const ws = squad.map(weight);
    const total = ws.reduce((a, b) => a + b, 0);
    for (let g = 0; g < goals; g++) {
      let r = rng() * total;
      for (let i = 0; i < squad.length; i++) { r -= ws[i]; if (r <= 0) { squad[i].goals++; break; } }
    }
  };
  for (const f of fixtures) {
    if (f.hg === undefined) continue;
    const r = matchRates(ratings[f.home], ratings[f.away]);
    xgShare(f.home, r.home); xgShare(f.away, r.away);
    if (f.mw !== DEMO_MW) { score(f.home, f.hg); score(f.away, f.ag!); }
  }
}

/**
 * Appearances, assists, cards and clean sheets for every played game. Runs last, on its own random
 * stream, so the squads, results, goals and feeds are exactly what they were before it existed.
 * Matchweek-34 games use their feeds (assisters and bookings on screen); earlier ones are drawn.
 */
function assignSeasonStats(seed: number, players: Player[], clubs: Club[], fixtures: Fixture[], feeds: League['feeds']) {
  const rng = mulberry32(hashSeed('season-stats', seed));
  const byClub = new Map<string, Player[]>();
  for (const p of players) { byClub.set(p.club, [...(byClub.get(p.club) ?? []), p]); Object.assign(p, { apps: 0, assists: 0, yellow: 0, red: 0 }); if (p.pos === 'GK') p.cleanSheets = 0; }
  const pick = (squad: Player[], w: (p: Player) => number) => {
    const ws = squad.map(w);
    let r = rng() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < squad.length; i++) { r -= ws[i]; if (r <= 0) return squad[i]; }
    return squad[squad.length - 1];
  };
  const assistW = (p: Player) => ({ FW: 2, MF: 3, DF: 1, GK: 0.05 }[p.pos]) * Math.pow(p.attrs.passing / 70, 3) * (p.starter ? 3 : 1);
  const cardW = (p: Player) => ({ FW: 1.2, MF: 2.5, DF: 3, GK: 0.2 }[p.pos]) * (p.starter ? 3 : 1) * (1 + (p.attrs.defending - 50) / 100);
  const keeper = (code: string) => byClub.get(code)!.find((p) => p.pos === 'GK' && p.starter)!;
  const feedOf = new Map(feeds.map((f) => [f.fixtureId, f]));
  for (const f of fixtures) {
    if (f.hg === undefined && f.mw !== DEMO_MW) continue;
    const feed = feedOf.get(f.id);
    if (f.hg === undefined && !feed) continue; // not played yet
    for (const code of [f.home, f.away]) {
      const squad = byClub.get(code)!;
      const style = clubs.find((c) => c.code === code)!.style;
      for (const p of squad) if (rng() < (p.starter ? 0.9 : 0.3)) p.apps!++;
      if (feed) continue;
      const scored = code === f.home ? f.hg! : f.ag!;
      for (let g = 0; g < scored; g++) if (rng() < 0.74) pick(squad, assistW).assists!++;
      const yellows = poisson(rng, 1.7 * (1 + 0.4 * (style.press - 0.5)));
      for (let y = 0; y < yellows; y++) pick(squad, cardW).yellow!++;
      if (rng() < 0.06) pick(squad, cardW).red!++;
      if ((code === f.home ? f.ag : f.hg) === 0) keeper(code).cleanSheets!++;
    }
  }
  // matchweek 34: the feeds say who assisted and who was booked
  const P = (id?: string) => players.find((p) => p.id === id);
  for (const feed of feeds) {
    const goals = { home: 0, away: 0 };
    for (const e of feed.events) {
      if (e.type === 'goal') { goals[e.team!]++; const a = P(e.other); if (a) a.assists!++; }
      if (/yellow card/i.test(e.text)) { const b = P(e.type === 'foul' ? e.other : e.player); if (b) b.yellow!++; }
      if (/red card|sent off/i.test(e.text)) { const b = P(e.type === 'foul' ? e.other : e.player); if (b) b.red!++; }
    }
    if (goals.away === 0) keeper(feed.home).cleanSheets!++;
    if (goals.home === 0) keeper(feed.away).cleanSheets!++;
  }
}

/**
 * Roles from attributes, within each squad (starters and bench sorted separately): the quicker defenders
 * play full-back and the stronger ones centre-back; the most defensive midfielder sits, the most
 * creative plays behind the strikers; the best finisher leads the line and the quickest forwards play
 * wide. No randomness, so nothing else in the league moves. Shirt numbers play no part.
 */
function assignRoles(players: Player[]) {
  const byClub = new Map<string, Player[]>();
  for (const p of players) byClub.set(p.club, [...(byClub.get(p.club) ?? []), p]);
  for (const squad of byClub.values()) {
    for (const starter of [true, false]) {
      const group = (pos: Position) => squad.filter((p) => p.pos === pos && p.starter === starter);
      for (const p of group('GK')) p.role = 'GK';
      const dfs = group('DF').sort((a, b) => (b.attrs.pace - b.attrs.defending) - (a.attrs.pace - a.attrs.defending) || a.id.localeCompare(b.id));
      dfs.forEach((p, i) => { p.role = i < Math.ceil(dfs.length / 2) ? 'FB' : 'CB'; });
      const mfs = group('MF');
      const dm = [...mfs].sort((a, b) => (b.attrs.defending - b.attrs.passing) - (a.attrs.defending - a.attrs.passing) || a.id.localeCompare(b.id))[0];
      const am = [...mfs].filter((p) => p !== dm).sort((a, b) => (b.attrs.finishing + b.attrs.passing) - (a.attrs.finishing + a.attrs.passing) || a.id.localeCompare(b.id))[0];
      for (const p of mfs) p.role = p === dm ? 'DM' : p === am ? 'AM' : 'CM';
      const fws = group('FW');
      const st = [...fws].sort((a, b) => (b.attrs.finishing - b.attrs.pace) - (a.attrs.finishing - a.attrs.pace) || a.id.localeCompare(b.id))[0];
      for (const p of fws) p.role = p === st || (!starter && fws.indexOf(p) % 2 === 1) ? 'ST' : 'W';
    }
  }
}

/** The detailed profile: tackling, aerial, crossing, vision, dribbling, stamina, shaped by role. Own random stream. */
function assignProfiles(seed: number, players: Player[]) {
  const rng = mulberry32(hashSeed('profiles', seed));
  const c = (v: number) => Math.max(20, Math.min(95, Math.round(v + gaussian(rng) * 4)));
  for (const p of players) {
    const a = p.attrs, r = p.role!;
    const lean = (roles: Role[], plus: number, minus = -6) => (roles.includes(r) ? plus : minus);
    a.tackling = c(a.defending + lean(['CB', 'FB', 'DM'], 2, -4));
    a.aerial = c((a.defending + a.finishing) / 2 + lean(['CB', 'ST'], 12, -4) + (r === 'GK' ? 4 : 0));
    a.crossing = c(a.passing + lean(['FB', 'W'], 8, -8));
    a.vision = c(a.passing + lean(['AM', 'CM'], 6, -6));
    a.dribbling = c((a.pace + a.finishing) / 2 + lean(['W', 'AM'], 10, -6));
    a.stamina = c(62 + lean(['FB', 'CM', 'DM', 'W'], 12, 0) - (p.age > 31 ? (p.age - 31) * 2 : 0));
  }
}

/**
 * What each role is judged on, as season totals: a centre-back on clearances, aerial duels, interceptions and
 * progressive passes; a full-back on tackles, crosses and carries as well; midfielders on progressive and key
 * passes; wingers on dribbles and crosses; strikers on shots and aerial duels; keepers on saves. Totals scale
 * with appearances (a substitute's appearance counts for about a third of a game), the profile, and the club's
 * style and strength. Own random stream, run last, so every number above is unchanged.
 */
function assignPositionStats(seed: number, players: Player[], clubs: Club[], fixtures: Fixture[], ratings: ReturnType<typeof clubRatings>) {
  const rng = mulberry32(hashSeed('position-stats', seed));
  const conceded = new Map<string, number>();
  const played = new Map<string, number>();
  for (const f of fixtures) {
    if (f.hg === undefined) continue;
    conceded.set(f.home, (conceded.get(f.home) ?? 0) + f.ag!); conceded.set(f.away, (conceded.get(f.away) ?? 0) + f.hg);
    played.set(f.home, (played.get(f.home) ?? 0) + 1); played.set(f.away, (played.get(f.away) ?? 0) + 1);
  }
  // per full game: tackles, interceptions, clearances, blocks, aerials won, progressive passes, progressive carries, key passes, crosses, dribbles
  const RATES: Record<Role, number[]> = {
    CB: [1.3, 1.5, 4.4, 0.8, 3.0, 3.4, 0.6, 0.2, 0.05, 0.2],
    FB: [2.1, 1.1, 1.5, 0.4, 1.0, 4.0, 2.2, 0.8, 1.1, 0.8],
    DM: [2.4, 1.4, 1.0, 0.4, 1.2, 5.5, 1.0, 0.6, 0.1, 0.5],
    CM: [1.7, 0.9, 0.6, 0.3, 0.8, 6.2, 1.8, 1.2, 0.4, 0.9],
    AM: [0.9, 0.5, 0.3, 0.1, 0.5, 4.8, 2.6, 2.0, 0.6, 1.8],
    W: [0.7, 0.3, 0.2, 0.1, 0.4, 2.2, 3.6, 1.4, 1.3, 2.6],
    ST: [0.5, 0.3, 0.6, 0.1, 2.6, 1.2, 1.4, 0.9, 0.1, 1.1],
    GK: [0, 0, 0.3, 0, 0.6, 0.5, 0, 0, 0, 0]
  };
  for (const p of players) {
    const club = clubs.find((x) => x.code === p.club)!;
    const a = p.attrs, r = p.role!;
    const games = (p.apps ?? 0) * (p.starter ? 1 : 0.35);
    // a better attribute means more of the action; a poor one still leaves a floor (a winger still makes tackles)
    const f = (v: number | undefined) => Math.max(0.5, Math.pow((v ?? 60) / 70, 1.5));
    const underPressure = 1 + 0.3 * (1 - ratings[p.club].att); // weaker sides defend more
    const press = 1 + 0.3 * (club.style.press - 0.5), tempo = 1 + 0.3 * (club.style.tempo - 0.5);
    const [tk, it, cl, bl, ae, pp, pc, kp, cr, dr] = RATES[r];
    p.tackles = poisson(rng, games * tk * f(a.tackling) * underPressure * press);
    p.interceptions = poisson(rng, games * it * f(a.defending) * underPressure);
    p.clearances = poisson(rng, games * cl * f(a.defending) * underPressure);
    p.blocks = poisson(rng, games * bl * underPressure);
    p.aerials = poisson(rng, games * ae * f(a.aerial));
    p.progPasses = poisson(rng, games * pp * f(a.passing) * tempo);
    p.progCarries = poisson(rng, games * pc * f(a.dribbling) * tempo);
    p.keyPasses = (p.assists ?? 0) + poisson(rng, games * kp * f(a.vision));
    p.crosses = poisson(rng, games * cr * f(a.crossing));
    p.dribbles = poisson(rng, games * dr * f(a.dribbling));
    const base: Record<Role, number> = { CB: 87, FB: 80, DM: 87, CM: 85, AM: 80, W: 75, ST: 71, GK: 68 };
    p.passAcc = Math.round(Math.max(55, Math.min(94, base[r] + (a.passing - 65) * 0.35 + gaussian(rng) * 1.5)) * 10) / 10;
    if (p.pos !== 'GK') {
      // shots from the chances he had: about one shot per 0.13 xG, so the goals he scored are among them
      p.shots = p.goals + poisson(rng, Math.max(0, (p.xg ?? 0) / 0.13 - p.goals));
      let on = p.goals;
      for (let i = p.goals; i < p.shots; i++) if (rng() < 0.3) on++;
      p.onTarget = on;
    } else {
      const share = p.starter ? Math.min(1, (p.apps ?? 0) / Math.max(1, played.get(p.club) ?? 1)) : ((p.apps ?? 0) * 0.35) / Math.max(1, played.get(p.club) ?? 1);
      p.conceded = Math.round((conceded.get(p.club) ?? 0) * share);
      const rate = Math.max(0.55, Math.min(0.85, 0.68 + (a.keeping - 70) * 0.006 + gaussian(rng) * 0.01));
      p.saves = Math.round((p.conceded * rate) / (1 - rate));
    }
  }
  // goals prevented: saves beyond what the league's average keeper would have made from the same shots on target
  const keepers = players.filter((p) => p.pos === 'GK' && (p.saves ?? 0) + (p.conceded ?? 0) > 0);
  const avg = keepers.reduce((x, p) => x + p.saves!, 0) / keepers.reduce((x, p) => x + p.saves! + p.conceded!, 0);
  for (const p of players) if (p.pos === 'GK') p.prevented = Math.round(((p.saves ?? 0) - ((p.saves ?? 0) + (p.conceded ?? 0)) * avg) * 10) / 10;
}

function main() {
  const rng = mulberry32(SEED);
  const clubs = buildClubs();
  const players = buildSquads(rng);
  const base = schedule(rng);
  const ratings = clubRatings(clubs, players);

  let best: SeasonPick | null = null;
  for (let s = 0; s < 40000; s++) {
    const pick = trySeason(base, ratings, hashSeed(`${SEED}:${s}`));
    if (!best || pick.score < best.score) best = pick;
    if (best.score === 0) break;
  }
  const season = best!;
  assignGoals(mulberry32(season.seed), players, season.fixtures, ratings);

  // event feeds for the rest of the matchweek (the 17:30 game hasn't kicked off)
  const demo = buildDemo(DEMO_ID);
  const feeds = [demo, ...season.fixtures
    .filter((f) => f.mw === DEMO_MW && f.id !== DEMO_ID && f.hg !== undefined)
    .map((f) => generateFeed({
      fixtureId: f.id, home: clubs.find((c) => c.code === f.home)!, away: clubs.find((c) => c.code === f.away)!,
      hg: f.hg!, ag: f.ag!, kickoff: f.kickoff, rates: matchRates(ratings[f.home], ratings[f.away]), players
    }))];
  // matchweek goals come from the feeds, so the scorers on screen match the season tallies
  for (const feed of feeds.slice(1)) for (const e of feed.events) if (e.type === 'goal') players.find((p) => p.id === e.player)!.goals++;
  for (const p of players) if (p.xg !== undefined) p.xg = Math.round(p.xg * 10) / 10;
  assignSeasonStats(SEED, players, clubs, season.fixtures, feeds);
  assignRoles(players);
  assignProfiles(SEED, players);
  assignPositionStats(SEED, players, clubs, season.fixtures, ratings);

  const managers: Manager[] = [
    ...clubs.map((c) => ({ name: c.manager, club: c.code, style: c.style, bio: `Manager of ${c.name}.` })),
    ...FREE_AGENT_MANAGERS.map((m) => ({ name: m.name, club: null, lastClub: m.lastClub, style: m.style, bio: m.bio }))
  ];

  const league: League = {
    name: 'Meridian League',
    season: '2026–27',
    seed: SEED,
    generatedAt: new Date().toISOString().slice(0, 10),
    clubs,
    players,
    managers,
    fixtures: season.fixtures,
    currentMw: DEMO_MW,
    demo,
    feeds
  };

  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/league.json');
  writeFileSync(out, JSON.stringify(league));

  const table = buildTable(clubs.map((c) => c.code), season.fixtures.filter((f) => f.hg !== undefined).map((f) => ({ home: f.home, away: f.away, hg: f.hg!, ag: f.ag! })));
  console.log(`The Forge · seed ${SEED} · season sim ${season.seed} · story score ${season.score} · ${season.notes}`);
  table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${r.code}  P${r.p} ${String(r.pts).padStart(3)} pts  GD ${r.gf - r.ga}`));
  const top = [...players].sort((a, b) => b.goals - a.goals).slice(0, 5).map((p) => `${p.name} (${p.club}) ${p.goals}`);
  console.log('Top scorers:', top.join(', '));
  console.log(`Wrote ${out}`);
}

main();
