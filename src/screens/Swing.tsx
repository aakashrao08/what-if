import { useEffect, useMemo, useState } from 'react';
import { useShown, useT } from '../state/i18n';
import { Link } from 'react-router-dom';
import { league, club, surname } from '../data/league';
import { useMatch, minuteLabel, SPEEDS, type Speed } from '../state/match';
import { usePrefs, personaLabels } from '../state/prefs';
import { MatchTicker } from '../ui/MatchTicker';
import { Loading, Pitch, Segmented, WinBar, Listen } from '../ui/kit';
import { swingCard } from '../agents/pipeline';
import { overlayCues } from '../agents/overlay';
import { turningPoints } from '../agents/dataScientist';
import { liveStats, momentum, scoreAt } from '../engine/demo';
import { cached } from '../engine/client';
import type { CreditResult } from '../engine/credit';
import { FULL_TIME } from '../engine/match';
import type { Lang, Persona } from '../agents/format';
import { band, kmIn, KICKOFF_FRAME, win, wpAt } from './shared';

const X = (m: number) => (Math.min(m, FULL_TIME) / FULL_TIME) * 900;
const Y = (p: number) => 12 + (1 - p / 100) * 216;
const TICKS: [number, string][] = [[0, "0'"], [15, "15'"], [30, "30'"], [45, 'HT'], [60, "60'"], [75, "75'"], [90, "90'"]];

