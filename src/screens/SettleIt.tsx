import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useShown, useT } from '../state/i18n';
import { usePrefs } from '../state/prefs';
import { league } from '../data/league';
import { useMatch } from '../state/match';
import { AgentTrace, Handoff, Loading, MicButton, Listen } from '../ui/kit';
import { useSearchParams } from 'react-router-dom';
import { settleIt, type AgentStep, type SettleResult } from '../agents/pipeline';
import { STUDIO_PRESETS } from '../agents/dataScientist';
import { demoFinal } from '../engine/league';

interface Asked { time: string; q: string; a: string; res: SettleResult }

const STEP_NAMES = ['Data Scientist', 'Analyst', 'Narrator', 'Verifier'] as const;

export default function SettleIt() {
  const [params] = useSearchParams();
  const handed = params.get('q');
  const { demoTimeline: tl } = useMatch();
  const t = useT();
  const shown = useShown();
  const { prefs } = usePrefs();
  const [text, setText] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('q') || STUDIO_PRESETS[0].text);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SettleResult | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [history, setHistory] = useState<Asked[]>([]);
  const [gfx, setGfx] = useState(false);
  const [allPresets, setAllPresets] = useState(false);
  const runId = useRef(0);
  const started = useRef(false);

  const ask = async (q: string) => {
    if (!tl) return;
    const id = ++runId.current;
    setText(q); setBusy(true); setReply(null); setGfx(false);
    const out = await settleIt(league, tl, q, (s) => id === runId.current && setSteps(s));
    if (id !== runId.current) return;
    setBusy(false);
    if (!out.ok) { setReply(out.reply); return; }
    setRes(out);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setHistory((h) => [{ time, q, a: out.view.answer.replace(/\.$/, ''), res: out }, ...h.filter((x) => x.q !== q)].slice(0, 6));
  };

  useEffect(() => {
    if (!tl || started.current) return;
    started.current = true;
    // the studio has been busy tonight: earlier questions, answered by the same pipeline
    (async () => {
      const earlier: Asked[] = [];
      const times = ['20:49', '21:06'];
      for (const [i, p] of [STUDIO_PRESETS[1], STUDIO_PRESETS[2]].entries()) {
        const out = await settleIt(league, tl, p.text, () => {}, { live: false });
        if (out.ok) earlier.unshift({ time: times[i], q: p.text, a: out.view.answer.replace(/\.$/, ''), res: out });
      }
      setHistory((h) => [...h, ...earlier.filter((e) => !h.some((x) => x.q === e.q))]);
    })();
    ask(handed?.trim() || STUDIO_PRESETS[0].text); // a question handed over by Ask What If, or the first preset
  }, [tl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tl) return <Loading />;
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim()) ask(text.trim()); };
  const final = demoFinal(league);
  const v = res?.view;
  const shownSteps = steps.length ? steps : STEP_NAMES.map((n) => ({ agent: n, status: 'working' as const, detail: 'Waiting', ms: 0 }));

  return (
    <>
      <section className="between" style={{ alignItems: 'flex-end', gap: '16px 32px' }}>
        <div className="stack-12" style={{ gap: 10 }}>
          <span className="badge" style={{ alignSelf: 'flex-start', background: '#FF8A4C', color: '#0B0F14' }}>{t('For studios').toUpperCase()}</span>
          <h1 className="h1">{t('Settle It')}</h1>
          <Handoff />
          <p className="lede">{t('Ask it the way you’d say it on air. Get an answer you can put on screen, with the numbers checked.')}</p>
        </div>
        <span className="inline mono" style={{ gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid #2A3240', fontSize: 13 }}><span className="dim">{t('Match').toUpperCase()}</span>NBR {final.hg}–{final.ag} HAR · {t('Full time').toUpperCase()}</span>
      </section>

      <form onSubmit={submit} className="panel stack-12" style={{ padding: 18 }}>
        <label htmlFor="q" className="kicker">{t('The question').toUpperCase()}</label>
        <div className="wrap" style={{ gap: 10, alignItems: 'stretch' }}>
          <textarea id="q" rows={2} maxLength={300} className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Was it the substitution that cost them?')} style={{ flex: '1 1 520px', minWidth: 0, width: 'auto' }} />
          <button type="submit" className="btn btn-primary" style={{ minHeight: 56, padding: '0 26px', fontSize: 16 }} disabled={busy}>{t('Settle it')}</button>
          <MicButton lang={prefs.lang} disabled={busy} onText={(q) => ask(q)} />
        </div>
        <div className="wrap" style={{ gap: '4px 6px' }}>
          <span className="kicker" style={{ marginRight: 6 }}>{t('Try').toUpperCase()}</span>
          {(allPresets ? STUDIO_PRESETS : STUDIO_PRESETS.slice(0, 4)).map((p) => (
            <button key={p.text} type="button" onClick={() => ask(p.text)} style={{ minHeight: 44, padding: '0 10px', borderRadius: 6, border: 'none', boxShadow: `inset 0 -2px 0 ${text === p.text ? '#CFF05A' : '#2A3240'}`, background: 'transparent', color: text === p.text ? '#F2EFE6' : '#C9CFD8', fontSize: 14, cursor: 'pointer' }}>{t(p.short)}</button>
          ))}
          <button type="button" className="more-btn" aria-expanded={allPresets} onClick={() => setAllPresets(!allPresets)}>{t(allPresets ? 'Fewer' : `${STUDIO_PRESETS.length - 4} more`)}</button>
        </div>
      </form>

      <div className="strip">
        <ol aria-label={t('Agents')} className="strip-in" style={{ margin: 0, padding: 0, listStyle: 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {shownSteps.map((s, i) => {
            const active = busy && s.status === 'working' && (i === 0 || shownSteps[i - 1].status !== 'working');
            const done = s.status === 'done' || s.status === 'flagged';
            const flag = s.status === 'flagged' || s.status === 'failed';
            const color = flag ? '#FF8A4C' : done ? '#CFF05A' : active ? '#FF8A4C' : '#222B38';
            return (
              <li key={s.agent} className="inline" style={{ gap: 12, padding: '14px 18px', boxShadow: `inset 0 2px 0 ${done || active || flag ? color : 'transparent'}` }}>
                <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: active ? 'stepPulse 1s ease-in-out infinite' : 'none' }}>
                  {done && !flag && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L5 9 L10 3" fill="none" stroke="#0B0F14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  {flag && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2 V7 M6 9.6 V10" fill="none" stroke="#0B0F14" strokeWidth="2.2" strokeLinecap="round" /></svg>}
                </span>
                <span className="stack-8" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{s.agent}</span>
                  <span style={{ fontSize: 13, color: '#A9B1BD' }}>{t(active ? (s.detail === 'Waiting' ? 'Working…' : s.detail) : s.detail)}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {!busy && <AgentTrace trace={res?.trace} />}
      </div>

      {reply && <div className="quote body" role="alert">{t(reply)}</div>}

      {v && res && (
        <div className="row fade-in" style={{ opacity: busy ? 0.45 : 1, transition: 'opacity 200ms' }}>
          <div className="col panel" style={{ flex: '1 1 480px', gap: 0 }}>
            <div className="pad stack-16">
              <span className="kicker">{t('The test').toUpperCase()}</span>
              <p style={{ fontSize: 17, lineHeight: 1.5 }}>{t(v.test)}</p>
              {v.bars && (
                <div className="stack-12" style={{ gap: 14 }}>
                  {v.bars.map((b) => (
                    <div key={b.label} className="stack-8" style={{ gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: b.highlight ? '#CFF05A' : '#A9B1BD' }}>{t(b.label)}</span>
                      <div className="wdl tall">
                        <div className="c-home" style={{ flex: `${b.w} 1 0` }}>NBR {b.w}%</div>
                        <div className="c-draw" style={{ flex: `${Math.max(1, b.d)} 1 0` }}>{b.d}%</div>
                        <div className="c-away" style={{ flex: `${Math.max(1, b.l)} 1 0` }}>{b.l}%</div>
                      </div>
                    </div>
                  ))}
                  <div className="wrap mono muted" style={{ gap: 14, fontSize: 12 }}>
                    <span className="legend"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#F2EFE6' }} />{t('Northbridge win').toUpperCase()}</span>
                    <span className="legend"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#4A5466' }} />{t('Draw').toUpperCase()}</span>
                    <span className="legend"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#7CB8FF' }} />{t('Harbour win').toUpperCase()}</span>
                  </div>
                </div>
              )}
              {v.table && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr className="mono dim" style={{ fontSize: 11, textAlign: 'left' }}>{v.table.cols.map((c, i) => <th key={c} scope="col" style={{ padding: '6px 4px', fontWeight: 400, textAlign: i ? 'right' : 'left' }}>{t(c).toUpperCase()}</th>)}</tr></thead>
                  <tbody>
                    {v.table.rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #222B38', background: v.table!.highlight === i ? '#1B2330' : 'transparent' }}>
                        {r.map((cell, j) => <td key={j} className={j ? 'mono' : ''} style={{ padding: '10px 4px', textAlign: j ? 'right' : 'left', color: v.table!.highlight === i && j === r.length - 1 ? '#CFF05A' : undefined, fontWeight: j === 0 && v.table!.highlight === i ? 600 : 400 }}>{j ? cell : t(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {v.rates && (
                <div className="stack-16">
                  {v.rates.map((r) => (
                    <div key={r.label} className="stack-8" style={{ gap: 6 }}>
                      <span className="between" style={{ fontSize: 14 }}><span style={{ fontWeight: 500, color: r.highlight ? '#CFF05A' : '#A9B1BD' }}>{t(r.label)}</span><span className="mono">{r.v}%</span></span>
                      <div style={{ position: 'relative', height: 14, borderRadius: 4, background: '#222B38' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${r.v}%`, borderRadius: 4, background: r.highlight ? '#CFF05A' : '#4A5466' }} />
                        {r.lo !== undefined && r.hi !== undefined && <>
                          <div style={{ position: 'absolute', left: `${r.lo}%`, width: `${r.hi - r.lo}%`, top: '50%', height: 2, marginTop: -1, background: '#F2EFE6' }} />
                          <div style={{ position: 'absolute', left: `${r.lo}%`, top: -3, bottom: -3, width: 2, background: '#F2EFE6' }} />
                          <div style={{ position: 'absolute', left: `${r.hi}%`, top: -3, bottom: -3, width: 2, background: '#F2EFE6' }} />
                        </>}
                      </div>
                      {r.lo !== undefined && <span className="kicker muted">{t(v.rangeText ?? "")}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="wrap" style={{ gap: 10, paddingTop: 4 }}>
                <span className="mono" style={{ padding: '5px 10px', borderRadius: 6, background: '#0B0F14', fontSize: 14, color: v.effectTone === 'good' ? '#CFF05A' : v.effectTone === 'neutral' ? '#F2EFE6' : '#A9B1BD' }}>{t(v.effect)}</span>
                <span style={{ fontSize: 14, color: '#A9B1BD' }}>{t(v.effectNote)}</span>
              </div>
            </div>
            <div className="hair-t stack-8" style={{ padding: '20px 24px', gap: 10 }}>
              <span className="kicker">{t('What it means').toUpperCase()}</span>
              <p style={{ fontSize: 17, lineHeight: 1.55 }}>{t(v.analyst)}</p>
            </div>
            <section aria-labelledby="tonight-h" className="hair-t grow stack-8" style={{ padding: '20px 24px 12px', gap: 4 }}>
              <div className="between" style={{ paddingBottom: 6 }}>
                <h2 id="tonight-h" className="kicker" style={{ fontWeight: 400 }}>{t('Asked tonight').toUpperCase()}</h2>
                <span className="kicker">{t(`${history.length} on air`).toUpperCase()}</span>
              </div>
              {history.map((h) => (
                <button key={h.q} type="button" className="rowbtn" aria-pressed={res.question === h.q} onClick={() => { setRes(h.res); setText(h.q); setSteps(h.res.steps); }} style={{ margin: '0 -12px', width: 'calc(100% + 24px)', borderTop: '1px solid #1B2330', minHeight: 52, gap: 14 }}>
                  <span className="mono muted" style={{ flex: '0 0 44px', fontSize: 13 }}>{h.time}</span>
                  <span style={{ flex: '1 1 auto', fontSize: 15, lineHeight: 1.35 }}>{t(h.q)}</span>
                  <span className="display volt" style={{ flex: '0 0 auto', padding: '4px 10px', borderRadius: 6, background: '#0B0F14', fontSize: 14 }}>{t(h.a)}</span>
                </button>
              ))}
            </section>
          </div>

          <div className="col" style={{ flex: '1 1 480px', gap: 16 }}>
            <article className="panel accent grow stack-16" style={{ padding: 24 }}>
              <span className="kicker">{t('The answer').toUpperCase()}</span>
              <span className="display volt" style={{ fontSize: 64, lineHeight: 0.95, letterSpacing: '-0.04em' }}>{t(v.answer)}</span>
              <p style={{ fontSize: 18, lineHeight: 1.45 }}>{t(v.line)}</p>
              <div role="img" aria-label={`On-air graphic: ${v.gfx.kicker}. ${v.gfx.big}. ${v.gfx.sub}`} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', background: '#0E1A17' }}>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <g fill="none" stroke="#1F3A31" strokeWidth="0.5"><rect x="4" y="4" width="152" height="82" /><line x1="80" y1="4" x2="80" y2="86" /><circle cx="80" cy="45" r="13" /></g>
                </svg>
                <div style={{ position: 'absolute', left: '6%', top: '10%', bottom: '10%', width: '52%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: '4% 5%', borderRadius: 8, background: 'rgba(11,15,20,0.94)' }}>
                  <span className="mono volt" style={{ fontSize: 'clamp(9px, 1vw, 12px)' }}>{t(v.gfx.kicker)}</span>
                  <span className="display" style={{ fontSize: 'clamp(30px, 4.2vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.03em' }}>{t(v.gfx.big)}</span>
                  <span style={{ fontSize: 'clamp(10px, 1.1vw, 14px)', lineHeight: 1.35, color: '#C9CFD8' }}>{t(v.gfx.sub)}</span>
                </div>
                <span className="display" style={{ position: 'absolute', right: '4%', bottom: '7%', fontSize: 'clamp(11px, 1.2vw, 15px)', letterSpacing: '-0.03em' }}>what if<span className="volt">?</span></span>
              </div>
              <div className="quote stack-8" style={{ gap: 6 }}>
                <span className="kicker signal">{t('Presenter script').toUpperCase()}</span>
                {(() => { const s = shown(v.script); return <><p style={{ fontSize: 16, lineHeight: 1.55, color: '#E4E1D9' }}>{s.text}</p><Listen text={s.text} lang={s.lang} label="Hear it read" /></>; })()}
              </div>
              {res.flags.length > 0 && (
                <details className="small">
                  <summary style={{ cursor: 'pointer' }}>{t(`The Verifier sent back ${res.drafts - 1} draft${res.drafts > 2 ? 's' : ''}`)}</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{res.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </details>
              )}
              <div className="wrap mt-auto" style={{ gap: 10 }}>
                <button type="button" className={`btn ${gfx ? '' : 'btn-primary'}`} style={{ flex: '1 1 auto', minHeight: 48, color: gfx ? '#CFF05A' : undefined }} onClick={() => setGfx(!gfx)}>{t(gfx ? 'Sent to graphics' : 'Send to graphics')}</button>
                <button type="button" className="btn" style={{ flex: '1 1 auto', minHeight: 48 }} onClick={() => { try { navigator.clipboard?.writeText(t(v.script)); } catch { /* clipboard unavailable */ } }}>{t('Copy script')}</button>
              </div>
            </article>
          </div>
        </div>
      )}

      <footer className="footer-note">{t('Synthetic match and league data. Every answer is built from fresh simulations and checked before it reaches the screen.')}</footer>
    </>
  );
}
