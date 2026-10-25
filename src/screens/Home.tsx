import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '../state/i18n';
import { MicButton } from '../ui/kit';
import { Link, useNavigate } from 'react-router-dom';
import { league, club } from '../data/league';
import { useMatch, minuteLabel } from '../state/match';
import { usePrefs } from '../state/prefs';
import { cached } from '../engine/client';
import type { ShotOutcomes } from '../engine/ghost';
import { scoreAt } from '../engine/demo';
import { FULL_TIME } from '../engine/match';
import { swingCard } from '../agents/pipeline';
import { turningPoints } from '../agents/dataScientist';
import type { Persona } from '../agents/format';
import { band, km, win } from './shared';
import { ASK_EXAMPLES, DESTINATION, routeQuestion } from '../agents/router';
import { askAgents, LIVE } from '../agents/live';
import type { AskReply } from '../agents/contract';

const FONTS = [
  { font: 'Bricolage Grotesque, serif', weight: 800, style: 'normal', stretch: '100%', scale: 1 },
  { font: 'Unbounded, sans-serif', weight: 700, style: 'normal', stretch: '100%', scale: 0.74 },
  { font: 'Anybody, sans-serif', weight: 900, style: 'italic', stretch: '125%', scale: 0.82 },
  { font: 'Archivo, sans-serif', weight: 900, style: 'normal', stretch: '112%', scale: 0.9 },
  { font: 'IBM Plex Mono, monospace', weight: 500, style: 'normal', stretch: '100%', scale: 0.92 },
  { font: 'Big Shoulders Display, sans-serif', weight: 900, style: 'normal', stretch: '100%', scale: 1.08 },
  { font: 'Instrument Serif, serif', weight: 400, style: 'italic', stretch: '100%', scale: 1.1 }
];

type Outcome = 'topCorner' | 'saved' | 'bottomCorner' | 'blocked' | 'post' | 'over' | 'wide';
const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'topCorner', label: 'TOP BINS' }, { key: 'saved', label: 'SAVED' }, { key: 'bottomCorner', label: 'BOTTOM CORNER' },
  { key: 'blocked', label: 'BLOCKED' }, { key: 'post', label: 'OFF THE POST' }, { key: 'over', label: 'OVER THE BAR' }, { key: 'wide', label: 'WIDE · WHAT HAPPENED' }
];

function GoalTile({ outcome, tick }: { outcome: Outcome; tick: number }) {
  const ball = (path: string, cx: number, cy: number, r: number) => <><path d={path} fill="none" stroke="#CFF05A" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="1 9" /><circle cx={cx} cy={cy} r={r} fill="#CFF05A" /></>;
  const art: Record<Outcome, ReactElement> = {
    topCorner: ball('M10 76 Q46 38 80 44', 91, 45, 11),
    bottomCorner: ball('M10 118 Q56 138 86 146', 96, 148, 10),
    wide: ball('M10 98 Q74 98 118 128', 124, 136, 9),
    over: ball('M10 66 Q50 8 90 12', 100, 13, 8),
    saved: <>{ball('M10 92 Q46 70 72 70', 80, 70, 10)}<rect x="84" y="50" width="22" height="28" rx="9" fill="#F2EFE6" /><rect x="86" y="38" width="5" height="16" rx="2.5" fill="#F2EFE6" /><rect x="93" y="35" width="5" height="18" rx="2.5" fill="#F2EFE6" /><rect x="100" y="38" width="5" height="16" rx="2.5" fill="#F2EFE6" /></>,
    blocked: <><path d="M10 104 L36 102" fill="none" stroke="#CFF05A" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="1 9" /><circle cx="58" cy="76" r="9" fill="#F2EFE6" /><rect x="50" y="88" width="16" height="62" rx="8" fill="#F2EFE6" /><circle cx="42" cy="102" r="9" fill="#CFF05A" /></>,
    post: <>{ball('M10 80 Q66 58 96 66', 101, 68, 9)}<line x1="116" y1="56" x2="126" y2="50" stroke="#FF8A4C" strokeWidth="3" strokeLinecap="round" /><line x1="118" y1="68" x2="130" y2="68" stroke="#FF8A4C" strokeWidth="3" strokeLinecap="round" /><line x1="116" y1="80" x2="126" y2="86" stroke="#FF8A4C" strokeWidth="3" strokeLinecap="round" /></>
  };
  return (
    <div style={{ position: 'relative', width: 'clamp(34px, 8.6vw, 104px)', aspectRatio: '140 / 170' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 140 170" aria-hidden="true">
        <rect x="4" y="4" width="132" height="162" rx="16" fill="#1B2330" />
        <path d="M4 85 H136 V150 Q136 166 120 166 H20 Q4 166 4 150 Z" fill="#212B3A" />
        <g stroke="#2E3949" strokeWidth="1.5">{[30, 50, 70, 90].map((x) => <line key={x} x1={x} y1="28" x2={x} y2="166" />)}{[48, 68, 104, 124, 144].map((y) => <line key={y} x1="10" y1={y} x2="108" y2={y} />)}</g>
        <path d="M10 28 H108 V166" fill="none" stroke="#F2EFE6" strokeWidth="7" strokeLinejoin="round" />
      </svg>
      <svg key={tick} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: 'flap 560ms cubic-bezier(.2,.8,.2,1) 380ms both' }} viewBox="0 0 140 170" aria-hidden="true">{art[outcome]}</svg>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 140 170" aria-hidden="true"><line x1="4" y1="85" x2="136" y2="85" stroke="#0B0F14" strokeWidth="4" /></svg>
    </div>
  );
}

