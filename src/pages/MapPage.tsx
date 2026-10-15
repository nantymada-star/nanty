import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge, useOnline } from '../components/ui'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { fetchShops, isOpenNow } from '../lib/geo'
import { db, type Shop } from '../lib/db'
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

/** Groupes de couleur de la maquette : supermarché, marché, petite boutique, grossiste, autre. */
export const SHOP_GROUPS = [
  { key: 'supermarket', color: '#2864b4', kinds: ['shop=supermarket'], label: ['Supermarché', 'Supermarché'] },
  { key: 'market', color: '#cf3f37', kinds: ['amenity=marketplace'], label: ['Tsena', 'Marché'] },
  { key: 'small', color: '#ef7a1a', kinds: ['shop=convenience', 'shop=general', 'shop=grocery'], label: ['Fivarotana kely', 'Boutique'] },
  { key: 'wholesale', color: '#1b7a49', kinds: ['shop=wholesale'], label: ['Ambongadiny', 'Grossiste'] },
  { key: 'other', color: '#6b7a71', kinds: [], label: ['Hafa', 'Autre'] },
] as const
export function shopGroup(kind: string, tags?: Record<string, string>) {
  if (tags?.wholesale === 'yes' && kind !== 'shop=supermarket') return SHOP_GROUPS[3]
  return SHOP_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind)) ?? SHOP_GROUPS[4]
}

export function shopKindLabel(kind: string, lang: 'mg' | 'fr') {
  const v = kind.split('=')[1] ?? kind
  const l = OSM_KIND_LABEL[v]
  return l ? (lang === 'mg' ? l[0] : l[1]) : v
}

export default function MapPage() {
  const { t, lang } = useT()
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
  const [hidden, setHidden] = useState<string[]>([])
  const [sel, setSel] = useState<Shop | null>(null)
  const selPrices = useLiveQuery(() => (sel ? db.shopPrices.where('shopId').equals(sel.id).reverse().sortBy('declaredAt') : []), [sel?.id]) ?? []

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
    .filter((x) => !hidden.includes(shopGroup(x.sh.kind, x.sh.tags).key))
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
            {listed.map(({ sh }) => {
              const g = shopGroup(sh.kind, sh.tags)
              const on = sel?.id === sh.id
              return (
                <CircleMarker key={sh.id} center={[sh.lat, sh.lon]} radius={on ? 10 : 7} pathOptions={{ color: '#ffffff', fillColor: g.color, fillOpacity: 1, weight: on ? 3 : 2 }}
                  eventHandlers={{ click: () => setSel(sh) }} />
              )
            })}
          </MapContainer>
        ) : (
          <Empty icon="wifiOff">{t('mapUnavailable')}</Empty>
        )}
      </div>
      {sel && (() => {
        const g = shopGroup(sel.kind, sel.tags)
        const open = isOpenNow(sel.tags.opening_hours)
        return (
          <div className="card stack" style={{ borderLeft: `5px solid ${g.color}` }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <b>{sel.name || shopKindLabel(sel.kind, lang)}</b>
                <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                  <span className="badge" style={{ background: g.color, color: '#fff' }}>{shopKindLabel(sel.kind, lang)}</span>
                  <span className="muted">{fmtNum(haversineKm(s.place ?? center, sel), 1)} km</span>
                  {open === true && <span className="badge b-verified">{t('openNow')}</span>}
                  {open === false && <span className="badge b-suspect">{t('closedNow')}</span>}
                </div>
              </div>
              <button className="btn small ghost" onClick={() => setSel(null)} aria-label={t('close')}><Icon name="x" size={14} /></button>
            </div>
            {selPrices.slice(0, 2).map((p) => (
              <div key={p.id} className="row between" style={{ fontSize: 14 }}>
                <span>{p.product} <small>/ {p.unit}</small> <StatusBadge status="declared" /></span>
                <b className="price num" style={{ fontSize: 16 }}>{fmtAr(p.price)}</b>
              </div>
            ))}
            {selPrices.length === 0 && <small>{t('noShopPrice')}</small>}
            <div className="grid2">
              <Link className="btn small" to={`/fivarotana/${sel.id}`}><Icon name="store" size={16} /> {t('seeShop')}</Link>
              <Link className="btn small secondary" to={`/dia?to=${sel.lat},${sel.lon}&name=${encodeURIComponent(sel.name || '')}`}><Icon name="route" size={16} /> {t('itinerary')}</Link>
            </div>
          </div>
        )
      })()}
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
        <div className="chips" role="group" aria-label={t('legend')}>
          {SHOP_GROUPS.map((g) => {
            const off = hidden.includes(g.key)
            return (
              <button key={g.key} className="chip" aria-pressed={!off} style={{ opacity: off ? 0.45 : 1 }} onClick={() => setHidden(off ? hidden.filter((x) => x !== g.key) : [...hidden, g.key])}>
                <span className="dot" style={{ background: g.color }} /> {g.label[lang === 'mg' ? 0 : 1]}
              </button>
            )
          })}
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
                  <span className="tile" style={{ minHeight: 0, padding: 8, border: 0, color: shopGroup(sh.kind, sh.tags).color }}><Icon name="store" /></span>
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
