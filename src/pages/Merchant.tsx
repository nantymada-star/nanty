import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, StatusBadge, useOnline } from '../components/ui'
import { db, type ShopPrice } from '../lib/db'
import { useSettings } from '../lib/settings'
import { fetchShops } from '../lib/geo'
import { stripAccents } from '../lib/commodities'
import { fmtAr, fmtDateTime } from '../lib/format'
import { shopKindLabel } from './MapPage'

const ALL_KINDS = ['shop=supermarket', 'shop=convenience', 'shop=general', 'shop=grocery', 'shop=wholesale', 'shop=hardware', 'shop=doityourself', 'shop=agrarian', 'shop=butcher', 'shop=bakery', 'amenity=marketplace']

export default function Merchant() {
  const { t, lang } = useT()
  const s = useSettings()
  const online = useOnline()
  const [params, setParams] = useSearchParams()
  const shopId = params.get('shop') ?? ''
  const shop = useLiveQuery(() => (shopId ? db.shops.get(shopId) : undefined), [shopId])
  const cached = useLiveQuery(() => db.shops.toArray(), []) ?? []
  const prices = useLiveQuery(() => (shopId ? db.shopPrices.where('shopId').equals(shopId).toArray() : []), [shopId]) ?? []
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ product: '', unit: 'kg', price: '', priceType: 'Retail' as ShopPrice['priceType'], stock: 'unknown' as ShopPrice['stock'], delivery: false })
  const [editId, setEditId] = useState<number | null>(null)

  const loadNearby = async () => {
    if (!s.place) return
    setBusy(true); setErr('')
    try { await fetchShops(s.place, 2000, ALL_KINDS) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const found = q.length > 1 ? cached.filter((x) => x.name && stripAccents(x.name).includes(stripAccents(q))).slice(0, 30) : []

  const save = async () => {
    const price = Number(form.price)
    if (!shop || !form.product.trim() || !(price > 0)) return
    const row: ShopPrice = {
      shopId: shop.id, shopName: shop.name, product: form.product.trim(), unit: form.unit.trim() || 'kg', price, priceType: form.priceType,
      stock: form.stock, delivery: form.delivery, declaredAt: new Date().toISOString(), declaredBy: s.displayName || t('roleMerchant'),
    }
    if (editId) await db.shopPrices.update(editId, row)
    else await db.shopPrices.add(row)
    setForm({ ...form, product: '', price: '' }); setEditId(null)
  }

  return (
    <div className="stack">
      <PageHeader title={t('merchantTitle')} />
      <div className="banner info"><Icon name="store" /> <div>{t('merchantNote')}</div></div>

      {!shop ? (
        <div className="card stack">
          <h2>{t('pickShop')}</h2>
          <div className="row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchShopName')} />
          </div>
          <button className="btn secondary" onClick={loadNearby} disabled={!s.place || busy || !online}>{busy ? <span className="spinner" /> : <Icon name="gps" size={18} />} {t('loadShops')} {s.place ? `(${s.place.name})` : ''}</button>
          {!s.place && <small>{t('needStart')}</small>}
          {err && <div className="banner err">{err}</div>}
          <ul className="list">
            {found.map((x) => (
              <li key={x.id}><button className="btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={() => setParams({ shop: x.id })}>{x.name} <small>· {shopKindLabel(x.kind, lang)}</small></button></li>
            ))}
          </ul>
          {q.length > 1 && !found.length && <Empty icon="store">{t('noResults')}</Empty>}
          <small>{lang === 'mg' ? 'Tsy hita ny fivarotanao? Ampio ao amin\'ny OpenStreetMap.org izy.' : 'Commerce absent ? Ajoutez-le sur OpenStreetMap.org.'} <a href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">openstreetmap.org</a></small>
        </div>
      ) : (
        <>
          <div className="card row between">
            <div><b>{shop.name}</b><div><small>{shopKindLabel(shop.kind, lang)} · {shop.id}</small></div></div>
            <div className="row">
              <Link className="btn small secondary" to={`/fivarotana/${shop.id}`}>{lang === 'mg' ? 'Jereo' : 'Voir'}</Link>
              <button className="btn small ghost" onClick={() => setParams({})}>{t('changeTown')}</button>
            </div>
          </div>
          <div className="card stack">
            <h2>{editId ? t('updatedAt') : t('addPrice')}</h2>
            <div className="grid2">
              <label className="field"><span>{t('product')}</span><input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Vary gasy 50 kg" /></label>
              <label className="field"><span>{t('unit')}</span><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, gony 50 kg, litatra…" /></label>
              <label className="field"><span>{t('amount')}</span><input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
              <label className="field"><span>{t('priceType')}</span>
                <select value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value as ShopPrice['priceType'] })}>
                  <option value="Retail">{lang === 'mg' ? 'Antsinjarany' : 'Détail'}</option><option value="Wholesale">{lang === 'mg' ? 'Ambongadiny' : 'Gros'}</option>
                </select>
              </label>
              <label className="field"><span>{t('stock')}</span>
                <select value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value as ShopPrice['stock'] })}>
                  <option value="unknown">{t('stockUnknown')}</option><option value="declared">{t('stockDeclared')}</option><option value="out">{t('stockOut')}</option>
                </select>
              </label>
              <label className="row" style={{ alignSelf: 'end', minHeight: 44 }}><input type="checkbox" checked={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.checked })} /> {t('delivery')}</label>
            </div>
            <button className="btn orange" onClick={save}><Icon name="check" size={18} /> {t('save')}</button>
          </div>
          <div className="card">
            <h2>{t('declaredPrices')}</h2>
            {prices.length === 0 ? <Empty icon="store">—</Empty> : (
              <ul className="list">
                {prices.map((p) => (
                  <li key={p.id} className="row between">
                    <div>
                      <b>{p.product}</b> <small>/ {p.unit}</small>
                      <div className="row" style={{ gap: 6 }}><StatusBadge status="declared" /><small>{t('updatedAt')} {fmtDateTime(p.declaredAt, lang)}</small></div>
                    </div>
                    <div className="row">
                      <span className="price num">{fmtAr(p.price)}</span>
                      <button className="btn small secondary" onClick={() => { setEditId(p.id!); setForm({ product: p.product, unit: p.unit, price: String(p.price), priceType: p.priceType, stock: p.stock, delivery: p.delivery }) }} aria-label="edit"><Icon name="edit" size={14} /></button>
                      <button className="btn small danger" onClick={() => db.shopPrices.delete(p.id!)} aria-label={t('del')}><Icon name="trash" size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
