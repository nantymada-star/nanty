import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { Thumb } from './Thumb'
import type { Observation } from '../lib/db'
import { db, getKV } from '../lib/db'
import { freshnessOf, type Freshness, type Series } from '../lib/stats'
import { getSettings, updateSettings, useSettings, type Place } from '../lib/settings'
import { commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAgo, fmtAr, fmtDateTime, fmtPct, fmtPeriod } from '../lib/format'
import { CITIES, geocode } from '../lib/geo'
import { SOURCE_WFP, syncWfp, useSyncState } from '../lib/sync'
import { useData } from '../lib/data'

export function PageHeader({ title, right, back = true }: { title: string; right?: ReactNode; back?: boolean }) {
  const nav = useNavigate()
  const { t } = useT()
  return (
    <div className="row between" style={{ marginBottom: 12 }}>
      <div className="row" style={{ minWidth: 0 }}>
        {back && (
          <button className="btn ghost small" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label={t('back')}>
            <Icon name="back" size={18} />
          </button>
        )}
        <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function StatusBadge({ status }: { status: Freshness }) {
  const { t } = useT()
  const map: Record<Freshness, [string, Parameters<typeof t>[0], Parameters<typeof t>[0]]> = {
    verified: ['b-verified', 'stVerified', 'stVerifiedHelp'],
    declared: ['b-declared', 'stDeclared', 'stDeclaredHelp'],
    estimated: ['b-estimated', 'stEstimated', 'stEstimatedHelp'],
    stale: ['b-stale', 'stStale', 'stStaleHelp'],
    pending: ['b-pending', 'stPending', 'stDeclaredHelp'],
  }
  const [cls, label, help] = map[status]
  return (
    <span className={`badge ${cls}`} title={t(help)}>
      {status === 'verified' && <Icon name="check" size={12} stroke={3} />}
      {t(label)}
    </span>
  )
}

export function useFreshness() {
  const s = useSettings()
  return (o: Observation) => freshnessOf(o, s.staleDays)
}

export function Change({ v }: { v: number | null }) {
  if (v == null) return <span className="muted">—</span>
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'muted'
  return <span className={`num ${cls}`} style={{ fontWeight: 700 }}>{v > 0.05 ? '▲' : v < -0.05 ? '▼' : '='} {fmtPct(v)}</span>
}

/** Ligne de prix : produit, marché, prix, unité, statut, période réelle, source. */
export function SeriesRow({ s, showCommodity = true, extra, highlight }: { s: Series; showCommodity?: boolean; extra?: ReactNode; highlight?: boolean }) {
  const { t, lang } = useT()
  const fr = useFreshness()
  const o = s.latest
  return (
    <Link className={`rowlink${highlight ? ' new-flash' : ''}`} to={`/vokatra/${encodeURIComponent(o.commodityCode)}?market=${encodeURIComponent(o.marketCode)}&unit=${encodeURIComponent(o.unit)}&pt=${encodeURIComponent(o.priceType)}`}>
      <Thumb category={o.category} name={o.commodityName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>
          {showCommodity ? commodityLabel(o.commodityName, lang) : o.marketName}
          {showCommodity && <span className="muted" style={{ fontWeight: 500 }}> · {o.marketName}</span>}
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 3, fontSize: 12.5 }}>
          <StatusBadge status={fr(o)} />
          <span className="muted">{priceTypeLabel(o.priceType, lang)}</span>
          <span className="muted">· {fmtPeriod(o.periodStart, o.periodEnd, lang)}</span>
          {!showCommodity && o.admin1 && <span className="muted">· {o.admin1}</span>}
        </div>
        {extra}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="price num">{fmtAr(o.price)}</div>
        <div style={{ fontSize: 12 }} className="muted">/ {unitLabel(o.unit, lang)}</div>
        <div style={{ fontSize: 12 }}><Change v={s.change1} /></div>
      </div>
      <span className="sr-only">{t('source')}: WFP</span>
    </Link>
  )
}

export function Empty({ children, icon = 'search' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div style={{ opacity: 0.5, marginBottom: 6 }}><Icon name={icon} size={32} /></div>
      {children}
    </div>
  )
}

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}