/** The agents, in the order a question meets them. */
const AGENTS = [
  ['Router', 'Reads a free-form question and hands it to the team that can answer it.'],
  ['Data Scientist', 'Chooses the test or the simulation, runs it on the engine and checks the result answers the question.'],
  ['Dr Football', 'Turns a what-if or a goal into changes the simulator can play out, and says no to what it can’t.'],
  ['Analyst', 'Turns engine output into named facts and the context behind them.'],
  ['Narrator', 'Writes from those facts only, for a casual fan, a club’s fan or an analyst, in seven languages.'],
  ['Verifier', 'Checks every number against the facts and the football sense of every claim; anything that stretches the truth goes back.'],
  ['Scout', 'Watches the matches you follow and decides what deserves an alert, in your language and from your side.']
];

/** The brief's five stages, and where each one happens in the app. */
const STAGES: { n: string; name: string; what: string; links: [string, string][] }[] = [
  { n: '01', name: 'Ingest', what: 'Match events arrive as they happen: shots with xG, passes, tackles, fouls, offsides, substitutions, tactical switches and tracking numbers, from a synthetic league forged for the purpose (every club and player invented). The replay clock feeds them in minute by minute.', links: [['/swing', 'The Swing'], ['/league', 'Current Affairs']] },
  { n: '02', name: 'Interpret', what: 'The engine turns events into win probability at every minute (calculated exactly over every possible scoreline), momentum, Ghost Runs of stopped attacks, fair credit for each turning point, and 10,000-season run-ins for the table.', links: [['/swing', 'The Swing'], ['/ghost', 'Ghost Run']] },
  { n: '03', name: 'Explain', what: 'Seven agents work on every result: they choose what to test, run it, and write why it mattered. Every number is checked by the Verifier before it reaches the screen.', links: [['/settle', 'Settle It'], ['/multiverse', 'Multiverse']] },
  { n: '04', name: 'Render', what: 'The insight is built to sit beside the match: a broadcast overlay on the pitch, on-air graphics for the studio, a full-time recap, and a timed, machine-readable cue feed for a broadcast graphics system.', links: [['/swing', 'Overlay & cues'], ['/ripple', 'Recap']] },
  { n: '05', name: 'Personalise', what: 'The same intelligence, told differently: a casual fan, a club’s fan (“we”) or an analyst; seven languages; your clubs, players and a player to follow; alerts at your threshold.', links: [['/dugout', 'My Dugout'], ['/ripple', 'Watch as']] }
];

