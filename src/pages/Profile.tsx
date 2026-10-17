import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader, PlacePicker, SyncStatus } from '../components/ui'
import { db } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { updateSettings, useSettings } from '../lib/settings'
import { commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAr, fmtNum } from '../lib/format'

export default function Profile() {
  const { t, lang } = useT()
  const s = useSettings()
  const { session } = useAuth()
  const { seriesList, commodities, marketByCode } = useData()
  const favs = useLiveQuery(() => db.favorites.toArray(), []) ?? []
  const [usage, setUsage] = useState<number | null>(null)
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => {})
  }, [])

  const exportAll = async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      observations: await db.observations.toArray(),
      syncRuns: await db.syncRuns.toArray(),
      favorites: await db.favorites.toArray(),
      alerts: await db.alerts.toArray(),
      simulations: await db.simulations.toArray(),
      shopPrices: await db.shopPrices.toArray(),
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `madaprice-${data.exportedAt.slice(0, 10)}.json`
    a.click()
  }
  const clearAll = async () => {
    if (!confirm(t('confirmClear'))) return
    await db.delete()
    localStorage.clear()
    location.href = '/'
  }

  return (
    <div className="stack">
      <PageHeader title={t('profileTitle')} back={false} />
      <div className="card stack">
        <label className="field"><span>{t('yourName')}</span><input value={s.displayName} maxLength={60} onChange={(e) => updateSettings({ displayName: e.target.value })} /></label>
        <small>{t('localOnly')}</small>
        <label className="field"><span>{t('role')}</span>
          <select value={s.role} disabled={!!session} title={session ? t('loggedAs') : undefined} onChange={(e) => updateSettings({ role: e.target.value as typeof s.role })}>
            <option value="user">{t('roleUser')}</option><option value="merchant">{t('roleMerchant')}</option><option value="admin">{t('roleAdmin')}</option>
          </select>
        </label>
      </div>

      <div className="card stack">
        <div className="grid2">
          <label className="field"><span><Icon name="globe" size={14} /> {t('language')}</span>
            <select value={s.lang} onChange={(e) => updateSettings({ lang: e.target.value as 'mg' | 'fr' })}>
              <option value="mg">Malagasy</option><option value="fr">Français</option>
            </select>
          </label>
          <label className="field"><span>{t('theme')}</span>
            <select value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as typeof s.theme })}>
              <option value="auto">{t('themeAuto')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option>
            </select>
          </label>
        </div>
        <div><small>{t('chooseTown')}</small><PlacePicker /></div>
      </div>

      <div className="card">
        <h2>{t('favorites')}</h2>
        {favs.length === 0 ? <small>—</small> : (
          <ul className="list">
            {favs.map((f) => {
              const sr = seriesList.find((x) => x.key === `${f.commodityCode}|${f.marketCode}|${f.unit}|${f.priceType}`)
              const c = commodities.find((x) => x.code === f.commodityCode)
              return (
                <li key={f.id}>
                  <Link className="rowlink" to={`/vokatra/${encodeURIComponent(f.commodityCode)}?market=${encodeURIComponent(f.marketCode)}&unit=${encodeURIComponent(f.unit)}&pt=${encodeURIComponent(f.priceType)}`}>
                    <div style={{ flex: 1 }}><b>{c ? commodityLabel(c.name, lang) : f.commodityCode}</b> · {marketByCode.get(f.marketCode)?.name}<div><small>{unitLabel(f.unit, lang)} · {priceTypeLabel(f.priceType, lang)}</small></div></div>
                    {sr && <span className="price num">{fmtAr(sr.latest.price)}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="card stack">
        <h2>{t('offlineData')}</h2>
        <SyncStatus compact />
        {usage != null && <small>{t('storageUsed')} : {fmtNum(usage / 1048576, 1)} Mo</small>}
        <div className="row wrap">
          <button className="btn small secondary" onClick={exportAll}><Icon name="download" size={16} /> {t('exportData')}</button>
          <button className="btn small danger" onClick={clearAll}><Icon name="trash" size={16} /> {t('clearData')}</button>
        </div>
      </div>

      <div className="card">
        <ul className="list">
          <li><Link className="rowlink" to="/kaonty"><Icon name="user" /> <span style={{ flex: 1 }}>{t('account')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/lisitra"><Icon name="edit" /> <span style={{ flex: 1 }}>{t('lists')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/devis"><Icon name="store" /> <span style={{ flex: 1 }}>{t('myQuotes')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/tantarako"><Icon name="refresh" /> <span style={{ flex: 1 }}>{t('historyTitle')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/kajy"><Icon name="calc" /> <span style={{ flex: 1 }}>{t('mySims')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/fanairana"><Icon name="bell" /> <span style={{ flex: 1 }}>{t('myAlerts')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/hanome-vidiny"><Icon name="edit" /> <span style={{ flex: 1 }}>{t('submitTitle')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/mpivarotra"><Icon name="store" /> <span style={{ flex: 1 }}>{t('merchantTitle')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/admin"><Icon name="settings" /> <span style={{ flex: 1 }}>{t('adminTitle')}</span><Icon name="chevron" /></Link></li>
          <li><Link className="rowlink" to="/fiarovana"><Icon name="shield" /> <span style={{ flex: 1 }}>{t('privacy')} · {t('help')}</span><Icon name="chevron" /></Link></li>
        </ul>
      </div>
    </div>
  )
}
