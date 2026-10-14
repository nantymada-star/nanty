import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge } from '../components/ui'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import { externalDirectionsUrl, isOpenNow, osmUrl } from '../lib/geo'
import { fmtAr, fmtDateTime, fmtNum } from '../lib/format'
import { haversineKm } from '../lib/stats'
import { shopKindLabel } from './MapPage'

export default function ShopPage() {
  const { type = '', id = '' } = useParams()
  const sid = `${type}/${id}`
  const { t, lang } = useT()
  const s = useSettings()
  const shop = useLiveQuery(() => db.shops.get(sid), [sid])
  const prices = useLiveQuery(() => db.shopPrices.where('shopId').equals(sid).reverse().sortBy('declaredAt'), [sid]) ?? []

  if (shop === undefined) return <div className="empty"><span className="spinner" /></div>
  if (!shop) return <div><PageHeader title={t('error')} /><Empty>{t('noResults')}</Empty></div>

  const tg = shop.tags
  const open = isOpenNow(tg.opening_hours)
  const phone = tg.phone || tg['contact:phone']
  const web = tg.website || tg['contact:website'] || tg['contact:facebook']
  const addr = [tg['addr:housenumber'], tg['addr:street'], tg['addr:suburb'], tg['addr:city']].filter(Boolean).join(', ')
  const dist = s.place ? haversineKm(s.place, shop) : null

  return (
    <div className="stack">
      <PageHeader title={shop.name || shopKindLabel(shop.kind, lang)} />
      <div className="card stack">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge b-verified">{shopKindLabel(shop.kind, lang)}</span>
          {open === true && <span className="badge b-verified">{t('openNow')}</span>}
          {open === false && <span className="badge b-suspect">{t('closedNow')}</span>}
          {open === null && <span className="badge b-stale">{t('hoursUnknown')}</span>}
          {tg.wholesale === 'yes' && <span className="badge b-declared">{lang === 'mg' ? 'Ambongadiny' : 'Gros'}</span>}
        </div>
        <table className="table">
          <tbody>
            <tr><th>{t('address')}</th><td>{addr || <span className="muted">—</span>} {dist != null && <small>· {fmtNum(dist, 1)} km</small>}</td></tr>
            <tr><th>{t('phone')}</th><td>{phone ? <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a> : <span className="muted">—</span>}</td></tr>
            <tr><th>{t('hours')}</th><td>{tg.opening_hours ?? <span className="muted">—</span>}</td></tr>
            {web && <tr><th>{t('website')}</th><td><a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noreferrer">{web}</a></td></tr>}
            <tr><th>{t('delivery')}</th><td>{tg.delivery === 'yes' ? t('yes') : tg.delivery === 'no' ? t('no') : <span className="muted">—</span>}</td></tr>
            <tr><th>{t('source')}</th><td><a href={osmUrl(shop.id)} target="_blank" rel="noreferrer">OpenStreetMap {shop.id}</a>{tg.check_date ? ` · ${tg.check_date}` : ''} · {fmtDateTime(shop.fetchedAt, lang)}</td></tr>
          </tbody>
        </table>
        <div className="grid2">
          <Link className="btn" to={`/dia?to=${shop.lat},${shop.lon}&name=${encodeURIComponent(shop.name || '')}`}><Icon name="route" size={18} /> {t('itinerary')}</Link>
          {phone ? <a className="btn secondary" href={`tel:${phone.replace(/\s/g, '')}`}><Icon name="phone" size={18} /> {t('call')}</a>
            : <a className="btn secondary" href={externalDirectionsUrl(shop, s.place)} target="_blank" rel="noreferrer"><Icon name="map" size={18} /> {t('openExternal')}</a>}
        </div>
        <small>{t('osmData')}</small>
      </div>

      <div className="card">
        <div className="row between"><h2>{t('declaredPrices')}</h2><Link className="btn small secondary" to={`/mpivarotra?shop=${encodeURIComponent(shop.id)}`}><Icon name="plus" size={16} /> {t('addPrice')}</Link></div>
        {prices.length === 0 ? (
          <Empty icon="store">{t('noShopPrice')}{phone ? '' : ''}</Empty>
        ) : (
          <ul className="list">
            {prices.map((p) => (
              <li key={p.id} className="row between">
                <div>
                  <b>{p.product}</b> <small>/ {p.unit}</small>
                  <div className="row wrap" style={{ gap: 6, fontSize: 12 }}>
                    <StatusBadge status="declared" />
                    <span className="badge b-stale">{p.stock === 'declared' ? t('stockDeclared') : p.stock === 'out' ? t('stockOut') : t('stockUnknown')}</span>
                    {p.delivery && <span className="badge b-verified">{t('delivery')}</span>}
                  </div>
                  <small>{t('updatedAt')} {fmtDateTime(p.declaredAt, lang)} · {p.declaredBy || '—'}</small>
                </div>
                <div className="price num">{fmtAr(p.price)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
