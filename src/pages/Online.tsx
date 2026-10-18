import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { OnlineRow } from '../components/Online'
import { supabase } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { fold } from '../../supabase/functions/sync-online/parse'
import { GROUPS, groupKey, type OnlineProduct, type OnlineShop } from '../lib/online'

const PAGE = 50
type Sort = 'unit' | 'price' | 'recent'

/** « Vidiny an-tserasera » : prix affichés par les boutiques en ligne, recherche côté serveur et mise à jour en direct. */
export default function Online() {
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const group = params.get('g') ?? ''
  const shop = params.get('shop') ?? ''
  const sort = (params.get('sort') as Sort) || 'unit'
  const [text, setText] = useState(q)
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [q, group, shop, sort])
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }

  const { data: shops } = useServer<OnlineShop[]>(() => supabase?.from('online_shops').select('*').order('name') ?? null, [], ['online_shops'])
  const { data, loading, error } = useServer<OnlineProduct[]>(() => {
    if (!supabase) return null
    let r = supabase.from('online_products').select('*')
    // Recherche sur chaque mot, sans accents ni majuscules (colonne search_text préparée par le serveur)
    for (const w of fold(q).split(/\s+/).filter((x) => x.length > 1).slice(0, 4)) r = r.ilike('search_text', `%${w}%`)
    if (group) r = group === 'other' ? r.is('product_group', null) : r.eq('product_group', group)
    if (shop) r = r.eq('shop_id', shop)
    r = sort === 'unit' ? r.order('unit_price', { ascending: true, nullsFirst: false }) : sort === 'price' ? r.order('price') : r.order('last_changed_at', { ascending: false })
    return r.order('id').limit(limit)
  }, [q, group, shop, sort, limit], ['online_products'])

  return (
    <div className="stack">
      <PageHeader title={t('onlineTitle')} />
      <div className="banner info"><Icon name="globe" /> <small>{t('onlineNote')}</small></div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); set('q', text.trim()) }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('onlineSearchPh')} aria-label={t('onlineSearchPh')} />
        <button className="btn"><Icon name="search" size={16} /></button>
      </form>
      <div className="row wrap" style={{ gap: 8 }}>
        <select value={shop} onChange={(e) => set('shop', e.target.value)} aria-label={t('allShops')} style={{ flex: '1 1 140px' }}>
          <option value="">{t('allShops')}</option>
          {shops?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => set('sort', e.target.value === 'unit' ? '' : e.target.value)} aria-label={t('sortUnit')} style={{ flex: '1 1 140px' }}>
          <option value="unit">{t('sortUnit')}</option><option value="price">{t('sortPrice')}</option><option value="recent">{t('sortChanged')}</option>
        </select>
      </div>
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={!group} className={`chip ${!group ? 'on' : ''}`} onClick={() => set('g', '')}>{t('allGroups')}</button>
        {[...GROUPS, 'other'].map((g) => (
          <button key={g} role="tab" aria-selected={group === g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => set('g', g)}>{t(groupKey(g === 'other' ? null : g))}</button>
        ))}
      </div>
      {error && <div className="banner err">{error}</div>}
      <div className="card" style={{ paddingBlock: 0 }}>
        {!data?.length ? (loading ? <div className="empty"><span className="spinner" /></div> : <Empty icon="store">{t('noOnline')}</Empty>) : (
          <ul className="list">{data.map((p) => <OnlineRow key={p.id} p={p} shop={shops?.find((s) => s.id === p.shop_id)} />)}</ul>
        )}
      </div>
      {data && data.length >= limit && <button className="btn secondary" onClick={() => setLimit(limit + PAGE)}>{t('seeAll')}</button>}
    </div>
  )
}