/** Who's on top: each side's xG over the last 10 minutes, home above the line, away below. */
function MomentumStrip({ points, home, away }: { points: { minute: number; home: number; away: number }[]; home: string; away: string }) {
  const peak = Math.max(0.6, ...points.flatMap((p) => [p.home, p.away]));
  const h = (v: number) => (v / peak) * 22;
  const w = (2 / FULL_TIME) * 900 * 0.8;
  const last = points[points.length - 1];
  const chaos = last && last.home >= 0.4 && last.away >= 0.4;
  const onTop = last && Math.abs(last.home - last.away) >= 0.25 ? (last.home > last.away ? home : away) : null;
  return (
    <div className="stack-8" style={{ gap: 4 }}>
      <div className="between mono" style={{ fontSize: 11, color: '#8A93A3' }}>
        <span>PRESSURE · xG IN THE LAST 10 MIN</span>
        <span>{!last ? '' : chaos ? 'END TO END' : onTop ? `${onTop.toUpperCase()} ON TOP` : 'EVEN'}</span>
      </div>
      <svg width="100%" height="50" viewBox="0 0 900 50" preserveAspectRatio="none" role="img" aria-label={`Pressure: ${home} above the line, ${away} below${onTop ? `; ${onTop} on top now` : ''}`}>
        <line x1="0" y1="25" x2="900" y2="25" stroke="#2E3949" vectorEffect="non-scaling-stroke" />
        {points.map((p) => (
          <g key={p.minute}>
            {p.home > 0 && <rect x={X(p.minute) - w} y={25 - h(p.home)} width={w} height={h(p.home)} fill="#F2EFE6" opacity={0.85} />}
            {p.away > 0 && <rect x={X(p.minute) - w} y={25} width={w} height={h(p.away)} fill="#7CB8FF" opacity={0.85} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Swing() {
  const { timeline: tl, ghosts, clock, minute, live, play, pause, setSpeed, seek, feed, timelines, minuteOf } = useMatch();
  const { prefs, set, personaIn } = usePrefs();
  const persona = personaIn(feed);
  const km = (id: string) => kmIn(feed, id);
  const H = club(feed.home), A = club(feed.away);
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const lang: Lang = prefs.lang;
  const t = useT();
  const shown = useShown();
  const pov = persona === 'away' ? 'away' : 'home';
  const tps = useMemo(() => (tl ? turningPoints(tl, minute) : []), [tl, minute]);
  const mom = useMemo(() => momentum(feed), [feed]); // before the loading return: hooks run in the same order every render
  // tagged with its match: right after switching matches, the previous match's credit must not be drawn
  const [creditOf, setCreditOf] = useState<{ fixtureId: string; c: CreditResult } | null>(null);
  useEffect(() => {
    let on = true;
    cached('credit', { fixtureId: feed.fixtureId }).then((c) => { if (on) setCreditOf({ fixtureId: feed.fixtureId, c }); });
    return () => { on = false; };
  }, [feed.fixtureId]);
  const credit = creditOf?.fixtureId === feed.fixtureId ? creditOf.c : null;

  useEffect(() => {
    if (follow && tps.length) setSelected(tps[tps.length - 1].id);
    if (!tps.length) setSelected(null);
  }, [follow, tps]);
  useEffect(() => { setFollow(true); }, [feed.fixtureId]);

  if (!tl) return <Loading>Working out the match: every scoreline from every minute…</Loading>;

  const tp = tps.find((t) => t.id === selected) ?? tps[tps.length - 1] ?? null;
  const card = tp ? swingCard(league, feed, tl, tp, persona, lang, pov) : null;
  const b = tp ? band(feed, tp) : null;
  const now = wpAt(tl, minute);
  const score = scoreAt(league, minute, feed);
  const povCode = pov === 'home' ? feed.home : feed.away;
  const lineColor = pov === 'home' ? '#F2EFE6' : '#7CB8FF';
  const before = tp ? win(tp.before, pov) : 0;
  const after = tp ? win(tp.after, pov) : 0;
  const cfv = tp ? win(tp.cf, pov) : 0;
  const delta = after - before;
  const deltaLabel = tp ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} PTS${tp.quiet ? ` · WHAT IF ${cfv - before >= 0 ? '+' : '−'}${Math.abs(cfv - before)}` : ''}` : '';
  const good = delta > 0 || (delta === 0 && cfv < before);

  // chart series up to the clock
  const pts = tl.points.filter((p) => p.minute <= minute);
  pts.push({ minute, wp: now });
  const actual = pts.map((p) => `${X(p.minute).toFixed(1)},${Y(win(p.wp, pov)).toFixed(1)}`).join(' ');
  const fork = tp ? tp.fork.map((p) => `${X(p.minute).toFixed(1)},${Y(win(p.wp, pov)).toFixed(1)}`).join(' ') : '';

  const feedRows = feed.events.filter((e) => e.minute <= minute).reverse().map((e) => {
    const ev = tl.events.find((x) => x.id === e.id);
    const d = ev ? Math.round(win(ev.after, pov) - win(ev.before, pov)) : 0;
    const tpOf = tps.find((t) => t.eventId === e.id);
    return { e, d, tpOf };
  });

  const stats = liveStats(league, minute, feed);
  const labels = personaLabels(H.short, A.short);
  const scorers = score.scorers.map((s) => `${surname(s.player)} ${s.label}`).join(' · ');

  return (
    <>
      <MatchTicker swingFor={(id) => { const tli = timelines[id]; const f = league.feeds.find((x) => x.fixtureId === id); return !!tli && !!f && turningPoints(tli, minuteOf(f)).length > 0; }} />

      <h1 className="sr">{t('The Swing')}</h1>
      <section aria-label={t('Match')} className="panel pad between" style={{ alignItems: 'center', gap: 20 }}>
        <div className="stack-12">
          <div className="wrap" style={{ gap: 10 }}>
            {live ? <span className="badge live"><i />{t('Live').toUpperCase()} · {minuteLabel(minute)}</span> : <span className="badge ft">{t('Full time').toUpperCase()}</span>}
            <span className="kicker">MERIDIAN LEAGUE · {feed.ground.toUpperCase()} · {t('Kick-off').toUpperCase()} {feed.kickoff}</span>
          </div>
          <div className="display wrap" style={{ gap: 16, fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1, alignItems: 'baseline' }}>
            <span>{H.name}</span><span className="mono" style={{ fontWeight: 500 }}>{score.home} – {score.away}</span><span>{A.name}</span>
          </div>
          <div className="small">{scorers || t('No goals yet')}</div>
        </div>
        <div className="stack-8" style={{ flex: '0 1 400px', minWidth: 260 }}>
          <div className="kicker">{t(live ? 'Right now · every scoreline weighed' : 'Final result').toUpperCase()}</div>
          <WinBar home={now.home} draw={now.draw} away={now.away} />
          <div className="between mono" style={{ fontSize: 13 }}>
            <span>{feed.home} {Math.round(now.home)}%</span><span className="muted">{t('Draw').toUpperCase()} {Math.round(now.draw)}%</span><span className="harbour">{feed.away} {Math.round(now.away)}%</span>
          </div>
          {feed.kickoff >= '15:00' ? (
          <div className="wrap" style={{ marginTop: 6 }} aria-label={t('Replay controls')}>
            <button type="button" className="btn btn-sm" onClick={clock.playing ? pause : play} aria-label={t(clock.playing ? 'Pause replay' : 'Play replay')} style={{ minWidth: 44 }}>
              {clock.playing ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" fill="#F2EFE6" /><rect x="7" y="1" width="3" height="10" fill="#F2EFE6" /></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1 L11 6 L2 11 Z" fill="#F2EFE6" /></svg>}
              {t(clock.playing ? 'Pause' : clock.minute >= FULL_TIME ? 'Replay' : 'Play')}
            </button>
            <div role="group" aria-label={t('Replay speed')} className="seg">
              {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={clock.speed === s} onClick={() => setSpeed(s as Speed)} style={{ minHeight: 30, padding: '0 10px', fontSize: 13 }}>{s}×</button>)}
            </div>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => seek(0)}>{t('Kick-off')}</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => seek(FULL_TIME)}>{t('Full time')}</button>
          </div>
          ) : <span className="small" style={{ marginTop: 6 }}>{t(`Kicked off at ${feed.kickoff}, so it’s already over. The replay clock runs the 15:00 games.`)}</span>}
        </div>
      </section>

      <div className="wrap" style={{ gap: '12px 24px' }}>
        <Segmented<Persona> label={t('Watch as')} options={(['casual', 'home', 'away', 'analyst'] as Persona[]).map((p) => ({ id: p, label: t(labels[p]) }))} value={persona} onChange={(p) => set({ watchAs: p })} volt />
        <div className="control" style={{ marginLeft: 'auto' }}>
          <span className="kicker">{t('For broadcasters').toUpperCase()}</span>
          <span className="wrap" style={{ gap: 8 }}>
          <button type="button" className="btn" style={{ borderColor: overlay ? '#CFF05A' : undefined }} aria-pressed={overlay} onClick={() => setOverlay(!overlay)}>
            <span className="switch sm" aria-hidden="true" data-on={overlay} />{t('Broadcast overlay')}
          </button>
          <button type="button" className="btn btn-quiet" disabled={!tl || !ghosts} title={t('Every turning point and Ghost Run as timed, machine-readable cues a broadcast graphics system can play out (JSON)')} onClick={() => {
            if (!tl || !ghosts) return;
            const blob = new Blob([JSON.stringify(overlayCues(league, feed, tl, ghosts, persona, lang), null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `overlay-${feed.fixtureId}-${persona}-${lang}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}>{t('Download the graphics feed')} ↓</button>
          </span>
        </div>
      </div>

      <div className="row">
        <div className="col main-col">
          <div className="panel pad-s stack-12">
            <div className="between kicker">
              <span>{tp && b ? `${km(tp.id).label} · ${t(b.kind)}` : t('Kick-off').toUpperCase()}</span>
              <span>{H.short.toUpperCase()} <span style={{ color: '#F2EFE6' }}>●</span> {t('Attacking').toUpperCase()} →&nbsp;&nbsp; {A.short.toUpperCase()} <span className="harbour">●</span></span>
            </div>
            <Pitch frame={tp ? km(tp.id).frame : KICKOFF_FRAME} overlay={overlay && !!tp}
              lower={tp && b ? { band: t(b.text), color: b.color, code: povCode, before, after, good, title: t(km(tp.id).title) } : undefined} />
          </div>

          <div className="panel pad grow stack-12" style={{ justifyContent: 'center' }}>
            <div className="between">
              <h2 className="h2">{t('The Swing')}</h2>
              <div className="wrap mono" style={{ gap: 14, fontSize: 12, color: '#A9B1BD' }}>
                <span className="legend"><span className="ln" style={{ background: lineColor }} />{t(`${pov === 'home' ? H.short : A.short} win %`)}</span>
                <span className="legend"><span className="dt" />{t('If it had gone the other way')}</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 260 }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 900 240" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1={Y(75)} x2="900" y2={Y(75)} stroke="#222B38" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={Y(50)} x2="900" y2={Y(50)} stroke="#2E3949" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={Y(25)} x2="900" y2={Y(25)} stroke="#222B38" vectorEffect="non-scaling-stroke" />
                <line x1={X(45.5)} y1="0" x2={X(45.5)} y2="240" stroke="#222B38" vectorEffect="non-scaling-stroke" />
                {live && <rect x={X(minute)} y="0" width={900 - X(minute)} height="240" fill="#0B0F14" opacity="0.55" />}
                {live && <line x1={X(minute)} y1="0" x2={X(minute)} y2="240" stroke="#FF8A4C" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
                {fork && <polyline points={fork} fill="none" stroke="#CFF05A" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" vectorEffect="non-scaling-stroke" />}
                <polyline points={actual} fill="none" stroke={lineColor} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="mono dim" style={{ position: 'absolute', left: 0, top: `${(Y(50) / 240) * 100}%`, transform: 'translateY(-120%)', fontSize: 11 }}>50%</span>
              {live && <span className="mono signal" style={{ position: 'absolute', left: `${(X(minute) / 900) * 100}%`, top: 6, marginLeft: 8, fontSize: 11 }}>{t('Now').toUpperCase()} {minuteLabel(minute)}</span>}
              {tps.map((x) => {
                const on = tp?.id === x.id;
                const bb = band(feed, x);
                const y = win(x.after, pov);
                const yPct = (Y(y) / 240) * 100;
                const left = `${(X(x.minute) / 900) * 100}%`;
                return (
                  <span key={x.id}>
                    <button type="button" aria-pressed={on} aria-label={`${t('Turning point')}: ${t(km(x.id).title)}`} onClick={() => { setSelected(x.id); setFollow(false); }}
                      style={{ position: 'absolute', left, top: `${yPct}%`, transform: 'translate(-50%, -50%)', width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: on ? 22 : 16, height: on ? 22 : 16, borderRadius: '50%', background: on ? bb.color : '#0B0F14', border: `3px solid ${x.quiet ? '#CFF05A' : bb.color}` }} />
                    </button>
                    <span className="mono" style={{ position: 'absolute', left, top: `calc(${yPct}% ${y > 55 ? '- 38px' : '+ 18px'})`, transform: 'translateX(-50%)', fontSize: 11, color: on ? '#F2EFE6' : '#8A93A3', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{t(bb.short)}</span>
                  </span>
                );
              })}
            </div>
            <div className="mono dim" style={{ position: 'relative', height: 14, fontSize: 11 }} aria-hidden="true">
              {TICKS.map(([m, l]) => <span key={l} style={{ position: 'absolute', left: `${(X(m) / 900) * 100}%`, transform: m === 0 ? 'none' : 'translateX(-50%)' }}>{l}</span>)}
            </div>
            <MomentumStrip points={mom.filter((p) => p.minute <= minute + 0.01)} home={H.short} away={A.short} />
          </div>
        </div>

        <div className="col side-col">
          {tp && card && b ? (
            <article aria-live="polite" className="panel pad stack-16" style={{ border: `1px solid ${b.color}` }}>
              <div className="between" style={{ alignItems: 'center' }}>
                <span className="band" style={{ background: b.color }}>{b.text}</span>
                <span className="kicker">{t(`Turning point ${tps.findIndex((x) => x.id === tp.id) + 1} of ${tps.length}`).toUpperCase()}</span>
              </div>
              <h2 className="display" style={{ fontSize: 28, lineHeight: 1.1 }}>{t(km(tp.id).title)}</h2>
              <div className="wrap">
                <span className="chip-num" style={{ border: '1px solid #2A3240', background: 'transparent' }}><span className="dim">{povCode} {t('Win').toUpperCase()}</span>{before}%<span className="dim">→</span>{after}%</span>
                <span className="chip-num" style={{ color: good ? '#CFF05A' : '#FF8A4C' }}>{t(deltaLabel)}</span>
              </div>
              <div className="stack-8">
                <span className="kicker">{t('Why it matters').toUpperCase()}</span>
                {(() => { const s = shown(card.text, card.lang); return <><p className="body">{s.text}</p><Listen text={s.text} lang={s.lang} /></>; })()}
              </div>
              <div className="quote volt stack-8" style={{ gap: 4 }}>
                <span className="kicker volt">{t('What if').toUpperCase()}</span>
                <span style={{ fontSize: 16, lineHeight: 1.45 }}>{card.lang === lang ? card.whatIf : t(card.whatIf)}</span>
              </div>
              {km(tp.id).ghostId && (
                <div className="wrap mt-auto">
                  <Link className="btn btn-primary" to={`/ghost/${km(tp.id).ghostId}`}>{t('Open in Ghost Run')}</Link>
                </div>
              )}
            </article>
          ) : (
            <article className="panel pad stack-12">
              <span className="kicker">{t('No turning points yet').toUpperCase()}</span>
              <p className="body">{t('The Data Scientist flags a moment when the win chance moves by 10 points or more, or when the other outcome would have moved it by 15. Press play and they’ll appear here.')}</p>
            </article>
          )}

          <section aria-label={t('Match feed')} className="panel pad-s grow stack-8">
            <div className="between kicker" style={{ padding: '0 4px 4px' }}><span>{t('Match feed').toUpperCase()}</span><span>{povCode} {t('Win').toUpperCase()} %</span></div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {feedRows.map(({ e, d, tpOf }) => {
                const dl = d === 0 ? (['kickoff', 'half_time', 'full_time'].includes(e.type) ? '' : '0') : `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
                const color = d < 0 ? '#FF8A4C' : d > 0 ? '#CFF05A' : '#8A93A3';
                const inner = <>
                  <span className="mono" style={{ flex: '0 0 44px', fontSize: 13, color: '#A9B1BD' }}>{e.label}</span>
                  <span style={{ flex: '1 1 auto', fontSize: 14, lineHeight: 1.35, color: tpOf ? '#F2EFE6' : '#C9CFD8' }}>{t(e.text)}</span>
                  <span className="mono" style={{ fontSize: 13, color }}>{dl}</span>
                </>;
                return tpOf
                  ? <button key={e.id} type="button" className="rowbtn" aria-pressed={tp?.id === tpOf.id} onClick={() => { setSelected(tpOf.id); setFollow(false); }}>{inner}</button>
                  : <div key={e.id} className="inline" style={{ gap: 12, minHeight: 36, padding: '2px 12px', width: '100%' }}>{inner}</div>;
              })}
            </div>
          </section>
        </div>
      </div>

      <section aria-label={t('Live stats')} className="panel pad stack-16">
        <div className="between kicker"><span>{t('Live stats').toUpperCase()} · {minuteLabel(minute)}</span><span><span style={{ color: '#F2EFE6' }}>{feed.home}</span> · <span className="harbour">{feed.away}</span></span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px 28px' }}>
          {stats.map((s) => (
            <div key={s.label} className="stack-8" style={{ gap: 6 }}>
              <div className="between mono" style={{ fontSize: 14 }}><span>{s.home}</span><span className="muted" style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>{t(s.label)}</span><span className="harbour">{s.away}</span></div>
              <div style={{ display: 'flex', gap: 3, height: 6 }}><div style={{ flex: `${s.hw} 1 0`, borderRadius: 2, background: '#F2EFE6' }} /><div style={{ flex: `${s.aw} 1 0`, borderRadius: 2, background: '#7CB8FF' }} /></div>
            </div>
          ))}
        </div>
      </section>

      {credit && minute >= FULL_TIME && credit.moments.length > 1 && (() => {
        const who = credit.focus === 'home' ? H.short : A.short;
        const max = Math.max(...credit.moments.map((m) => Math.abs(m.shapley)), 1);
        const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
        return (
          <section aria-label={t('Fair credit')} className="panel pad stack-16">
            <div className="between kicker"><span>{t('Fair credit · who decided it').toUpperCase()}</span><span>{t(`${who} win, points`).toUpperCase()}</span></div>
            <p className="small" style={{ maxWidth: 760 }}>
              {t(`Every turning point played both ways, in all ${credit.combos} combinations, each one worked out exactly from ${Math.floor(credit.from)}′. Each moment’s share is its Shapley value: its average effect across every combination of the others. The shares add up to the ${credit.total.toFixed(1)}-point gap between this match as it happened (${credit.asHappened.toFixed(1)}%) and the match where every moment went the other way (${credit.allFlipped.toFixed(1)}%).`)}
            </p>
            <div className="stack-8">
              {[...credit.moments].sort((x, y) => Math.abs(y.shapley) - Math.abs(x.shapley)).map((m) => (
                <div key={m.id} className="inline" style={{ gap: 12, minHeight: 32 }}>
                  <span className="mono" style={{ flex: '0 0 44px', fontSize: 13, color: '#A9B1BD' }}>{km(m.id).label}</span>
                  <span style={{ flex: '1 1 200px', fontSize: 14 }}>{t(km(m.id).title)}</span>
                  <span aria-hidden="true" style={{ flex: '1 1 160px', display: 'flex', height: 8 }}>
                    <span style={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-end' }}>{m.shapley < 0 && <span style={{ width: `${(Math.abs(m.shapley) / max) * 100}%`, background: '#FF8A4C', borderRadius: 2 }} />}</span>
                    <span style={{ flex: '1 1 0', display: 'flex' }}>{m.shapley > 0 && <span style={{ width: `${(m.shapley / max) * 100}%`, background: '#CFF05A', borderRadius: 2 }} />}</span>
                  </span>
                  <span className="mono" style={{ flex: '0 0 56px', textAlign: 'right', fontSize: 13, color: m.shapley >= 0 ? '#CFF05A' : '#FF8A4C' }}>{pts(m.shapley)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <footer className="footer-note">{t(`Synthetic match${feed.source === 'generated' ? ', generated by The Forge' : ''}. Every club and player is fictional. Each probability is computed exactly over every scoreline the rest of the match could produce from that moment, with each side’s scoring rate updated by the chances it has created; every sentence is checked against them before it’s shown.`)}</footer>
    </>
  );
}

