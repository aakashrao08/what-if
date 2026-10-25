// "What would it take?" results: Dr Football's answer on the left, the routes there on the right.
import { useT } from '../state/i18n';
import type { TakesOk } from '../agents/pipeline';

const TAG_COLOR: Record<string, string> = { MOMENT: '#FF8A4C', TACTICS: '#CFF05A', MANAGER: '#CFF05A', SIGNING: '#7CB8FF', ELSEWHERE: '#A9B1BD', COMBINED: '#FF8A4C' };

export default function TakesPanel({ res, dim, onPlay }: { res: TakesOk; dim: boolean; onPlay: (sentence: string) => void }) {
  const { view, result } = res;
  const t = useT();
  return (
    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '40px 56px', alignItems: 'stretch', borderTop: '1px solid #222B38', paddingTop: 32, opacity: dim ? 0.4 : 1, transition: 'opacity 200ms' }}>
      <article className="stack-16" style={{ gap: 18, minWidth: 0, padding: 'clamp(24px, 3vw, 40px)', borderRadius: 4, background: '#F2EFE6', color: '#0B0F14' }}>
        <div className="between" style={{ paddingBottom: 12, borderBottom: '3px double #0B0F14' }}>
          <span className="display" style={{ fontSize: 24 }}>{t('Dr Football’s answer')}</span>
          <span className="mono" style={{ fontSize: 12, color: '#3A4352' }}>{view.clubName.toUpperCase()} · {t(view.raceLabel).toUpperCase()}</span>
        </div>
        <p className="mono" style={{ fontSize: 13, color: '#3A4352' }}>{t(view.goalLine)}</p>
        <h2 className="display" style={{ fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.035em', lineHeight: 0.98 }}>{t(view.head)}</h2>
        <p style={{ maxWidth: 560, fontSize: 19, lineHeight: 1.55, color: '#2A3240' }}>{t(view.sub)}</p>
        <div className="mt-auto between mono" style={{ paddingTop: 14, borderTop: '1px solid #C9C4B8', fontSize: 12, color: '#3A4352', gap: 12, flexWrap: 'wrap' }}>
          <span>{t(`${result.screened} universes searched · ${result.n.toLocaleString('en-GB')} seasons each to confirm`).toUpperCase()}</span>
          <span>{t(res.verdict.ok ? `${res.verdict.checked} numbers checked by the Verifier` : 'Verifier flagged this').toUpperCase()}</span>
        </div>
      </article>

      <section aria-labelledby="routes-h" className="col" style={{ gap: 0, minWidth: 0 }}>
        <div className="between" style={{ paddingBottom: 12 }}>
          <h2 id="routes-h" className="h3">{t('Routes there')}</h2>
          <span style={{ fontSize: 13, color: '#8A93A3' }}>{t(`Chance with the change · was ${Math.round(result.base * 100)}%`)}</span>
        </div>
        {view.rows.length === 0 && <p className="small" style={{ padding: '12px 0', borderTop: '1px solid #222B38' }}>{t('No single change moves them by more than a point.')}</p>}
        {view.rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', padding: '14px 0', borderTop: '1px solid #222B38' }}>
            <span className="mono" style={{ flex: '0 0 84px', fontSize: 11, color: TAG_COLOR[r.tag] ?? '#A9B1BD' }}>{t(r.tag)}</span>
            <span style={{ flex: '1 1 200px', fontSize: 16, fontWeight: 500, minWidth: 0 }}>{t(r.short)}</span>
            <span className="inline mono" style={{ alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
              <span className={`display ${r.reaches ? 'volt' : ''}`} style={{ fontSize: 26 }}>{r.p}%</span>
              <span style={{ fontSize: 12, color: '#8A93A3' }}>{r.lo}–{r.hi} · +{r.delta}</span>
            </span>
            {r.sentence && <button type="button" className="btn btn-sm" style={{ minHeight: 40 }} onClick={() => onPlay(r.sentence!)}>{t('Play it out')}</button>}
          </div>
        ))}
        <div className="between mt-auto" style={{ gap: 16, padding: '16px 0 0', borderTop: '1px solid #222B38' }}>
          <span style={{ fontSize: 15, color: '#C9CFD8' }}>{t('On points alone')}</span>
          <span className="mono signal" style={{ fontSize: 15 }}>{t(result.pointsNeeded === null ? 'more than 30 points' : `${result.pointsNeeded} point${result.pointsNeeded === 1 ? '' : 's'}`)}</span>
        </div>
      </section>
    </div>
  );
}
