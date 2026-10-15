import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { db } from '../lib/db'
import { estimateRange, monthTone, seasonProfile } from '../lib/seasonal'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { PageHeader } from '../components/ui'
import { useData } from '../lib/data'
import { CALENDAR_SOURCES, CROPS, CYCLONE_SEASON, LEAN_SEASON } from '../lib/seasons'
import { commodityLabel, unitLabel } from '../lib/commodities'
import { fmtAr, MONTHS_SHORT, monthName } from '../lib/format'

export default function Seasons() {
  const { t, lang } = useT()
  const { commodities, seriesList } = useData()
  const [params, setParams] = useSearchParams()
  const code = params.get('c') ?? ''
  const [region, setRegion] = useState('')
  const [alertOk, setAlertOk] = useState(false)
  const c = commodities.find((x) => x.code === code) ?? commodities.find((x) => /rice \(local\)/i.test(x.name)) ?? commodities[0]
  const unit = c?.units.includes('kg') ? 'kg' : c?.units[0] ?? ''

  // Profil saisonnier calculé sur les prix réels, optionnellement pour une seule région
  const prof = useMemo(() => (c ? seasonProfile(seriesList, c.code, unit, region) : null), [c, seriesList, unit, region])
  const range = useMemo(
    () => (c && prof && prof.hi != null ? estimateRange(seriesList, prof, c.code, unit, prof.hi, region) : null),
    [c, prof, seriesList, unit, region],
  )
  const regionsForC = useMemo(
    () => [...new Set(seriesList.filter((s) => s.latest.commodityCode === c?.code && s.latest.unit === unit).map((s) => s.latest.admin1).filter(Boolean))].sort(),
    [seriesList, c?.code, unit],
  )
  const addSeasonAlert = async () => {
    if (!c) return
    await db.alerts.add({ commodityCode: c.code, marketCode: '*', unit, priceType: 'Retail', kind: 'season', threshold: 0, active: true, createdAt: new Date().toISOString() })
    setAlertOk(true)
  }
  const toneColor = (v: number | null) => {
    const tone = monthTone(v)
    return tone === 'shortage' ? 'var(--red)' : tone === 'abundance' ? 'var(--green2)' : 'var(--orange)'
  }
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
        <div className="grid2">
          <select value={c?.code ?? ''} onChange={(e) => { setParams({ c: e.target.value }, { replace: true }); setRegion(''); setAlertOk(false) }} aria-label={t('product')}>
            {commodities.map((x) => <option key={x.code} value={x.code}>{commodityLabel(x.name, lang)}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label={t('forRegion')}>
            <option value="">{t('national')}</option>
            {regionsForC.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {prof && prof.hi != null ? (
          <>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={prof.months.map((x) => ({ m: MONTHS_SHORT[lang][x.m], v: x.v == null ? null : Math.round(x.v * 10) / 10 }))}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} />
                  <YAxis domain={[(min: number) => Math.floor(Math.min(min, 90)), (max: number) => Math.ceil(Math.max(max, 110))]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={36} />
                  <ReferenceLine y={100} stroke="var(--muted)" strokeDasharray="4 4" />
                  <Tooltip formatter={(v: number) => [v, 'Index']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {prof.months.map((x) => <Cell key={x.m} fill={toneColor(x.v)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend-row">
              <span><span className="dot" style={{ background: 'var(--green2)' }} /> {t('abundance')}</span>
              <span><span className="dot" style={{ background: 'var(--orange)' }} /> {t('realistic')}</span>
              <span><span className="dot" style={{ background: 'var(--red)' }} /> {t('shortage')}</span>
            </div>
            <small>{t('seasonIndexHelp')} ({prof.markets} {t('markets')}{region ? ` · ${region}` : ''})</small>
            <div className="banner info">
              <div className="stack" style={{ width: '100%' }}>
                <b>{t('opportunity')}</b>
                <div>{t('oppText', { hi: monthName(prof.hi, lang), lo: monthName(prof.lo!, lang), n: prof.years })}</div>
                {range && (
                  <div>
                    {t('estRange')} {monthName(prof.hi, lang)} : <b className="price num" style={{ fontSize: 16 }}>{fmtAr(range.low)} – {fmtAr(range.high)}</b> / {unitLabel(unit, lang)}{' '}
                    <span className="badge b-estimated">{t('stEstimated')}</span>
                    <div><small>{t('estRangeHelp')}</small></div>
                  </div>
                )}
                {alertOk
                  ? <div className="banner ok"><Icon name="check" /> {t('saved')} — <Link to="/fanairana">{t('myAlerts')}</Link></div>
                  : <button className="btn small secondary" onClick={addSeasonAlert}><Icon name="bell" size={16} /> {t('seasonAlertBtn')}</button>}
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
