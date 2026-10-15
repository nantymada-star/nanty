import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { FxStrip } from '../components/Enrichment'
import { Empty, KPI, PlacePicker, SeriesRow, SyncStatus } from '../components/ui'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { haversineKm } from '../lib/stats'
import { fmtNum } from '../lib/format'

export default function Home() {
  const { t } = useT()
  const nav = useNavigate()
  const s = useSettings()
  const { seriesList, markets, commodities, observations, ready } = useData()
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)

  const recent = useMemo(() => {
    const place = s.place
    const withDist = seriesList
      .filter((x) => x.latest.priceType === 'Retail')
      .map((x) => ({
        x,
        d: place && x.latest.lat != null ? haversineKm(place, { lat: x.latest.lat, lon: x.latest.lon! }) : 0,
      }))
    // le plus récent d'abord, puis le plus proche
    withDist.sort((a, b) => b.x.latest.periodStart.slice(0, 7).localeCompare(a.x.latest.periodStart.slice(0, 7)) || a.d - b.d)
    if (place) {
      const nearest = withDist.length ? Math.min(...withDist.map((w) => w.d)) : 0
      return withDist.filter((w) => w.d <= Math.max(60, nearest + 30)).slice(0, 8)
    }
    return withDist.slice(0, 8)
  }, [seriesList, s.place])

  const nowMs = Date.now()
  // Les 8 catégories de la maquette. Sans prix WFP (matériaux, intrants agricoles), on cherche dans les commerces OSM.
  const cats: [string, string, Parameters<typeof t>[0], string, string][] = [
    ['/vidiny?cat=' + encodeURIComponent('cereals and tubers'), 'leaf', 'catCereals', 'var(--orange-soft)', 'var(--orange)'],
    ['/sarintany?q=' + encodeURIComponent('ciment'), 'layers', 'catBuild', 'var(--blue-soft)', 'var(--blue)'],
    ['/sarintany?q=' + encodeURIComponent('zezika'), 'leaf', 'catFarm', 'var(--leaf)', 'var(--green2)'],
    ['/vidiny?cat=' + encodeURIComponent('meat, fish and eggs'), 'store', 'catLivestock', 'var(--blue-soft)', 'var(--blue)'],
    ['/vidiny?cat=' + encodeURIComponent('miscellaneous food,oil and fats,pulses and nuts,vegetables and fruits'), 'store', 'catDaily', 'var(--orange-soft)', 'var(--orange)'],
    ['/kajy', 'calc', 'qSim', 'var(--leaf)', 'var(--green2)'],
    ['/sarintany', 'map', 'qShops', 'var(--orange-soft)', 'var(--orange)'],
    ['/vanim-potoana', 'calendar', 'qSeasons', 'var(--leaf)', 'var(--green2)'],
  ]
  const tiles: [string, string, Parameters<typeof t>[0]][] = [
    ['/vidiny', 'chart', 'qCompare'],
    ['/faritra', 'truck', 'qRegions'],
    ['/vidiny?cat=non-food', 'truck', 'catFuel'],
    ['/fanairana', 'bell', 'navAlerts'],
    ['/hanome-vidiny', 'edit', 'qSubmit'],
    ['/mpivarotra', 'store', 'qMerchant'],
    ['/tantarako', 'refresh', 'historyTitle'],
    ['/fanampiny', 'globe', 'enrichTitle'],
    ['/admin', 'settings', 'qAdmin'],
  ]

  return (
    <div className="stack">
      <div className="hero stack">
        <div>
          <h1 style={{ color: '#fff' }}>{t('tagline')}</h1>
          <small>{t('motto')}</small>
        </div>
        <form className="search" onSubmit={(e) => { e.preventDefault(); nav(`/hitady?q=${encodeURIComponent(q)}`) }}>
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} aria-label={t('searchPh')} style={{ color: 'var(--fg)' }} />
          <Link to="/hitady?voice=1" className="btn small secondary" aria-label={t('voice')}><Icon name="mic" size={16} /></Link>
        </form>
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{t('heroText')}</span>
          <Link className="btn small orange" to="/sarintany"><Icon name="map" size={16} /> {t('seeMap')}</Link>
        </div>
        <div className="row between" style={{ fontSize: 14 }}>
          <span className="row" style={{ gap: 6 }}><Icon name="pin" size={16} /> {s.place ? s.place.name : t('allTowns')}</span>
          <button className="btn small ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} onClick={() => setPicking(!picking)}>{t('changeTown')}</button>
        </div>
        {picking && <div className="card" style={{ color: 'var(--fg)' }}><PlacePicker onPicked={() => setPicking(false)} /></div>}
      </div>

      <SyncStatus />

      <FxStrip />

      <div className="grid3 fixed">
        <KPI v={fmtNum(markets.length)} l={t('markets')} />
        <KPI v={fmtNum(commodities.length)} l={t('products')} />
        <KPI v={fmtNum(observations.length)} l={t('observations')} />
      </div>

      <div className="section-title"><h2>{t('categories')}</h2></div>
      <div className="grid4">
        {cats.map(([to, ic, k, bg, fg]) => (
          <Link key={k} to={to} className="tile cat-tile"><span className="ic" style={{ background: bg, color: fg }}><Icon name={ic} /></span>{t(k)}</Link>
        ))}
      </div>

      <div className="section-title"><h2>{t('quick')}</h2></div>
      <div className="grid4">
        {tiles.map(([to, ic, k]) => (
          <Link key={to} to={to} className="tile"><span className="ic"><Icon name={ic} /></span>{t(k)}</Link>
        ))}
      </div>

      <div className="section-title">
        <h2>{t('recentPrices')}</h2>
        <Link to="/vidiny">{t('seeAll')}</Link>
      </div>
      <div className="card" style={{ paddingBlock: 0 }}>
        {!ready ? (
          <div className="empty"><span className="spinner" /> {t('loading')}</div>
        ) : recent.length === 0 ? (
          <Empty icon="chart">{observations.length ? t('noPriceHere') : t('noData')}</Empty>
        ) : (
          <ul className="list">
            {recent.map(({ x }) => (
              <li key={x.key}><SeriesRow s={x} highlight={nowMs - Date.parse(x.latest.firstSeenAt) < 10 * 60000} /></li>
            ))}
          </ul>
        )}
      </div>
      <small>{t('demoNone')} {t('source')} : World Food Programme (WFP) via HDX HAPI — OCHA.</small>
    </div>
  )
}
