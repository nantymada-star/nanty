import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { Empty, PageHeader, SeriesRow, SyncStatus, useFreshness } from '../components/ui'
import { useData } from '../lib/data'
import { CommodityEnrichment } from '../components/Enrichment'
import { OnlineForCommodity } from '../components/Online'
import { OdrForCommodity } from '../components/Odr'
import { useSettings } from '../lib/settings'
import { haversineKm, summarize } from '../lib/stats'
import { categoryLabel, commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAr, fmtNum } from '../lib/format'

type Sort = 'cheap' | 'expensive' | 'profit' | 'rising' | 'falling' | 'recent' | 'near'

export default function Compare() {
  const { t, lang } = useT()
  const s = useSettings()
  const fresh = useFreshness()
  const { commodities, seriesList, regions } = useData()
  const [params, setParams] = useSearchParams()
  // ?cat= : une ou plusieurs catégories WFP séparées par des virgules (catégories de l'accueil)
  const cats = (params.get('cat') ?? '').split(',').filter(Boolean)
  const shown = cats.length ? commodities.filter((c) => cats.includes(c.category)) : commodities
  const code = params.get('c') ?? shown[0]?.code ?? ''
  const com = commodities.find((c) => c.code === code)
  const unit = params.get('unit') ?? com?.units[0] ?? ''
  const pt = params.get('pt') ?? (com?.priceTypes.includes('Retail') ? 'Retail' : com?.priceTypes[0]) ?? ''
  const [region, setRegion] = useState('')
  const [sort, setSort] = useState<Sort>(s.place ? 'near' : 'cheap')
  const [onlyFresh, setOnlyFresh] = useState(false)

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    p.set(k, v)
    if (k === 'c') { p.delete('unit'); p.delete('pt') }
    if (k === 'cat') { p.delete('c'); p.delete('unit'); p.delete('pt'); if (!v) p.delete('cat') }
    setParams(p, { replace: true })
  }

  const rows = useMemo(() => {
    let list = seriesList.filter((x) => x.latest.commodityCode === code && x.latest.unit === unit && x.latest.priceType === pt)
    if (region) list = list.filter((x) => x.latest.admin1 === region)
    if (onlyFresh) list = list.filter((x) => fresh(x.latest) === 'verified')
    const dist = (x: (typeof list)[number]) =>
      s.place && x.latest.lat != null ? haversineKm(s.place, { lat: x.latest.lat, lon: x.latest.lon! }) : Infinity
    const sorters: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      cheap: (a, b) => a.latest.price - b.latest.price,
      // Plus rentable pour revendre : écart le plus grand avec le marché le moins cher (avant transport)
      profit: (a, b) => b.latest.price - a.latest.price,
      expensive: (a, b) => b.latest.price - a.latest.price,
      rising: (a, b) => (b.change1 ?? -1e9) - (a.change1 ?? -1e9),
      falling: (a, b) => (a.change1 ?? 1e9) - (b.change1 ?? 1e9),
      recent: (a, b) => b.latest.periodStart.localeCompare(a.latest.periodStart),
      near: (a, b) => dist(a) - dist(b),
    }
    return [...list].sort(sorters[sort]).map((x) => ({ x, d: dist(x) }))
  }, [seriesList, code, unit, pt, region, onlyFresh, sort, s.place, fresh])

  const sum = summarize(rows.map((r) => r.x))
  const minPrice = sum?.min ?? 0
  const sorts: [Sort, Parameters<typeof t>[0]][] = [
    ['cheap', 'sortCheap'], ['profit', 'sortProfit'], ['expensive', 'sortExpensive'], ['rising', 'sortRising'], ['falling', 'sortFalling'], ['recent', 'sortRecent'],
    ...(s.place ? ([['near', 'sortNear']] as [Sort, Parameters<typeof t>[0]][]) : []),
  ]

  return (
    <div className="stack">
      <PageHeader title={t('compareTitle')} />
      <SyncStatus compact />
      <div className="card stack">
        <label className="field"><span>{t('categories')}</span>
          <select value={cats.join(',')} onChange={(e) => set('cat', e.target.value)}>
            <option value="">{t('allProducts')}</option>
            {cats.length > 1 && <option value={cats.join(',')}>{cats.map((c) => categoryLabel(c, lang)).join(', ')}</option>}
            {[...new Set(commodities.map((c) => c.category))].map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
        </label>
        {shown.length === 0 && commodities.length > 0 && (
          <div className="banner warn">{t('noPriceCat')} <Link className="btn small" to="/sarintany">{t('qShops')}</Link></div>
        )}
        <label className="field"><span>{t('product')}</span>
          <select value={code} onChange={(e) => set('c', e.target.value)}>
            {Object.entries(groupBy(shown, (c) => c.category)).map(([cat, list]) => (
              <optgroup key={cat} label={categoryLabel(cat, lang)}>
                {list.map((c) => <option key={c.code} value={c.code}>{commodityLabel(c.name, lang)} ({c.markets} {t('markets')})</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="grid3">
          <label className="field"><span>{t('unit')}</span>
            <select value={unit} onChange={(e) => set('unit', e.target.value)}>
              {com?.units.map((u) => <option key={u} value={u}>{unitLabel(u, lang)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('priceType')}</span>
            <select value={pt} onChange={(e) => set('pt', e.target.value)}>
              {com?.priceTypes.map((p) => <option key={p} value={p}>{priceTypeLabel(p, lang)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('region')}</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">{t('allRegions')}</option>
              {regions.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <div className="chips" role="group">
          {sorts.map(([k, l]) => <button key={k} className={`chip ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{t(l)}</button>)}
          <button className={`chip ${onlyFresh ? 'on' : ''}`} onClick={() => setOnlyFresh(!onlyFresh)}>{t('onlyFresh')}</button>
        </div>
      </div>

      {sum && (
        <div className="grid3 fixed">
          <div className="kpi"><div className="v num down">{fmtAr(sum.min)}</div><div className="l">{t('min')}</div></div>
          <div className="kpi"><div className="v num">{fmtAr(sum.median)}</div><div className="l">{t('median')} · {sum.n} {t('markets')}</div></div>
          <div className="kpi"><div className="v num up">{fmtAr(sum.max)}</div><div className="l">{t('max')}</div></div>
        </div>
      )}
      <small>{t('comparableNote')}</small>
      {com && <CommodityEnrichment commodityName={com.name} />}
      {com && <OdrForCommodity code={com.code} region={region || undefined} />}
      {com && <OnlineForCommodity code={com.code} />}
      {sort === 'profit' && <div className="banner info">{t('gapHelp')} <Link className="btn small" to="/faritra">{t('qRegions')}</Link></div>}

      <div className="card" style={{ paddingBlock: 0 }}>
        {rows.length === 0 ? (
          <Empty icon="chart">{t('noData')}</Empty>
        ) : (
          <ul className="list">
            {rows.map(({ x, d }) => (
              <li key={x.key}>
                <SeriesRow s={x} showCommodity={false} extra={
                  <small>
                    {Number.isFinite(d) ? `${fmtNum(d)} km` : ''}
                    {sort === 'profit' && minPrice > 0 && x.latest.price > minPrice && <b className="down">{Number.isFinite(d) ? ' · ' : ''}+{fmtAr(x.latest.price - minPrice)} {t('gapLabel')}</b>}
                  </small>
                } />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function groupBy<T>(xs: T[], f: (x: T) => string) {
  const o: Record<string, T[]> = {}
  for (const x of xs) (o[f(x)] ??= []).push(x)
  return o
}
