// Current Affairs: the Meridian League as it stands. The table, then the players.
import { useState } from 'react';
import { league } from '../data/league';
import { usePrefs } from '../state/prefs';
import { useT } from '../state/i18n';
import { Handoff, Loading } from '../ui/kit';
import { BOARDS, MORE_BOARDS, STAT, chance, leaderboard, roleOf, type StatKey } from '../agents/currentAffairs';
import type { RaceLine } from '../engine/races';
import { ClubSheet, Crest, Form, PlayerSheet, clubOf, outlookOf, useRaces, useStandings } from './leagueParts';

export default function CurrentAffairs() {
  const { prefs } = usePrefs();
  const t = useT();
  const s = useStandings();
  const r = useRaces();
  const [club, setClub] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [board, setBoard] = useState<StatKey>('goals');
  const [more, setMore] = useState(false);
  if (!s) return <Loading>{t('Playing out the rest of the season…')}</Loading>;

  const rows = leaderboard(league, board);
  const raceOf = (b: StatKey): RaceLine[] | null => (b === 'goals' || b === 'assists' || b === 'cleanSheets' ? r?.[b] ?? null : null);
  const race = raceOf(board);
  const unit = STAT[board].unit;
  const show = (b: StatKey, v: number) => (b === 'overxg' ? `+${v.toFixed(1)}` : STAT[b].digits ? v.toFixed(STAT[b].digits) : String(v));
  const lucky = [...s.clubs].sort((a, b) => (b.row.pts - b.xpts) - (a.row.pts - a.xpts));

  return (
    <>
      <section className="stack-16" style={{ padding: 'clamp(16px, 3vw, 36px) 0 8px' }}>
        <h1 className="h1">{t('Current Affairs')}</h1>
        <Handoff />
        <p className="lede">{t(`The ${league.name} after matchweek ${s.mw}, and where it’s heading. Tap a club or a player for their numbers.`)}</p>
      </section>

      <section aria-labelledby="table-h" className="panel" style={{ padding: '18px clamp(12px, 2vw, 22px) 8px' }}>
        <div className="between" style={{ paddingBottom: 6, gap: 12, flexWrap: 'wrap' }}>
          <h2 id="table-h" className="h3">{t('The table')}</h2>
          <span className="small">{t(s.pending.length ? `${s.pending.map((p) => `${clubOf(p.home).short} v ${clubOf(p.away).short}`).join(', ')} still to play (${s.pending[0].kickoff})` : 'All matchweek games played')}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="lt">
            <thead>
              <tr><th className="l">#</th><th className="l">{t('Club')}</th><th className="wide">P</th><th>GD</th><th>Pts</th><th className="l wide">{t('Form')}</th><th>{t('Chance')}</th></tr>
            </thead>
            <tbody>
              {s.clubs.map((c) => {
                const o = outlookOf(s, c.code);
                const mine = [prefs.club, ...prefs.also].includes(c.code);
                const moved = c.posBefore - c.pos;
                return (
                  <tr key={c.code} className={`${c.pos <= 4 ? 'zone-top' : c.pos >= 18 ? 'zone-rel' : ''}${mine ? ' mine' : ''}`} onClick={() => setClub(c.code)} style={{ cursor: 'pointer' }}>
                    <td className="l mono" style={{ width: 40 }}>{c.pos}<span style={{ fontSize: 10, marginLeft: 4, color: moved > 0 ? '#CFF05A' : '#FF8A4C' }}>{moved > 0 ? '▲' : moved < 0 ? '▼' : ''}</span></td>
                    <td className="l"><button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); setClub(c.code); }}><Crest code={c.code} />{clubOf(c.code).short}</button></td>
                    <td className="wide dim">{c.row.p}</td>
                    <td className="dim">{c.row.gf - c.row.ga > 0 ? '+' : ''}{c.row.gf - c.row.ga}</td>
                    <td><b>{c.row.pts}</b></td>
                    <td className="l wide"><Form form={c.form} /></td>
                    <td className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}><span className="dim wide">{t(o.label)} </span><b style={{ color: o.p >= 0.5 ? '#CFF05A' : '#F2EFE6' }}>{chance(o.p)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small" style={{ padding: '12px 0 6px', lineHeight: 1.5 }}>{t(`Chance: how often each club reaches the goal that matters to it, in ${s.n.toLocaleString('en-GB')} simulated run-ins. Green line, top four; orange, the bottom three.`)}</p>
      </section>

      <section aria-labelledby="players-h" className="stack-16" style={{ paddingTop: 36 }}>
        <div className="between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h2 id="players-h" className="h3">{t('Players')}</h2>
          <div role="group" aria-label={t('Leaderboard')} className="seg">
            {BOARDS.map((b) => <button key={b.id} type="button" aria-pressed={board === b.id} onClick={() => setBoard(b.id)} style={{ minHeight: 38, fontSize: 14 }}>{t(b.label)}</button>)}
          </div>
        </div>
        <div className="col" style={{ gap: 0 }}>
          {rows.map(({ p, v, rank }) => {
            const line = race?.find((x) => x.id === p.id);
            return (
              <button key={p.id} type="button" className="rowbtn" onClick={() => setPlayer(p.id)} style={{ borderTop: '1px solid #222B38', minHeight: 54, padding: '8px 4px', gap: 14 }}>
                <span className="mono dim" style={{ flex: '0 0 28px', fontSize: 13 }}>{rank}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                  <span className="inline small" style={{ gap: 8, flexWrap: 'wrap' }}><Crest code={p.club} />{clubOf(p.club).short}{line && line.top >= 0.01 && <span className="mono" style={{ fontSize: 12 }}>{t('finishes top')} <b style={{ color: line.top >= 0.5 ? '#CFF05A' : '#C9CFD8' }}>{chance(line.top)}</b></span>}</span>
                </span>
                <span className="display" style={{ flex: '0 0 64px', fontSize: 26, textAlign: 'right' }}>{show(board, v)}</span>
              </button>
            );
          })}
        </div>
        <p className="small">{t(race ? `“Finishes top” (shown where it’s 1% or more): share of ${r!.n.toLocaleString('en-GB')} simulated run-ins (${r!.games} games left) where he ends the season top for ${unit}, ties included.` : `Season totals so far${board === 'overxg' ? ', goals minus expected goals, players with five or more goals' : ''}.`)}</p>
        <button type="button" className="btn" aria-expanded={more} onClick={() => setMore(!more)} style={{ alignSelf: 'flex-start' }}>{t(more ? 'Fewer stats' : 'More stats: creating, defending, keeping')}</button>
      </section>

      {more && (
        <section aria-label={t('More stats')} className="stack-16 fade-in" style={{ paddingTop: 20, gap: 28 }}>
          {MORE_BOARDS.map((g) => (
            <div key={g.group} className="stack-8" style={{ gap: 10 }}>
              <h3 className="h3" style={{ fontSize: 19 }}>{t(g.group)}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '8px 40px' }}>
                {g.boards.map((b) => {
                  const rc = raceOf(b.id);
                  return (
                    <div key={b.id} className="col" style={{ gap: 0 }}>
                      <span className="kicker" style={{ padding: '6px 0' }}>{t(b.label).toUpperCase()}</span>
                      {leaderboard(league, b.id, 5).map(({ p, v, rank }) => {
                        const line = rc?.find((x) => x.id === p.id);
                        return (
                          <button key={p.id} type="button" className="rowbtn" onClick={() => setPlayer(p.id)} style={{ borderTop: '1px solid #222B38', padding: '8px 2px', gap: 10, minHeight: 50 }}>
                            <span className="mono dim" style={{ flex: '0 0 20px', fontSize: 12 }}>{rank}</span>
                            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                              <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                              <span className="inline small" style={{ gap: 6, flexWrap: 'wrap' }}><Crest code={p.club} />{clubOf(p.club).short} · {t(roleOf(p))}{line && line.top >= 0.01 && <span className="mono" style={{ fontSize: 11 }}>· {t('top')} <b>{chance(line.top)}</b></span>}</span>
                            </span>
                            <span className="display" style={{ fontSize: 20, textAlign: 'right' }}>{show(b.id, v)}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="small">{t('Goals prevented: saves beyond what the league’s average keeper would make from the same shots on target. Save % and goals prevented: keepers with ten or more appearances.')}</p>
        </section>
      )}

      <section aria-labelledby="luck-h" className="stack-16" style={{ paddingTop: 36 }}>
        <div className="between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h2 id="luck-h" className="h3">{t('Riding their luck')}</h2>
          <span className="small">{t('Points against what their chances deserved')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '0 48px' }}>
          {[{ t: 'Ahead of their chances', xs: lucky.slice(0, 3) }, { t: 'Behind their chances', xs: lucky.slice(-3).reverse() }].map((g) => (
            <div key={g.t} className="col" style={{ gap: 0 }}>
              <span className="kicker" style={{ padding: '8px 0' }}>{t(g.t).toUpperCase()}</span>
              {g.xs.map((c) => {
                const d = Math.round((c.row.pts - c.xpts) * 10) / 10;
                return (
                  <button key={c.code} type="button" className="rowbtn" onClick={() => setClub(c.code)} style={{ borderTop: '1px solid #222B38', padding: '8px 4px' }}>
                    <Crest code={c.code} /><span style={{ flex: '1 1 auto', fontWeight: 600 }}>{clubOf(c.code).short}</span>
                    <span className="mono dim" style={{ fontSize: 13 }}>{t(`${c.row.pts} pts · deserved ${c.xpts}`)}</span>
                    <span className="mono" style={{ flex: '0 0 52px', textAlign: 'right', color: d > 0 ? '#CFF05A' : '#FF8A4C' }}>{d > 0 ? '+' : ''}{d}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <footer className="footer-note">{t(`Synthetic league. Every number comes from the simulation engine, run in your browser; the chances replay the remaining games ${s.n.toLocaleString('en-GB')} times.`)}</footer>

      <ClubSheet s={s} code={club} onClose={() => setClub(null)} />
      <PlayerSheet r={r} id={player} onClose={() => setPlayer(null)} />
    </>
  );
}
