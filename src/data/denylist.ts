// Real-world names the app must never produce or accept, stored only as one-way hashes so the repo
// itself contains none of them (hackathon rule: no real clubs, players or competitions anywhere).
//   OUTSIDE: clubs, competitions and players that tell Dr Football someone is asking about real football
//   REAL_PLAYERS: real footballers' full names and distinctive surnames The Forge must never generate
// To add an entry, hash it with denyHash() in a scratch script and paste the number; never commit the name.

import { hashSeed } from '../engine/rng';

export const denyNorm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim();
export const denyHash = (s: string) => hashSeed('deny', denyNorm(s));

/** Invented canaries, so tests can exercise the real-world checks without naming anyone real. */
export const CANARY = { club: 'Atlantis Wanderers', player: 'Quillon Farrowmere' };

const OUTSIDE = new Set<number>([3521511576, 3367534369, 3842070933, 2975768162, 636687937, 3762681496, 1889861288, 2270317935, 514356278, 1801306934, 1575118805, 2862538394, 393645402, 3717813240, 766927593, 415582714, 2057900490, 3527727811, 2137286040, 3382992344]);
const REAL_PLAYERS = new Set<number>([3168955991, 1436576647, 3514546410, 1749080691, 45263698, 851448886, 726194677, 666742877, 139034816, 3345646838, 2554781641, 244507035, 701062631, 3189205908, 2248263143, 3082966181, 1669624882, 3559609327, 3556112934, 3343453368, 1180774091, 3332425552, 1494911733, 3049734655, 300270703, 559515754, 5757826, 4197826004, 454254391, 1916682452, 2430723919, 12899412, 466887911, 174149695, 3182297271, 4199952807, 2547348354, 3485196573, 1268325584, 2162254868, 3048242044, 1332987802, 2164133503, 2516592226, 3291075548, 2443515892, 209535938, 2047317008, 1220414235, 1293838739, 2857817578, 4175612188, 302119948, 1938959671, 3924871966, 1881611352, 912602989, 2900163132, 296911366, 835815054, 2963793969, 1060275529, 3135700071, 2509286308, 4270270659, 2153132107, 2813010010, 3255664859, 2818367376, 1568041991]);

export const DENY_SIZES = { outside: OUTSIDE.size, players: REAL_PLAYERS.size };

/** The first one-, two- or three-word phrase in the text that is on the list, as the text spelt it. */
export function denyMatch(text: string, list: 'outside' | 'players' = 'outside'): string | null {
  const set = list === 'outside' ? OUTSIDE : REAL_PLAYERS;
  const words = denyNorm(text).split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (set.has(denyHash(phrase))) return phrase;
    }
  }
  return null;
}

/** A full name, or its surname, belongs to a real footballer. */
export function isRealPlayer(full: string): boolean {
  const lower = denyNorm(full);
  return REAL_PLAYERS.has(denyHash(lower)) || REAL_PLAYERS.has(denyHash(lower.split(' ').slice(1).join(' ')));
}
