import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useShown, useT } from '../state/i18n';
import { Link } from 'react-router-dom';
import { league } from '../data/league';
import { usePrefs, type SavedUniverse } from '../state/prefs';
import { multiverse, whatItTakes, type AgentStep, type MultiverseResult, type TakesOk } from '../agents/pipeline';
import { TAKES_EXAMPLES } from '../agents/takes';
import TakesPanel from './TakesPanel';
import { examples, EXAMPLES } from '../agents/drFootball';
import { RUNIN_SIMS } from '../engine/league';
import { useUniverseStat } from './useUniverse';
import { AgentTrace, Handoff, Listen } from '../ui/kit';
import { useSearchParams } from 'react-router-dom';

type Voice = 'back' | 'report' | 'analyst';
const VOICES: { id: Voice; label: string }[] = [{ id: 'back', label: 'Back page' }, { id: 'report', label: 'Match report' }, { id: 'analyst', label: 'Analyst notes' }];

function UniverseRow({ u, on, open }: { u: SavedUniverse; on: boolean; open: () => void }) {
  const stat = useUniverseStat(u);
  const t = useT();
  return (
    <button type="button" onClick={open} aria-current={on} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 24px', minHeight: 56, padding: '14px 12px', border: 'none', borderTop: '1px solid #222B38', background: on ? '#121821' : 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <span className="mono volt" style={{ flex: '0 0 100px', fontSize: 12 }}>{u.kind}</span>
      <span className="display" style={{ flex: '1 1 260px', fontSize: 19 }}>{t(u.title)}</span>
      <span className="mono" style={{ fontSize: 14, color: '#C9CFD8' }}>{stat ? t(stat) : '…'}</span>
      <span style={{ flex: '0 0 70px', fontSize: 13, color: '#8A93A3', textAlign: 'right' }}>{t(u.date)}</span>
    </button>
  );
}

const EX = examples(league);
const TX = TAKES_EXAMPLES(league);
type Mode = 'whatif' | 'takes';