const FEATURES: { to: string; n: string; tag: string; tagBg: string; tagFg: string; title: string; body: string; hero?: boolean; wide?: boolean }[] = [
  { to: '/league', n: '00', tag: 'CONTEXT', tagBg: '#2A3240', tagFg: '#F2EFE6', title: 'Current Affairs', body: 'The table, every club’s chances, the squads and the leaderboards: where the season stands before you change it.', wide: true },
  { to: '/swing', n: '01', tag: 'LIVE', tagBg: '#FF8A4C', tagFg: '#0B0F14', title: 'The Swing', body: 'Live win probability that flags the moments that tilt the match, and says why.', hero: true },
  { to: '/ghost', n: '02', tag: 'LIVE', tagBg: '#FF8A4C', tagFg: '#0B0F14', title: 'Ghost Run', body: 'Fouled, offside or blocked? See the run that never finished, and the odds it ended in a goal.' },
  { to: '/ripple', n: '03', tag: 'FULL TIME', tagBg: '#F2EFE6', tagFg: '#0B0F14', title: 'Ripple', body: 'Highlights ranked by impact, then the shockwave across the whole league table.' },
  { to: '/multiverse', n: '04', tag: 'SANDBOX', tagBg: '#CFF05A', tagFg: '#0B0F14', title: 'Multiverse', body: 'Give Dr Football a what-if in one sentence, like the transfer that never happened or the miss that went in, and he plays the season out again.' },
  { to: '/settle', n: '05', tag: 'STUDIO', tagBg: '#FF8A4C', tagFg: '#0B0F14', title: 'Settle It', body: 'A pundit asks a question. Agents design the experiment, run it, check it and answer on air.' },
  { to: '/dugout', n: '06', tag: 'PROFILE', tagBg: '#2A3240', tagFg: '#F2EFE6', title: 'My Dugout', body: 'Your club, players, language and depth, plus every Universe you have saved.' }
];

/** Ask What If: one box, routed to the agent team that can answer. */
function AskBox() {
  const nav = useNavigate();
  const t = useT();
  const { prefs } = usePrefs();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const go = async (text: string) => {
    const question = text.trim();
    if (!question) return;
    setQ(question); setReply(null);
    let route = routeQuestion(league, question);
    if (!route && LIVE) {
      setBusy(true);
      const r = await askAgents<AskReply>('ask', { question }, 20000);
      setBusy(false);
      if (r?.ok) route = r.route;
      else if (r && !r.ok) { setReply(r.reply); return; }
    }
    if (!route) { setReply('I can’t tell which part of the app answers that. Ask about a match (“Was it the substitution?”), a what-if (“What if Nettleshaw had missed the season?”), a goal (“What would it take for Harbour to stay up?”) or the table.'); return; }
    sessionStorage.setItem('whatif.handoff', JSON.stringify({ q: question, to: route.to, why: route.why }));
    nav(DESTINATION[route.to].path(route));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="stack-8" style={{ width: 'min(680px, 100%)', gap: 10, marginTop: 10 }} role="search" aria-label={t('Ask What If')}>
      <div className="panel wrap" style={{ gap: 8, padding: 8, border: '1px solid #2A3240' }}>
        <label htmlFor="ask" className="sr">{t('Ask What If')}</label>
        <input id="ask" maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ask anything about the matchweek or the league…')}
          style={{ flex: '1 1 300px', minWidth: 0, minHeight: 50, padding: '0 14px', border: 'none', borderRadius: 8, background: '#0B0F14', color: '#F2EFE6', fontSize: 17 }} />
        <button type="submit" className="btn btn-primary" style={{ minHeight: 50, padding: '0 20px' }} disabled={busy}>{t(busy ? 'Routing…' : 'Ask')}</button>
        <MicButton lang={prefs.lang} disabled={busy} onText={(x) => go(x)} />
      </div>
      <div className="wrap" style={{ justifyContent: 'center', gap: 6 }}>
        {ASK_EXAMPLES.map((x) => <button key={x} type="button" className="more-btn" style={{ color: '#A9B1BD', minHeight: 36 }} onClick={() => go(x)}>{t(x)}</button>)}
      </div>
      {reply && <p className="small" role="alert" style={{ textAlign: 'left' }}>{t(reply)}</p>}
    </form>
  );
}

