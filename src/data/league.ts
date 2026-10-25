import json from './league.json';
import type { Club, League, Player } from './types';

/** The Meridian League, as written by The Forge (npm run forge). */
export const league = json as unknown as League;

const clubIndex = new Map(league.clubs.map((c) => [c.code, c]));
const playerIndex = new Map(league.players.map((p) => [p.id, p]));

export const club = (code: string): Club => clubIndex.get(code)!;
export const player = (id: string): Player => playerIndex.get(id)!;
export const surname = (id: string) => player(id).name.split(' ').slice(1).join(' ');

export const HOME = league.demo.home;
export const AWAY = league.demo.away;
