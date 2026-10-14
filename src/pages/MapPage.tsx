import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, useOnline } from '../components/ui'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { fetchShops, isOpenNow } from '../lib/geo'
import type { Shop } from '../lib/db'
import { commodityLabel, OSM_KIND_LABEL, osmKindsForQuery, unitLabel } from '../lib/commodities'
import { fmtAr, fmtMonth, fmtNum } from '../lib/format'
import { haversineKm } from '../lib/stats'

const MG_CENTER: [number, number] = [-19.3, 46.9]

function CenterTracker({ onMove }: { onMove: (c: { lat: number; lon: number }, z: number) => void }) {
  const map = useMapEvents({ moveend: () => { const c = map.getCenter(); onMove({ lat: c.lat, lon: c.lng }, map.getZoom()) } })
  return null
}
function FlyTo({ to }: { to: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (to) map.setView(to, Math.max(map.getZoom(), 13))
  }, [to, map])
  return null
}

export function shopKindLabel(kind: string, lang: 'mg' | 'fr') {
  const v = kind.split('=')[1] ?? kind
  const l = OSM_KIND_LABEL[v]
  return l ? (lang === 'mg' ? l[0] : l[1]) : v
}

export default function MapPage() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const s = useSettings()
  const online = useOnline()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { markets, seriesList } = useData()
  const start: [number, number] = s.place ? [s.place.lat, s.place.lon] : MG_CENTER
  const [center, setCenter] = useState({ lat: start[0], lon: start[1] })
  const [zoom, setZoom] = useState(s.place ? 13 : 6)
  const [radius, setRadius] = useState(3000)
  const [shops, setShops] = useState<Shop[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fly, setFly] = useState<[number, number] | null>(null)
  const [showMarkets, setShowMarkets] = useState(true)
  const [onlyOpen, setOnlyOpen] = useState(false)

  const latestByMarket = useMemo(() => {
    const m = new Map<string, typeof seriesList>()
    for (const x of seriesList) {
      if (x.latest.priceType !== 'Retail') continue
      const a = m.get(x.latest.marketCode) ?? []
      a.push(x)
      m.set(x.latest.marketCode, a)
    }
    return m
  }, [seriesList])

  const load = async () => {
    setBusy(true); setErr('')
    try {
      setShops(await fetchShops(center, radius, osmKindsForQuery(q)))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const listed = shops
    .map((sh) => ({ sh, d: haversineKm(center, sh), open: isOpenNow(sh.tags.opening_hours) }))
    .filter((x) => !onlyOpen || x.open === true)
    .sort((a, b) => a.d - b.d)

  return (
    <div className="stack">
      <PageHeader title={t('mapTitle')} back={false} />
      {q && <div className="banner info"><Icon name="search" /> « {q} » — {t('inShops')}</div>}
      <div className="map tall">
        {online ? (
          <MapContainer center={start} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CenterTracker onMove={(c, z) => { setCenter(c); setZoom(z) }} />
            <FlyTo to={fly} />
            {showMarkets && markets.filter((m) => m.lat != null).map((m) => (
              <CircleMarker key={m.code} center={[m.lat!, m.lon!]} radius={8} pathOptions={{ color: '#0d5434', fillColor: '#ef7a1a', fillOpacity: 0.9, weight: 2 }}>
                <Popup>
                  <b>{m.name}</b><br /><small>{m.admin2}{m.admin1 ? `, ${m.admin1}` : ''} · WFP</small>
                  <ul style={{ paddingLeft: 16, margin: '6px 0' }}>
                    {(latestByMarket.get(m.code) ?? []).slice(0, 6).map((x) => (
                      <li key={x.key}>{commodityLabel(x.latest.commodityName, lang)} : <b>{fmtAr(x.latest.price)}</b>/{unitLabel(x.latest.unit, lang)} <small>({fmtMonth(x.latest.periodStart, lang)})</small></li>
                    ))}
                  </ul>
                  <Link to={`/dia?to=${m.lat},${m.lon}&name=${encodeURIComponent(m.name)}`}>{t('itinerary')}</Link>
                </Popup>
              </CircleMarker>
            ))}
            {shops.map((sh) => (
              <CircleMarker key={sh.id} center={[sh.lat, sh.lon]} radius={6} pathOptions={{ color: '#1b7a49', fillColor: '#ffffff', fillOpacity: 1, weight: 3 }}
                eventHandlers={{ click: () => nav(`/fivarotana/${sh.id}`) }}>
                <Popup>{sh.name || shopKindLabel(sh.kind, lang)}</Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        ) : (
          <Empty icon="wifiOff">{t('mapUnavailable')}</Empty>
        )}
      </div>
      <div className="card stack">
        <div className="row wrap">
          <label className="field" style={{ flex: 1, minWidth: 120 }}><span>{t('radius')}</span>
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {[1000, 3000, 5000, 10000].map((r) => <option key={r} value={r}>{r / 1000} km</option>)}
            </select>
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={load} disabled={busy || !online || zoom < 10}>
            {busy ? <span className="spinner" /> : <Icon name="store" size={18} />} {t('loadShops')}
          </button>
          {s.place && <button className="btn ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setFly([s.place!.lat, s.place!.lon])}><Icon name="gps" size={18} /></button>}
        </div>
        {zoom < 10 && <small>{lang === 'mg' ? 'Atonony kokoa ny sarintany (zoom) vao mitady fivarotana.' : 'Zoomez davantage pour chercher des commerces.'}</small>}
        <div className="chips">
          <button className={`chip ${showMarkets ? 'on' : ''}`} onClick={() => setShowMarkets(!showMarkets)}><span className="dot" style={{ background: 'var(--orange)' }} /> {t('wfpMarkets')}</button>
          <button className={`chip ${onlyOpen ? 'on' : ''}`} onClick={() => setOnlyOpen(!onlyOpen)}>{t('openNow')}</button>
        </div>
        {err && <div className="banner err"><Icon name="x" /> {t('error')} : {err} <button className="btn small" onClick={load}>{t('retry')}</button></div>}
        <small>{t('osmData')}</small>
      </div>

      {shops.length > 0 && (
        <div className="card" style={{ paddingBlock: 0 }}>
          <div style={{ padding: '10px 0 0' }}><b>{listed.length}</b> {t('shopsFound')}</div>
          <ul className="list">
            {listed.slice(0, 150).map(({ sh, d, open }) => (
              <li key={sh.id}>
                <Link className="rowlink" to={`/fivarotana/${sh.id}`}>
                  <span className="tile" style={{ minHeight: 0, padding: 8, border: 0 }}><Icon name="store" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{sh.name || <i className="muted">{shopKindLabel(sh.kind, lang)}</i>}</div>
                    <small>{shopKindLabel(sh.kind, lang)} · {fmtNum(d, 1)} km{open === true ? ` · ${t('openNow')}` : open === false ? ` · ${t('closedNow')}` : ''}</small>
                  </div>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