export default function Home() {
  const { load } = useMatch();
  useEffect(() => { league.feeds.forEach((f) => load(f.fixtureId)); }, [load]);
  const { demoTimeline: tl, clock, timelines, minuteOf, setFixture } = useMatch();
  const live = clock.minute < FULL_TIME;
  const nav = useNavigate();
  const { prefs } = usePrefs();
  const t = useT();
  const [tick, setTick] = useState(0);
  const [shot, setShot] = useState<ShotOutcomes | null>(null);
  const [persona, setPersona] = useState<Persona>(prefs.depth === 'analyst' ? 'analyst' : 'casual');

  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 2200);
    cached('hero', {}).then(setShot);
    return () => clearInterval(iv);
  }, []);

  const rest = tick % 4 === 0;
  const letters = ['W', 'H', 'A', 'T', null, 'I', 'F'];
  const cur = OUTCOMES[tick % OUTCOMES.length];
  const pctOf = (k: Outcome) => (shot ? Math.round((shot[k] / shot.n) * 100) : 0);

  const tps = tl ? turningPoints(tl, clock.minute) : [];
  const tp = tps[tps.length - 1];
  const card = tl && tp ? swingCard(league, league.demo, tl, tp, persona, prefs.lang, 'home') : null;
  const score = scoreAt(league, clock.minute);
  const X = (m: number) => (Math.min(m, FULL_TIME) / FULL_TIME) * 600;
  const Y = (p: number) => 6 + (1 - p / 100) * 80;
  const line = tl ? [...tl.points.filter((p) => p.minute <= clock.minute), { minute: clock.minute, wp: tl.byMinute[Math.floor(clock.minute)] }].map((p) => `${X(p.minute).toFixed(1)},${Y(win(p.wp, 'home')).toFixed(1)}`).join(' ') : '';
  const fork = tp ? tp.fork.map((p) => `${X(p.minute).toFixed(1)},${Y(win(p.wp, 'home')).toFixed(1)}`).join(' ') : '';

  return (
    <>
      <section id="top" className="stack-16" style={{ alignItems: 'center', textAlign: 'center', gap: 26, padding: 'clamp(40px, 7vw, 88px) 0 clamp(40px, 6vw, 72px)' }}>
        <div className="mono dim" style={{ fontSize: 13, letterSpacing: '0.1em' }}>{t(`Explainable match intelligence · the ${league.name}`).toUpperCase()}</div>
        <div className="inline" style={{ justifyContent: 'center', gap: 'clamp(3px, 0.7vw, 9px)' }} role="img" aria-label="Scoreboard spelling WHAT IF, the last tile cycling through shot outcomes">
          {letters.map((ch, i) => {
            if (!ch) return <div key={i} style={{ width: 'clamp(8px, 2vw, 26px)' }} />;
            const f = rest ? FONTS[0] : FONTS[(tick * 2 + i * 3) % FONTS.length];
            return (
              <div key={i} className="flap">
                <span key={`${tick}-${i}`} style={{ fontFamily: f.font, fontWeight: f.weight, fontStyle: f.style, fontStretch: f.stretch, fontSize: `calc(${f.scale} * clamp(24px, 6.2vw, 76px))`, animationDelay: `${i * 55}ms` }}>{ch}</span>
              </div>
            );
          })}
          <GoalTile outcome={cur.key} tick={tick} />
        </div>
        <div className="stack-8" style={{ width: 'min(560px, 100%)', gap: 10 }} aria-live="polite">
          <div className="between mono" style={{ fontSize: 13 }}>
            <span className="volt">{t(cur.label)}</span>
            <span className="muted">{t(shot ? `${pctOf(cur.key)}% of ${shot.n} simulated futures` : 'Simulating…')}</span>
          </div>
          <div style={{ display: 'flex', gap: 3, height: 8 }} aria-hidden="true">
            {OUTCOMES.map((o) => <div key={o.key} style={{ flex: `${Math.max(1, pctOf(o.key))} 1 0`, borderRadius: 2, background: o.key === cur.key ? (o.key === 'wide' ? '#F2EFE6' : '#CFF05A') : '#2A3240', transition: 'background 300ms' }} />)}
          </div>
          <div className="mono dim" style={{ fontSize: 12, textAlign: 'left' }}>{t(`Nettleshaw’s shot at 49′, simulated ${shot?.n ?? 500} times. In the real match, it went wide.`)}</div>
        </div>
        <h1 className="display" style={{ marginTop: 8, fontSize: 'clamp(40px, 6.4vw, 80px)', lineHeight: 1, letterSpacing: '-0.04em' }}>{t('Same match.')} <span className="volt">{t('Different ending.')}</span></h1>
        <p style={{ maxWidth: 680, fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.5, color: '#C9CFD8' }}>{t('What If replays every moment that decided a match, and the ones that almost did. Our engine weighs every scoreline each turning point could lead to and replays every stopped attack hundreds of times; our AI explains what it means, for your club, in your language.')}</p>
        <div className="wrap" style={{ justifyContent: 'center', gap: 12, marginTop: 6 }}>
          <Link to="/swing" className="btn btn-primary" style={{ minHeight: 52, padding: '0 26px', fontSize: 17, borderRadius: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF8A4C', boxShadow: '0 0 0 3px rgba(255,138,76,0.35)' }} />{t('Watch The Swing live')}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0F14" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          </Link>
          <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }} className="btn" style={{ minHeight: 52, padding: '0 24px', fontSize: 17, borderRadius: 10 }}>{t('How it works')}</a>
        </div>
        <AskBox />
      </section>

      <section aria-label={t('Live match')} className="panel accent-signal wrap" style={{ gap: 20, padding: 24, alignItems: 'stretch' }}>
        <div className="stack-16" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="wrap" style={{ gap: 10 }}>
            {live ? <span className="badge live"><i />{t('Live').toUpperCase()} · {minuteLabel(clock.minute)}</span> : <span className="badge ft">{t('Full time').toUpperCase()}</span>}
            <span className="kicker">{league.name.toUpperCase()} · {t(`Matchweek ${league.currentMw}`).toUpperCase()}</span>
          </div>
          <div className="display wrap" style={{ gap: 14, fontSize: 'clamp(26px, 3.4vw, 40px)', alignItems: 'baseline' }}>
            <span>{club('NBR').short}</span><span className="mono" style={{ fontWeight: 500 }}>{score.home} – {score.away}</span><span>{club('HAR').name}</span>
          </div>
          <svg width="100%" height="92" viewBox="0 0 600 92" preserveAspectRatio="none" role="img" aria-label="Northbridge win probability across the match so far">
            <line x1="0" y1={Y(50)} x2="600" y2={Y(50)} stroke="#2A3240" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            {fork && <polyline points={fork} fill="none" stroke="#CFF05A" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" vectorEffect="non-scaling-stroke" />}
            <polyline points={line} fill="none" stroke="#F2EFE6" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {tp && <div className="wrap" style={{ gap: 10 }}>
            <span className="band" style={{ background: band(league.demo, tp).color }}>{t(band(league.demo, tp).text)}</span>
            <span className="chip-num"><span className="dim">NBR {t('Win').toUpperCase()}</span>{win(tp.before, 'home')}%<span className="dim">→</span><span className="volt">{win(tp.after, 'home')}%</span></span>
          </div>}
        </div>
        <div className="stack-12" style={{ flex: '1 1 360px', minWidth: 0, padding: '4px 0 4px 24px', borderLeft: '1px solid #2A3240' }}>
          <div className="kicker">{t('Explain it to me as').toUpperCase()}</div>
          <div role="group" aria-label={t('Explanation depth')} className="seg volt" style={{ alignSelf: 'flex-start' }}>
            {(['casual', 'home', 'analyst'] as Persona[]).map((p) => <button key={p} type="button" aria-pressed={persona === p} onClick={() => setPersona(p)}>{t(p === 'casual' ? 'Casual' : p === 'home' ? 'Northbridge fan' : 'Analyst')}</button>)}
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>{card ? (card.lang === prefs.lang ? card.text : t(card.text)) : t('Nothing has tilted this match yet.')}</p>
          {tp && <span className="small">{t(km(tp.id).title)}.</span>}
          <Link to="/swing" className="mt-auto" style={{ alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontWeight: 600, textDecoration: 'none' }}>{t('Open The Swing for this match →')}</Link>
        </div>
      </section>

      <section aria-label={t('Across the matchweek')} className="stack-12" style={{ marginTop: 8 }}>
        <div className="between"><span className="kicker">{t('Across the matchweek · every game simulated').toUpperCase()}</span><span className="small">{t('Tap a game to open it in The Swing')}</span></div>
        <div className="strip">
          <div className="strip-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
            {league.feeds.filter((f) => f.fixtureId !== league.demo.fixtureId).map((f) => {
              const m = minuteOf(f);
              const sc = scoreAt(league, m, f);
              const tli = timelines[f.fixtureId];
              const n = tli ? turningPoints(tli, m).length : null;
              return (
                <button key={f.fixtureId} type="button" onClick={() => { setFixture(f.fixtureId); nav('/swing'); }} className="stack-8" style={{ gap: 6, padding: '14px 16px', border: 'none', borderLeft: '1px solid #222B38', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                  <span className="mono" style={{ fontSize: 12, color: m >= 94 ? '#8A93A3' : '#FF8A4C' }}>{m >= 94 ? 'FT' : minuteLabel(m)}</span>
                  <span className="display" style={{ fontSize: 17 }}>{club(f.home).short} {sc.home}–{sc.away} {club(f.away).short}</span>
                  <span className="small">{t(n === null ? 'Simulating…' : n === 0 ? 'No turning points yet' : `${n} turning point${n === 1 ? '' : 's'} · ${f.stoppedAttacks.filter((a) => a.minute <= m).length} ghost runs`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="stack-8" style={{ padding: 'clamp(56px, 8vw, 96px) 0 0' }}>
        <h2 className="display" style={{ margin: '0 0 8px', fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{t('How it works')}</h2>
        <p style={{ fontSize: 18, lineHeight: 1.5, color: '#C9CFD8', maxWidth: 680, marginBottom: 16 }}>{t('One pipeline, five stages. Each one links to where you can see it working.')}</p>
        {STAGES.map((st, i) => (
          <div key={st.n} className="wrap" style={{ gap: '14px 40px', padding: '26px 0', borderTop: '1px solid #2A3240', borderBottom: i === STAGES.length - 1 ? '1px solid #2A3240' : undefined, alignItems: 'flex-start' }}>
            <div className="stack-8" style={{ flex: '1 1 220px', gap: 6 }}><div className="mono volt" style={{ fontSize: 14 }}>{st.n}</div><h3 className="display" style={{ fontSize: 30 }}>{t(st.name)}</h3></div>
            <div className="stack-12" style={{ flex: '999 1 520px', minWidth: 0, gap: 12 }}>
              <p style={{ fontSize: 17, lineHeight: 1.55, color: '#E4E1D9' }}>{t(st.what)}</p>
              {st.n === '03' && (
                <div className="strip" style={{ borderColor: '#2A3240' }}>
                  <ol className="strip-in" style={{ margin: 0, padding: 0, listStyle: 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    {AGENTS.map(([name, body]) => (
                      <li key={name} className="stack-8" style={{ padding: '14px 16px', borderLeftColor: '#2A3240', boxShadow: name === 'Verifier' ? 'inset 0 2px 0 #CFF05A' : undefined, gap: 6 }}>
                        <span className="display" style={{ fontSize: 18, color: name === 'Verifier' ? '#CFF05A' : undefined }}>{name}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.45, color: '#C9CFD8' }}>{t(body)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="wrap" style={{ gap: 8 }}>{st.links.map(([to, l]) => <Link key={l} to={to} className="btn btn-sm mono" style={{ minHeight: 40, fontSize: 13 }}>{t(l)} →</Link>)}</div>
            </div>
          </div>
        ))}
      </section>

      <section id="features" className="stack-16" style={{ gap: 28, padding: 'clamp(56px, 8vw, 96px) 0 0' }}>
        <div className="stack-8" style={{ gap: 10 }}>
          <div className="mono dim" style={{ fontSize: 13, letterSpacing: '0.1em' }}>{t('Inside What If').toUpperCase()}</div>
          <h2 className="display" style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{t('Seven ways into the other timeline')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 1, background: '#2A3240', borderTop: '1px solid #2A3240', borderBottom: '1px solid #2A3240' }}>
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="stack-12" style={{ padding: '28px 26px 26px', background: '#0B0F14', boxShadow: f.hero ? 'inset 0 3px 0 #FF8A4C' : undefined, color: '#F2EFE6', textDecoration: 'none', gridColumn: f.wide ? '1 / -1' : undefined }}>
              <div className="between" style={{ alignItems: 'center' }}><span className="mono dim" style={{ fontSize: 13 }}>{f.n}</span><span className="mono" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: f.tagBg, color: f.tagFg }}>{t(f.tag)}</span></div>
              <h3 className="display" style={{ fontSize: 32 }}>{t(f.title)}</h3>
              <p style={{ fontSize: 16, lineHeight: 1.5, color: '#C9CFD8' }}>{t(f.body)}</p>
              <span className="mt-auto volt" style={{ fontWeight: 600 }}>{t('Open')} →</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="wrap" style={{ justifyContent: 'space-between', gap: 16, padding: '64px 0 40px', marginTop: 'clamp(56px, 8vw, 96px)', borderTop: '1px solid #2A3240', fontSize: 14, color: '#A9B1BD' }}>
        <span>{t(`Synthetic data only. The ${league.name}, its clubs and players are fictional.`)}</span>
        <span>{t('Every number simulated in your browser. Every sentence checked before you see it.')}</span>
      </footer>
    </>
  );
}
