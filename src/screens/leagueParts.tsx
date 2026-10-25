// Pieces shared by Current Affairs and the squad pages: data hooks, the club card and the player card.
import { useT } from '../state/i18n';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { league } from '../data/league';
import { cached } from '../engine/client';
import type { PlayerImpact, Races, Standings } from '../engine/races';
import type { Outcome } from '../engine/match';
import { chance, clubCard, impactLine, playerCard, RACE_LABEL, RACE_SHORT, ROLE_NAME } from '../agents/currentAffairs';
import { raceProb } from '../engine/takes';
import { Sheet } from '../ui/kit';

export const clubOf = (code: string) => league.clubs.find((c) => c.code === code)!;
export const pct = (x: number) => Math.round(x * 100);

export function useStandings() {
  const [s, setS] = useState<Standings | null>(null);
  useEffect(() => { let alive = true; cached('standings', {}).then((r) => alive && setS(r)); return () => { alive = false; }; }, []);
  return s;
}
export function useRaces() {
  const [r, setR] = useState<Races | null>(null);
  useEffect(() => { let alive = true; cached('races', {}).then((x) => alive && setR(x)); return () => { alive = false; }; }, []);
  return r;
}

export function Crest({ code }: { code: string }) {
  return <span className="crest" style={{ background: clubOf(code).colors.primary }} aria-hidden="true" />;
}

export function Form({ form }: { form: ('W' | 'D' | 'L')[] }) {
  return <span className="form" role="img" aria-label={`Last ${form.length}: ${form.join(' ')}`}>{form.map((f, i) => <i key={i} className={f} />)}</span>;
}

/** The race a club is in, as a short label and its chance. */
export function outlookOf(s: Standings, code: string) {
  const c = s.clubs.find((x) => x.code === code)!;
  return { label: RACE_SHORT[c.race], p: raceProb(c.outlook, c.race).p };
}

function FixtureOdds({ p, home }: { p: Outcome; home: boolean }) {
  const w = pct(home ? p.home : p.away), d = pct(p.draw), l = 100 - w - d;
  const t = useT();
  return (
    <span className="inline mono" style={{ gap: 10, fontSize: 13, whiteSpace: 'nowrap' }} aria-label={`Win ${w} percent, draw ${d} percent, lose ${l} percent`}>
      <span className="volt">{t('W')} {w}%</span><span className="dim">{t('D')} {d}%</span><span style={{ color: '#FF8A4C' }}>{t('L')} {l}%</span>
    </span>
  );
}

export function ClubSheet({ s, code, onClose, showSquadLink = true }: { s: Standings; code: string | null; onClose: () => void; showSquadLink?: boolean }) {
  const c = code ? s.clubs.find((x) => x.code === code) : null;
  const club = code ? clubOf(code) : null;
  const card = code ? clubCard(league, s, code) : null;
  const t = useT();
  return (
    <Sheet open={!!code} onClose={onClose} label={club ? `${club.name}: ${t('stats and chances')}` : t('Club')}>
      {c && club && card && <>
        <div className="stack-8" style={{ gap: 6 }}>
          <span className="inline" style={{ gap: 10 }}><Crest code={c.code} /><span className="kicker">{club.nickname.toUpperCase()} · {t('Manager').toUpperCase()} {club.manager.toUpperCase()}</span></span>
          <h2 className="display" style={{ fontSize: 34, lineHeight: 1 }}>{club.name}</h2>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: '#E4E1D9' }}>{t(card.headline.text)}</p>
        </div>
        <div className="col" style={{ gap: 0 }}>
          {card.odds.map((o) => (
            <div key={o.label} className="kv" style={{ alignItems: 'baseline' }}>
              <span>{t(o.label)}</span>
              <span className="mono"><b className="display" style={{ fontSize: 20, color: o.p >= 0.1 ? (o.label === 'Relegated' ? '#FF8A4C' : '#CFF05A') : o.p < 0.005 ? '#5A6578' : undefined }}>{chance(o.p)}</b>{o.p >= 0.01 && o.p <= 0.99 && <span className="dim" style={{ fontSize: 12 }}> {pct(o.lo)}–{pct(o.hi)}%</span>}</span>
            </div>
          ))}
        </div>
        <div className="statgrid">
          <div><b>{c.row.w}-{c.row.d}-{c.row.l}</b><span>{t('Won-drawn-lost')}</span></div>
          <div><b>{c.row.gf}:{c.row.ga}</b><span>{t('Goals')}</span></div>
          <div><b>{c.xpts}</b><span>{t('Points deserved')}</span></div>
          <div><b>{c.cleanSheets}</b><span>{t('Clean sheets')}</span></div>
        </div>
        <p className="small" style={{ lineHeight: 1.5 }}>{t(card.luck.text)}</p>
        {c.next.length > 0 && (
          <section className="col" style={{ gap: 0 }} aria-label={t('Games left')}>
            <span className="kicker" style={{ paddingBottom: 6 }}>{t('Games left').toUpperCase()}</span>
            {c.next.map((n) => (
              <div key={`${n.mw}-${n.opp}`} className="between" style={{ gap: 12, minHeight: 44, borderTop: '1px solid #222B38' }}>
                <span style={{ fontSize: 15 }}><span className="mono dim" style={{ fontSize: 12, marginRight: 10 }}>MW{n.mw}</span>{n.home ? 'v' : '@'} {clubOf(n.opp).short}</span>
                <FixtureOdds p={n.p} home={n.home} />
              </div>
            ))}
          </section>
        )}
        {showSquadLink && <Link to={`/league/${c.code}`} className="btn btn-primary" style={{ minHeight: 48 }} onClick={onClose}>{t('See the squad →')}</Link>}
      </>}
    </Sheet>
  );
}

