import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import type { PitchFrame, Side } from '../data/types';
import { player } from '../data/league';
import { usePrefs } from '../state/prefs';
import { useT } from '../state/i18n';
import { LANGS, type Lang } from '../agents/format';
import { LIVE } from '../agents/live';
import { hearQuestion, speakLine, speechReady, startRecording, stopSpeaking, type Recording } from '../agents/speech';
import type { TraceEvent } from '../agents/contract';

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 170) / 140} viewBox="0 0 140 170" aria-hidden="true">
      <rect x="4" y="4" width="132" height="162" rx="16" fill="#1B2330" />
      <path d="M4 85 H136 V150 Q136 166 120 166 H20 Q4 166 4 150 Z" fill="#212B3A" />
      <path d="M10 28 H108 V166" fill="none" stroke="#F2EFE6" strokeWidth="10" strokeLinejoin="round" />
      <circle cx="91" cy="45" r="14" fill="#CFF05A" />
      <path d="M10 98 Q74 98 118 128" fill="none" stroke="#F2EFE6" strokeWidth="8" strokeLinecap="round" />
      <circle cx="124" cy="136" r="11" fill="#F2EFE6" />
      <line x1="4" y1="85" x2="136" y2="85" stroke="#0B0F14" strokeWidth="7" />
    </svg>
  );
}

