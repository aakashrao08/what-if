// The twenty clubs of the Meridian League. All invented.
// `tier` (0–1) sets squad quality; the season itself is simulated, so the table is not hand-written.

import type { ClubStyle } from '../src/data/types';

export interface ClubSeed {
  code: string;
  name: string;
  short: string;
  nickname: string;
  ground: string;
  founded: number;
  manager: string;
  tier: number;
  style: ClubStyle;
  colors: { primary: string; secondary: string };
}

export const CLUBS: ClubSeed[] = [
  { code: 'SAL', name: 'Saltmarsh Wanderers', short: 'Saltmarsh', nickname: 'The Waders', ground: 'The Reedbed', founded: 1881, manager: 'Bastian Crowle', tier: 0.95, style: { press: 0.7, line: 0.65, tempo: 0.7 }, colors: { primary: '#2E6F5E', secondary: '#F2EFE6' } },
  { code: 'THI', name: 'Thistlebury Town', short: 'Thistlebury', nickname: 'The Prickles', ground: 'Burr Lane', founded: 1887, manager: 'Ottilie Ferncastle', tier: 0.9, style: { press: 0.6, line: 0.6, tempo: 0.55 }, colors: { primary: '#6B4C9A', secondary: '#E8E2F2' } },
  { code: 'KET', name: 'Kettlebridge Athletic', short: 'Kettlebridge', nickname: 'The Kettles', ground: 'Steam Yard', founded: 1893, manager: 'Ruben Ashgrove', tier: 0.83, style: { press: 0.55, line: 0.5, tempo: 0.65 }, colors: { primary: '#B33A3A', secondary: '#1A1A1A' } },
  { code: 'GAL', name: 'Gallowmere United', short: 'Gallowmere', nickname: 'The Mere', ground: 'Lakeside Park', founded: 1879, manager: 'Edda Halvorsby', tier: 0.79, style: { press: 0.45, line: 0.45, tempo: 0.5 }, colors: { primary: '#1F3B5C', secondary: '#C9D6E3' } },
  { code: 'NBR', name: 'Northbridge', short: 'Northbridge', nickname: 'The Bridge', ground: 'Northbridge Park', founded: 1884, manager: 'Hal Brindlecombe', tier: 0.78, style: { press: 0.5, line: 0.45, tempo: 0.55 }, colors: { primary: '#F2EFE6', secondary: '#0B0F14' } },
  { code: 'POR', name: 'Port Selkie', short: 'Port Selkie', nickname: 'The Seals', ground: 'Skerry Road', founded: 1890, manager: 'Morwenna Tregarth', tier: 0.74, style: { press: 0.5, line: 0.5, tempo: 0.6 }, colors: { primary: '#3E7CA8', secondary: '#F2EFE6' } },
  { code: 'BRA', name: 'Brambleton Rovers', short: 'Brambleton', nickname: 'The Thorns', ground: 'Hedgerow Ground', founded: 1899, manager: 'Cosmo Pellingham', tier: 0.68, style: { press: 0.65, line: 0.55, tempo: 0.6 }, colors: { primary: '#5A7D2E', secondary: '#F5E9C8' } },
  { code: 'COP', name: 'Copperfield Town', short: 'Copperfield', nickname: 'The Pennies', ground: 'Mint Street', founded: 1902, manager: 'Abel Drummersby', tier: 0.62, style: { press: 0.4, line: 0.4, tempo: 0.45 }, colors: { primary: '#B87333', secondary: '#1C1C1C' } },
  { code: 'DUC', name: 'Duckwater Albion', short: 'Duckwater', nickname: 'The Drakes', ground: 'Millpond Lane', founded: 1895, manager: 'Seren Lloydmarsh', tier: 0.57, style: { press: 0.45, line: 0.45, tempo: 0.5 }, colors: { primary: '#2F8F83', secondary: '#FFD55A' } },
  { code: 'WYV', name: 'Wyvern Heath', short: 'Wyvern Heath', nickname: 'The Dragons', ground: 'Scorch Common', founded: 1908, manager: 'Ignatius Harrowgate', tier: 0.54, style: { press: 0.6, line: 0.55, tempo: 0.65 }, colors: { primary: '#7A1F2B', secondary: '#E3B341' } },
  { code: 'LAN', name: 'Lanternfield', short: 'Lanternfield', nickname: 'The Lamplighters', ground: 'Wickworks', founded: 1897, manager: 'Pim van der Kettering', tier: 0.51, style: { press: 0.4, line: 0.4, tempo: 0.45 }, colors: { primary: '#E0A526', secondary: '#1B1B2F' } },
  { code: 'FOG', name: 'Fogbury Town', short: 'Fogbury', nickname: 'The Mist', ground: 'Haze Park', founded: 1911, manager: 'Clem Waterhollow', tier: 0.48, style: { press: 0.35, line: 0.35, tempo: 0.4 }, colors: { primary: '#8A94A6', secondary: '#F2EFE6' } },
  { code: 'OPU', name: 'Old Puddingham', short: 'Old Puddingham', nickname: 'The Puds', ground: 'Custard Fields', founded: 1876, manager: 'Barnaby Thripp', tier: 0.45, style: { press: 0.35, line: 0.4, tempo: 0.4 }, colors: { primary: '#F0D9A0', secondary: '#5B3A29' } },
  { code: 'MAR', name: 'Marrowgate', short: 'Marrowgate', nickname: 'The Gourds', ground: 'Allotment Road', founded: 1905, manager: 'Dagny Pottersfield', tier: 0.42, style: { press: 0.45, line: 0.45, tempo: 0.5 }, colors: { primary: '#4F7942', secondary: '#F2EFE6' } },
  { code: 'FEN', name: "St Fennick's", short: "St Fennick's", nickname: 'The Saints', ground: 'Chapel Meadow', founded: 1883, manager: 'Lorcan Abernethy-Bloom', tier: 0.4, style: { press: 0.4, line: 0.4, tempo: 0.45 }, colors: { primary: '#2B2D42', secondary: '#EDF2F4' } },
  { code: 'CRV', name: 'Crumpet Vale', short: 'Crumpet Vale', nickname: 'The Toasters', ground: 'Griddle Park', founded: 1913, manager: 'Hettie Sparrowhawk', tier: 0.36, style: { press: 0.5, line: 0.45, tempo: 0.55 }, colors: { primary: '#C97C3D', secondary: '#FFF4E0' } },
  { code: 'RAV', name: 'Ravenscar City', short: 'Ravenscar', nickname: 'The Rooks', ground: 'Cliff Top', founded: 1900, manager: 'Mattias Grimsdyke', tier: 0.34, style: { press: 0.4, line: 0.4, tempo: 0.45 }, colors: { primary: '#111111', secondary: '#C0C0C0' } },
  { code: 'HAR', name: 'Harbour Athletic', short: 'Harbour', nickname: 'The Gulls', ground: 'Quayside Road', founded: 1892, manager: 'Moira Teaselby', tier: 0.32, style: { press: 0.35, line: 0.35, tempo: 0.45 }, colors: { primary: '#7CB8FF', secondary: '#0B0F14' } },
  { code: 'GRV', name: 'Gravel Lane', short: 'Gravel Lane', nickname: 'The Pebbles', ground: 'The Quarry', founded: 1921, manager: 'Wendell Brassington', tier: 0.28, style: { press: 0.4, line: 0.35, tempo: 0.4 }, colors: { primary: '#6E6259', secondary: '#E9E4DE' } },
  { code: 'MOS', name: 'Mossgrave', short: 'Mossgrave', nickname: 'The Lichens', ground: 'Damp Hollow', founded: 1919, manager: 'Primrose Ollerenshaw', tier: 0.2, style: { press: 0.3, line: 0.3, tempo: 0.35 }, colors: { primary: '#3F5E3A', secondary: '#D9E4C8' } }
];

/** Managers out of work, available to Multiverse "what if X took over" scenarios. */
export const FREE_AGENT_MANAGERS = [
  { name: 'Ines Vance', lastClub: 'Copperfield Town', style: { press: 0.82, line: 0.78, tempo: 0.75 }, bio: 'High press, high line. Took Copperfield from the second tier to 8th, then left in May.' },
  { name: 'Augustin Peverell', lastClub: 'Fogbury Town', style: { press: 0.25, line: 0.25, tempo: 0.3 }, bio: 'Deep block and counters. Kept Fogbury up three seasons running on a small budget.' },
  { name: 'Tamsin Reedwick', lastClub: 'Duckwater Albion', style: { press: 0.55, line: 0.5, tempo: 0.7 }, bio: 'Fast, direct football. Best goals-per-game record of any manager in the league last season.' }
];
