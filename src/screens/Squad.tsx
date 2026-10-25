// A club's squad: where the season is heading, what stands out, and every player's numbers.
import { useT } from '../state/i18n';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { league } from '../data/league';
import { cached } from '../engine/client';
import type { SquadImpact } from '../engine/races';
import { Handoff, Loading } from '../ui/kit';
import { clubCard, RACE_NAME, roleOf, squadInsights, STAT, type StatKey } from '../agents/currentAffairs';
import { ClubSheet, Crest, PlayerSheet, useRaces, useStandings } from './leagueParts';

const GROUPS = [['GK', 'Goalkeepers'], ['DF', 'Defenders'], ['MF', 'Midfielders'], ['FW', 'Forwards']] as const;
// what each group is judged on, most telling first (the first two stay visible on phones)
const COLS: Record<'GK' | 'DF' | 'MF' | 'FW', StatKey[]> = {
  GK: ['cleanSheets', 'prevented', 'saves', 'savePct'],
  DF: ['tackles', 'clearances', 'interceptions', 'aerials'],
  MF: ['progPasses', 'keyPasses', 'assists', 'tackles'],
  FW: ['goals', 'assists', 'xg', 'shots']
};
const SHORT: Partial<Record<StatKey, string>> = { cleanSheets: 'CS', prevented: 'GP', saves: 'Sv', savePct: 'Sv%', tackles: 'Tkl', clearances: 'Clr', interceptions: 'Int', aerials: 'Aer', progPasses: 'Prog', keyPasses: 'KP', assists: 'A', goals: 'G', xg: 'xG', shots: 'Sh' };

export default function Squad() {
  const { code = '' } = useParams();
  const t = useT();
  const s = useStandings();
  const r = useRaces();
  const [imp, setImp] = useState<SquadImpact | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [card, setCard] = useState(false);
  const club = league.clubs.find((c) => c.code === code.toUpperCase());
  useEffect(() => {
    if (!club) return;
    let alive = true;
    setImp(null);
    cached('squad', { club: club.code }).then((x) => alive && setImp(x));
    return () => { alive = false; };
  }, [club?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!club) return <section className="stack-16" style={{ padding: '36px 0' }}><h1 className="h1">{t('No such club')}</h1><Link to="/league" className="tap-link">{t('← Back to Current Affairs')}</Link></section>;
  if (!s) return <Loading>{t('Playing out the rest of the season…')}</Loading>;

  const c = s.clubs.find((x) => x.code === club.code)!;
  const head = clubCard(league, s, club.code);
  const insights = squadInsights(league, s, imp, club.code);
  const squad = league.players.filter((p) => p.club === club.code);
  const impactOf = (id: string) => imp?.impacts.find((i) => i.id === id)?.delta;

  return (
    <>
      <section className="stack-16" style={{ padding: 'clamp(16px, 3vw, 36px) 0 8px', gap: 14 }}>
        <Link to="/league" className="small tap-link" style={{ textDecoration: 'none' }}>{t('← Current Affairs')}</Link>
        <span className="inline" style={{ gap: 10 }}><Crest code={club.code} /><span className="kicker">{club.nickname.toUpperCase()} · {club.ground.toUpperCase()} · MANAGER {club.manager.toUpperCase()}</span></span>
        <h1 className="h1">{club.name}</h1>
        <Handoff />
        <p className="lede">{t(head.headline.text)}</p>
        <div className="wrap" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => setCard(true)}>{t('Chances and games left')}</button>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '28px 48px', alignItems: 'start', paddingTop: 12 }}>
        <section aria-labelledby="ins-h" className="col" style={{ gap: 0 }}>
          <h2 id="ins-h" className="h3" style={{ paddingBottom: 10 }}>{t('What stands out')}</h2>
          {insights.length === 0 && <p className="small">{t('Working it out…')}</p>}
          {insights.map((i) => (
            <button key={i.tag} type="button" className="rowbtn" onClick={() => i.player && setPlayer(i.player)} style={{ alignItems: 'baseline', borderTop: '1px solid #222B38', padding: '14px 4px', gap: 14 }}>
              <span className="mono" style={{ flex: '0 0 86px', fontSize: 11, color: i.tag === 'KEY MAN' ? '#FF8A4C' : '#CFF05A' }}>{t(i.tag)}</span>
              <span style={{ fontSize: 15, lineHeight: 1.5, color: '#E4E1D9' }}>{t(i.line.text)}</span>
            </button>
          ))}
          {!imp && <p className="small" style={{ paddingTop: 10 }}>{t('Testing the season without each key player…')}</p>}
        </section>

        <section aria-labelledby="sq-h" className="col" style={{ gap: 0, minWidth: 0 }}>
          <div className="between" style={{ paddingBottom: 6, gap: 12, flexWrap: 'wrap' }}>
            <h2 id="sq-h" className="h3">{t('The squad')}</h2>
            <span className="small">{t(`“If out”: change in their chance to ${RACE_NAME[c.race]} without him all season. Tap a player for the rest.`)}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="lt">
              {GROUPS.map(([pos, label]) => {
                const cols = COLS[pos];
                return (
                  <tbody key={pos}>
                    <tr>
                      <th className="l" colSpan={2} style={{ paddingTop: 18 }}><span className="kicker">{t(label).toUpperCase()}</span></th>
                      <th className="wide">{t('Role')}</th><th>{t('Apps')}</th>
                      {cols.map((k, i) => <th key={k} className={i >= 2 ? 'wide' : undefined} title={STAT[k].unit}>{SHORT[k]}</th>)}
                      <th className="wide">{t('Cards')}</th><th>{t('If out')}</th>
                    </tr>
                    {squad.filter((p) => p.pos === pos).sort((a, b) => Number(b.starter) - Number(a.starter) || a.number - b.number).map((p) => {
                      const d = impactOf(p.id);
                      return (
                        <tr key={p.id} onClick={() => setPlayer(p.id)} style={{ cursor: 'pointer' }}>
                          <td className="l mono dim" style={{ width: 36 }}>{p.number}</td>
                          <td className="l"><button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); setPlayer(p.id); }}>{p.name}</button>{!p.starter && <span className="mono dim" style={{ fontSize: 11, marginLeft: 8 }}>{t('bench').toUpperCase()}</span>}</td>
                          <td className="wide mono dim" style={{ fontSize: 12 }}>{t(roleOf(p))}</td>
                          <td className="dim">{p.apps ?? 0}</td>
                          {cols.map((k, i) => { const v = STAT[k].get(p); return <td key={k} className={i >= 2 ? 'wide' : undefined}>{STAT[k].digits ? v.toFixed(STAT[k].digits) : v || <span className="dim">0</span>}</td>; })}
                          <td className="wide mono" style={{ fontSize: 13 }}>{(p.yellow ?? 0) > 0 && <span style={{ color: '#E8C547' }}>{p.yellow}Y</span>} {(p.red ?? 0) > 0 && <span style={{ color: '#FF8A4C' }}>{p.red}R</span>}</td>
                          <td className="mono" style={{ fontSize: 13, color: d !== undefined && d <= -10 ? '#FF8A4C' : '#8A93A3' }}>{d === undefined ? '' : d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>
      </div>

      <footer className="footer-note">{t(`Synthetic squad. “If out” replays the season ${imp ? imp.n.toLocaleString('en-GB') : '2,000'} times with the player removed and his best replacement in.`)}</footer>

      <ClubSheet s={s} code={card ? club.code : null} onClose={() => setCard(false)} showSquadLink={false} />
      <PlayerSheet r={r} id={player} onClose={() => setPlayer(null)} showSquadLink={false} />
    </>
  );
}
