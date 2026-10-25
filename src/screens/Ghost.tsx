import { useEffect, useRef } from 'react';
import { useShown, useT } from '../state/i18n';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { league, surname, club } from '../data/league';
import { MatchTicker } from '../ui/MatchTicker';
import type { StoppedAttack } from '../data/types';
import { useMatch, minuteLabel } from '../state/match';
import { usePrefs, personaLabels } from '../state/prefs';
import { Loading, Pitch, Segmented, Listen } from '../ui/kit';
import { ghostCard } from '../agents/pipeline';
import type { Persona } from '../agents/format';

function stopLong(a: StoppedAttack): string {
  const s = a.stopper ? surname(a.stopper).toUpperCase() : '';
  if (a.stop === 'cleared') return `CLEARED OFF THE LINE BY ${s}`;
  if (a.stop === 'fouled') return `FOULED BY ${s} · YELLOW CARD`;
  if (a.stop === 'offside') return `FLAGGED OFFSIDE BY ${a.stopModel.kind === 'offside' ? a.stopModel.marginM : ''} m`;
  return `SHOT BLOCKED BY ${s}`;
}
const STOP_SHORT = { cleared: 'Cleared off line', fouled: 'Fouled', offside: 'Offside', blocked: 'Blocked' } as const;

export default function Ghost() {
  const { id } = useParams();
  const nav = useNavigate();
  const { ghosts, minute, live, feed, setFixture } = useMatch();
  const { set, personaIn } = usePrefs();
  const persona = personaIn(feed);
  const t = useT();
  const shown = useShown();
  const owner = id ? league.feeds.find((f) => f.stoppedAttacks.some((a) => a.id === decodeURIComponent(id))) : undefined;
  // a link to one attack (/ghost/<id>) opens that attack's match, once per link...
  const synced = useRef(false);
  useEffect(() => { synced.current = false; if (owner && owner.fixtureId !== feed.fixtureId) setFixture(owner.fixtureId); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ...and picking another match in the ticker afterwards leaves that link behind instead of snapping back
  useEffect(() => {
    if (!id || !owner) return;
    if (feed.fixtureId === owner.fixtureId) { synced.current = true; return; }
    if (synced.current) nav('/ghost', { replace: true });
  }, [feed.fixtureId, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ghosts) return <Loading>{t('Playing each stopped attack on 500 times…')}</Loading>;

  const attacks = feed.stoppedAttacks.filter((a) => a.minute <= minute);
  const H = club(feed.home), A = club(feed.away);
  const labels = personaLabels(H.short, A.short);
  const a = attacks.find((x) => x.id === (id && decodeURIComponent(id))) ?? attacks[0];
  const header = (
    <section className="between" style={{ alignItems: 'flex-end', gap: '18px 32px' }}>
      <div className="stack-12">
        <div className="wrap kicker" style={{ gap: 10 }}>
          {live ? <span className="badge live"><i />{t('Live').toUpperCase()} · {minuteLabel(minute)}</span> : <span className="badge ft">{t('Full time').toUpperCase()}</span>}
          <span>{H.name.toUpperCase()} {t('v').toUpperCase()} {A.name.toUpperCase()}</span>
        </div>
        <h1 className="h1">{t('Ghost Run')}</h1>
        <p className="lede">{t(`Fouled, offside or blocked? We play the attack on ${ghosts[0]?.n ?? 500} times from the moment it stopped, and count how often it ends in a goal.`)}</p>
      </div>
      <Segmented<Persona> label={t('Watch as')} options={(['casual', 'home', 'away', 'analyst'] as Persona[]).map((p) => ({ id: p, label: t(labels[p]) }))} value={persona} onChange={(p) => set({ watchAs: p })} />
    </section>
  );
  if (!a) return <><MatchTicker />{header}<div className="panel pad body">{t('No attack has been stopped yet in this match. The first Ghost Run appears the moment one is.')}</div></>;

  const g = ghosts.find((x) => x.id === a.id)!;
  const card = ghostCard(league, a, g, persona);
  const ch = g.chart;
  const all = [...ch.actual, ...ch.ghost].map((p) => p[1]);
  const maxY = Math.min(100, Math.ceil((Math.max(...all) + 8) / 20) * 20);
  const cx = (t: number) => (t / ch.duration) * 600;
  const cy = (p: number) => 190 - (p / maxY) * 180;
  const line = (arr: [number, number][]) => arr.map(([t, p]) => `${cx(t).toFixed(1)},${cy(p).toFixed(1)}`).join(' ');
  const stop = ch.actual[ch.actual.length - 1];
  const end = ch.ghost[ch.ghost.length - 1];
  const verdictBg = g.goalPct >= 30 ? '#CFF05A' : g.goalPct >= 10 ? '#F2EFE6' : '#7A8597';
  const km = feed.keyMoments.find((k) => k.id === a.momentId);

  return (
    <>
      <MatchTicker />
      {header}

      <div className="strip">
        <div className="strip-in" role="group" aria-label={t('Stopped attacks')} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {attacks.map((x) => {
            const on = x.id === a.id;
            const gx = ghosts.find((y) => y.id === x.id)!;
            return (
              <button key={x.id} type="button" aria-pressed={on} onClick={() => nav(`/ghost/${encodeURIComponent(x.id)}`)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '16px 20px', border: 'none', borderLeft: '1px solid #222B38', boxShadow: `inset 0 3px 0 ${on ? '#CFF05A' : 'transparent'}`, background: on ? '#121821' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <span className="between mono" style={{ width: '100%', fontSize: 12 }}><span className="muted">{x.label} · {t(STOP_SHORT[x.stop])}</span><span style={{ color: x.team === 'home' ? '#F2EFE6' : '#7CB8FF' }}>{x.team === 'home' ? feed.home : feed.away}</span></span>
                <span className="display" style={{ fontSize: 19, lineHeight: 1.2 }}>{t(x.title)}</span>
                <span className="inline mono" style={{ fontSize: 13 }}><span className="volt" style={{ fontWeight: 500 }}>{gx.goalPct}%</span><span className="muted">{t(gx.goalPct >= 30 ? 'Real chance' : gx.goalPct >= 10 ? 'Half chance' : 'Wouldn’t have scored')}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: '20px 32px' }}>
        <div className="col main-col">
          <div className="panel pad-s stack-12 grow">
            <div className="between kicker">
              <span>{a.label} · {t(stopLong(a))}</span>
              <span className="wrap" style={{ gap: 14 }}>
                <span className="legend"><span className="ln" style={{ width: 16, background: '#F2EFE6' }} />{t('What happened').toUpperCase()}</span>
                <span className="legend"><span className="dt" style={{ width: 16 }} />{t('Ghost Run').toUpperCase()}</span>
                <span className="legend"><span className="signal" style={{ fontWeight: 500 }}>✕</span>{t('Stopped').toUpperCase()}</span>
              </span>
            </div>
            <Pitch frame={a.frame} variant="ghost" />
            <div className="hair-t" style={{ marginTop: 10, paddingTop: 16 }}>
            <div className="stack-12">
              <div className="between">
                <span style={{ fontSize: 17, fontWeight: 600 }}>{t('Chance of a goal, second by second')}</span>
                <span className="wrap mono muted" style={{ gap: 14, fontSize: 12 }}>
                  <span className="legend"><span className="ln" style={{ width: 16, background: '#F2EFE6' }} />{t('What happened').toUpperCase()}</span>
                  <span className="legend"><span className="dt" style={{ width: 16 }} />{t('Ghost Run').toUpperCase()}</span>
                </span>
              </div>
              <div style={{ position: 'relative', height: 200 }} role="img" aria-label={`Chance of a goal rises to ${stop[1]} percent before the attack is stopped; the ghost run continues to ${end[1]} percent.`}>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="10" x2="600" y2="10" stroke="#222B38" vectorEffect="non-scaling-stroke" />
                  <line x1="0" y1="100" x2="600" y2="100" stroke="#222B38" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                  <line x1="0" y1="190" x2="600" y2="190" stroke="#2E3949" vectorEffect="non-scaling-stroke" />
                  <polyline points={`${cx(stop[0]).toFixed(1)},${cy(stop[1]).toFixed(1)} ${cx(stop[0] + ch.duration * 0.04).toFixed(1)},${cy(0).toFixed(1)}`} fill="none" stroke="#FF8A4C" strokeWidth="2" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                  <polyline points={line(ch.ghost)} fill="none" stroke="#CFF05A" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" vectorEffect="non-scaling-stroke" />
                  <polyline points={line(ch.actual)} fill="none" stroke="#F2EFE6" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="mono dim" style={{ position: 'absolute', left: 0, top: 0, fontSize: 11 }}>{maxY}%</span>
                <span style={{ position: 'absolute', left: `${(stop[0] / ch.duration) * 100}%`, top: `${(cy(stop[1]) / 200) * 100}%`, transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%', background: '#FF8A4C', color: '#0B0F14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✕</span>
                <span className="mono signal" style={{ position: 'absolute', left: `${(stop[0] / ch.duration) * 100}%`, top: `${(cy(stop[1]) / 200) * 100}%`, transform: 'translate(-50%, 16px)', fontSize: 11, whiteSpace: 'nowrap' }}>{t(STOP_SHORT[a.stop]).toUpperCase()}</span>
                <span style={{ position: 'absolute', left: `${(end[0] / ch.duration) * 100}%`, top: `${(cy(end[1]) / 200) * 100}%`, transform: 'translate(-50%, -50%)', width: 16, height: 16, borderRadius: '50%', border: '3px solid #CFF05A', background: '#0B0F14' }} />
                <span className="mono volt" style={{ position: 'absolute', left: `${(end[0] / ch.duration) * 100}%`, top: `${(cy(end[1]) / 200) * 100}%`, transform: 'translate(-50%, -34px)', fontSize: 13, whiteSpace: 'nowrap' }}>{g.goalPct}%</span>
              </div>
              <div className="between mono dim" style={{ fontSize: 11 }} aria-hidden="true">
                {Array.from({ length: ch.duration + 1 }, (_, s) => <span key={s}>{s}s</span>)}
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="col side-col">
          <article aria-live="polite" className="panel accent pad grow stack-16" style={{ padding: 26, gap: 18 }}>
            <div className="stack-8" style={{ gap: 4 }}>
              <span className="display volt" style={{ fontSize: 96, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{g.goalPct}%</span>
              <span style={{ fontSize: 16, color: '#C9CFD8' }}>{t(`of ${g.n} ghost runs ended in a goal`)}</span>
            </div>
            <div className="stack-8" style={{ gap: 6 }}>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: '#1B2330' }} role="img" aria-label={`Likely range ${g.ci.lo} to ${g.ci.hi} percent`}>
                <div style={{ position: 'absolute', left: `${g.ci.lo}%`, width: `${Math.max(1, g.ci.hi - g.ci.lo)}%`, top: 0, bottom: 0, borderRadius: 5, background: 'rgba(207,240,90,0.35)' }} />
                <div style={{ position: 'absolute', left: `${g.goalPct}%`, top: -3, bottom: -3, width: 3, marginLeft: -1.5, borderRadius: 2, background: '#CFF05A' }} />
              </div>
              <span className="between kicker"><span>0%</span><span>{t(`Likely range ${g.ci.lo}–${g.ci.hi}%`).toUpperCase()}</span><span>100%</span></span>
            </div>
            <span className="mono" style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 4, background: verdictBg, color: '#0B0F14', fontSize: 13, fontWeight: 500 }}>{t(card.verdictLabel).toUpperCase()}</span>
            {(() => { const s = shown(card.text); return <><p className="body">{s.text}</p><Listen text={s.text} lang={s.lang} /></>; })()}
            <div className="stack-8" style={{ gap: 0 }}>
              <span className="kicker" style={{ paddingBottom: 8 }}>{t(`How the ${g.n} runs ended`).toUpperCase()}</span>
              {([['Goal', g.out.goal, '#CFF05A'], ['Saved', g.out.saved, '#F2EFE6'], ['Off target', g.out.wide, '#5A6578'], ['Blocked', g.out.blocked, '#2F3A4A']] as [string, number, string][]).map(([k, v, c]) => (
                <div key={k} className="inline" style={{ gap: 12, padding: '12px 0', borderTop: '1px solid #222B38', fontSize: 14 }}>
                  <span style={{ flex: '0 0 84px', color: '#A9B1BD' }}>{t(k)}</span>
                  <span style={{ flex: '1 1 auto', height: 6, borderRadius: 3, background: '#1B2330', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${(v / g.n) * 100}%`, background: c, borderRadius: 3 }} /></span>
                  <span className="mono" style={{ flex: '0 0 40px', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="stack-8" style={{ gap: 0 }}>
              <span className="kicker" style={{ paddingBottom: 8 }}>{t('From the tracking data').toUpperCase()}</span>
              {a.facts.map((f) => <div key={f.k} className="kv" style={{ fontSize: 14 }}><span>{t(f.k)}</span><span>{t(f.v)}</span></div>)}
            </div>
            <div className="mt-auto stack-8" style={{ gap: 10, paddingTop: 18, borderTop: '1px solid #2A3240' }}>
              <span className="kicker signal">{t('In the studio').toUpperCase()}</span>
              <span className="display" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.3 }}>“{t(a.claim.quote)}”</span>
              <span className="inline" style={{ fontSize: 15, fontWeight: 600, color: g.claimHolds ? '#CFF05A' : '#FF8A4C' }}>
                {g.claimHolds
                  ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="#CFF05A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="#FF8A4C" strokeWidth="2.2" strokeLinecap="round" /></svg>}
                {t(card.check)}
              </span>
            </div>
            {km && <Link to="/swing" style={{ alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontWeight: 600, textDecoration: 'none' }}>{t('See this moment in The Swing →')}</Link>}
          </article>
        </div>
      </div>

      <section aria-labelledby="num-h" className="stack-16" style={{ paddingTop: 8, gap: 22 }}>
        <div className="between">
          <h2 id="num-h" className="display" style={{ fontSize: 30 }}>{t('The numbers behind it')}</h2>
          <span className="kicker">{a.label} · {t(a.title).toUpperCase()}</span>
        </div>
        <div className="strip">
          <div className="strip-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {card.tiles.map((x) => (
              <div key={x.k} className="cell stack-8" style={{ gap: 10, padding: '18px 20px', boxShadow: `inset 0 2px 0 ${x.x ? '#CFF05A' : 'transparent'}` }}>
                <span className="kicker" style={{ color: x.x ? '#CFF05A' : undefined }}>{t(x.k)}</span>
                <span className="display" style={{ fontSize: 42, lineHeight: 1, letterSpacing: '-0.03em', color: x.x ? '#CFF05A' : '#F2EFE6' }}>{x.v}</span>
                <span className="small">{t(x.s)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer-note">{t('Synthetic match. Every player is fictional. Each ghost run continues the play from the moment it was stopped; shot quality comes from the xG model, defensive actions from the xClear, xTackle and xBlock models.')}</footer>
    </>
  );
}
