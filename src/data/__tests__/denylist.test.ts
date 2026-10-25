// The hackathon rule, enforced: no real club, competition or player name anywhere in the repo.
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CANARY, denyMatch, isRealPlayer } from '../denylist';
import { league } from '../league';

describe('real-world names', () => {
  it('are caught by the hashed lists (checked with invented canaries)', () => {
    expect(denyMatch(`What if ${CANARY.club} had won it?`)).toBe('atlantis wanderers');
    expect(isRealPlayer(CANARY.player)).toBe(true);
    expect(denyMatch('What if Northbridge had pressed higher?')).toBeNull();
  });

  it('appear nowhere in the league data', () => {
    for (const p of league.players) expect(isRealPlayer(p.name), p.id).toBe(false);
    for (const c of league.clubs) expect(denyMatch(`${c.name} ${c.short} ${c.nickname} ${c.ground}`), c.code).toBeNull();
    for (const m of league.managers) expect(isRealPlayer(m.name), m.name).toBe(false);
  });

  it('appear in no tracked file', () => {
    const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
      .filter((f) => /\.(ts|tsx|md|json|html|css|yml|mjs)$/.test(f) && !/package-lock\.json$/.test(f));
    const hits: string[] = [];
    for (const f of files) {
      let text: string;
      try { text = readFileSync(f, 'utf8'); } catch { continue; }
      for (const lineText of text.split('\n')) {
        const club = denyMatch(lineText, 'outside');
        if (club && club !== 'atlantis wanderers') hits.push(`${f}: club or competition`);
        for (const name of lineText.match(/[A-Z][a-z]+(?:[ -][A-Z][a-z]+)+/g) ?? []) if (isRealPlayer(name) && name !== CANARY.player) hits.push(`${f}: player`);
      }
    }
    expect(hits).toEqual([]);
  });
});
