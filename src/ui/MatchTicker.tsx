import { league } from '../data/league';
import { useT } from '../state/i18n';
import { scoreAt } from '../engine/demo';
import { useMatch, minuteLabel } from '../state/match';
import { matchweek } from '../screens/shared';

/** Every matchweek game, with its clock and score; picking one switches the screen to it. */
export function MatchTicker({ onlyFinished = false, swingFor }: { onlyFinished?: boolean; swingFor?: (fixtureId: string) => boolean }) {
  const { fixtureId, setFixture, minuteOf } = useMatch();
  const t = useT();
  const games = matchweek()
    .map((f) => ({ f, feed: league.feeds.find((x) => x.fixtureId === f.id) }))
    .sort((a, b) => (a.f.id === league.demo.fixtureId ? -1 : b.f.id === league.demo.fixtureId ? 1 : a.f.kickoff.localeCompare(b.f.kickoff)));
  return (
    <nav aria-label="Matchweek games" className="ticker">
      <span className="kicker" style={{ flex: '0 0 auto' }}>MATCHWEEK {league.currentMw}</span>
      {games.map(({ f, feed }) => {
        if (!feed) {
          return (
            <button key={f.id} type="button" disabled aria-label={`${f.home} v ${f.away}, kicks off ${f.kickoff}`} style={{ opacity: 0.55, cursor: 'default' }}>
              <span className="dim">{f.kickoff}</span><span>{f.home} v {f.away}</span>
            </button>
          );
        }
        const m = minuteOf(feed);
        const s = scoreAt(league, m, feed);
        const done = m >= 94;
        const disabled = onlyFinished && !done;
        return (
          <button key={f.id} type="button" aria-pressed={fixtureId === f.id} disabled={disabled} onClick={() => setFixture(f.id)} style={disabled ? { opacity: 0.55, cursor: 'default' } : undefined}>
            <span style={{ color: done ? '#8A93A3' : '#FF8A4C' }}>{done ? 'FT' : minuteLabel(m)}</span>
            <span>{f.home} {s.home}–{s.away} {f.away}</span>
            {swingFor?.(f.id) && <span className="inline signal" style={{ fontSize: 11, gap: 5 }}><span className="dot" style={{ width: 6, height: 6, background: '#FF8A4C' }} />{t('Swing').toUpperCase()}</span>}
          </button>
        );
      })}
    </nav>
  );
}