export function PlayerSheet({ r, id, onClose, showSquadLink = true }: { r: Races | null; id: string | null; onClose: () => void; showSquadLink?: boolean }) {
  const p = id ? league.players.find((x) => x.id === id) : null;
  const card = id ? playerCard(league, r, id) : null;
  const [imp, setImp] = useState<PlayerImpact | null>(null);
  const t = useT();
  useEffect(() => {
    setImp(null);
    if (!id) return;
    let alive = true;
    cached('impact', { player: id }).then((x) => alive && setImp(x));
    return () => { alive = false; };
  }, [id]);
  const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
  return (
    <Sheet open={!!id} onClose={onClose} label={p ? `${p.name}: ${t('stats')}` : t('Player')}>
      {p && card && <>
        <div className="stack-8" style={{ gap: 6 }}>
          <span className="inline" style={{ gap: 10 }}><Crest code={p.club} /><span className="kicker">{clubOf(p.club).short.toUpperCase()} · #{p.number} · {t(ROLE_NAME[card.role]).toUpperCase()} · {t('Age').toUpperCase()} {p.age}</span></span>
          <h2 className="display" style={{ fontSize: 34, lineHeight: 1 }}>{p.name}</h2>
        </div>
        <div className="statgrid">
          {card.tiles.map((x) => (
            <div key={x.key}><b>{x.value}</b><span>{t(x.label)}</span>{x.rank && x.rank.rank <= 10 && <span className="mono" style={{ fontSize: 11, color: x.rank.rank <= 3 ? '#CFF05A' : '#8A93A3' }}>{t(`${ord(x.rank.rank)} of ${x.rank.of}`)}</span>}</div>
          ))}
        </div>
        <div className="stack-8" style={{ gap: 10 }}>
          {card.lines.map((l, i) => <p key={i} style={{ fontSize: 15, lineHeight: 1.5, color: '#C9CFD8' }}>{t(l.text)}</p>)}
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#C9CFD8' }}>{imp ? t(impactLine(league, imp).text) : <span className="dim">{t('Playing the season out without him…')}</span>}</p>
        </div>
        {card.race && (
          <div className="col" style={{ gap: 0 }}>
            <span className="kicker" style={{ paddingBottom: 6 }}>{t(RACE_LABEL[card.race.board])}</span>
            <div className="kv"><span>{t('Finishes top')}</span><b className="display volt" style={{ fontSize: 20 }}>{chance(card.race.line.top)}</b></div>
            <div className="kv"><span>{t('Finishes top three')}</span><span className="mono">{chance(card.race.line.top3)}</span></div>
            <div className="kv"><span>{t('Projected total')}</span><span className="mono">{card.race.line.mean} <span className="dim">({card.race.line.lo}–{card.race.line.hi})</span></span></div>
          </div>
        )}
        <span className="small">{t(`Ranks are among ${ROLE_NAME[card.role].toLowerCase()}s with ten or more appearances.`)}</span>
        {showSquadLink && <Link to={`/league/${p.club}`} className="btn" style={{ minHeight: 48 }} onClick={onClose}>{t(`See the ${clubOf(p.club).short} squad →`)}</Link>}
      </>}
    </Sheet>
  );
}