/** Bandeau d'état : hors ligne, source non configurée, synchronisation, dernière mise à jour. */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useT()
  const st = useSyncState()
  const s = useSettings()
  const online = useOnline()
  const { newestPeriod } = useData()
  const lastSuccess = useLiveQuery(() => getKV<string | null>('lastSuccess:' + SOURCE_WFP, null), [st.running])
  const lastRun = useLiveQuery(() => db.syncRuns.orderBy('id').last(), [st.running])
  const [, tick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="stack">
      {!online && (
        <div className="banner warn"><Icon name="wifiOff" /> <div>{t('offline')}{lastSuccess ? ` · ${t('cachedFrom')} ${fmtDateTime(lastSuccess, lang)}` : ''}</div></div>
      )}
      {!s.appId && s.dataSource === 'hapi' && (
        <div className="banner warn">
          <Icon name="settings" />
          <div style={{ flex: 1 }}>{t('noAppId')}</div>
          <Link className="btn small orange" to="/admin">{t('configure')}</Link>
        </div>
      )}
      {lastRun?.status === 'error' && !st.running && (
        <div className="banner err">
          <Icon name="x" />
          <div style={{ flex: 1 }}>
            <b>{t('syncErr')}</b> — <small>{lastRun.error}</small>
          </div>
          <button className="btn small" onClick={() => syncWfp('manual')} disabled={!online}>{t('retry')}</button>
        </div>
      )}
      <div className={`row between ${compact ? '' : 'card'}`} style={{ fontSize: 13, padding: compact ? 0 : '10px 12px' }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <span className="dot" style={{ background: st.running ? 'var(--orange)' : lastSuccess ? 'var(--green2)' : 'var(--muted)' }} />
          <div style={{ minWidth: 0 }}>
            {st.running ? (
              <span>{t('syncing')} {st.progress ? `${st.progress} ${t('rows')}` : ''}</span>
            ) : lastSuccess ? (
              <span>{t('lastSync')} : <b>{fmtAgo(lastSuccess, lang)}</b> <small>({fmtDateTime(lastSuccess, lang)})</small></span>
            ) : (
              <span>{t('neverSynced')}</span>
            )}
            {newestPeriod && <div className="muted" style={{ fontSize: 12 }}>{t('lastObs')} : {fmtPeriod(newestPeriod, newestPeriod, lang)} · WFP / HDX HAPI</div>}
          </div>
        </div>
        <button className="btn small secondary" onClick={() => syncWfp('manual')} disabled={st.running || !online || (!s.appId && s.dataSource === 'hapi')} aria-label={t('syncNow')}>
          {st.running ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
        </button>
      </div>
      {!compact && <small>{t('liveNote', { n: s.autoSyncMinutes })}</small>}
    </div>
  )
}

/** Sélection d'une localité sans géolocalisation (villes, marchés WFP, recherche OSM) ou avec GPS (consentement). */
export function PlacePicker({ onPicked, dark = false }: { onPicked?: (p: Place | null) => void; dark?: boolean }) {
  const { t } = useT()
  const s = useSettings()
  const { markets } = useData()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const choose = (p: Place | null) => {
    updateSettings({ place: p })
    onPicked?.(p)
  }
  const options: Place[] = [
    ...CITIES,
    ...markets.filter((m) => m.lat != null && !CITIES.some((c) => c.name.toLowerCase() === m.name.toLowerCase()))
      .map((m) => ({ name: m.name, lat: m.lat!, lon: m.lon!, admin1: m.admin1 })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const search = async () => {
    if (!q.trim()) return
    setBusy(true); setErr('')
    try { setRes(await geocode(q)) } catch (e) { setErr(String((e as Error).message)) } finally { setBusy(false) }
  }
  const gps = () => {
    if (!('geolocation' in navigator)) { setErr('GPS indisponible'); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        updateSettings({ geoConsent: true })
        choose({ name: 'GPS', lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      (e) => { setBusy(false); setErr(e.message) },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    )
  }
  return (
    <div className="stack">
      <select
        aria-label={t('chooseTown')}
        value={s.place ? s.place.name : ''}
        onChange={(e) => choose(options.find((o) => o.name === e.target.value) ?? null)}
      >
        <option value="">{t('allTowns')}</option>
        {s.place && !options.some((o) => o.name === s.place!.name) && <option value={s.place.name}>{s.place.name}</option>}
        {options.map((o) => <option key={o.name + o.lat} value={o.name}>{o.name}{o.admin1 ? ` (${o.admin1})` : ''}</option>)}
      </select>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fokontany, kaominina…" onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn small secondary" onClick={search} disabled={busy}><Icon name="search" size={16} /></button>
      </div>
      {res.length > 0 && (
        <ul className="list card" style={{ padding: '0 12px', color: 'var(--fg)' }}>
          {res.map((r) => (
            <li key={r.name + r.lat}><button className="btn ghost small" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { choose(r); setRes([]) }}>{r.name}</button></li>
          ))}
        </ul>
      )}
      <button className={`btn ${dark ? 'ghost' : 'secondary'}`} onClick={gps} disabled={busy}><Icon name="gps" size={18} /> {t('useGps')}</button>
      {err && <small style={{ color: dark ? '#ffd2cf' : 'var(--red)' }}>{err}</small>}
    </div>
  )
}

export function KPI({ v, l }: { v: ReactNode; l: string }) {
  return <div className="kpi"><div className="v num">{v}</div><div className="l">{l}</div></div>
}

export function useCommodityLabel() {
  const { lang } = useT()
  return (name: string) => commodityLabel(name, lang)
}

export function placeOrNull() {
  return getSettings().place
}
