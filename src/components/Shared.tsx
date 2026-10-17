import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { Empty, StatusBadge } from './ui'
import { useAuth } from '../lib/auth'
import { errText, supabase, SUPABASE_URL, type Business, type BusinessPrice, type Profile, type QuoteRequest, type ServerSubmission } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import type { Shop } from '../lib/db'
import { commodityLabel } from '../lib/commodities'
import { fmtAr, fmtDateTime, fmtDay, fmtNum } from '../lib/format'
import { QuoteStatus } from '../pages/Quotes'

const NeedLogin = () => {
  const { t } = useT()
  return <div className="banner info"><Icon name="user" /> <div style={{ flex: 1 }}>{t('needLogin')}</div><Link className="btn small" to="/kaonty">{t('login')}</Link></div>
}

function useBusiness(osmId: string) {
  return useServer<Business | null>(() => (supabase ? supabase.from('businesses').select('*').eq('osm_id', osmId).maybeSingle() : null), [osmId], ['businesses'])
}

/** Fiche commerce : informations et prix partagés, badge vérifié, demande de devis. */
export function ShopServerPanel({ shop }: { shop: Shop }) {
  const { t, lang } = useT()
  const { session } = useAuth()
  const { data: biz } = useBusiness(shop.id)
  const { data: prices } = useServer<BusinessPrice[]>(
    () => (supabase && biz ? supabase.from('business_prices').select('*').eq('business_id', biz.id).order('updated_at', { ascending: false }) : null),
    [biz?.id], ['business_prices'],
  )
  const [q, setQ] = useState({ product: '', quantity: '', message: '', contact: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { if (biz?.id) supabase?.rpc('record_business_view', { b: biz.id }) }, [biz?.id])
  if (!supabase || !biz) return null

  return (
    <div className="card stack" style={{ borderLeft: '4px solid var(--green2)' }}>
      <div className="row between wrap">
        <b>{biz.name}</b>
        <span className="row" style={{ gap: 6 }}>
          <span className="badge b-estimated">{t('sharedBadge')}</span>
          {biz.verified ? <span className="badge b-verified"><Icon name="check" size={12} /> {t('verifiedShop')}</span> : <StatusBadge status="declared" />}
        </span>
      </div>
      {(biz.address || biz.phone || biz.hours) && (
        <table className="table"><tbody>
          {biz.address && <tr><th>{t('address')}</th><td>{biz.address}</td></tr>}
          {biz.phone && <tr><th>{t('phone')}</th><td><a href={`tel:${biz.phone.replace(/\s/g, '')}`}>{biz.phone}</a></td></tr>}
          {biz.hours && <tr><th>{t('hours')}</th><td>{biz.hours}</td></tr>}
          {biz.delivery != null && <tr><th>{t('delivery')}</th><td>{biz.delivery ? t('yes') : t('no')}{biz.delivery_area ? ` · ${biz.delivery_area}` : ''}</td></tr>}
        </tbody></table>
      )}
      <small>{t('updatedAt')} {fmtDateTime(biz.updated_at, lang)}</small>
      {!!prices?.length && (
        <ul className="list">
          {prices.map((p) => (
            <li key={p.id} className="row between">
              <div>
                <b>{p.product}</b> <small>/ {p.unit}</small>
                <div className="row wrap" style={{ gap: 6, fontSize: 12 }}>
                  <StatusBadge status={biz.verified ? 'verified' : 'declared'} />
                  <span className="badge b-stale">{p.stock === 'declared' ? t('stockDeclared') : p.stock === 'out' ? t('stockOut') : t('stockUnknown')}</span>
                  {p.delivery && <span className="badge b-verified">{t('delivery')}</span>}
                </div>
                <small>{t('updatedAt')} {fmtDateTime(p.updated_at, lang)}</small>
              </div>
              <div className="price num">{fmtAr(Number(p.price))}</div>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>{t('quote')}</summary>
        {!session ? <NeedLogin /> : (
          <form className="stack" style={{ marginTop: 8 }} onSubmit={async (e) => {
            e.preventDefault()
            if (!q.product.trim()) return
            const { error } = await supabase!.from('quote_requests').insert({ business_id: biz.id, product: q.product.trim(), quantity: q.quantity.trim() || null, message: q.message.trim() || null, contact: q.contact.trim() || null })
            setMsg(error ? { ok: false, text: errText(error) } : { ok: true, text: t('quoteSent') })
            if (!error) setQ({ product: '', quantity: '', message: '', contact: '' })
          }}>
            <div className="grid2">
              <label className="field"><span>{t('product')}</span><input required maxLength={120} value={q.product} onChange={(e) => setQ({ ...q, product: e.target.value })} /></label>
              <label className="field"><span>{t('quantityLabel')}</span><input maxLength={60} value={q.quantity} onChange={(e) => setQ({ ...q, quantity: e.target.value })} placeholder="20 gony" /></label>
            </div>
            <label className="field"><span>{t('message')}</span><textarea rows={2} maxLength={500} value={q.message} onChange={(e) => setQ({ ...q, message: e.target.value })} /></label>
            <label className="field"><span>{t('contact')}</span><input maxLength={80} value={q.contact} onChange={(e) => setQ({ ...q, contact: e.target.value })} /></label>
            <button className="btn orange"><Icon name="check" size={16} /> {t('sendQuote')}</button>
            {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`}>{msg.text} {msg.ok && <Link to="/devis">{t('myQuotes')}</Link>}</div>}
          </form>
        )}
      </details>
    </div>
  )
}

/** Espace commerçant partagé : revendiquer un commerce, fiche, prix, devis reçus, statistiques. */
export function MerchantServer({ shop }: { shop: Shop }) {
  const { t, lang } = useT()
  const { session, isAdmin } = useAuth()
  const { data: biz, reload } = useBusiness(shop.id)
  const [tab, setTab] = useState<'info' | 'products' | 'quotes' | 'stats'>('products')
  const [err, setErr] = useState('')
  const owner = !!biz && !!session && (biz.owner_id === session.user.id || isAdmin)
  const { data: prices, reload: reloadPrices } = useServer<BusinessPrice[]>(() => (supabase && biz ? supabase.from('business_prices').select('*').eq('business_id', biz.id).order('updated_at', { ascending: false }) : null), [biz?.id], ['business_prices'])
  const { data: quotes } = useServer<QuoteRequest[]>(() => (supabase && biz && owner ? supabase.from('quote_requests').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }) : null), [biz?.id, owner], ['quote_requests'])
  const { data: views } = useServer<{ views: number }[]>(() => (supabase && biz && owner ? supabase.from('business_views').select('views').eq('business_id', biz.id).gte('day', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)) : null), [biz?.id, owner, tab])
  const [f, setF] = useState({ product: '', unit: 'kg', price: '', price_type: 'Retail', stock: 'unknown', delivery: false })
  const [info, setInfo] = useState({ address: '', phone: '', hours: '', delivery: '', delivery_area: '' })
  const [replies, setReplies] = useState<Record<string, string>>({})
  useEffect(() => {
    if (biz) setInfo({ address: biz.address ?? '', phone: biz.phone ?? '', hours: biz.hours ?? '', delivery: biz.delivery == null ? '' : biz.delivery ? 'yes' : 'no', delivery_area: biz.delivery_area ?? '' })
  }, [biz])

  if (!supabase) return null
  if (!session) return <NeedLogin />
  if (!biz) {
    return (
      <div className="card stack">
        <button className="btn orange" onClick={async () => {
          const { error } = await supabase!.from('businesses').insert({
            osm_id: shop.id, name: shop.name || shop.id, kind: shop.kind, lat: shop.lat, lon: shop.lon,
            phone: shop.tags.phone || shop.tags['contact:phone'] || null, hours: shop.tags.opening_hours || null,
          })
          if (error) setErr(errText(error)); else reload()
        }}><Icon name="store" size={18} /> {t('claimShop')} ({t('sharedBadge')})</button>
        <small>{t('claimNote')}</small>
        {err && <div className="banner err">{err}</div>}
      </div>
    )
  }
  if (!owner) return <div className="banner warn">{t('error')} : {t('claimNote')}</div>

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="badge b-estimated">{t('sharedBadge')}</span>
        {biz.verified ? <span className="badge b-verified">{t('verifiedShop')}</span> : <span className="badge b-pending">{t('stPending')}</span>}
      </div>
      <div className="chips" role="tablist">
        {([['info', 'tabInfo'], ['products', 'tabProducts'], ['quotes', 'quotes'], ['stats', 'tabStats']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {t(l)}{k === 'quotes' && quotes?.some((q) => q.status === 'open') ? ` (${quotes.filter((q) => q.status === 'open').length})` : ''}
          </button>
        ))}
      </div>
      {err && <div className="banner err">{err}</div>}

      {tab === 'info' && (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase!.from('businesses').update({
            address: info.address.trim() || null, phone: info.phone.trim() || null, hours: info.hours.trim() || null,
            delivery: info.delivery === '' ? null : info.delivery === 'yes', delivery_area: info.delivery_area.trim() || null,
          }).eq('id', biz.id)
          setErr(error ? errText(error) : '')
        }}>
          <div className="grid2">
            <label className="field"><span>{t('address')}</span><input maxLength={200} value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} /></label>
            <label className="field"><span>{t('phone')}</span><input type="tel" maxLength={40} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></label>
            <label className="field"><span>{t('hours')}</span><input maxLength={200} value={info.hours} onChange={(e) => setInfo({ ...info, hours: e.target.value })} placeholder="Mo-Fr 08:00-18:00" /></label>
            <label className="field"><span>{t('delivery')}</span>
              <select value={info.delivery} onChange={(e) => setInfo({ ...info, delivery: e.target.value })}><option value="">—</option><option value="yes">{t('yes')}</option><option value="no">{t('no')}</option></select>
            </label>
            <label className="field"><span>{t('deliveryArea')}</span><input maxLength={120} value={info.delivery_area} onChange={(e) => setInfo({ ...info, delivery_area: e.target.value })} /></label>
          </div>
          <small>{t('updatedAt')} {fmtDateTime(biz.updated_at, lang)}</small>
          <button className="btn orange"><Icon name="check" size={18} /> {t('save')}</button>
        </form>
      )}

      {tab === 'products' && (
        <>
          <form className="card stack" onSubmit={async (e) => {
            e.preventDefault()
            const price = Number(f.price)
            if (!f.product.trim() || !(price > 0)) return
            const { error } = await supabase!.from('business_prices').insert({ business_id: biz.id, product: f.product.trim(), unit: f.unit.trim() || 'kg', price, price_type: f.price_type, stock: f.stock, delivery: f.delivery })
            if (error) setErr(errText(error)); else { setF({ ...f, product: '', price: '' }); reloadPrices() }
          }}>
            <h2>{t('addPrice')}</h2>
            <div className="grid2">
              <label className="field"><span>{t('product')}</span><input maxLength={120} value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} placeholder="Vary gasy 50 kg" /></label>
              <label className="field"><span>{t('unit')}</span><input maxLength={30} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></label>
              <label className="field"><span>{t('amount')}</span><input type="number" min={1} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
              <label className="field"><span>{t('priceType')}</span><select value={f.price_type} onChange={(e) => setF({ ...f, price_type: e.target.value })}><option value="Retail">{lang === 'mg' ? 'Antsinjarany' : 'Détail'}</option><option value="Wholesale">{lang === 'mg' ? 'Ambongadiny' : 'Gros'}</option></select></label>
              <label className="field"><span>{t('stock')}</span><select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })}><option value="unknown">{t('stockUnknown')}</option><option value="declared">{t('stockDeclared')}</option><option value="out">{t('stockOut')}</option></select></label>
              <label className="row" style={{ alignSelf: 'end', minHeight: 44 }}><input type="checkbox" checked={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.checked })} /> {t('delivery')}</label>
            </div>
            <button className="btn orange"><Icon name="check" size={18} /> {t('save')}</button>
          </form>
          <div className="card" style={{ paddingBlock: 0 }}>
            {!prices?.length ? <Empty icon="store">—</Empty> : (
              <ul className="list">
                {prices.map((p) => (
                  <li key={p.id} className="row between">
                    <div><b>{p.product}</b> <small>/ {p.unit}</small><div><small>{t('updatedAt')} {fmtDateTime(p.updated_at, lang)}</small></div></div>
                    <div className="row">
                      <input type="number" defaultValue={Number(p.price)} style={{ width: 110 }} aria-label={t('amount')} onBlur={async (e) => {
                        const v = Number(e.target.value)
                        if (v > 0 && v !== Number(p.price)) { const { error } = await supabase!.from('business_prices').update({ price: v }).eq('id', p.id); if (error) setErr(errText(error)) }
                      }} />
                      <select value={p.stock} aria-label={t('stock')} onChange={(e) => supabase!.from('business_prices').update({ stock: e.target.value }).eq('id', p.id)} style={{ width: 'auto' }}>
                        <option value="unknown">?</option><option value="declared">✓</option><option value="out">✗</option>
                      </select>
                      <button className="btn small danger" aria-label={t('del')} onClick={async () => { await supabase!.from('business_prices').delete().eq('id', p.id); reloadPrices() }}><Icon name="trash" size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === 'quotes' && (
        <div className="card" style={{ paddingBlock: 0 }}>
          {!quotes?.length ? <Empty icon="store">{t('noQuotes')}</Empty> : (
            <ul className="list">
              {quotes.map((q) => (
                <li key={q.id} className="stack">
                  <div className="row between"><b>{q.product}{q.quantity ? ` · ${q.quantity}` : ''}</b><QuoteStatus s={q.status} /></div>
                  <small>{fmtDateTime(q.created_at, lang)}{q.contact ? ` · ${q.contact}` : ''}</small>
                  {q.message && <div style={{ fontSize: 14 }}>{q.message}</div>}
                  {q.reply ? <div className="banner ok">{q.reply}</div> : (
                    <div className="row">
                      <input value={replies[q.id] ?? ''} onChange={(e) => setReplies({ ...replies, [q.id]: e.target.value })} placeholder={t('reply')} maxLength={500} />
                      <button className="btn small" onClick={async () => {
                        const r = (replies[q.id] ?? '').trim()
                        if (!r) return
                        const { error } = await supabase!.from('quote_requests').update({ reply: r }).eq('id', q.id)
                        if (error) setErr(errText(error))
                      }}>{t('sendReply')}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div className="grid3 fixed">
          <div className="kpi"><div className="v num">{fmtNum((views ?? []).reduce((s, v) => s + v.views, 0))}</div><div className="l">{t('viewsTotal')}</div></div>
          <div className="kpi"><div className="v num">{fmtNum(prices?.length ?? 0)}</div><div className="l">{t('pricesCount')}</div></div>
          <div className="kpi"><div className="v num">{fmtNum(quotes?.length ?? 0)}</div><div className="l">{t('quotes')}</div></div>
        </div>
      )}
    </div>
  )
}

/** Prix envoyés par les utilisateurs et validés par la modération, pour une série. */
export function ApprovedSubmissions({ code, market, unit, pt }: { code: string; market: string; unit: string; pt: string }) {
  const { t, lang } = useT()
  const { data } = useServer<ServerSubmission[]>(
    () => (supabase ? supabase.from('user_submissions').select('*').eq('status', 'approved').eq('commodity_code', code).eq('market_code', market).eq('unit', unit).eq('price_type', pt).order('observed_on', { ascending: false }).limit(10) : null),
    [code, market, unit, pt], ['user_submissions'],
  )
  if (!data?.length) return null
  return (
    <div className="card">
      <h2>{t('approvedByCommunity')}</h2>
      <ul className="list">
        {data.map((s) => (
          <li key={s.id} className="row between">
            <div><div className="row" style={{ gap: 6 }}><StatusBadge status="verified" /><span className="badge b-estimated">{t('sharedBadge')}</span></div><small>{fmtDay(s.observed_on, lang)}{s.note ? ` · ${s.note}` : ''}</small></div>
            <div className="price num">{fmtAr(Number(s.price))}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Administration partagée : modération, rôles, commerces, synchronisation serveur. */
export function ServerAdmin() {
  const { t, lang } = useT()
  const { session, isStaff, isAdmin } = useAuth()
  const { data: pending, reload } = useServer<ServerSubmission[]>(() => (supabase && isStaff ? supabase.from('user_submissions').select('*').eq('status', 'pending').order('created_at') : null), [isStaff], ['user_submissions'])
  const { data: users, reload: reloadUsers } = useServer<Profile[]>(() => (supabase && isStaff ? supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200) : null), [isStaff])
  const { data: shops } = useServer<Business[]>(() => (supabase && isStaff ? supabase.from('businesses').select('*').order('verified').order('updated_at', { ascending: false }).limit(200) : null), [isStaff], ['businesses'])
  const { data: runs } = useServer<{ id: number; status: string; trigger: string; started_at: string; duration_ms: number | null; fetched: number; inserted: number; updated: number; error: string | null }[]>(
    () => (supabase ? supabase.from('data_sync_runs').select('*').order('id', { ascending: false }).limit(10) : null), [], ['data_sync_runs'])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!supabase) return null
  if (!session) return <NeedLogin />

  const moderate = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase!.from('user_submissions').update({ status, moderation_note: notes[id] || null }).eq('id', id)
    if (error) setErr(errText(error)); else reload()
  }
  const runSync = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-wfp`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: '{}' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) setErr(j.error || `HTTP ${res.status}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row between"><h2>{t('serverSync')}</h2>
          {isAdmin && <button className="btn small secondary" onClick={runSync} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />} {t('runServerSync')}</button>}
        </div>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>{t('date')}</th><th>{t('status')}</th><th>{t('fetched')}</th><th>{t('inserted')}</th><th>{t('updated')}</th><th /></tr></thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.started_at, lang)}<div><small>{r.trigger}</small></div></td>
                  <td><span className={`badge ${r.status === 'success' ? 'b-verified' : r.status === 'running' ? 'b-declared' : 'b-suspect'}`}>{r.status}</span></td>
                  <td className="num">{fmtNum(r.fetched)}</td><td className="num">{fmtNum(r.inserted)}</td><td className="num">{fmtNum(r.updated)}</td>
                  <td><small>{r.error}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <div className="banner err">{err}</div>}
      </div>

      {isStaff ? (
        <>
          <div className="card">
            <h2>{t('serverModeration')} ({pending?.length ?? 0})</h2>
            {!pending?.length ? <small>{t('noneToModerate')}</small> : (
              <ul className="list">
                {pending.map((s) => (
                  <li key={s.id} className="stack">
                    <div><b>{commodityLabel(s.commodity_name, lang)}</b> · {s.market_name} · <span className="price num">{fmtAr(Number(s.price))}</span>/{s.unit} <small>({s.price_type})</small></div>
                    <small>{fmtDay(s.observed_on, lang)} · {s.note || '—'} · {fmtDateTime(s.created_at, lang)}</small>
                    <div className="row wrap">
                      <input value={notes[s.id] ?? ''} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} placeholder={t('comment')} maxLength={300} style={{ flex: '1 1 160px' }} />
                      <button className="btn small" onClick={() => moderate(s.id, 'approved')}><Icon name="check" size={14} /> {t('approve')}</button>
                      <button className="btn small danger" onClick={() => moderate(s.id, 'rejected')}><Icon name="x" size={14} /> {t('reject')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>{t('usersAdmin')} ({users?.length ?? 0})</h2>
            <ul className="list">
              {(users ?? []).map((u) => (
                <li key={u.id} className="row between wrap">
                  <div><b>{u.display_name || u.email}</b><div><small>{u.email} · {t('reputation')} {u.reputation}</small></div></div>
                  <select value={u.role} disabled={!isAdmin || u.id === session.user.id} style={{ width: 'auto' }} aria-label={t('role')} onChange={async (e) => {
                    const { error } = await supabase!.from('profiles').update({ role: e.target.value }).eq('id', u.id)
                    if (error) setErr(errText(error)); else reloadUsers()
                  }}>
                    <option value="user">{t('roleUser')}</option><option value="merchant">{t('roleMerchant')}</option><option value="moderator">{t('roleModerator')}</option><option value="admin">{t('roleAdmin')}</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>{t('businessesAdmin')} ({shops?.length ?? 0})</h2>
            <ul className="list">
              {(shops ?? []).map((b) => (
                <li key={b.id} className="row between wrap">
                  <div><b>{b.name}</b> {b.verified && <span className="badge b-verified">{t('verifiedShop')}</span>}<div><small>{b.osm_id} · {b.phone || '—'} · {fmtDateTime(b.updated_at, lang)}</small></div></div>
                  {isAdmin && (
                    <button className={`btn small ${b.verified ? 'ghost' : ''}`} onClick={async () => {
                      const { error } = await supabase!.from('businesses').update({ verified: !b.verified }).eq('id', b.id)
                      if (error) setErr(errText(error))
                    }}>{b.verified ? t('unverify') : t('verify')}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : <small>{t('adminOnly')}</small>}
    </div>
  )
}
