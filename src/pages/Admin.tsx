import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { KPI, PageHeader, SyncStatus } from '../components/ui'
import { db, getKV, setKV } from '../lib/db'
import { useData } from '../lib/data'
import { updateSettings, useSettings } from '../lib/settings'
import { encodeAppIdentifier } from '../lib/hapi'
import { SOURCE_WFP, syncWfp, useSyncState } from '../lib/sync'
import { categoryLabel, commodityLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtMonth, fmtNum } from '../lib/format'

interface AuditEntry { at: string; who: string; action: string; target: string }

export default function Admin() {
  const { t, lang } = useT()
  const s = useSettings()
  const st = useSyncState()
  const { observations, markets, commodities, regions } = useData()
  const runs = useLiveQuery(() => db.syncRuns.orderBy('id').reverse().limit(30).toArray(), []) ?? []
  const pending = useLiveQuery(() => db.observations.where('moderation').equals('pending').toArray(), []) ?? []
  const audit = useLiveQuery(() => getKV<AuditEntry[]>('audit', []), [pending.length]) ?? []
  const lastSuccess = useLiveQuery(() => getKV<string | null>('lastSuccess:' + SOURCE_WFP, null), [st.running])
  const fails = useLiveQuery(() => getKV<number>('fails:' + SOURCE_WFP, 0), [st.running]) ?? 0
  const shopsCount = useLiveQuery(() => db.shops.count(), []) ?? 0
  const shopPricesCount = useLiveQuery(() => db.shopPrices.count(), []) ?? 0
  const [app, setApp] = useState('MadaPrice')
  const [email, setEmail] = useState('')
  const [appId, setAppId] = useState(s.appId)
  const suspects = observations.filter((o) => o.suspect)

  const moderate = async (id: string, decision: 'approved' | 'rejected') => {
    await db.observations.update(id, { moderation: decision, lastVerifiedAt: new Date().toISOString() })
    const list = await getKV<AuditEntry[]>('audit', [])
    await setKV('audit', [{ at: new Date().toISOString(), who: s.displayName || t('roleAdmin'), action: decision, target: id }, ...list].slice(0, 200))
  }
  const fullResync = async () => {
    if (!confirm(lang === 'mg' ? 'Hofafana ny vidiny WFP voatahiry ary haka indray?' : 'Supprimer les prix WFP en cache et tout re-télécharger ?')) return
    await db.observations.where('source').equals('wfp-hapi').delete()
    await syncWfp('full-resync')
  }

  const perCat = Object.entries(
    observations.reduce<Record<string, number>>((a, o) => ((a[o.category] = (a[o.category] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1])

  return (
    <div className="stack">
      <PageHeader title={t('adminTitle')} />
      {s.role !== 'admin' && <div className="banner warn"><Icon name="shield" /> <div>{t('role')} : {t('roleUser')}. <button className="btn small" onClick={() => updateSettings({ role: 'admin' })}>{t('roleAdmin')}</button></div></div>}
      <small>{t('adminLocalNote')}</small>

      <div className="grid4">
        <KPI v={fmtNum(observations.length)} l={t('observations')} />
        <KPI v={fmtNum(markets.length)} l={t('markets')} />
        <KPI v={fmtNum(commodities.length)} l={t('products')} />
        <KPI v={fmtNum(regions.length)} l={t('region')} />
      </div>

      <div className="card stack">
        <h2>{t('sources')}</h2>
        <table className="table">
          <thead><tr><th>{t('source')}</th><th>{t('status')}</th><th>{t('lastSync')}</th></tr></thead>
          <tbody>
            <tr>
              <td><b>WFP — HDX HAPI</b><div><small>food-prices-market-monitor · MDG · MGA</small></div></td>
              <td>{s.appId ? <span className={`badge ${fails >= 3 ? 'b-suspect' : 'b-verified'}`}>{fails >= 3 ? t('syncErr') : t('connected')}</span> : <span className="badge b-declared">{t('notConnected')}</span>}</td>
              <td>{lastSuccess ? fmtDateTime(lastSuccess, lang) : '—'}</td>
            </tr>
            <tr><td><b>OpenStreetMap — Overpass</b><div><small>{lang === 'mg' ? 'Fivarotana sy tsena (rehefa ilaina)' : 'Commerces et marchés (à la demande)'}</small></div></td><td><span className="badge b-verified">{t('connected')}</span></td><td>{fmtNum(shopsCount)} {t('shopsFound')}</td></tr>
            <tr><td><b>OSRM</b><div><small>{t('itinerary')}</small></div></td><td><span className="badge b-verified">{t('connected')}</span></td><td>—</td></tr>
            <tr><td><b>Nominatim</b><div><small>{t('chooseTown')}</small></div></td><td><span className="badge b-verified">{t('connected')}</span></td><td>—</td></tr>
            <tr><td><b>{lang === 'mg' ? 'Mpampiasa / mpivarotra' : 'Utilisateurs / commerçants'}</b></td><td><span className="badge b-declared">{t('stDeclared')}</span></td><td>{pending.length} {t('stPending').toLowerCase()} · {shopPricesCount} {t('declaredPrices').toLowerCase()}</td></tr>
          </tbody>
        </table>

        <label className="field"><span>{t('appIdLabel')}</span>
          <input value={appId} onChange={(e) => setAppId(e.target.value.trim())} placeholder="TWFkYVByaWNlOm1lQGV4YW1wbGUub3Jn" />
        </label>
        <details>
          <summary>{t('genAppId')}</summary>
          <div className="grid2" style={{ marginTop: 8 }}>
            <label className="field"><span>{t('appName')}</span><input value={app} onChange={(e) => setApp(e.target.value.replace(/:/g, ''))} /></label>
            <label className="field"><span>{t('email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} /></label>
          </div>
          <button className="btn small secondary" style={{ marginTop: 8 }} disabled={!app || !/^[^@\s:]+@[^@\s:]+\.[^@\s:]+$/.test(email)} onClick={() => setAppId(encodeAppIdentifier(app, email))}>{t('genAppId')}</button>
          <div><small>{lang === 'mg' ? 'Ampiasain\'ny HDX hamantarana ny app fotsiny io. Tsy alefa any amin\'ny toerana hafa.' : 'Sert uniquement à identifier l’application auprès de HDX. Envoyé à HDX seulement.'}</small></div>
        </details>
        <div className="grid2">
          <label className="field"><span>{t('hapiMode')}</span>
            <select value={s.hapiMode} onChange={(e) => updateSettings({ hapiMode: e.target.value as typeof s.hapiMode })}>
              <option value="auto">{t('modeAuto')}</option><option value="direct">{t('modeDirect')}</option><option value="proxy">{t('modeProxy')}</option>
            </select>
          </label>
          <label className="field"><span>{t('autoEvery')}</span><input type="number" min={5} value={s.autoSyncMinutes} onChange={(e) => updateSettings({ autoSyncMinutes: Math.max(5, Number(e.target.value) || 30) })} /></label>
          <label className="field"><span>{t('historyYears')}</span><input type="number" min={1} max={20} value={s.historyYears} onChange={(e) => updateSettings({ historyYears: Math.min(20, Math.max(1, Number(e.target.value) || 4)) })} /></label>
          <label className="field"><span>{t('staleAfter')}</span><input type="number" min={1} value={s.staleDays.default} onChange={(e) => updateSettings({ staleDays: { ...s.staleDays, default: Math.max(1, Number(e.target.value) || 60) } })} /></label>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => { updateSettings({ appId }); setTimeout(() => syncWfp('manual'), 0) }} disabled={!appId || st.running}><Icon name="check" size={18} /> {t('save')} + {t('syncNow')}</button>
          <button className="btn ghost" onClick={fullResync} disabled={!s.appId || st.running}><Icon name="refresh" size={18} /> {lang === 'mg' ? 'Havaozina tanteraka' : 'Resynchronisation complète'}</button>
        </div>
        <SyncStatus compact />
      </div>

      <div className="card">
        <h2>{t('syncRuns')}</h2>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>{t('date')}</th><th>{t('status')}</th><th>{t('durationS')}</th><th>{t('fetched')}</th><th>{t('inserted')}</th><th>{t('updated')}</th><th>{t('suspects')}</th><th>{t('attempts')}</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.startedAt, lang)}<div><small>{r.trigger}</small></div></td>
                  <td><span className={`badge ${r.status === 'success' ? 'b-verified' : r.status === 'running' ? 'b-declared' : 'b-suspect'}`}>{r.status}</span></td>
                  <td className="num">{r.durationMs != null ? `${fmtNum(r.durationMs / 1000, 1)} s` : '—'}</td>
                  <td className="num">{fmtNum(r.fetched)}</td><td className="num">{fmtNum(r.inserted)}</td><td className="num">{fmtNum(r.updated)}</td>
                  <td className="num">{fmtNum(r.suspects)}</td><td className="num">{r.attempts}</td>
                  <td><small style={{ wordBreak: 'break-word' }}>{r.error}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>{t('moderation')}</h2>
        {pending.length === 0 ? <small>{t('noneToModerate')}</small> : (
          <ul className="list">
            {pending.map((o) => (
              <li key={o.id} className="row between wrap">
                <div>
                  <b>{commodityLabel(o.commodityName, lang)}</b> · {o.marketName} · <span className="price num">{fmtAr(o.price)}</span>/{o.unit}
                  <div><small>{o.periodStart} · {o.note || '—'} · {fmtDateTime(o.firstSeenAt, lang)}</small></div>
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => moderate(o.id, 'approved')}><Icon name="check" size={14} /> {t('approve')}</button>
                  <button className="btn small danger" onClick={() => moderate(o.id, 'rejected')}><Icon name="x" size={14} /> {t('reject')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {audit.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary>Audit ({audit.length})</summary>
            <ul>{audit.slice(0, 50).map((a, i) => <li key={i}><small>{fmtDateTime(a.at, lang)} · {a.who} · {a.action} · {a.target}</small></li>)}</ul>
          </details>
        )}
      </div>

      <div className="card">
        <h2>{t('suspects')} ({suspects.length})</h2>
        <small>{t('suspectHelp')}</small>
        <ul className="list">
          {suspects.slice(0, 40).map((o) => (
            <li key={o.id}><b>{commodityLabel(o.commodityName, lang)}</b> · {o.marketName} · {fmtMonth(o.periodStart, lang)} : <span className="up num">{fmtAr(o.price)}</span>/{o.unit}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>{t('stats')}</h2>
        <table className="table">
          <tbody>{perCat.map(([c, n]) => <tr key={c}><td>{categoryLabel(c, lang)}</td><td className="num" style={{ textAlign: 'right' }}>{fmtNum(n)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
