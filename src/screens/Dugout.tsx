import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useT } from '../state/i18n';
import { Link } from 'react-router-dom';
import { league, club, player } from '../data/league';
import { usePrefs, personaFor, type Depth, type Prefs, type SavedUniverse } from '../state/prefs';
import { useMatch } from '../state/match';
import { initials } from '../ui/kit';
import { swingCard } from '../agents/pipeline';
import { rippleLine } from '../agents/narrator';
import { LANGS, type Lang } from '../agents/format';
import { cached } from '../engine/client';
import { scoreAt } from '../engine/demo';
import { turningPoints } from '../agents/dataScientist';
import { table, type RippleResult } from '../engine/league';
import { ordinal } from '../agents/format';
import { useUniverseStat } from './useUniverse';
import { scoutAlerts, type ScoutAlert } from '../agents/scout';
import { askAgents, LIVE } from '../agents/live';
import { verify } from '../agents/verifier';
import type { ScoutReply } from '../agents/contract';
import { band, kmIn, win } from './shared';

const DEPTHS: { id: Depth; label: string; desc: string }[] = [
  { id: 'casual', label: 'Casual', desc: 'Plain English, no stats you need to look up.' },
  { id: 'fan', label: 'Fan', desc: 'Written from your club’s side, good news and bad.' },
  { id: 'analyst', label: 'Analyst', desc: 'xG, probabilities and sample sizes.' }
];
const ALERTS: { id: keyof Prefs['alerts']; label: string; desc: string }[] = [
  { id: 'swing', label: 'Swing alerts', desc: 'When your club’s win chance moves sharply.' },
  { id: 'ghost', label: 'Ghost Run verdicts', desc: 'After big fouls, offsides and blocks in your club’s games.' },
  { id: 'ripple', label: 'Ripple at full time', desc: 'What the result means for your season.' },
  { id: 'others', label: 'Other results that affect you', desc: 'When a match you’re not in moves your club’s chances.' }
];
const SWATCHES = [{ c: '#CFF05A', n: 'Volt' }, { c: '#F2EFE6', n: 'Chalk' }, { c: '#7CB8FF', n: 'Blue' }, { c: '#FF8A4C', n: 'Orange' }];

function Crest({ code, on }: { code: string; on?: boolean }) {
  return <span className="mono" style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', background: on ? '#CFF05A' : '#1B2330', color: on ? '#0B0F14' : '#C9CFD8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500 }}>{code}</span>;
}
const X = () => <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="#F2EFE6" strokeWidth="1.6" strokeLinecap="round" /></svg>;

function SavedRow({ u }: { u: SavedUniverse }) {
  const stat = useUniverseStat(u);
  return (
    <Link to="/multiverse" className="stack-8" style={{ gap: 5, padding: '12px 0', borderTop: '1px solid #222B38', color: '#F2EFE6', textDecoration: 'none' }}>
      <span className="between mono" style={{ fontSize: 11 }}><span className="volt">{u.kind}</span><span className="dim">{u.date}</span></span>
      <span className="display" style={{ fontSize: 17 }}>{u.title}</span>
      <span className="mono muted" style={{ fontSize: 13 }}>{stat ?? '…'}</span>
    </Link>
  );
}

