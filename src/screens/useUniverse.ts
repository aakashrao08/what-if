import { useEffect, useState } from 'react';
import { league } from '../data/league';
import { universeFor } from '../agents/pipeline';
import type { SavedUniverse } from '../state/prefs';

/** The headline number for a saved Universe, re-simulated if it wasn't stored (seeded, so it's stable). */
export function useUniverseStat(u: SavedUniverse): string | null {
  const [stat, setStat] = useState<string | null>(u.stat || null);
  useEffect(() => {
    if (u.stat) { setStat(u.stat); return; }
    let alive = true;
    universeFor(league, u.prompt).then((r) => alive && setStat(r ? r.view.stat : '—'));
    return () => { alive = false; };
  }, [u.prompt, u.stat]);
  return stat;
}