export default function Multiverse() {
  const [params] = useSearchParams();
  const { prefs, set } = usePrefs();
  const t = useT();
  const shown = useShown();
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'rejected'>('idle');
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState<MultiverseResult | null>(null);
  const [reply, setReply] = useState<{ text: string; suggestions: string[] } | null>(null);
  const [voice, setVoice] = useState<Voice>('back');
  const [mode, setMode] = useState<Mode>('whatif');
  const [takes, setTakes] = useState<TakesOk | null>(null);
  const [goalText, setGoalText] = useState(TX[0]);
  const [allEx, setAllEx] = useState(false);
  const runId = useRef(0);

  const start = async (text: string) => {
    const id = ++runId.current;
    setPrompt(text);
    setPhase('running');
    setProgress(0);
    setReply(null);
    const out = await multiverse(league, text, (d) => id === runId.current && setProgress(d), (st) => id === runId.current && setSteps(st));
    if (id !== runId.current) return;
    if (!out.ok) { setReply({ text: out.rejected.reply, suggestions: out.rejected.suggestions }); setPhase('rejected'); return; }
    setRes(out);
    setProgress(RUNIN_SIMS);
    setPhase('done');
  };

  const startTakes = async (text: string) => {
    const id = ++runId.current;
    setMode('takes');
    setGoalText(text);
    setPhase('running');
    setProgress(0);
    setReply(null);
    const out = await whatItTakes(league, text, prefs.club, (p) => id === runId.current && setProgress(p), (st) => id === runId.current && setSteps(st));
    if (id !== runId.current) return;
    if (!out.ok) { setReply({ text: out.reply, suggestions: [] }); setPhase('rejected'); return; }
    setTakes(out);
    setPhase('done');
  };
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    runId.current++;
    setMode(m);
    setReply(null);
    setPhase(m === 'whatif' ? (res ? 'done' : 'idle') : (takes ? 'done' : 'idle'));
    setSteps(m === 'whatif' ? res?.steps ?? [] : takes?.steps ?? []);
  };
  const playOut = (sentence: string) => { setMode('whatif'); start(sentence); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // first visit: a question handed over by Ask What If, or a universe straight away
  useEffect(() => {
    const q = params.get('q')?.trim();
    if (q && params.get('mode') === 'takes') startTakes(q); else start(q || EXAMPLES[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'takes') { if (goalText.trim()) startTakes(goalText.trim()); return; }
    if (prompt.trim()) start(prompt.trim());
  };
  const total = mode === 'takes' ? 100 : RUNIN_SIMS;
  const trace = mode === 'takes' ? takes?.trace : res?.trace;
  const saved = res ? prefs.universes.find((u) => u.prompt.toLowerCase() === prompt.toLowerCase()) : undefined;
  const toggleSave = () => {
    if (!res) return;
    if (saved) { set({ universes: prefs.universes.filter((u) => u !== saved) }); return; }
    const u: SavedUniverse = { id: `u-${Date.now()}`, prompt, kind: res.parsed.kind, title: res.parsed.short, stat: res.view.stat, date: 'Today' };
    set({ universes: [u, ...prefs.universes] });
  };
  const story = res?.view.story[voice];
  const max = res ? Math.max(10, ...res.view.hist.flatMap((h) => [h.real, h.alt])) : 50;

  return (
    <>
      <section className="stack-16" style={{ padding: 'clamp(16px, 3vw, 36px) 0 8px' }}>
        <h1 className="h1">{t('Multiverse')}</h1>
        <Handoff />
        <p className="lede">{t(mode === 'whatif' ? 'Rewrite a transfer, a manager or a single moment, then watch the season play out again.' : 'Name a goal. Dr Football searches every change the simulator can make for the smallest one that gets there.')}</p>
        <div role="group" aria-label={t('Ask')} className="seg" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={mode === 'whatif'} onClick={() => switchMode('whatif')} style={{ minHeight: 40, fontSize: 15 }}>{t('What if…')}</button>
          <button type="button" aria-pressed={mode === 'takes'} onClick={() => switchMode('takes')} style={{ minHeight: 40, fontSize: 15 }}>{t('What would it take?')}</button>
        </div>
        <form onSubmit={submit} className="panel wrap" style={{ gap: 10, padding: 10, border: '1px solid #2A3240' }}>
          <label htmlFor="wi" className="sr">{t(mode === 'whatif' ? 'Your what-if' : 'Your goal')}</label>
          <input id="wi" type="text" value={mode === 'whatif' ? prompt : goalText} onChange={(e) => (mode === 'whatif' ? setPrompt : setGoalText)(e.target.value)} placeholder={t(mode === 'whatif' ? 'What if…' : 'What would it take for…')}
            style={{ flex: '1 1 420px', minWidth: 0, minHeight: 56, padding: '0 16px', border: 'none', borderRadius: 8, background: '#0B0F14', color: '#F2EFE6', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(18px, 2vw, 22px)' }} />
          <button type="submit" className="btn btn-primary" style={{ minHeight: 56, padding: '0 24px', fontSize: 16 }} disabled={phase === 'running'}>{t(mode === 'whatif' ? `Run ${RUNIN_SIMS.toLocaleString('en-GB')} seasons` : 'Find the smallest change')}</button>
        </form>
        <div className="wrap">
          <span className="kicker" style={{ marginRight: 4 }}>{t('Try').toUpperCase()}</span>
          {mode === 'takes' && TX.map((g) => (
            <button key={g} type="button" className="btn btn-sm" style={{ minHeight: 44, whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%', borderColor: goalText === g && phase !== 'idle' ? '#CFF05A' : undefined }} onClick={() => startTakes(g)}>
              <span className="mono volt" style={{ fontSize: 11 }}>{t('Target').toUpperCase()}</span>{t(g.replace(/^What would it take for /, '').replace(/\?$/, ''))}
            </button>
          ))}
          {mode === 'whatif' && (allEx ? EX : EX.slice(0, 4)).map((ex) => (
            <button key={ex.text} type="button" className="btn btn-sm" title={ex.text} style={{ minHeight: 44, whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%', borderColor: prompt === ex.text && phase !== 'idle' ? '#CFF05A' : undefined }} onClick={() => start(ex.text)}>
              <span className="mono volt" style={{ fontSize: 11 }}>{t(ex.kind)}</span>{t(ex.text.replace(/^What if /, '').replace(/\?$/, ''))}
            </button>
          ))}
          {mode === 'whatif' && <button type="button" className="more-btn" aria-expanded={allEx} onClick={() => setAllEx(!allEx)}>{t(allEx ? 'Fewer' : `${EX.length - 4} more`)}</button>}
        </div>
        {phase === 'running' && (
          <div className="stack-8" role="status">
            <div className="between mono" style={{ fontSize: 13 }}><span className="signal">{t(mode === 'whatif' ? 'Dr Football is viewing alternate futures' : 'Dr Football is trying every change').toUpperCase()}</span><span>{mode === 'whatif' ? `${progress.toLocaleString('en-GB')} / ${RUNIN_SIMS.toLocaleString('en-GB')}` : `${progress}%`}</span></div>
            <div style={{ height: 6, borderRadius: 3, background: '#222B38', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(progress / total) * 100}%`, background: '#FF8A4C', transition: 'width 120ms linear' }} /></div>
          </div>
        )}
        {phase === 'done' && mode === 'whatif' && <div className="mono muted" style={{ fontSize: 13 }}>{t(`${RUNIN_SIMS.toLocaleString('en-GB')} futures viewed. Not quite 14,000,605, but enough to find the ones where you win.`)}</div>}
        {phase === 'done' && steps.length > 0 && (
          <div className="wrap mono dim" style={{ fontSize: 12, gap: '4px 16px' }}>
            {steps.map((st) => <span key={st.agent}><span style={{ color: st.status === 'flagged' ? '#FF8A4C' : '#CFF05A' }}>●</span> {st.agent.toUpperCase()} · {t(st.detail)}</span>)}
          </div>
        )}
        {phase === 'done' && <AgentTrace trace={trace} />}
        {phase === 'rejected' && reply && (
          <div className="quote stack-8" style={{ gap: 6 }} role="alert">
            <span className="kicker signal">DR FOOTBALL</span>
            <span className="body">{t(reply.text)}</span>
          </div>
        )}
      </section>

      {mode === 'takes' && takes && (phase === 'done' || phase === 'running') && <TakesPanel res={takes} dim={phase === 'running'} onPlay={playOut} />}

      {mode === 'whatif' && res && story && (phase === 'done' || phase === 'running') && (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '40px 56px', alignItems: 'stretch', borderTop: '1px solid #222B38', paddingTop: 32, opacity: phase === 'running' ? 0.4 : 1, transition: 'opacity 200ms' }}>
          <div className="stack-16" style={{ gap: 18, minWidth: 0 }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 15, color: '#A9B1BD' }}>{t('How the Narrator writes it up')}</span>
              <div role="group" aria-label={t('Write it as')} className="seg">
                {VOICES.map((v) => <button key={v.id} type="button" aria-pressed={voice === v.id} onClick={() => setVoice(v.id)} style={{ minHeight: 38, fontSize: 14 }}>{t(v.label)}</button>)}
              </div>
            </div>
            <article style={{ flex: '1 1 auto', padding: 'clamp(24px, 3vw, 40px)', borderRadius: 4, background: '#F2EFE6', color: '#0B0F14', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="between" style={{ paddingBottom: 12, borderBottom: '3px double #0B0F14' }}>
                <span className="display" style={{ fontSize: 24 }}>The Meridian Post</span>
                <span className="mono" style={{ fontSize: 12, color: '#3A4352' }}>{t('Alternate edition').toUpperCase()} · {t(res.parsed.kind)}</span>
              </div>
              <h2 className="display" style={{ fontSize: voice === 'back' ? 'clamp(40px, 4.6vw, 60px)' : 'clamp(30px, 3.2vw, 42px)', letterSpacing: '-0.035em', lineHeight: 0.98 }}>{t(story.head)}</h2>
              <p style={{ maxWidth: 560, fontSize: 19, lineHeight: 1.55, color: '#2A3240' }}>{t(story.sub)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${res.view.metrics.length}, minmax(0, 1fr))`, borderTop: '1px solid #0B0F14', borderBottom: '1px solid #0B0F14' }}>
                {res.view.metrics.map((m, i) => (
                  <div key={m.label} style={{ padding: '14px 14px 14px 0', paddingLeft: i ? 14 : 0, borderLeft: i ? '1px solid #C9C4B8' : 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="display" style={{ fontSize: 'clamp(28px, 3vw, 38px)', lineHeight: 1 }}>{m.alt}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.35, color: '#3A4352' }}>{t(`${m.label}, was ${m.real}`)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto between mono" style={{ paddingTop: 14, borderTop: '1px solid #C9C4B8', fontSize: 12, color: '#3A4352' }}>
                <span>{t(`From ${res.result.n.toLocaleString('en-GB')} simulated seasons`).toUpperCase()}</span>
                <span>{t(`Written by the Narrator · ${res.verdict.ok ? `${res.verdict.checked} numbers checked by the Verifier` : 'Verifier flagged this'}`).toUpperCase()}</span>
              </div>
            </article>
            <div className="wrap" style={{ gap: 10 }}>
              <button type="button" className={`btn ${saved ? '' : 'btn-primary'}`} aria-pressed={!!saved} onClick={toggleSave} style={{ minHeight: 48, padding: '0 22px', color: saved ? '#CFF05A' : undefined }}>{t(saved ? 'Saved to My Dugout' : 'Save as a Universe')}</button>
              <button type="button" className="btn" style={{ minHeight: 48, padding: '0 22px' }} onClick={() => { try { navigator.clipboard?.writeText(`${story.head}\n${story.sub}\n— What If? Multiverse: “${prompt}”`); } catch { /* clipboard unavailable */ } }}>{t('Copy the story')}</button>
              {(() => { const h = shown(story.head), b = shown(story.sub); const en = h.lang !== prefs.lang || b.lang !== prefs.lang; return <Listen text={en ? `${story.head} ${story.sub}` : `${h.text} ${b.text}`} lang={en ? 'en' : prefs.lang} />; })()}
            </div>
            <section aria-labelledby="else-h" className="col" style={{ gap: 0, paddingTop: 12 }}>
              <div className="between" style={{ paddingBottom: 12 }}>
                <h2 id="else-h" className="h3">{t('Who else this moves')}</h2>
                <span style={{ fontSize: 13, color: '#8A93A3' }}>{t('Clubs not in the sentence')}</span>
              </div>
              {res.view.others.length === 0 && <p className="small" style={{ padding: '12px 0', borderTop: '1px solid #222B38' }}>{t('Nobody else’s season moves by more than a point or two.')}</p>}
              {res.view.others.map((o) => (
                <div key={o.code} className="between" style={{ gap: 12, padding: '11px 0', borderTop: '1px solid #222B38', fontSize: 15 }}>
                  <span>{o.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: '#C9CFD8' }}>{t(o.line)}</span>
                </div>
              ))}
            </section>

          </div>

          <div className="stack-16" style={{ gap: 36, minWidth: 0 }}>
            <section aria-labelledby="chg-h" className="col" style={{ gap: 0 }}>
              <div className="between" style={{ paddingBottom: 12 }}>
                <h2 id="chg-h" className="h3">{t('What Dr Football changed')}</h2>
                <span style={{ fontSize: 13, color: '#8A93A3' }}>{t('Edit the sentence to change these')}</span>
              </div>
              {res.parsed.changes.map((l) => (
                <div key={l.k} className="inline" style={{ gap: 16, minHeight: 48, padding: '10px 0', borderTop: '1px solid #222B38' }}>
                  <span style={{ flex: '0 0 150px', fontSize: 14, color: '#8A93A3' }}>{t(l.k)}</span>
                  <span style={{ flex: '1 1 auto', fontSize: 16, fontWeight: 500 }}>{t(l.v)}</span>
                </div>
              ))}
            </section>

            <section aria-labelledby="num-h" className="col" style={{ gap: 0 }}>
              <div className="between" style={{ paddingBottom: 12 }}>
                <h2 id="num-h" className="h3">{t('The numbers')}</h2>
                <span style={{ fontSize: 13, color: '#8A93A3' }}>{t('Real season → this universe')}</span>
              </div>
              {res.view.metrics.map((m) => (
                <div key={m.label} className="between" style={{ gap: 16, padding: '14px 0', borderTop: '1px solid #222B38' }}>
                  <span style={{ fontSize: 16, color: '#C9CFD8' }}>{t(m.label)}</span>
                  <span className="inline mono" style={{ alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 16, color: '#8A93A3' }}>{m.real}</span><span style={{ color: '#5A6578' }}>→</span>
                    <span className="display volt" style={{ fontSize: 32, minWidth: 72, textAlign: 'right' }}>{m.alt}</span>
                  </span>
                </div>
              ))}
            </section>

            <section aria-labelledby="fin-h" className="mt-auto stack-12" style={{ gap: 14 }}>
              <div className="between">
                <h2 id="fin-h" className="h3">{t(`Where ${res.view.focusName} finish`)}</h2>
                <span className="wrap" style={{ gap: 14, fontSize: 13, color: '#A9B1BD' }}>
                  <span className="legend"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#5A6578' }} />{t('Real season')}</span>
                  <span className="legend"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#CFF05A' }} />{t('This universe')}</span>
                </span>
              </div>
              <div role="img" aria-label={`${res.view.focusName} final position, real season versus this universe`} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, alignItems: 'end', height: 170, borderBottom: '1px solid #2E3949' }}>
                {res.view.hist.map((h) => (
                  <div key={h.label} style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%', justifyContent: 'center' }}>
                    <div title={`${h.real}%`} style={{ width: '40%', height: `${(h.real / max) * 100}%`, borderRadius: '2px 2px 0 0', background: '#5A6578', transition: 'height 400ms ease' }} />
                    <div title={`${h.alt}%`} style={{ width: '40%', height: `${(h.alt / max) * 100}%`, borderRadius: '2px 2px 0 0', background: '#CFF05A', transition: 'height 400ms ease' }} />
                  </div>
                ))}
              </div>
              <div className="mono dim" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, fontSize: 12, textAlign: 'center' }} aria-hidden="true">
                {res.view.hist.map((h) => <span key={h.label}>{h.label}</span>)}
              </div>
            </section>

          </div>
        </div>
      )}

      <section aria-labelledby="uni-h" className="col" style={{ gap: 0, paddingTop: 28, borderTop: '1px solid #222B38' }}>
        <div className="between" style={{ paddingBottom: 10 }}>
          <h2 id="uni-h" className="display" style={{ fontSize: 26 }}>{t('Your Universes')}</h2>
          <Link to="/dugout" style={{ fontWeight: 600, textDecoration: 'none' }}>{t('All in My Dugout →')}</Link>
        </div>
        {prefs.universes.length === 0 && <p className="small" style={{ padding: '14px 0', borderTop: '1px solid #222B38' }}>{t('Nothing saved yet. Run a what-if and save it here.')}</p>}
        {prefs.universes.map((u) => <UniverseRow key={u.id} u={u} on={u.prompt === prompt && phase === 'done'} open={() => start(u.prompt)} />)}
      </section>

      <footer className="footer-note">{t(`Synthetic league. Every club, player and manager is fictional. A what-if changes one thing and plays the rest of the season out again ${RUNIN_SIMS.toLocaleString('en-GB')} times; the real column is the same simulation of the season as it stands.`)}</footer>
    </>
  );
}