export default function Dugout() {
  const { prefs, set } = usePrefs();
  const t = useT();
  const { timelines, ghostsBy, minuteOf, load, clock } = useMatch();
  const [previewId, setPreviewId] = useState('km-61');
  useEffect(() => { league.feeds.forEach((f) => load(f.fixtureId)); }, [load]);
  const [picker, setPicker] = useState<null | 'main' | 'also'>(null);
  const [newPlayer, setNewPlayer] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Prefs['profile'] | null>(null);
  const [rip, setRip] = useState<RippleResult | null>(null);

  // Dugout settings set the voice; clear any one-off "Watch as" choice made elsewhere
  const setPref = (patch: Partial<Prefs>) => set({ ...patch, watchAs: null });
  // every turning point in a match involving a club you follow (or the flagship match if none)
  const followedCodes = [prefs.club, ...prefs.also];
  const myFeeds = league.feeds.filter((f) => followedCodes.includes(f.home) || followedCodes.includes(f.away));
  const feedsForPreview = myFeeds.length ? myFeeds : [league.demo];
  const choices = feedsForPreview.flatMap((f) => {
    const t = timelines[f.fixtureId];
    return t ? turningPoints(t, minuteOf(f)).map((m) => ({ f, t, m })) : [];
  });
  const picked = choices.find((c) => c.m.id === previewId) ?? choices[choices.length - 1];
  const pf = picked?.f;
  const pov: 'home' | 'away' = pf ? (pf.away === prefs.club || (pf.home !== prefs.club && prefs.also.includes(pf.away)) ? 'away' : 'home') : 'home';
  const pen = picked?.m;
  const preview = picked ? swingCard(league, picked.f, picked.t, picked.m, personaFor({ ...prefs, watchAs: null }, picked.f), prefs.lang, pov) : null;

  // the Scout: what this matchweek would have sent you, at your settings
  const [ripples, setRipples] = useState<Record<string, RippleResult>>({});
  const finished = league.feeds.filter((f) => minuteOf(f) >= 94).map((f) => f.fixtureId).join(',');
  useEffect(() => {
    let alive = true;
    const wanted = league.feeds.filter((f) => minuteOf(f) >= 94 && ((prefs.alerts.ripple && myFeeds.includes(f)) || (prefs.alerts.others && !myFeeds.includes(f))));
    for (const f of wanted) {
      const sc = scoreAt(league, 94, f);
      cached('ripple', { hg: sc.home, ag: sc.away, fixtureId: f.fixtureId }).then((r) => alive && setRipples((x) => (x[f.fixtureId] ? x : { ...x, [f.fixtureId]: r })));
    }
    return () => { alive = false; };
  }, [finished, prefs.alerts.ripple, prefs.alerts.others, followedCodes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const fanVoice = prefs.depth === 'fan';
  const scouted: ScoutAlert[] = scoutAlerts({ league, followed: followedCodes, threshold: prefs.threshold, alerts: prefs.alerts, lang: prefs.lang, fan: fanVoice, timelines, ghostsBy, minuteOf, ripples });
  // live: the Scout's model rewrites the alerts in your language; each one must pass the Verifier again here
  const [written, setWritten] = useState<Record<string, string>>({});
  const alertKeys = scouted.map((a) => a.key).join('|');
  const voiceKey = `${prefs.lang}|${fanVoice}|${prefs.club}`;
  useEffect(() => {
    if (!LIVE || !scouted.length) return;
    let alive = true;
    const t = setTimeout(() => {
      askAgents<ScoutReply>('scout', { lang: prefs.lang, fan: fanVoice, club: prefs.club, alerts: scouted.slice(0, 12).map((a) => ({ key: a.key, type: a.type, facts: a.facts, template: a.text })) })
        .then((r) => { if (alive && r?.ok) setWritten((w) => ({ ...w, ...Object.fromEntries(Object.entries(r.texts).map(([k, v]) => [`${voiceKey}|${k}`, v])) })); });
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [alertKeys, voiceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const alertLog = useMemo(() => scouted.map((a) => {
    const live = written[`${voiceKey}|${a.key}`];
    return live && verify(live, a.facts, prefs.lang).ok ? { ...a, text: live, live: true } : { ...a, live: false };
  }), [scouted, written, voiceKey, prefs.lang]);
  const checked = alertLog.reduce((n, a) => n + verify(a.text, a.facts, prefs.lang).checked, 0);

  // "if it ends like this": the picked match at its current score, through the rest of the season
  const rf = pf ?? league.demo;
  const score = scoreAt(league, minuteOf(rf), rf);
  useEffect(() => {
    let alive = true;
    cached('ripple', { hg: score.home, ag: score.away, fixtureId: rf.fixtureId }).then((r) => alive && setRip(r));
    return () => { alive = false; };
  }, [score.home, score.away, rf.fixtureId]);
  const followed = [prefs.club, ...prefs.also].filter((c) => c !== rf.home && c !== rf.away);
  const clubs = [...league.clubs].sort((a, b) => a.name.localeCompare(b.name));

  const addPlayer = (e: FormEvent) => {
    e.preventDefault();
    const q = newPlayer.trim().toLowerCase();
    if (!q) return;
    const p = league.players.find((x) => x.name.toLowerCase() === q) ?? league.players.find((x) => x.name.toLowerCase().includes(q));
    if (!p) { setAddError(`No one called “${newPlayer.trim()}” plays in the Meridian League.`); return; }
    setAddError(null);
    if (!prefs.players.includes(p.id)) set({ players: [...prefs.players, p.id] });
    setNewPlayer('');
  };
  const focusLine = (() => {
    if (!prefs.focus) return null;
    const p = player(prefs.focus);
    if (p.club !== 'NBR' && p.club !== 'HAR') return `${p.name} · not in this match`;
    const evs = league.demo.events.filter((e) => e.minute <= clock.minute && (e.player === p.id || e.other === p.id));
    const shots = evs.filter((e) => e.player === p.id && e.xg !== undefined).length;
    const saves = evs.filter((e) => e.other === p.id && (e.type === 'header_cleared' || e.type === 'shot_blocked')).length;
    return `${p.name} · ${shots} shot${shots === 1 ? '' : 's'}${saves ? ` · ${saves} block${saves === 1 ? '' : 's'} and clearances` : ''} · top sprint ${p.topSpeed} km/h`;
  })();

  return (
    <>
      <section className="between" style={{ alignItems: 'flex-end', gap: '16px 32px' }}>
        <div className="stack-12" style={{ gap: 10 }}>
          <h1 className="h1">{t('My Dugout')}</h1>
          <p className="lede">{t('Set it once. Every screen follows.')}</p>
        </div>
        <div className="inline" style={{ gap: 12 }}>
          <span className="avatar" style={{ width: 48, height: 48, fontSize: 18, background: prefs.profile.avatar }}>{initials(prefs.profile.name)}</span>
          <span className="stack-8" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{prefs.profile.name}</span><span style={{ fontSize: 13, color: '#A9B1BD' }}>{t(`Following ${club(prefs.club).short}`)}</span></span>
        </div>
      </section>

      <div className="row">
        <div className="col panel" style={{ flex: '999 1 620px', gap: 0 }}>
          <section aria-labelledby="club-h" className="stack-12" style={{ padding: 24, gap: 14 }}>
            <h2 id="club-h" className="h3">{t('Your clubs')}</h2>
            {!picker ? (
              <>
                <div className="between" style={{ alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 8, background: '#0B0F14', boxShadow: 'inset 3px 0 0 #CFF05A' }}>
                  <span className="inline" style={{ gap: 14 }}>
                    <span className="mono" style={{ width: 46, height: 46, borderRadius: '50%', background: '#CFF05A', color: '#0B0F14', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{prefs.club}</span>
                    <span className="stack-8" style={{ gap: 2 }}><span className="mono volt" style={{ fontSize: 11 }}>{t('Main club').toUpperCase()}</span><span className="display" style={{ fontSize: 22 }}>{club(prefs.club).name}</span></span>
                  </span>
                  <button type="button" className="btn" onClick={() => setPicker('main')}>{t('Change')}</button>
                </div>
                <div className="stack-8" style={{ gap: 10 }}>
                  <span style={{ fontSize: 14, color: '#A9B1BD' }}>{t('Also following')}</span>
                  <div className="wrap">
                    {prefs.also.map((c) => (
                      <span key={c} className="inline" style={{ minHeight: 44, padding: '0 6px', borderRadius: 8, border: '1px solid #2A3240', fontSize: 15 }}>
                        <Crest code={c} />{club(c).name}
                        <button type="button" aria-label={`Stop following ${club(c).name}`} onClick={() => set({ also: prefs.also.filter((x) => x !== c) })} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#1B2330', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X /></button>
                      </span>
                    ))}
                    <button type="button" className="btn" style={{ borderStyle: 'dashed', borderColor: '#5A6578', fontSize: 14 }} onClick={() => setPicker('also')}>+ {t('Follow another club')}</button>
                  </div>
                </div>
                {(() => {
                  const tbl = table(league);
                  const pos = tbl.findIndex((r) => r.code === prefs.club);
                  const row = tbl[pos];
                  const scorer = league.players.filter((p) => p.club === prefs.club).sort((a, b) => b.goals - a.goals)[0];
                  const next = league.fixtures.filter((f) => (f.home === prefs.club || f.away === prefs.club) && f.mw > league.currentMw).sort((a, b) => a.mw - b.mw)[0];
                  const opp = next ? (next.home === prefs.club ? `${club(next.away).short} (home)` : `${club(next.home).short} (away)`) : '—';
                  return (
                    <section aria-labelledby="season-h" className="stack-8" style={{ gap: 0, paddingTop: 4 }}>
                      <h3 id="season-h" style={{ fontSize: 14, color: '#A9B1BD', fontWeight: 400, marginBottom: 6 }}>{t(`${club(prefs.club).short} this season`)}</h3>
                      <div className="kv" style={{ fontSize: 14 }}><span>{t('Table')}</span><span>{t(`${ordinal(pos + 1)} · ${row.pts} pts from ${row.p}`)}</span></div>
                      <div className="kv" style={{ fontSize: 14 }}><span>{t('Top scorer')}</span><span>{scorer.name} · {scorer.goals}</span></div>
                      <div className="kv" style={{ fontSize: 14 }}><span>{t('Next')}</span><span>{t(`MW${next?.mw} · ${opp}`)}</span></div>
                    </section>
                  );
                })()}

              </>
            ) : (
              <>
                <div className="between" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{picker === 'main' ? 'Pick your main club' : 'Follow more clubs'}</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setPicker(null)}>{t('Done')}</button>
                </div>
                <div role="group" aria-label={picker === 'main' ? 'Pick your main club' : 'Follow more clubs'} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                  {clubs.map((c) => {
                    const isMain = prefs.club === c.code;
                    const on = picker === 'main' ? isMain : prefs.also.includes(c.code);
                    const locked = picker === 'also' && isMain;
                    return (
                      <button key={c.code} type="button" aria-pressed={on} disabled={locked}
                        onClick={() => {
                          if (picker === 'main') { setPref({ club: c.code, also: prefs.also.filter((x) => x !== c.code) }); setPicker(null); return; }
                          set({ also: on ? prefs.also.filter((x) => x !== c.code) : [...prefs.also, c.code] });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 12px', borderRadius: 8, border: `1px solid ${on ? '#CFF05A' : '#2A3240'}`, background: on ? '#1B2330' : '#0B0F14', textAlign: 'left', cursor: locked ? 'default' : 'pointer', fontSize: 14, opacity: locked ? 0.5 : 1 }}>
                        <Crest code={c.code} on={on || locked} /><span style={{ lineHeight: 1.2 }}>{c.name}{locked ? ' · main' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="pl-h" className="hair-t stack-12" style={{ padding: 24, gap: 14 }}>
            <h2 id="pl-h" className="h3">{t('Favourite players')}</h2>
            <div className="wrap">
              {prefs.players.map((id) => {
                const p = player(id);
                return (
                  <span key={id} className="inline" style={{ minHeight: 44, padding: '0 6px 0 14px', borderRadius: 8, border: '1px solid #2A3240', fontSize: 15 }}>
                    {p.name}<span className="mono dim" style={{ fontSize: 11 }}>{p.club}</span>
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ players: prefs.players.filter((x) => x !== id), focus: prefs.focus === id ? null : prefs.focus })} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#1B2330', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X /></button>
                  </span>
                );
              })}
            </div>
            <form onSubmit={addPlayer} className="wrap">
              <label htmlFor="addp" className="sr">{t('Add a player')}</label>
              <input id="addp" className="input" type="text" maxLength={60} value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} placeholder={t('Add a player, e.g. Jonty Sorrelwick')} list="all-players" style={{ flex: '1 1 260px', minWidth: 0 }} />
              <datalist id="all-players">{league.players.filter((p) => p.starter).map((p) => <option key={p.id} value={p.name} />)}</datalist>
              <button type="submit" className="btn" style={{ minHeight: 46 }}>{t('Add')}</button>
            </form>
            {addError && <span className="small signal">{t(addError)}</span>}
            <div className="hair-t stack-8" style={{ paddingTop: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t('Player focus')}</span>
              <span className="small">{t('Follow one player for the whole match: their runs, sprints and moments come first.')}</span>
              <div role="radiogroup" aria-label={t('Player focus')} className="seg" style={{ alignSelf: 'flex-start' }}>
                {[{ id: null as string | null, label: t('Off') }, ...prefs.players.map((id) => ({ id: id as string | null, label: player(id).name }))].map((f) => (
                  <button key={f.id ?? 'off'} type="button" role="radio" aria-checked={prefs.focus === f.id} onClick={() => set({ focus: f.id })} style={{ fontSize: 14 }}>{f.label}</button>
                ))}
              </div>
            </div>
          </section>

          <div className="strip" style={{ borderBottom: 'none' }}>
            <div className="strip-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <section aria-labelledby="depth-h" className="stack-12" style={{ padding: 24 }}>
                <h2 id="depth-h" className="h3">{t('How deep')}</h2>
                <div role="radiogroup" aria-labelledby="depth-h" className="stack-8">
                  {DEPTHS.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={prefs.depth === d.id} onClick={() => setPref({ depth: d.id })}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '12px 14px', borderRadius: 8, border: `1px solid ${prefs.depth === d.id ? '#CFF05A' : '#2A3240'}`, background: prefs.depth === d.id ? '#1B2330' : '#0B0F14', textAlign: 'left', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{t(d.label)}</span>
                      <span style={{ fontSize: 13, color: '#A9B1BD' }}>{t(d.desc)}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section aria-labelledby="lang-h" className="stack-12" style={{ padding: 24 }}>
                <h2 id="lang-h" className="h3">{t('Language')}</h2>
                <div role="radiogroup" aria-labelledby="lang-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {LANGS.map((l) => (
                    <button key={l.id} type="button" role="radio" aria-checked={prefs.lang === l.id} onClick={() => set({ lang: l.id as Lang })}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, padding: '0 14px', borderRadius: 8, border: `1px solid ${prefs.lang === l.id ? '#CFF05A' : '#2A3240'}`, background: prefs.lang === l.id ? '#1B2330' : '#0B0F14', cursor: 'pointer', fontSize: 15 }}>
                      <span style={{ fontWeight: 500 }}>{l.label}</span><span className="mono dim" style={{ fontSize: 12 }}>{l.native}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <section aria-labelledby="alert-h" className="hair-t grow stack-8" style={{ padding: 24, gap: 6 }}>
            <h2 id="alert-h" className="h3" style={{ marginBottom: 8 }}>{t('Alerts')}</h2>
            {ALERTS.map((a) => (
              <div key={a.id} className="between" style={{ alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid #222B38' }}>
                <span className="stack-8" style={{ gap: 2, flex: '1 1 260px' }}><span style={{ fontWeight: 600, fontSize: 15 }}>{t(a.label)}</span><span style={{ fontSize: 13, color: '#A9B1BD' }}>{t(a.desc)}</span></span>
                <button type="button" role="switch" className="switch" aria-checked={prefs.alerts[a.id]} aria-label={t(a.label)} onClick={() => set({ alerts: { ...prefs.alerts, [a.id]: !prefs.alerts[a.id] } })} />
              </div>
            ))}
            <div className="wrap" style={{ paddingTop: 6 }}>
              <span style={{ fontSize: 14, color: '#A9B1BD', marginRight: 4 }}>{t('Ping me when a swing is bigger than')}</span>
              {[10, 15, 20].map((n) => (
                <button key={n} type="button" aria-pressed={prefs.threshold === n} onClick={() => set({ threshold: n })} className="mono" style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${prefs.threshold === n ? '#FF8A4C' : '#2A3240'}`, background: prefs.threshold === n ? '#FF8A4C' : 'transparent', color: prefs.threshold === n ? '#0B0F14' : '#F2EFE6', fontSize: 13, cursor: 'pointer' }}>{t(`${n} pts`)}</button>
              ))}
            </div>
          </section>
        </div>

        <div className="col side-col" style={{ gap: 16 }}>
          <article aria-live="polite" className="panel accent-signal stack-16" style={{ padding: 22, gap: 14 }}>
            {preview && pen ? <>
              <div className="between" style={{ alignItems: 'center' }}>
                <span className="display" style={{ padding: '5px 10px', borderRadius: 4, background: band(pf!, pen).color, color: '#0B0F14', fontSize: 15 }}>{t(band(pf!, pen).text)}</span>
                <span className="kicker">{pf!.home} {scoreAt(league, pen.minute, pf!).home}–{scoreAt(league, pen.minute, pf!).away} {pf!.away}</span>
              </div>
              <h3 className="display" style={{ fontSize: 24, lineHeight: 1.15 }}>{t(kmIn(pf!, pen.id).title)}</h3>
              <label className="sr" htmlFor="pv">{t('Preview another moment')}</label>
              <select id="pv" className="input" value={pen.id} onChange={(e) => setPreviewId(e.target.value)} style={{ minHeight: 40, fontSize: 14 }}>
                {choices.map((c) => <option key={c.m.id} value={c.m.id}>{c.f.home} v {c.f.away} · {kmIn(c.f, c.m.id).label} {kmIn(c.f, c.m.id).title}</option>)}
              </select>
              <span className="chip-num" style={{ alignSelf: 'flex-start' }}><span className="dim">{pov === 'home' ? pf!.home : pf!.away} {t('Win').toUpperCase()}</span>{win(pen.before, pov)}%<span className="dim">→</span><span style={{ color: win(pen.after, pov) >= win(pen.before, pov) ? '#CFF05A' : '#FF8A4C' }}>{win(pen.after, pov)}%</span></span>
              <p style={{ fontSize: 17, lineHeight: 1.6 }}>{preview.lang === prefs.lang ? preview.text : t(preview.text)}</p>
              {rip && followed.length > 0 && (
                <div className="hair-t stack-8" style={{ gap: 10, paddingTop: 14, borderTopColor: '#2A3240' }}>
                  <span className="kicker volt">{t(`If it ends ${score.home}–${score.away}`).toUpperCase()}</span>
                  {followed.map((c) => <span key={c} style={{ fontSize: 15, lineHeight: 1.45 }}><strong style={{ fontWeight: 600 }}>{club(c).short}.</strong> <span className="muted">{t(rippleLine(league, rip, c))}</span></span>)}
                </div>
              )}
              {focusLine && (
                <div className="quote volt inline" style={{ gap: 10 }}>
                  <span className="kicker volt">{t('Focus').toUpperCase()}</span><span style={{ fontSize: 15 }}>{t(focusLine)}</span>
                </div>
              )}
            </> : <span className="kicker">{t('Loading preview…')}</span>}
          </article>

          <section aria-labelledby="log-h" className="panel stack-8" style={{ padding: '20px 22px', gap: 0 }}>
            <div className="between" style={{ paddingBottom: 10 }}>
              <h2 id="log-h" className="h3">{t('Your alerts this matchweek')}</h2>
              <span className="mono signal" style={{ fontSize: 13 }}>{alertLog.length}</span>
            </div>
            {alertLog.length > 0 && <p className="mono dim" style={{ fontSize: 11, paddingBottom: 8 }}>{t(`Chosen and written by the Scout · ${checked} numbers checked${alertLog.some((a) => a.live) ? ' · written live' : ''}`).toUpperCase()}</p>}
            {alertLog.length === 0 && <p className="small" style={{ padding: '10px 0', borderTop: '1px solid #222B38' }}>{t(`Nothing has crossed your ${prefs.threshold}-point threshold yet.`)}</p>}
            <div style={{ maxHeight: 260, overflowY: 'auto' }} tabIndex={0} role="region" aria-label={t('Your alerts this matchweek')}>
              {alertLog.map((a) => (
                <div key={a.key} className="stack-8" style={{ gap: 4, padding: '12px 0', borderTop: '1px solid #222B38' }}>
                  <span className="inline mono" style={{ gap: 10, fontSize: 11 }}>
                    <span className="muted">{a.label}</span>
                    <span style={{ color: a.type === 'SWING' ? '#FF8A4C' : a.type === 'RIPPLE' || a.type === 'ELSEWHERE' ? '#F2EFE6' : '#CFF05A' }}>{a.type}</span>
                    {a.pick && <span className="signal">· {t('Scout’s pick').toUpperCase()}</span>}
                  </span>
                  <span style={{ fontSize: 15, lineHeight: 1.45, color: '#E4E1D9' }}>{a.text}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="panel grow col" style={{ gap: 0 }}>
            <section aria-labelledby="uni-h" className="stack-8" style={{ padding: '22px 22px 14px', gap: 4 }}>
              <div className="between" style={{ marginBottom: 8 }}>
                <h2 id="uni-h" className="h3">{t('Saved Universes')}</h2>
                <Link to="/multiverse" className="tap-link" style={{ fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>{t('New')} →</Link>
              </div>
              {prefs.universes.length === 0 && <span className="small">{t('Nothing saved yet.')}</span>}
              {prefs.universes.map((u) => <SavedRow key={u.id} u={u} />)}
            </section>
            <section aria-labelledby="acct-h" className="hair-t grow stack-12" style={{ padding: 22, gap: 14 }}>
              <div className="between">
                <h2 id="acct-h" className="h3">{t('Account')}</h2>
                <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...prefs.profile })}>{t('Edit profile')}</button>
              </div>
              <button type="button" onClick={() => setEditing({ ...prefs.profile })} aria-label={t('Edit profile')} className="inline" style={{ gap: 14, padding: '4px 0', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <span className="avatar" style={{ width: 56, height: 56, fontSize: 21, background: prefs.profile.avatar }}>{initials(prefs.profile.name)}</span>
                <span className="stack-8" style={{ gap: 3, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{prefs.profile.name}</span>
                  <span className="mono muted" style={{ fontSize: 13 }}>@{prefs.profile.username}</span>
                  <span className="muted" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prefs.profile.email}</span>
                </span>
              </button>
              <div>
                <div className="kv" style={{ fontSize: 14 }}><span>{t('Member since')}</span><span>{t('August 2026')}</span></div>
                <div className="kv" style={{ fontSize: 14 }}><span>{t('Saved on')}</span><span>{t('This browser')}</span></div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {editing && (
        <div className="overlay-backdrop" onClick={() => setEditing(null)}>
          <form role="dialog" aria-modal="true" aria-labelledby="edit-h" className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); set({ profile: editing }); setEditing(null); }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <h2 id="edit-h" className="display" style={{ fontSize: 26 }}>{t('Edit profile')}</h2>
              <button type="button" aria-label={t('Close')} onClick={() => setEditing(null)} style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid #2A3240', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X /></button>
            </div>
            <div className="inline" style={{ gap: 16 }}>
              <span className="avatar" style={{ width: 76, height: 76, fontSize: 28, background: editing.avatar }}>{initials(editing.name)}</span>
              <div className="stack-8">
                <span style={{ fontSize: 14, color: '#A9B1BD' }}>{t('Profile colour')}</span>
                <div role="radiogroup" aria-label={t('Avatar colour')} className="wrap">
                  {SWATCHES.map((s) => <button key={s.c} type="button" role="radio" aria-checked={editing.avatar === s.c} aria-label={s.n} onClick={() => setEditing({ ...editing, avatar: s.c })} style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${editing.avatar === s.c ? '#F2EFE6' : 'transparent'}`, background: s.c, cursor: 'pointer' }} />)}
                </div>
              </div>
            </div>
            {(['name', 'username', 'email'] as const).map((k) => (
              <label key={k} className="stack-8" style={{ gap: 6, fontSize: 14, color: '#A9B1BD' }}>{k === 'name' ? 'Display name' : k === 'username' ? 'Username' : 'Email'}
                <input className="input" maxLength={k === 'email' ? 120 : 60} type={k === 'email' ? 'email' : 'text'} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} style={{ fontFamily: k === 'username' ? 'var(--mono)' : undefined, fontSize: 16 }} />
              </label>
            ))}
            <div className="wrap" style={{ gap: 10, paddingTop: 4 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: '1 1 auto', minHeight: 48 }}>{t('Save changes')}</button>
              <button type="button" className="btn" style={{ flex: '1 1 auto', minHeight: 48 }} onClick={() => setEditing(null)}>{t('Cancel')}</button>
            </div>
          </form>
        </div>
      )}

      <footer className="footer-note">{t('Synthetic league. Every club and player is fictional. Your settings stay in this browser.')}</footer>
    </>
  );
}
