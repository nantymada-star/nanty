import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
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
  const tiles: [string, string, Parameters<typeof t>[0]][] = [
    ['/vidiny', 'chart', 'qCompare'],
    ['/faritra', 'truck', 'qRegions'],
    ['/sarintany', 'store', 'qShops'],
    ['/vanim-potoana', 'calendar', 'qSeasons'],
    ['/kajy', 'calc', 'qSim'],
    ['/hanome-vidiny', 'edit', 'qSubmit'],
    ['/mpivarotra', 'store', 'qMerchant'],
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
        <div className="row between" style={{ fontSize: 14 }}>
          <span className="row" style={{ gap: 6 }}><Icon name="pin" size={16} /> {s.place ? s.place.name : t('allTowns')}</span>
          <button className="btn small ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} onClick={() => setPicking(!picking)}>{t('changeTown')}</button>
        </div>
        {picking && <div className="card" style={{ color: 'var(--fg)' }}><PlacePicker onPicked={() => setPicking(false)} /></div>}
      </div>

      <SyncStatus />

      <div className="grid3 fixed">
        <KPI v={fmtNum(markets.length)} l={t('markets')} />
        <KPI v={fmtNum(commodities.length)} l={t('products')} />
        <KPI v={fmtNum(observations.length)} l={t('observations')} />
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
