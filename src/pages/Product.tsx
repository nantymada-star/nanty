import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Change, Empty, PageHeader, SeriesRow, StatusBadge, useFreshness } from '../components/ui'
import { useData } from '../lib/data'
import { CommodityEnrichment } from '../components/Enrichment'
import { db, recordHistory, type PriceAlert } from '../lib/db'
import { compKey, seriesKey } from '../lib/stats'
import { categoryLabel, commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtMonth, fmtNum, fmtPeriod, MONTHS_SHORT } from '../lib/format'

export default function Product() {
  const { code = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { t, lang } = useT()
  const fresh = useFreshness()
  const { seriesList, observations } = useData()
  const forCommodity = seriesList.filter((s) => s.latest.commodityCode === code)
  const marketCode = params.get('market') ?? forCommodity[0]?.latest.marketCode ?? ''
  const unit = params.get('unit') ?? forCommodity.find((s) => s.latest.marketCode === marketCode)?.latest.unit ?? ''
  const pt = params.get('pt') ?? forCommodity.find((s) => s.latest.marketCode === marketCode && s.latest.unit === unit)?.latest.priceType ?? ''
  const series = seriesList.find((s) => s.key === seriesKey({ commodityCode: code, marketCode, unit, priceType: pt }))
  const [range, setRange] = useState<12 | 36 | 0>(36)

  const favId = `${code}|${marketCode}|${unit}|${pt}`
  const fav = useLiveQuery(() => db.favorites.get(favId), [favId])
  const [alertKind, setAlertKind] = useState<PriceAlert['kind']>('drop')
  const [threshold, setThreshold] = useState('5')
  const [alertOk, setAlertOk] = useState(false)

  const userObs = observations
    .filter((x) => x.source === 'user' && x.moderation !== 'rejected' && x.commodityCode === code && x.marketCode === marketCode && x.unit === unit && x.priceType === pt)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
  const chart = useMemo(() => {
    if (!series) return []
    const pts = range ? series.points.slice(-range) : series.points
    return pts.map((p) => ({ d: p.periodStart, price: p.price }))
  }, [series, range])

  const histKey = series ? `${series.latest.commodityCode}|${series.latest.marketCode}|${series.latest.unit}|${series.latest.priceType}` : ''
  useEffect(() => {
    if (!series) return
    const o = series.latest
    recordHistory({
      kind: 'product',
      key: histKey,
      label: `${commodityLabel(o.commodityName, lang)} · ${o.marketName}`,
      link: `/vokatra/${encodeURIComponent(o.commodityCode)}?market=${encodeURIComponent(o.marketCode)}&unit=${encodeURIComponent(o.unit)}&pt=${encodeURIComponent(o.priceType)}`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histKey])

  if (!series) {
    return (
      <div>
        <PageHeader title={t('product')} />
        <Empty icon="chart">{t('noData')}</Empty>
      </div>
    )
  }
  const o = series.latest
  const wholesale = o.priceType !== 'Wholesale'
    ? seriesList.find((x) => x.latest.commodityCode === o.commodityCode && x.latest.marketCode === o.marketCode && x.latest.priceType === 'Wholesale')
    : undefined
  const others = seriesList.filter((s) => compKey(s.latest) === compKey(o) && s.key !== series.key).sort((a, b) => a.latest.price - b.latest.price)
  const marketsForCommodity = forCommodity.filter((s, i, a) => a.findIndex((x) => x.key === s.key) === i)

  const toggleFav = async () => {
    if (fav) await db.favorites.delete(favId)
    else await db.favorites.put({ id: favId, commodityCode: code, marketCode, unit, priceType: pt, createdAt: new Date().toISOString() })
  }
  const addAlert = async () => {
    const th = Number(threshold)
    if (alertKind !== 'new' && !(th > 0)) return
    await db.alerts.add({ commodityCode: code, marketCode, unit, priceType: pt, kind: alertKind, threshold: th || 0, active: true, createdAt: new Date().toISOString(), lastFiredObsId: o.id })
    setAlertOk(true)
  }

  return (
    <div className="stack">
      <PageHeader title={commodityLabel(o.commodityName, lang)} right={
        <button className="btn small secondary" onClick={toggleFav} aria-pressed={!!fav} title={fav ? t('removeFav') : t('addFav')}>
          <Icon name="star" size={18} /> <span className="sr-only">{fav ? t('removeFav') : t('addFav')}</span>
        </button>
      } />

      <div className="card stack">
        <label className="field"><span>{t('market')}</span>
          <select value={series.key} onChange={(e) => {
            const s = marketsForCommodity.find((x) => x.key === e.target.value)!
            setParams({ market: s.latest.marketCode, unit: s.latest.unit, pt: s.latest.priceType }, { replace: true })
          }}>
            {marketsForCommodity.sort((a, b) => a.latest.marketName.localeCompare(b.latest.marketName)).map((s) => (
              <option key={s.key} value={s.key}>{s.latest.marketName} — {unitLabel(s.latest.unit, lang)} · {priceTypeLabel(s.latest.priceType, lang)}</option>
            ))}
          </select>
        </label>
        <div className="row between wrap">
          <div>
            <div className="price big num">{fmtAr(o.price)} <small style={{ fontSize: 15 }}>/ {unitLabel(o.unit, lang)}</small></div>
            <div className="row wrap" style={{ gap: 6 }}>
              <StatusBadge status={fresh(o)} />
              <span className="badge b-verified" style={{ background: 'var(--soft)', color: 'var(--fg)' }}>{priceTypeLabel(o.priceType, lang)}</span>
              {o.priceFlag !== 'actual' && <span className="badge b-stale" title="WFP price_flag">{o.priceFlag}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div><Change v={series.change1} /> <small>{t('vsPrev')}</small></div>
            <div><Change v={series.change12m} /> <small>{t('vs12')}</small></div>
          </div>
        </div>
        <table className="table">
          <tbody>
            <tr><th>{t('period')}</th><td>{fmtPeriod(o.periodStart, o.periodEnd, lang)}</td></tr>
            <tr><th>{t('market')}</th><td>{o.marketName}{o.admin2 ? `, ${o.admin2}` : ''}{o.admin1 ? ` (${o.admin1})` : ''}</td></tr>
            <tr><th>{t('source')}</th><td>World Food Programme (WFP) — HDX HAPI · <a href="https://data.humdata.org/dataset/wfp-food-prices-for-madagascar" target="_blank" rel="noreferrer">HDX</a></td></tr>
            <tr><th>{t('receivedAt')}</th><td>{fmtDateTime(o.firstSeenAt, lang)}</td></tr>
            <tr><th>{t('verifiedAt')}</th><td>{fmtDateTime(o.lastVerifiedAt, lang)}</td></tr>
            <tr><th>{t('product')}</th><td>{o.commodityName} · {categoryLabel(o.category, lang)}</td></tr>
          </tbody>
        </table>
        <div className="row wrap">
          {o.lat != null && <Link className="btn small secondary" to={`/dia?to=${o.lat},${o.lon}&name=${encodeURIComponent(o.marketName)}`}><Icon name="route" size={16} /> {t('itinerary')}</Link>}
          <Link className="btn small secondary" to={`/kajy?buy=${o.price}&c=${encodeURIComponent(code)}&unit=${encodeURIComponent(o.unit)}`}><Icon name="calc" size={16} /> {t('simulate')}</Link>
          <Link className="btn small ghost" to={`/vidiny?c=${encodeURIComponent(code)}&unit=${encodeURIComponent(o.unit)}&pt=${encodeURIComponent(o.priceType)}`}><Icon name="chart" size={16} /> {t('qCompare')}</Link>
        </div>
      </div>

      <CommodityEnrichment commodityName={o.commodityName} market={o.marketName} />

      <div className="card stack">
        <h2>{t('byQuantity')}</h2>
        <table className="table">
          <tbody>
            {(o.unit === 'kg' ? [1, 10, 50] : o.unit === 'L' ? [1, 5, 20] : [1, 10]).map((q) => (
              <tr key={q}><td>{q} {unitLabel(o.unit, lang)}</td><td className="num" style={{ textAlign: 'right' }}><b>{fmtAr(o.price * q)}</b> <span className="badge b-estimated">{t('stEstimated')}</span></td></tr>
            ))}
            {wholesale && (
              <tr><td>{t('wholesaleHere')} <div><small>{fmtPeriod(wholesale.latest.periodStart, wholesale.latest.periodEnd, lang)}</small></div></td>
                <td className="num" style={{ textAlign: 'right' }}><b>{fmtAr(wholesale.latest.price)}</b> / {unitLabel(wholesale.latest.unit, lang)} <StatusBadge status={fresh(wholesale.latest)} /></td></tr>
            )}
          </tbody>
        </table>
        <small>{t('qtyNote')}</small>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2>{t('history')}</h2>
          <div className="chips">
            {([12, 36, 0] as const).map((r) => (
              <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r === 0 ? '∞' : r === 12 ? (lang === 'mg' ? '12 volana' : '12 mois') : (lang === 'mg' ? '3 taona' : '3 ans')}</button>
            ))}
          </div>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="d" tickFormatter={(d: string) => `${MONTHS_SHORT[lang][Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={24} />
              <YAxis tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: number) => [fmtAr(v), unitLabel(o.unit, lang)]} labelFormatter={(d: string) => fmtMonth(d, lang)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }} />
              <Line type="monotone" dataKey="price" stroke="var(--orange)" strokeWidth={2.5} dot={chart.length < 30} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <small>{series.points.length} {lang === 'mg' ? 'fanangonana' : 'relevés'} · {fmtMonth(series.points[0].periodStart, lang)} – {fmtMonth(o.periodStart, lang)}</small>
        {series.points.some((p) => p.revisions?.length) && (
          <details style={{ marginTop: 8 }}>
            <summary>{t('revisions')}</summary>
            <ul>
              {series.points.filter((p) => p.revisions?.length).map((p) => (
                <li key={p.id}>{fmtMonth(p.periodStart, lang)} : {p.revisions!.map((r) => fmtAr(r.price)).join(' → ')} → {fmtAr(p.price)}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="card stack">
        <h2>{t('createAlert')}</h2>
        <div className="row wrap">
          <select value={alertKind} onChange={(e) => setAlertKind(e.target.value as PriceAlert['kind'])} style={{ flex: 2, minWidth: 140 }}>
            <option value="drop">{t('kDrop')}</option>
            <option value="rise">{t('kRise')}</option>
            <option value="below">{t('kBelow')}</option>
            <option value="above">{t('kAbove')}</option>
            <option value="new">{t('kNew')}</option>
          </select>
          {alertKind !== 'new' && <input type="number" inputMode="decimal" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ flex: 1, minWidth: 90 }} aria-label={t('threshold')} />}
          <button className="btn small" onClick={addAlert}><Icon name="bell" size={16} /> {t('add')}</button>
        </div>
        {alertOk && <div className="banner ok"><Icon name="check" /> {t('saved')} — <Link to="/fanairana">{t('myAlerts')}</Link></div>}
      </div>

      {userObs.length > 0 && (
        <div className="card">
          <h2>{t('declaredPrices')}</h2>
          <ul className="list">
            {userObs.map((u) => (
              <li key={u.id} className="row between">
                <div>
                  <div className="row" style={{ gap: 6 }}><StatusBadge status={fresh(u)} /><small>{fmtPeriod(u.periodStart, u.periodEnd, lang)}</small></div>
                  <small>{u.note || '—'}</small>
                </div>
                <div className="price num">{fmtAr(u.price)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section-title"><h2>{t('otherMarkets')}</h2></div>
      <div className="card" style={{ paddingBlock: 0 }}>
        {others.length ? (
          <ul className="list">{others.map((s) => <li key={s.key}><SeriesRow s={s} showCommodity={false} /></li>)}</ul>
        ) : <Empty>{t('noResults')}</Empty>}
      </div>
    </div>
  )
}