export const initials = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export function Header() {
  const { prefs, set } = usePrefs();
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // On phones the feature links scroll sideways; keep the current one in view.
  useEffect(() => {
    const el = nav.current, a = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && a && el.scrollWidth > el.clientWidth) el.scrollLeft = a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2;
  }, [pathname]);
  const links: [string, string][] = [['/league', 'Current Affairs'], ['/swing', 'The Swing'], ['/ghost', 'Ghost Run'], ['/ripple', 'Ripple'], ['/multiverse', 'Multiverse'], ['/settle', 'Settle It']];
  return (
    <header className="hdr">
      <Link to="/" className="brand" aria-label="What If home">
        <LogoMark />
        <span className="wordmark">what if<b>?</b></span>
      </Link>
      <nav ref={nav} aria-label={t('Features')} className="nav">
        {links.map(([to, label]) => <NavLink key={to} to={to}>{t(label)}</NavLink>)}
      </nav>
      <div className="hdr-end">
        <select className="select lang-pick" aria-label={t('Language')} value={prefs.lang} onChange={(e) => set({ lang: e.target.value as Lang })}>
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.native}</option>)}
        </select>
        <NavLink to="/dugout" className="dugout-link">
          <span className="avatar" style={{ background: prefs.profile.avatar }} aria-hidden="true">{initials(prefs.profile.name)}</span>
          {t('My Dugout')}
        </NavLink>
      </div>
    </header>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onChange, volt, hideLabel }: { label: string; options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; volt?: boolean; hideLabel?: boolean }) {
  return (
    <div className="control">
      {!hideLabel && <span className="kicker">{label.toUpperCase()}</span>}
      <div role="group" aria-label={label} className={`seg${volt ? ' volt' : ''}`}>
        {options.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function WinBar({ home, draw, away, tall, labels }: { home: number; draw: number; away: number; tall?: boolean; labels?: boolean }) {
  const r = (v: number) => Math.round(v);
  return (
    <div className={`wdl${tall ? ' tall' : ''}`} role="img" aria-label={`Northbridge win ${r(home)} percent, draw ${r(draw)} percent, Harbour win ${r(away)} percent`}>
      <div className="c-home" style={{ flex: `${Math.max(0.5, home)} 1 0` }}>{labels && `NBR ${r(home)}%`}</div>
      <div className="c-draw" style={{ flex: `${Math.max(0.5, draw)} 1 0` }}>{labels && `${r(draw)}%`}</div>
      <div className="c-away" style={{ flex: `${Math.max(0.5, away)} 1 0` }}>{labels && `${r(away)}%`}</div>
    </div>
  );
}

const PATH_STYLE: Record<string, { stroke: string; w: number }> = {
  home: { stroke: '#F2EFE6', w: 0.7 },
  away: { stroke: '#7CB8FF', w: 0.6 },
  ghost: { stroke: '#CFF05A', w: 0.7 }
};

export interface LowerThird { band: string; color: string; code: string; before: number; after: number; good: boolean; title: string }

/** A pitch with players, paths and (optionally) the broadcast overlay. Coordinates in metres, 105 x 68. */
export function Pitch({ frame, overlay = false, lower, variant = 'swing' }: { frame: PitchFrame; overlay?: boolean; lower?: LowerThird; variant?: 'swing' | 'ghost' }) {
  const ghostV = variant === 'ghost';
  const t = useT();
  return (
    <div className="pitch" role="img" aria-label={frame.label}>
      <svg viewBox="0 0 105 68" aria-hidden="true">
        <g fill="none" stroke="#2C4A40" strokeWidth="0.35">
          <rect x="0.6" y="0.6" width="103.8" height="66.8" />
          <line x1="52.5" y1="0.6" x2="52.5" y2="67.4" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0.6" y="13.84" width="15.9" height="40.32" />
          <rect x="0.6" y="24.84" width="4.9" height="18.32" />
          <rect x="88.5" y="13.84" width="15.9" height="40.32" />
          <rect x="99.5" y="24.84" width="4.9" height="18.32" />
          <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3" />
          <path d="M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3" />
        </g>
        {ghostV && <>
          <line x1="0.6" y1="30.34" x2="0.6" y2="37.66" stroke="#F2EFE6" strokeWidth="0.9" />
          <line x1="104.4" y1="30.34" x2="104.4" y2="37.66" stroke="#F2EFE6" strokeWidth="0.9" />
        </>}
        {frame.offsideX !== undefined && <line x1={frame.offsideX} y1="6" x2={frame.offsideX} y2="62" stroke="#FF8A4C" strokeWidth="0.3" strokeDasharray="1 1" />}
        {frame.paths.map((p, i) => {
          const s = PATH_STYLE[p.kind];
          const ghost = p.kind === 'ghost';
          return (
            <path key={i} d={p.d} fill="none" stroke={s.stroke} strokeWidth={p.width ?? s.w} strokeLinecap="round"
              strokeDasharray={ghost ? '0.4 1' : p.dashed ? '1 1.3' : undefined} opacity={p.dashed ? 0.75 : 1}
              style={ghost ? { animation: 'ghostDraw 1.2s linear infinite' } : undefined} />
          );
        })}
        {frame.dots.map((d, i) => {
          const r = ghostV ? (d.key ? 1.6 : 1.3) : d.key ? 1.25 : 0.85;
          const home = d.team === 'home';
          return <circle key={i} className="p" cx={d.x} cy={d.y} r={r} fill={home ? '#F2EFE6' : '#121821'} stroke={home ? '#F2EFE6' : '#7CB8FF'} strokeWidth={ghostV ? 0.5 : 0.28} opacity={d.key || ghostV ? 1 : 0.78} />;
        })}
        {frame.marks?.map((m, i) => m.kind === 'stop'
          ? <path key={i} d={`M${m.x - 0.8} ${m.y - 0.8} L${m.x + 0.8} ${m.y + 0.8} M${m.x + 0.8} ${m.y - 0.8} L${m.x - 0.8} ${m.y + 0.8}`} stroke="#FF8A4C" strokeWidth="0.6" strokeLinecap="round" />
          : <circle key={i} cx={m.x} cy={m.y} r="0.9" fill="none" stroke="#CFF05A" strokeWidth="0.4" />)}
        {frame.labels?.map((l, i) => (
          <text key={i} x={l.x} y={l.y} fontFamily="IBM Plex Mono, monospace" fontSize="2.1" fill={l.tone === 'home' ? '#F2EFE6' : l.tone === 'away' ? '#7CB8FF' : '#FF8A4C'}>{l.text}</text>
        ))}
        {frame.ball && !ghostV && <>
          <circle cx={frame.ball.x} cy={frame.ball.y} r="1.6" fill="#CFF05A" opacity="0.25" className="p" />
          <circle cx={frame.ball.x} cy={frame.ball.y} r="0.65" fill="#CFF05A" className="p" />
        </>}
      </svg>
      {overlay && frame.tags.map((t, i) => {
        const left = `${((t.x / 105) * 100).toFixed(2)}%`;
        const top = `${((t.y / 68) * 100).toFixed(2)}%`;
        // a second tag close to the first goes below its player instead of on top of the first tag
        const below = i > 0 && frame.tags.slice(0, i).some((o) => Math.abs(o.x - t.x) < 16 && Math.abs(o.y - t.y) < 12);
        const dy = below ? '16px' : 'calc(-100% - 16px)';
        const tf = t.x < 18 ? `translate(-4px, ${dy})` : t.x > 88 ? `translate(calc(-100% + 4px), ${dy})` : `translate(-50%, ${dy})`;
        const accent = t.team === 'away' ? '#7CB8FF' : t.team === 'home' ? '#F2EFE6' : '#CFF05A';
        return (
          <div key={i} className="ptag" style={{ left, top, transform: tf, borderLeftColor: accent }}>
            <b>{player(t.player).short.toUpperCase()}</b>
            <span style={{ color: accent }}>{t.detail}</span>
          </div>
        );
      })}
      {overlay && lower && (
        <div className="lower-third">
          <span className="display" style={{ background: lower.color, color: '#0B0F14', fontSize: 16 }}>{lower.band}</span>
          <span className="mono" style={{ gap: 8, fontSize: 13, borderRight: '1px solid #2A3240' }}>
            <span className="dim">{lower.code} {t('Win').toUpperCase()}</span>&nbsp;{lower.before}%&nbsp;<span className="dim">→</span>&nbsp;<span style={{ color: lower.good ? '#CFF05A' : '#FF8A4C' }}>{lower.after}%</span>
          </span>
          <span style={{ flex: '1 1 200px', fontSize: 14 }}>{lower.title}</span>
        </div>
      )}
    </div>
  );
}

export const sideColor = (s: Side) => (s === 'home' ? '#F2EFE6' : '#7CB8FF');

export function Loading({ children = 'Running the simulations…' }: { children?: ReactNode }) {
  const t = useT();
  return <div className="loading panel" role="status">{typeof children === 'string' ? t(children) : children}</div>;
}

/** Hash routing: the skip link moves focus instead of changing the route. */
export function SkipLink() {
  const t = useT();
  return <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{t('Skip to content')}</a>;
}

/** What the live agents actually did on the server: each model call, tool call and check, in order. */
export function AgentTrace({ trace }: { trace?: TraceEvent[] }) {
  const t = useT();
  if (!trace?.length) return null;
  const tools = trace.filter((e) => e.kind === 'tool').length;
  const tokens = trace.reduce((a, e) => a + (e.tokens ?? 0), 0);
  return (
    <details className="small">
      <summary style={{ cursor: 'pointer' }}>{t('How the agents worked it out')} · {t(`${tools} tool call${tools === 1 ? '' : 's'}${tokens ? ` · ${tokens.toLocaleString('en-GB')} tokens` : ''}`)}</summary>
      <ol className="mono" style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: '#A9B1BD', overflowWrap: 'anywhere' }}>
        {trace.map((e, i) => (
          <li key={i}><span style={{ color: e.kind === 'check' && /refused|isn’t|not /.test(e.detail) ? '#FF8A4C' : '#CFF05A' }}>{e.agent.toUpperCase()}</span> · {e.name} · {e.detail}{e.ms >= 50 ? ` · ${(e.ms / 1000).toFixed(1)} s` : ''}</li>
        ))}
      </ol>
    </details>
  );
}

/** A modal card: centred on desktop, a bottom sheet on phones. Escape, the backdrop and the close button dismiss it. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-label={label} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="sheet-in">
          <button type="button" className="btn btn-sm btn-quiet" onClick={onClose} style={{ alignSelf: 'flex-end', marginBottom: -12 }} aria-label={t('Close')}>{t('Close')}</button>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Shown on the screen an Ask What If question was handed to: who sent it, and why. */
export function Handoff() {
  const [h] = useState<{ q: string; why: string } | null>(() => {
    try { const v = sessionStorage.getItem('whatif.handoff'); sessionStorage.removeItem('whatif.handoff'); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const t = useT();
  if (!h) return null;
  return (
    <div className="quote volt stack-8" style={{ gap: 4 }} role="status">
      <span className="kicker volt">{t('Handed over by the router').toUpperCase()}</span>
      <span style={{ fontSize: 15, color: '#C9CFD8' }}>“{h.q}” · {t(h.why)}</span>
    </div>
  );
}

function useSpeech() {
  const [on, setOn] = useState(false);
  useEffect(() => { if (LIVE) void speechReady().then(setOn); }, []);
  return on;
}

/** Read a line aloud in the reader's language (Azure AI Speech, live mode only). */
export function Listen({ text, lang, label = 'Listen', light }: { text: string; lang: Lang; label?: string; light?: boolean }) {
  const t = useT();
  const on = useSpeech();
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'failed'>('idle');
  const mine = useRef(false); // this button started what's playing: stop it when the button goes away
  useEffect(() => () => { if (mine.current) stopSpeaking(); }, []);
  if (!on || !text) return null;
  const go = async () => {
    if (state === 'playing' || state === 'loading') { stopSpeaking(); setState('idle'); return; }
    setState('loading');
    mine.current = true;
    try { await speakLine(text, lang, () => setState('playing')); setState('idle'); } catch { setState('failed'); setTimeout(() => setState('idle'), 2500); }
    mine.current = false;
  };
  return (
    <button type="button" className={`btn btn-sm listen${light ? ' on-paper' : ''}`} aria-pressed={state === 'playing'} onClick={go}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        {state === 'playing' ? <><rect x="3" y="3" width="3.5" height="10" rx="1" fill="currentColor" /><rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="currentColor" /></>
          : <><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" /><path d="M11 5.5q2 2.5 0 5M12.8 3.8q3.4 4.2 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>}
      </svg>
      {t(state === 'loading' ? 'Loading…' : state === 'playing' ? 'Stop' : state === 'failed' ? 'Audio unavailable' : label)}
    </button>
  );
}

/** Ask by voice: tap to talk, tap again (or wait 12 seconds) to send. Hands back the words. */
export function MicButton({ lang, onText, disabled }: { lang: Lang; onText: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  const rec = useRef<Recording | null>(null);
  const [state, setState] = useState<'idle' | 'listening' | 'hearing'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const opening = useRef(false); // a second tap while the microphone is still opening is ignored
  const on = useSpeech();
  if (!on || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  const finish = async () => {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setState('hearing');
    try {
      const text = await hearQuestion(await r.stop(), lang);
      setState('idle');
      if (text) onText(text); else setNote(t('Didn’t catch that. Try again, a little closer to the mic.'));
    } catch { setState('idle'); setNote(t('Voice isn’t available right now. Type your question instead.')); }
  };
  const go = async () => {
    setNote(null);
    if (state === 'listening') { void finish(); return; }
    if (state !== 'idle' || opening.current) return;
    opening.current = true;
    try { rec.current = await startRecording(() => void finish()); setState('listening'); } catch { setNote(t('No microphone access. Type your question instead.')); } finally { opening.current = false; }
  };
  return (
    <span className="mic-wrap">
      <button type="button" className={`btn mic${state === 'listening' ? ' rec' : ''}`} aria-pressed={state === 'listening'} disabled={disabled || state === 'hearing'} onClick={go}
        aria-label={t(state === 'listening' ? 'Stop and send' : 'Ask by voice')} title={t(state === 'listening' ? 'Stop and send' : 'Ask by voice')}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="mic-label">{t(state === 'listening' ? 'Listening…' : state === 'hearing' ? 'Hearing…' : 'Speak')}</span>
      </button>
      {note && <span className="small mic-note" role="status">{note}</span>}
    </span>
  );
}
