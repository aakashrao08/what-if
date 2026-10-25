// Name generation for the Meridian League.
// Rule: no real footballers. Most surnames are invented compounds (Nettleshaw, Bobbinford),
// a minority are very common surnames paired with an unusual first name, and a blocklist
// rejects any known real player names that could still slip through (checked as hashes).

import type { Rng } from '../src/engine/rng';
import { pick } from '../src/engine/rng';
import { isRealPlayer } from '../src/data/denylist';

export const FIRST_NAMES = [
  'Ollie', 'Barnaby', 'Jonty', 'Mungo', 'Ferdie', 'Rufus', 'Tobias', 'Wilf', 'Dex', 'Kit',
  'Alfie', 'Reuben', 'Cosmo', 'Otis', 'Ezra', 'Arlo', 'Monty', 'Hector', 'Jem', 'Percy',
  'Digby', 'Tariq', 'Kwame', 'Mateo', 'Haruto', 'Sami', 'Ilya', 'Luca', 'Nico', 'Bram',
  'Sven', 'Teodor', 'Caspian', 'Fergus', 'Lorcan', 'Ivo', 'Rafferty', 'Elio', 'Bastian', 'Cormac',
  'Desmond', 'Ambrose', 'Jago', 'Laszlo', 'Quentin', 'Rowan', 'Silas', 'Thaddeus', 'Wolfie', 'Zeb',
  'Augustin', 'Booker', 'Cassius', 'Dashiell', 'Emeric', 'Florian', 'Gideon', 'Hamish', 'Isidore', 'Jasper',
  'Kofi', 'Leander', 'Magnus', 'Nils', 'Orrin', 'Pip', 'Ruari', 'Stellan', 'Tycho', 'Ugo',
  'Valentin', 'Wendell', 'Yusuf', 'Zoltan', 'Benedikt', 'Crispin', 'Duncan', 'Eamon', 'Fitz', 'Gus',
  'Hugo', 'Ignatius', 'Joaquin', 'Kenji', 'Linus', 'Marlow', 'Ned', 'Oskar', 'Perry', 'Ronan'
] as const;

const PREFIX = [
  'Thistle', 'Bramble', 'Quill', 'Puddle', 'Kettle', 'Lantern', 'Marrow', 'Gravel', 'Pepper', 'Tumble',
  'Crump', 'Muddle', 'Nettle', 'Bobbin', 'Pickle', 'Gorse', 'Fiddle', 'Clatter', 'Snuff', 'Tallow',
  'Cobble', 'Dabble', 'Juniper', 'Mallow', 'Sorrel', 'Teasel', 'Crumble', 'Wimble', 'Bustle', 'Tinker',
  'Saddle', 'Flint', 'Pennywhistle', 'Hazel', 'Mustard', 'Barley', 'Thimble', 'Toffee', 'Wicker', 'Drizzle'
] as const;

const SUFFIX = [
  'wood', 'worth', 'bury', 'ton', 'ford', 'wick', 'gate', 'combe', 'shaw', 'by',
  'thorpe', 'field', 'ridge', 'well', 'stone', 'brook', 'more', 'den', 'hurst', 'cote'
] as const;

const COMMON = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Hughes', 'Green'] as const;
// Unusual first names only, so a common surname never lands on a famous full name.
const COMMON_FIRST = ['Mungo', 'Thaddeus', 'Ignatius', 'Crispin', 'Wolfie', 'Zeb', 'Pip', 'Tycho', 'Isidore', 'Emeric', 'Dashiell', 'Orrin'] as const;

/** Real footballers' names are never generated: the check runs against hashes (src/data/denylist.ts), so no name is stored here. */
export const isBlocked = (full: string): boolean => isRealPlayer(full);

export function inventedSurname(rng: Rng): string {
  const p = pick(rng, PREFIX);
  let s = pick(rng, SUFFIX);
  if (p.endsWith('e') && s.startsWith('e')) s = 'ton';
  return p + s;
}

export function playerName(rng: Rng, used: Set<string>, avoid: (name: string) => boolean = () => false): string {
  for (let tries = 0; tries < 200; tries++) {
    const common = rng() < 0.12;
    const name = common ? `${pick(rng, COMMON_FIRST)} ${pick(rng, COMMON)}` : `${pick(rng, FIRST_NAMES)} ${inventedSurname(rng)}`;
    if (!used.has(name) && !isBlocked(name) && !avoid(name)) {
      used.add(name);
      return name;
    }
  }
  throw new Error('ran out of names');
}

export const shortName = (full: string) => {
  const [first, ...rest] = full.split(' ');
  return `${first[0]}. ${rest.join(' ')}`;
};
