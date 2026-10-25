import { useEffect, useState } from 'react';
import { useShown, useT } from '../state/i18n';
import { league, club, surname } from '../data/league';
import { useMatch } from '../state/match';
import { usePrefs, personaLabels } from '../state/prefs';
import { MatchTicker } from '../ui/MatchTicker';
import { Loading, Pitch, Segmented, Listen } from '../ui/kit';
import { reel } from '../agents/pipeline';
import { rippleStories } from '../agents/narrator';
import { matchRecap, type Recap } from '../agents/recap';
import { askAgents, LIVE } from '../agents/live';
import { verify } from '../agents/verifier';
import type { RecapReply } from '../agents/contract';
import type { DeserveExperiment } from '../engine/settle';
import { cached } from '../engine/client';
import { finalOf, type RippleResult, type Score } from '../engine/league';
import { FULL_TIME } from '../engine/match';
import type { Persona } from '../agents/format';
import { band, kmIn, pct, win } from './shared';

export default function Ripple() {
  const { timeline: tl, ghosts, live, seek, feed } = useMatch();
  const { prefs, set, personaIn } = usePrefs();
  const persona = personaIn(feed);
  const t = useT();
  const shown = useShown();
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<'title' | 'top4' | 'rel'>('top4');
  const [rip, setRip] = useState<RippleResult | null>(null);
  const actual = finalOf(feed);
  const [alt, setAlt] = useState<Score | null>(null);
  const result = alt ?? actual;
  const km = (id: string) => kmIn(feed, id);
  const H = club(feed.home), A = club(feed.away);
  const labels = personaLabels(H.short, A.short);

  useEffect(() => { setAlt(null); setSel(0); }, [feed.fixtureId]);
  // the recap is always about the match as it ended, whatever result is being tested below
  const [ripActual, setRipActual] = useState<RippleResult | null>(null);
  const [deserve, setDeserve] = useState<DeserveExperiment | null>(null);
  const [liveRecap, setLiveRecap] = useState<{ key: string; headline: string; paragraphs: string[] } | null>(null);
  useEffect(() => {
    if (live) return;
    let alive = true;
    setRipActual(null); setDeserve(null);
    cached('ripple', { ...actual, fixtureId: feed.fixtureId }).then((r) => alive && setRipActual(r));
    cached('experiment', { kind: 'deserve', fixtureId: feed.fixtureId }).then((d) => alive && setDeserve(d as DeserveExperiment));
    return () => { alive = false; };
  }, [live, feed.fixtureId]); // eslint-disable-line react-hooks/exhaustive-deps
  const recapKey = `${feed.fixtureId}|${persona}|${prefs.lang}`;
  useEffect(() => {
    if (!LIVE || live) return;
    let alive = true;
    askAgents<RecapReply>('recap', { fixtureId: feed.fixtureId, persona, lang: prefs.lang }, 40000)
      .then((r) => { if (alive && r?.ok && r.headline && r.paragraphs) setLiveRecap({ key: recapKey, headline: r.headline, paragraphs: r.paragraphs }); });
    return () => { alive = false; };
  }, [recapKey, live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (live) return;
    let alive = true;
    setRip(null);
    cached('ripple', { ...result, fixtureId: feed.fixtureId }).then((r) => alive && setRip(r));
    return () => { alive = false; };
  }, [live, feed.fixtureId, result.hg, result.ag]); // eslint-disable-line react-hooks/exhaustive-deps

  // the other two results this match could have had
  const hi = Math.max(actual.hg, actual.ag), lo = Math.min(actual.hg, actual.ag);
  const draw: Score = { hg: lo, ag: lo };
  const homeWin: Score = actual.hg > actual.ag ? actual : actual.hg === actual.ag ? { hg: hi + 1, ag: lo } : { hg: hi, ag: lo };
  const awayWin: Score = actual.ag > actual.hg ? actual : actual.hg === actual.ag ? { hg: lo, ag: hi + 1 } : { hg: lo, ag: hi };
  const outcomes: { label: string; score: Score }[] = [
    { label: `As it ended · ${actual.hg}–${actual.ag}`, score: actual },
    ...(actual.hg !== actual.ag ? [{ label: `If it’s a draw · ${draw.hg}–${draw.ag}`, score: draw }] : []),
    ...(actual.hg <= actual.ag ? [{ label: `If ${H.short} win · ${homeWin.hg}–${homeWin.ag}`, score: homeWin }] : []),
    ...(actual.ag <= actual.hg ? [{ label: `If ${A.short} win · ${awayWin.hg}–${awayWin.ag}`, score: awayWin }] : [])
  ];

  const header = (
    <section className="between" style={{ alignItems: 'flex-end', gap: '18px 32px' }}>
      <div className="stack-12">
        <span className={`badge ${live ? 'live' : 'ft'}`} style={{ alignSelf: 'flex-start' }}>{live ? <><i />{t('Still playing').toUpperCase()}</> : `${t('Full time').toUpperCase()} · ${H.short.toUpperCase()} ${t('v').toUpperCase()} ${A.short.toUpperCase()}`}</span>
        <h1 className="h1">{t('Ripple')}</h1>
        <p className="lede">{t('The match in four paragraphs, every moment ranked by how much it changed it, then what the result does to everyone’s season.')}</p>
      </div>
      <Segmented<Persona> label={t('Watch as')} options={(['casual', 'home', 'away', 'analyst'] as Persona[]).map((p) => ({ id: p, label: t(labels[p]) }))} value={persona} onChange={(p) => set({ watchAs: p })} />
    </section>
  );

  if (live) {
    return (
      <>
        <MatchTicker />
        {header}
        <div className="panel pad stack-12" style={{ alignItems: 'flex-start' }}>
          <span className="kicker">{t('Ripple opens at full time').toUpperCase()}</span>
          <p className="body" style={{ maxWidth: 640 }}>{t('The reel needs the whole match, and the league ripple needs the final score. Keep watching The Swing, or skip the replay to the final whistle.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => seek(FULL_TIME)}>{t('Skip to full time')}</button>
        </div>
      </>
    );
  }
  if (!tl || !ghosts || !rip) return <><MatchTicker />{header}<Loading>{t('Playing out the rest of the season 10,000 times, before and after this result…')}</Loading></>;

  const items = reel(league, feed, tl, ghosts, persona);
  const house: Recap | null = ripActual && deserve ? matchRecap(league, feed, tl, ripActual, deserve, persona) : null;
  // a live recap is shown only if the browser's Verifier agrees with every number in it
  const liveOk = !!(house && liveRecap && liveRecap.key === recapKey && verify([liveRecap.headline, ...liveRecap.paragraphs].join(' '), house.facts, prefs.lang).ok);
  const recap = house && liveOk ? { ...house, headline: liveRecap!.headline, paragraphs: liveRecap!.paragraphs } : house;
  const checked = recap ? verify([recap.headline, ...recap.paragraphs].join(' '), recap.facts, liveOk ? prefs.lang : 'en').checked : 0;
  const cur = items[Math.min(sel, items.length - 1)];
  const k = cur ? km(cur.mr.id) : null;
  const b = cur ? band(feed, cur.mr) : null;
  const focus = cur?.mr.focus ?? 'home';
  const goals = feed.events.filter((e) => e.type === 'goal');
  const follow = persona === 'home' ? feed.home : persona === 'away' ? feed.away : null;
  const stories = rippleStories(league, rip, persona, feed);
  const maxImpact = Math.max(1, ...items.map((i) => i.mr.impact));
  const isAlt = !!alt;
  const posBefore = new Map(rip.tableBefore.map((r, i) => [r.code, i + 1]));
  const rows = rip.tableAfter.map((r, i) => {
    const o = rip.after[r.code], ob = rip.before[r.code];
    const before = pct(ob[tab]), after = pct(o[tab]);
    const ci = o.ci[tab];
    return { r, pos: i + 1, move: (posBefore.get(r.code) ?? i + 1) - (i + 1), before, after, d: after - before, lo: pct(ci.lo), hi: pct(ci.hi) };
  }).filter((x) => x.before >= 1 || x.after >= 1).slice(0, 9);

  return (
    <>
      <MatchTicker onlyFinished />
      {header}

      <section aria-label="Result" className="panel between" style={{ padding: '20px 24px', alignItems: 'center', gap: '14px 24px' }}>
        <div className="display wrap" style={{ gap: 16, fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1, alignItems: 'baseline' }}>
          <span>{H.name}</span><span className="mono" style={{ fontWeight: 500 }}>{actual.hg} – {actual.ag}</span><span className="harbour">{A.name}</span>
        </div>
        <div className="small">{goals.map((g) => `${surname(g.player!)} ${g.label}`).join(' · ')}</div>
      </section>

      {recap && (
        <article aria-labelledby="recap-h" className="stack-16 fade-in" style={{ gap: 14, padding: 'clamp(22px, 3vw, 36px)', borderRadius: 4, background: '#F2EFE6', color: '#0B0F14' }}>
          <div className="between" style={{ paddingBottom: 10, borderBottom: '3px double #0B0F14', gap: 12, flexWrap: 'wrap' }}>
            <span className="display" style={{ fontSize: 20 }}>{t('The recap')}</span>
            <span className="mono" style={{ fontSize: 12, color: '#3A4352' }}>{t(persona === 'home' ? `For ${H.short} fans` : persona === 'away' ? `For ${A.short} fans` : persona === 'analyst' ? 'Analyst' : 'Full time').toUpperCase()}</span>
          </div>
          <h2 id="recap-h" className="display" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', letterSpacing: '-0.03em', lineHeight: 1.02 }}>{liveOk ? recap.headline : t(recap.headline)}</h2>
          <div className="stack-12" style={{ gap: 12, maxWidth: 720 }}>
            {recap.paragraphs.map((p, i) => <p key={i} style={{ fontSize: i === 0 ? 19 : 17, lineHeight: 1.55, color: '#1F2633' }}>{liveOk ? p : t(p)}</p>)}
          </div>
          <div className="between mono" style={{ paddingTop: 12, borderTop: '1px solid #C9C4B8', fontSize: 12, color: '#3A4352', gap: 12, flexWrap: 'wrap' }}>
            <span>{t(`${liveOk ? 'Written live by the Narrator' : 'Written by the Narrator'} · ${checked} numbers checked by the Verifier`).toUpperCase()}</span>
            <button type="button" className="btn btn-sm" style={{ color: '#0B0F14', borderColor: '#8A8577', minHeight: 36 }} onClick={() => { try { navigator.clipboard?.writeText([recap.headline, '', ...recap.paragraphs].join('\n\n')); } catch { /* clipboard unavailable */ } }}>{t('Copy recap')}</button>
            {(() => { const lines = [recap.headline, ...recap.paragraphs]; const s = lines.map((x) => (liveOk ? { text: x, lang: prefs.lang } : shown(x))); const all = s.every((x) => x.lang === prefs.lang); return <Listen light text={(all ? s.map((x) => x.text) : lines).join(' ')} lang={all ? prefs.lang : 'en'} label="Listen to the recap" />; })()}
          </div>
        </article>
      )}

      <section aria-labelledby="reel-h" className="stack-16">
        <div className="between">
          <h2 id="reel-h" className="display" style={{ fontSize: 30 }}>{t('Impact Reel')}</h2>
          <span className="small">{t('Ranked by how much each moment changed the win chance, or would have')}</span>
        </div>
        {!cur || !k || !b ? <div className="panel pad body">{t('Nothing in this match moved the win probability enough to make the reel.')}</div> : <div className="row">
          <div className="panel pad-s stack-16 main-col" style={{ minWidth: 0 }}>
            <div style={{ position: 'relative' }}>
              <Pitch frame={k.frame} overlay lower={{ band: t(b.text), color: b.color, code: focus === "home" ? feed.home : feed.away, before: win(cur.mr.before, focus), after: win(cur.mr.after, focus), good: true, title: t(k.title) }} />
              <span className="mono" style={{ position: 'absolute', left: '3%', top: '5%', display: 'inline-flex', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(11,15,20,0.9)', fontSize: 12 }}><span className="volt">#{cur.rank}</span>{k.label}</span>
              <span className="mono muted" style={{ position: 'absolute', right: '3%', top: '5%', padding: '6px 10px', borderRadius: 6, background: 'rgba(11,15,20,0.9)', fontSize: 12 }}>{k.clip}</span>
            </div>
            <div className="stack-8" style={{ gap: 10 }}>
              <h3 className="display" style={{ fontSize: 26, lineHeight: 1.15 }}>{t(k.title)}</h3>
              <p className="body" style={{ color: '#E4E1D9' }}>{t(cur.text)}</p>
              <span style={{ fontSize: 15, color: '#A9B1BD' }}><span className="kicker volt">{t('What if').toUpperCase()} · </span>{t(cur.whatIf)}</span>
            </div>
          </div>
          <ol className="side-col" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', borderBottom: '1px solid #222B38', minWidth: 0 }}>
            {items.map((it, i) => {
              const on = i === sel;
              return (
                <li key={it.mr.id} style={{ display: 'flex', flex: '1 1 auto' }}>
                  <button type="button" aria-pressed={on} onClick={() => setSel(i)} style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '12px 14px', border: 'none', borderTop: '1px solid #222B38', background: on ? '#121821' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span className="inline" style={{ alignItems: 'baseline', gap: 12, width: '100%' }}>
                      <span className="display" style={{ fontSize: 22, color: on ? '#CFF05A' : '#5A6578', minWidth: 24 }}>{it.rank}</span>
                      <span style={{ flex: '1 1 auto', fontSize: 15, lineHeight: 1.35 }}><span className="mono muted" style={{ fontSize: 13 }}>{km(it.mr.id).label} </span>{t(it.title)}</span>
                      <span className="mono volt" style={{ fontSize: 13 }}>{t(`${it.mr.impact} pts`)}</span>
                    </span>
                    <span className="inline" style={{ gap: 10, width: '100%' }}>
                      <span style={{ flex: '1 1 auto', height: 6, borderRadius: 3, background: '#222B38', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${Math.round((it.mr.impact / maxImpact) * 100)}%`, background: it.mr.quiet ? '#CFF05A' : '#F2EFE6', borderRadius: 3 }} /></span>
                      {it.mr.quiet && <span className="mono volt" style={{ fontSize: 11 }}>{t('What if').toUpperCase()}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>}
      </section>

      <section aria-labelledby="ripple-h" className="stack-16" style={{ paddingTop: 12 }}>
        <div className="between" style={{ alignItems: 'center', gap: 12 }}>
          <div className="stack-8" style={{ gap: 4 }}>
            <h2 id="ripple-h" className="display" style={{ fontSize: 30 }}>{t('The Ripple')}</h2>
            <span style={{ fontSize: 15, color: '#A9B1BD' }}>{t(`How this result moved every club’s season. ${rip.n.toLocaleString('en-GB')} simulated run-ins, before and after.`)}</span>
          </div>
        </div>
        <div className="between" style={{ alignItems: 'center', gap: 12 }}>
          <div className="control">
            <span className="kicker">{t('Result').toUpperCase()}</span>
            <div role="group" aria-label={t('Result to test')} className="seg volt">
              {outcomes.map((o) => (
                <button key={o.label} type="button" aria-pressed={result.hg === o.score.hg && result.ag === o.score.ag} onClick={() => setAlt(o.score.hg === actual.hg && o.score.ag === actual.ag ? null : o.score)} style={{ fontSize: 14 }}>{t(o.label)}</button>
              ))}
            </div>
          </div>
          <Segmented label={t('Race')} hideLabel options={[{ id: 'title', label: t('Title') }, { id: 'top4', label: t('Top four') }, { id: 'rel', label: t('Relegation') }]} value={tab} onChange={(x) => setTab(x as 'title' | 'top4' | 'rel')} />
        </div>
        <div className="strip">
          <div className="strip-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {stories.map((s) => (
              <div key={s.key} className="stack-8" style={{ padding: '22px 24px', background: follow && s.key === follow ? '#121821' : 'transparent' }}>
                <span className="kicker" style={{ color: s.tone === 'home' ? '#F2EFE6' : s.tone === 'away' ? '#7CB8FF' : '#A9B1BD' }}>{t(s.tag)}</span>
                <span className="display" style={{ fontSize: 20, lineHeight: 1.2 }}>{t(s.head)}</span>
                <span className="mono" style={{ fontSize: 15, color: s.statGood ? '#CFF05A' : '#FF8A4C' }}>{t(s.stat)}</span>
                <span style={{ fontSize: 15, lineHeight: 1.45, color: '#C9CFD8' }}>{t(s.body)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <caption className="small" style={{ textAlign: 'left', padding: '12px 0 8px' }}>{t(tab === 'title' ? 'Chance of winning the league. Clubs not shown can’t.' : tab === 'top4' ? 'Chance of a top-four finish. Clubs not shown are settled either way.' : 'Chance of relegation. Clubs not shown are safe.')}{isAlt ? ` ${t(`If it had ended ${result.hg}–${result.ag}.`)}` : ''}</caption>
            <thead>
              <tr className="mono dim" style={{ fontSize: 12, textAlign: 'left' }}>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400 }}>#</th>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400 }}>{t('Club').toUpperCase()}</th>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400, textAlign: 'right' }}>{t('Pts').toUpperCase()}</th>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400, textAlign: 'right' }}>{t('Before').toUpperCase()}</th>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400, textAlign: 'right' }}>{t('After').toUpperCase()}</th>
                <th scope="col" style={{ padding: '8px 6px', fontWeight: 400, textAlign: 'right' }}>{t('Change').toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const mine = follow === x.r.code;
                const goodFor = tab === 'rel' ? x.d < 0 : x.d > 0;
                return (
                  <tr key={x.r.code} style={{ background: mine ? '#1B2330' : 'transparent', borderTop: '1px solid #222B38', opacity: x.d === 0 && !mine ? 0.6 : 1 }}>
                    <td className="mono muted" style={{ padding: '12px 6px', whiteSpace: 'nowrap' }}>{x.pos} {x.move !== 0 && <span style={{ color: x.move > 0 ? '#CFF05A' : '#FF8A4C', fontSize: 12 }}>{x.move > 0 ? '▲' : '▼'}{Math.abs(x.move)}</span>}</td>
                    <th scope="row" style={{ padding: '12px 6px', textAlign: 'left', fontWeight: mine ? 700 : 500 }}>{club(x.r.code).name}</th>
                    <td className="mono" style={{ padding: '12px 6px', textAlign: 'right' }}>{x.r.pts}</td>
                    <td className="mono muted" style={{ padding: '12px 6px', textAlign: 'right' }}>{x.before}%</td>
                    <td className="mono" style={{ padding: '12px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.after}%{x.hi > x.lo && <span className="dim" style={{ fontSize: 12 }}> {x.lo}–{x.hi}</span>}</td>
                    <td style={{ padding: '12px 6px', textAlign: 'right' }}><span className="mono" style={{ display: 'inline-block', minWidth: 44, padding: '3px 8px', borderRadius: 6, background: x.d === 0 ? 'transparent' : goodFor ? '#CFF05A' : '#FF8A4C', color: x.d === 0 ? '#5A6578' : '#0B0F14', fontSize: 13, textAlign: 'center' }}>{x.d === 0 ? '–' : x.d > 0 ? `+${x.d}` : `−${-x.d}`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footer-note">{t(`Synthetic league. Chances come from ${rip.n.toLocaleString('en-GB')} simulated run-ins with and without this result; the small figures are 95% ranges.`)}</footer>
    </>
  );
}
