import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { db, type PriceAlert } from '../lib/db'
import { useData } from '../lib/data'
import { updateSettings, useSettings } from '../lib/settings'
import { commodityLabel, priceTypeLabel, unitLabel } from '../lib/commodities'
import { fmtAgo, fmtAr, fmtMonth } from '../lib/format'

export default function Alerts() {
  const { t, lang } = useT()
  const s = useSettings()
  const { commodities, markets } = useData()
  const notifs = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(100).toArray(), []) ?? []
  const alerts = useLiveQuery(() => db.alerts.toArray(), []) ?? []
  const [tab, setTab] = useState<'n' | 'a'>('n')
  // Onglets de la maquette : type de notification
  const [cat, setCat] = useState<'all' | 'price' | 'stock' | 'season'>('all')
  const [product, setProduct] = useState('')
  const catOf = (kind: string) => (kind === 'stock' ? 'stock' : kind === 'season' ? 'season' : kind === 'admin' ? 'admin' : 'price')
  const shownNotifs = notifs.filter((n) => cat === 'all' || catOf(n.kind) === cat)
  const [c, setC] = useState('')
  const com = commodities.find((x) => x.code === c) ?? commodities[0]
  const [m, setM] = useState('*')
  const [kind, setKind] = useState<PriceAlert['kind']>('drop')
  const [th, setTh] = useState('5')
  const [unit, setUnit] = useState('')
  const [pt, setPt] = useState('')
  const u = unit && com?.units.includes(unit) ? unit : com?.units[0] ?? ''
  const p = pt && com?.priceTypes.includes(pt) ? pt : com?.priceTypes.includes('Retail') ? 'Retail' : com?.priceTypes[0] ?? ''
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

  const add = async () => {
    if (kind === 'stock') {
      if (product.trim().length < 2) return
      await db.alerts.add({ commodityCode: '', marketCode: '*', unit: '', priceType: '', kind, product: product.trim(), threshold: 0, active: true, createdAt: new Date().toISOString() })
      setProduct('')
      setTab('a')
      return
    }
    if (!com) return
    if (!['new', 'season'].includes(kind) && !(Number(th) > 0)) return
    await db.alerts.add({ commodityCode: com.code, marketCode: kind === 'season' ? '*' : m, unit: u, priceType: kind === 'season' ? 'Retail' : p, kind, threshold: Number(th) || 0, active: true, createdAt: new Date().toISOString() })
    setTab('a')
  }
  const kindLabel = (a: PriceAlert) => {
    const k = { rise: 'kRise', drop: 'kDrop', below: 'kBelow', above: 'kAbove', new: 'kNew', season: 'kSeason', stock: 'kStock', online: 'kOnline' } as const
    const base = t(k[a.kind])
    return a.kind === 'new' || a.kind === 'season' || a.kind === 'stock' ? base : a.kind === 'rise' || a.kind === 'drop' ? `${base} ${a.threshold}` : `${base} ${fmtAr(a.threshold)}`
  }

  return (
    <div className="stack">
      <PageHeader title={t('alertsTitle')} back={false} />
      <div className="chips">
        <button className={`chip ${tab === 'n' ? 'on' : ''}`} onClick={() => setTab('n')}>{t('notifications')} ({notifs.filter((n) => !n.read).length})</button>
        <button className={`chip ${tab === 'a' ? 'on' : ''}`} onClick={() => setTab('a')}>{t('myAlerts')} ({alerts.length})</button>
      </div>

      {perm !== 'unsupported' && perm !== 'granted' && (
        <button className="btn secondary" onClick={async () => { const r = await Notification.requestPermission(); updateSettings({ notifConsent: r === 'granted' }) }}>
          <Icon name="bell" size={18} /> {t('enableNotif')}
        </button>
      )}
      {perm === 'granted' && !s.notifConsent && (
        <button className="btn secondary" onClick={() => updateSettings({ notifConsent: true })}><Icon name="bell" size={18} /> {t('enableNotif')}</button>
      )}

      {tab === 'n' && (
        <div className="chips" role="group">
          {([['all', 'tabAll'], ['price', 'tabPrice'], ['stock', 'tabStock'], ['season', 'tabSeason']] as const).map(([k, l]) => (
            <button key={k} className={`chip ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>
              {t(l)} ({notifs.filter((n) => k === 'all' || catOf(n.kind) === k).length})
            </button>
          ))}
        </div>
      )}
      {tab === 'n' && (
        <div className="card" style={{ paddingBlock: 0 }}>
          {shownNotifs.length === 0 ? <Empty icon="bell">{t('noNotifs')}</Empty> : (
            <>
              <div style={{ padding: '10px 0 0', textAlign: 'right' }}>
                <button className="btn small ghost" onClick={() => db.notifications.toCollection().modify({ read: true })}>{t('markRead')}</button>
              </div>
              <ul className="list">
                {shownNotifs.map((n) => (
                  <li key={n.id} style={{ opacity: n.read ? 0.7 : 1 }}>
                    <div className="row between">
                      <b>{!n.read && <span className="dot" style={{ background: 'var(--orange)', marginRight: 6 }} />}{n.title}</b>
                      <small>{fmtAgo(n.createdAt, lang)}</small>
                    </div>
                    <div style={{ fontSize: 14 }}>{n.body}</div>
                    {n.observedPeriod && <small>{t('priceDate')} : {fmtMonth(n.observedPeriod, lang)}</small>}
                    <div className="row" style={{ marginTop: 6 }}>
                      {n.link && <Link className="btn small secondary" to={n.link} onClick={() => db.notifications.update(n.id!, { read: true })}>{lang === 'mg' ? 'Jereo' : 'Voir'}</Link>}
                      <button className="btn small ghost" onClick={() => db.notifications.delete(n.id!)} aria-label={t('del')}><Icon name="trash" size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'a' && (
        <>
          <div className="card stack">
            <h2>{t('createAlert')}</h2>
            {kind !== 'stock' && <>
            <select value={com?.code ?? ''} onChange={(e) => { setC(e.target.value); setUnit(''); setPt('') }} aria-label={t('product')}>
              {commodities.map((x) => <option key={x.code} value={x.code}>{commodityLabel(x.name, lang)}</option>)}
            </select>
            <div className="grid3">
              <select value={m} onChange={(e) => setM(e.target.value)} aria-label={t('market')}>
                <option value="*">{t('anyMarket')}</option>
                {markets.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
              <select value={u} onChange={(e) => setUnit(e.target.value)} aria-label={t('unit')}>{com?.units.map((x) => <option key={x} value={x}>{unitLabel(x, lang)}</option>)}</select>
              <select value={p} onChange={(e) => setPt(e.target.value)} aria-label={t('priceType')}>{com?.priceTypes.map((x) => <option key={x} value={x}>{priceTypeLabel(x, lang)}</option>)}</select>
            </div>
            </>}
            <div className="row wrap">
              <select style={{ flex: '1 1 160px' }} value={kind} onChange={(e) => setKind(e.target.value as PriceAlert['kind'])} aria-label={t('alertKind')}>
                <option value="drop">{t('kDrop')}</option><option value="rise">{t('kRise')}</option>
                <option value="below">{t('kBelow')}</option><option value="above">{t('kAbove')}</option><option value="new">{t('kNew')}</option>
                <option value="season">{t('kSeason')}</option><option value="stock">{t('kStock')}</option>
              </select>
              {kind === 'stock' && <input style={{ flex: '1 1 140px' }} value={product} onChange={(e) => setProduct(e.target.value)} placeholder={t('productName')} aria-label={t('productName')} />}
              {!['new', 'season', 'stock'].includes(kind) && <input type="number" min={0} value={th} onChange={(e) => setTh(e.target.value)} aria-label={t('threshold')} />}
              <button className="btn" onClick={add}><Icon name="plus" size={16} /> {t('add')}</button>
            </div>
            {kind === 'stock' && <small>{t('stockAlertNote')}</small>}
            <small><Link to="/an-tserasera">{t('onlineAlertNote')}</Link></small>
            {kind === 'season' && <small>{t('seasonIndexHelp')}</small>}
          </div>
          <div className="card" style={{ paddingBlock: 0 }}>
            {alerts.length === 0 ? <Empty icon="bell">{t('noAlerts')}</Empty> : (
              <ul className="list">
                {alerts.map((a) => {
                  const cc = commodities.find((x) => x.code === a.commodityCode)
                  const mk = markets.find((x) => x.code === a.marketCode)
                  return (
                    <li key={a.id} className="row between">
                      <div>
                        <b>{a.kind === 'stock' || a.kind === 'online' ? a.product : cc ? commodityLabel(cc.name, lang) : a.commodityCode}</b> · {a.kind === 'online' ? t('onlineShort') : mk?.name ?? t('anyMarket')}
                        <div><small>{kindLabel(a)}{a.kind === 'online' ? '' : ` · ${unitLabel(a.unit, lang)} · ${priceTypeLabel(a.priceType, lang)}`}</small></div>
                      </div>
                      <div className="row">
                        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={a.active} onChange={(e) => db.alerts.update(a.id!, { active: e.target.checked })} /><small>{a.active ? 'ON' : 'OFF'}</small></label>
                        <button className="btn small danger" onClick={() => db.alerts.delete(a.id!)} aria-label={t('del')}><Icon name="trash" size={14} /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
