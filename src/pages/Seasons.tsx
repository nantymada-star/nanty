import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { PageHeader } from '../components/ui'
import { useData } from '../lib/data'
import { CALENDAR_SOURCES, CROPS, CYCLONE_SEASON, LEAN_SEASON } from '../lib/seasons'
import { seasonalIndex } from '../lib/stats'
import { commodityLabel, unitLabel } from '../lib/commodities'
import { MONTHS_SHORT, monthName } from '../lib/format'

export default function Seasons() {
  const { t, lang } = useT()
  const { commodities, seriesList } = useData()
  const [code, setCode] = useState('')
  const c = commodities.find((x) => x.code === code) ?? commodities.find((x) => /rice \(local\)/i.test(x.name)) ?? commodities[0]

  /** Indice saisonnier moyen sur tous les marchés (détail, même unité dominante). */
  const idx = useMemo(() => {
    if (!c) return null
    const ss = seriesList.filter((s) => s.latest.commodityCode === c.code && s.latest.priceType === 'Retail' && s.latest.unit === c.units[0])
    const per = ss.map((s) => seasonalIndex(s.points))
    const months = Array.from({ length: 12 }, (_, m) => {
      const vals = per.map((p) => p[m].index).filter((v): v is number => v != null)
      const years = Math.max(0, ...per.map((p) => p[m].n))
      return { m, v: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 100 : null, years, markets: vals.length }
    })
    const ok = months.filter((x) => x.v != null)
    if (ok.length < 10) return { months, hi: null, lo: null, years: 0, markets: 0 }
    const hi = ok.reduce((a, b) => (b.v! > a.v! ? b : a))
    const lo = ok.reduce((a, b) => (b.v! < a.v! ? b : a))
    return { months, hi, lo, years: Math.max(...ok.map((x) => x.years)), markets: Math.max(...ok.map((x) => x.markets)) }
  }, [c, seriesList])

  return (
    <div className="stack">
      <PageHeader title={t('seasonsTitle')} back={false} />

      <div className="card stack">
        <h2>{t('calendar')}</h2>
        <div className="scroll-x">
          <div className="cal" style={{ minWidth: 460 }}>
            <span />
            {MONTHS_SHORT[lang].map((m) => <span key={m} style={{ textAlign: 'center' }} className="muted">{m}</span>)}
            {CROPS.map((cr, i) => (
              <Row key={i} label={lang === 'mg' ? cr.mg : cr.fr} cls={(m) => (cr.plant.includes(m) && cr.harvest.includes(m) ? 'both' : cr.plant.includes(m) ? 'plant' : cr.harvest.includes(m) ? 'harvest' : '')} />
            ))}
            <Row label={t('lean')} cls={(m) => (LEAN_SEASON.includes(m) ? 'lean' : '')} />
            <Row label={t('cyclone')} cls={(m) => (CYCLONE_SEASON.includes(m) ? 'cyc' : '')} />
          </div>
        </div>
        <div className="row wrap" style={{ fontSize: 12, gap: 12 }}>
          <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: '#9ccc65' }} /> {t('planting')}</span>
          <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: 'var(--orange)' }} /> {t('harvest')}</span>
          <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: 'var(--red)' }} /> {t('lean')}</span>
          <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: 'var(--blue)' }} /> {t('cyclone')}</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {CROPS.filter((x) => (lang === 'mg' ? x.noteMg : x.noteFr)).map((x, i) => <li key={i}><b>{lang === 'mg' ? x.mg : x.fr}</b> : {lang === 'mg' ? x.noteMg : x.noteFr}</li>)}
        </ul>
        <small>{t('calWarn')} {t('calSource')} : {CALENDAR_SOURCES.map((s, i) => <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</small>
      </div>

      <div className="card stack">
        <h2>{t('observedSeason')}</h2>
        <select value={c?.code ?? ''} onChange={(e) => setCode(e.target.value)} aria-label={t('product')}>
          {commodities.map((x) => <option key={x.code} value={x.code}>{commodityLabel(x.name, lang)} ({unitLabel(x.units[0], lang)})</option>)}
        </select>
        {idx && idx.hi ? (
          <>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={idx.months.map((x) => ({ m: MONTHS_SHORT[lang][x.m], v: x.v == null ? null : Math.round(x.v * 10) / 10, mi: x.m }))}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} />
                  <YAxis domain={[(min: number) => Math.floor(Math.min(min, 90)), (max: number) => Math.ceil(Math.max(max, 110))]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={36} />
                  <ReferenceLine y={100} stroke="var(--muted)" strokeDasharray="4 4" />
                  <Tooltip formatter={(v: number) => [v, 'Index']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {idx.months.map((x) => <Cell key={x.m} fill={x.v != null && x.v >= 100 ? 'var(--orange)' : 'var(--green2)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <small>{t('seasonIndexHelp')} ({idx.markets} {t('markets')})</small>
            <div className="banner info">
              <div>
                <b>{t('opportunity')}</b>
                <div>{t('oppText', { hi: monthName(idx.hi.m, lang), lo: monthName(idx.lo!.m, lang), n: idx.years })}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="banner warn">{t('notEnough')}</div>
        )}
      </div>
    </div>
  )
}

function Row({ label, cls }: { label: string; cls: (m: number) => string }) {
  return (
    <>
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
      {Array.from({ length: 12 }, (_, m) => <span key={m} className={`cell ${cls(m)}`} />)}
    </>
  )
}
