import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader, PlacePicker, useOnline } from '../components/ui'
import { useSettings, type Place } from '../lib/settings'
import { CITIES, externalDirectionsUrl, fetchRoute, type Route } from '../lib/geo'
import { useData } from '../lib/data'
import { haversineKm } from '../lib/stats'
import { fmtAr, fmtNum } from '../lib/format'

type Mode = 'car' | 'taxi' | 'moto' | 'walk'

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(pts, { padding: [24, 24] })
    else if (pts.length === 1) map.setView(pts[0], 14)
  }, [pts, map])
  return null
}

export default function RoutePage() {
  const { t, lang } = useT()
  const s = useSettings()
  const online = useOnline()
  const [params] = useSearchParams()
  const { markets } = useData()
  const toParam = params.get('to')
  const dest: Place | null = toParam ? { name: params.get('name') || '—', lat: Number(toParam.split(',')[0]), lon: Number(toParam.split(',')[1]) } : null
  const [stops, setStops] = useState<Place[]>([])
  const [route, setRoute] = useState<Route | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('car')
  const [costKm, setCostKm] = useState<string>(() => localStorage.getItem('madaprice.costKm') ?? '')
  const [stopSel, setStopSel] = useState('')

  const from = s.place
  const pts = [from, ...stops, dest].filter(Boolean) as Place[]

  useEffect(() => {
    if (!from || !dest || !online) return
    const ac = new AbortController()
    setBusy(true); setErr(''); setRoute(null)
    fetchRoute(pts, ac.signal)
      .then(setRoute)
      .catch((e) => { if (!ac.signal.aborted) setErr((e as Error).message) })
      .finally(() => setBusy(false))
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.lat, from?.lon, toParam, stops.length, online])

  const crowKm = pts.slice(1).reduce((acc, p, i) => acc + haversineKm(pts[i], p), 0) * 1.3
  const km = route?.distanceKm ?? crowKm
  const speeds: Record<Mode, number> = { car: 0, taxi: 0, moto: 0, walk: 4.5 }
  const minutes = mode === 'walk' ? (km / speeds.walk) * 60 : route?.durationMin ?? null
  const cost = Number(costKm) > 0 ? Number(costKm) * km * 2 : null

  const stopOptions: Place[] = [
    ...CITIES,
    ...markets.filter((m) => m.lat != null).map((m) => ({ name: m.name, lat: m.lat!, lon: m.lon! })),
  ]

  return (
    <div className="stack">
      <PageHeader title={t('routeTitle')} />
      <div className="card stack">
        <div><small>{t('from')}</small><div style={{ fontWeight: 700 }}>{from ? from.name : '—'}</div></div>
        {!from && <><div className="banner warn">{t('needStart')}</div><PlacePicker /></>}
        {stops.map((st, i) => (
          <div key={i} className="row between"><span>↳ {st.name}</span><button className="btn small ghost" onClick={() => setStops(stops.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></div>
        ))}
        <div><small>{t('to')}</small><div style={{ fontWeight: 700 }}>{dest ? dest.name : '—'}</div></div>
        <div className="row">
          <select value={stopSel} onChange={(e) => setStopSel(e.target.value)} aria-label={t('addStop')}>
            <option value="">{t('addStop')}…</option>
            {stopOptions.map((o, i) => <option key={i} value={i}>{o.name}</option>)}
          </select>
          <button className="btn small secondary" disabled={stopSel === ''} onClick={() => { setStops([...stops, stopOptions[Number(stopSel)]]); setStopSel('') }}><Icon name="plus" size={16} /></button>
        </div>
      </div>

      {from && dest && (
        <div className="map">
          {online ? (
            <MapContainer center={[dest.lat, dest.lon]} zoom={12} style={{ height: '100%' }}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {pts.map((p, i) => <CircleMarker key={i} center={[p.lat, p.lon]} radius={7} pathOptions={{ color: i === 0 ? '#1b7a49' : '#ef7a1a', fillOpacity: 1 }} />)}
              {route && <Polyline positions={route.geometry} pathOptions={{ color: '#2864b4', weight: 5 }} />}
              <Fit pts={route ? route.geometry : pts.map((p) => [p.lat, p.lon] as [number, number])} />
            </MapContainer>
          ) : <div className="empty">{t('mapUnavailable')}</div>}
        </div>
      )}

      {from && dest && (
        <div className="card stack">
          {busy && <div><span className="spinner" /> {t('loading')}</div>}
          {err && <div className="banner warn">{t('routeUnavailable')} <small>({err})</small></div>}
          <div className="chips">
            {(['car', 'taxi', 'moto', 'walk'] as Mode[]).map((m) => (
              <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
                {{ car: lang === 'mg' ? 'Fiara' : 'Voiture', taxi: 'Taxi', moto: 'Moto', walk: lang === 'mg' ? 'An-tongotra' : 'À pied' }[m]}
              </button>
            ))}
          </div>
          <div className="grid2">
            <div className="kpi"><div className="v num">{fmtNum(km, 1)} km</div><div className="l">{route ? `${t('distance')} · ${route.provider}` : t('crowDist')}</div></div>
            <div className="kpi"><div className="v num">{minutes != null ? `${fmtNum(minutes)} min` : '—'}</div><div className="l">{t('duration')}{mode === 'walk' ? ` (4,5 km/h, ${t('stEstimated').toLowerCase()})` : mode !== 'car' ? ` (${lang === 'mg' ? 'fiara' : 'voiture'})` : ''}</div></div>
          </div>
          <label className="field"><span>{t('costPerKm')}</span>
            <input type="number" inputMode="decimal" min={0} value={costKm} onChange={(e) => { setCostKm(e.target.value); try { localStorage.setItem('madaprice.costKm', e.target.value) } catch { /* */ } }} placeholder="Ar / km" />
          </label>
          {cost != null && <div className="row between"><span>{t('tripCost')}</span><span className="price num">{fmtAr(cost)}</span></div>}
          <small>{t('routeNote')}</small>
          <a className="btn secondary" href={externalDirectionsUrl(dest, from)} target="_blank" rel="noreferrer"><Icon name="map" size={18} /> {t('openExternal')}</a>
        </div>
      )}
    </div>
  )
}
