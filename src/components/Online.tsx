import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { useAuth } from '../lib/auth'
import { errText, supabase, SUPABASE_URL } from '../lib/supabase'
import { useServer } from '../lib/useServer'
import { fmtAr, fmtDateTime, fmtDay } from '../lib/format'
import { groupForCommodity, isStaleOnline, spreadPct, type OnlineMatch, type OnlineProduct, type OnlineShop } from '../lib/online'
import { db } from '../lib/db'
import { localOffers } from '../lib/onlineCache'

export function OnlineBadge({ p }: { p: Pick<OnlineProduct, 'last_seen_at'> }) {
  const { t } = useT()
  if (isStaleOnline(p)) return <span className="badge b-stale" title={t('stStaleHelp')}>{t('stStale')}</span>
  return <span className="badge b-online" title={t('stOnlineHelp')}><Icon name="globe" size={11} /> {t('stOnline')}</span>
}

/** Une ligne produit : nom, boutique, prix, prix au kg/L, date du relevé, lien vers la boutique. */
export function OnlineRow({ p, shop }: { p: OnlineProduct; shop?: OnlineShop }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  return (
    <li className="stack" style={{ gap: 6 }}>
      <button style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 0, textAlign: 'left', width: '100%', padding: '10px 0', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        {p.image_url
          ? <img src={p.image_url} alt="" loading="lazy" width={44} height={44} style={{ borderRadius: 10, objectFit: 'cover', background: 'var(--soft)' }} />
          : <span className="thumb" style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--soft)' }}><Icon name="store" size={18} /></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{p.name}</div>
          <div className="row wrap" style={{ gap: 6, marginTop: 3, fontSize: 12.5 }}>
            <OnlineBadge p={p} />
            {p.suspect && <span className="badge b-declared" title={t('suspectHelp')}>{t('suspect')}</span>}
            {p.in_stock === false && <span className="badge b-stale">{t('outOfStock')}</span>}
            <span className="muted">{shop?.name ?? p.shop_id} · {t('seenOn')} {fmtDay(p.last_seen_at, lang)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="price num">{fmtAr(p.price)}</div>
          {p.unit_price != null && p.size_unit && <small className="num muted">{fmtAr(p.unit_price)} / {p.size_unit}</small>}
        </div>
      </button>
      {open && <OnlineDetail p={p} />}
    </li>
  )
}

function OnlineDetail({ p }: { p: OnlineProduct }) {
  const { t, lang } = useT()
  const { data } = useServer<{ seen_on: string; price: number }[]>(
    () => supabase?.from('online_price_points').select('seen_on, price').eq('product_id', p.id).order('seen_on') ?? null, [p.id])
  return (
    <div className="card stack" style={{ background: 'var(--soft)' }}>
      <small>{t('stOnlineHelp')}. {t('lastObs')} : {fmtDateTime(p.last_seen_at, lang)} · {t('changedSince')} : {fmtDateTime(p.last_changed_at, lang)}</small>
      {data && data.length > 1 && (
        <div style={{ height: 140 }} aria-label={t('priceHistory')}>
          <ResponsiveContainer>
            <LineChart data={data.map((d) => ({ d: d.seen_on, v: Number(d.price) }))}>
              <XAxis dataKey="d" fontSize={10} />
              <YAxis fontSize={10} width={50} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => fmtAr(Number(v))} />
              <Line dataKey="v" stroke="var(--green2)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {p.match_key && <OtherOffers p={p} />}
      <div className="row wrap">
        {p.url && <a className="btn small secondary" href={p.url} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={14} /> {t('openShop')}</a>}
        {p.match_key && <OnlineAlertButton p={p} />}
      </div>
    </div>
  )
}

/** Offres du même produit (même code-barres, ou même nom et contenance) dans les autres boutiques. */
function OtherOffers({ p }: { p: OnlineProduct }) {
  const { t, lang } = useT()
  const [offline, setOffline] = useState<OnlineProduct[] | null>(null)
  const { data, error } = useServer<OnlineProduct[]>(
    () => supabase?.from('online_products').select('*').eq('match_key', p.match_key!).order('price').limit(20) ?? null, [p.match_key], ['online_products'])
  useEffect(() => { if (error) localOffers(p.match_key!).then(setOffline).catch(() => setOffline([])) }, [error, p.match_key])
  const { data: shops } = useServer<OnlineShop[]>(() => supabase?.from('online_shops').select('*') ?? null, [])
  const rows = (data ?? offline ?? []).filter((x) => x.id !== p.id)
  if (!rows.length) return <small className="muted">{t('noOtherShop')}</small>
  const all = [p, ...rows].filter((x) => !x.suspect).map((x) => Number(x.price))
  const min = Math.min(...all)
  return (
    <div className="stack" style={{ gap: 4 }}>
      <b style={{ fontSize: 14 }}>{t('sameProductElsewhere')}{p.barcode ? ` · ${t('barcode')} ${p.barcode}` : ''}</b>
      <ul className="list">
        {rows.map((x) => (
          <li key={x.id} className="row between" style={{ fontSize: 13.5 }}>
            <span>{shops?.find((sh) => sh.id === x.shop_id)?.name ?? x.shop_id} · <span className="muted">{fmtDay(x.last_seen_at, lang)}</span>{x.suspect && <> <span className="badge b-declared">{t('suspect')}</span></>}</span>
            <b className={`num ${Number(x.price) === min ? 'down' : ''}`}>{fmtAr(Number(x.price))}</b>
          </li>
        ))}
      </ul>
      {Number(p.price) > min && <small className="down">{t('cheaperElsewhere', { v: fmtAr(Number(p.price) - min) })}</small>}
    </div>
  )
}

/** Alerte locale : prévenir quand ce produit (toutes boutiques) passe sous un prix. */
function OnlineAlertButton({ p }: { p: OnlineProduct }) {
  const { t } = useT()
  const [th, setTh] = useState(String(Math.max(50, Math.round(Number(p.price) * 0.95))))
  const [done, setDone] = useState(false)
  if (done) return <span className="badge b-verified"><Icon name="check" size={12} /> {t('alertCreated')}</span>
  return (
    <span className="row" style={{ gap: 6 }}>
      <input type="number" min={50} value={th} onChange={(e) => setTh(e.target.value)} style={{ width: 110 }} aria-label={t('threshold')} />
      <button className="btn small" onClick={async () => {
        const v = Number(th)
        if (!(v > 0)) return
        await db.alerts.add({ commodityCode: '', marketCode: '*', unit: p.size_unit ?? '', priceType: 'online', kind: 'online', onlineKey: p.match_key, product: p.name, threshold: v, active: true, createdAt: new Date().toISOString() })
        setDone(true)
      }}><Icon name="bell" size={14} /> {t('alertBelow')}</button>
    </span>
  )
}

/** Comparaison entre boutiques : produits vendus par au moins deux boutiques, triés par écart de prix. */
export function OnlineMatches({ group, q }: { group?: string; q?: string }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState<string | null>(null)
  const { data, loading } = useServer<OnlineMatch[]>(() => {
    if (!supabase) return null
    let r = supabase.from('online_matches').select('*')
    if (group && group !== 'other') r = r.eq('product_group', group)
    if (q) for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 4)) r = r.ilike('name', `%${w}%`)
    return r.order('shops', { ascending: false }).order('max_price', { ascending: false }).limit(100)
  }, [group, q], ['online_products'])
  const list = [...(data ?? [])].sort((a, b) => (spreadPct(b) ?? 0) - (spreadPct(a) ?? 0))
  if (loading && !data) return <div className="empty"><span className="spinner" /></div>
  if (!list.length) return <div className="card"><small>{t('noMatches')}</small></div>
  return (
    <div className="card" style={{ paddingBlock: 0 }}>
      <ul className="list">
        {list.map((m) => (
          <li key={m.match_key} className="stack" style={{ gap: 6 }}>
            <button className="row between" style={{ background: 'none', border: 0, width: '100%', padding: '10px 0', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setOpen(open === m.match_key ? null : m.match_key)} aria-expanded={open === m.match_key}>
              <span style={{ minWidth: 0 }}>
                <b>{m.name}</b>
                <div><small className="muted">{m.shops} {t('shopsCount')}{m.barcode ? ` · ${t('barcode')} ${m.barcode}` : ''} · {fmtDay(m.last_seen_at, lang)}</small></div>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="num"><b className="down">{m.min_price != null ? fmtAr(Number(m.min_price)) : '—'}</b> – <b className="up">{m.max_price != null ? fmtAr(Number(m.max_price)) : '—'}</b></span>
                {spreadPct(m) != null && <div><small className="muted">{t('spread')} {spreadPct(m)} %</small></div>}
              </span>
            </button>
            {open === m.match_key && <MatchOffers matchKey={m.match_key} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MatchOffers({ matchKey }: { matchKey: string }) {
  const { data } = useServer<OnlineProduct[]>(() => supabase?.from('online_products').select('*').eq('match_key', matchKey).order('price') ?? null, [matchKey])
  return <ul className="list">{data?.map((p) => <OnlineRow key={p.id} p={p} />)}</ul>
}

/** Sur la fiche d'un produit PAM : produits emballés du même rayon vendus en ligne (riz, huile, haricots, maïs). */
export function OnlineForCommodity({ code }: { code: string }) {
  const { t } = useT()
  const group = groupForCommodity(code)
  const { data } = useServer<OnlineProduct[]>(
    () => (group && supabase ? supabase.from('online_products').select('*').eq('product_group', group).not('unit_price', 'is', null).order('unit_price').limit(5) : null),
    [group], ['online_products'])
  const { data: shops } = useServer<OnlineShop[]>(() => supabase?.from('online_shops').select('*') ?? null, [])
  if (!group || !data?.length) return null
  return (
    <div className="card stack">
      <div className="row between"><h2>{t('onlineForProduct')}</h2><Link to={`/an-tserasera?g=${group}`}>{t('seeAll')}</Link></div>
      <small>{t('onlineForProductNote')}</small>
      <ul className="list">{data.map((p) => <OnlineRow key={p.id} p={p} shop={shops?.find((s) => s.id === p.shop_id)} />)}</ul>
    </div>
  )
}

/** Administration : boutiques, activation, tâche Apify, collecte à la demande et historique des collectes. */
export function OnlineAdmin() {
  const { t, lang } = useT()
  const { session, profile } = useAuth()
  const { data: shops, reload } = useServer<OnlineShop[]>(() => supabase?.from('online_shops').select('*').order('id') ?? null, [], ['online_shops'])
  const { data: runs } = useServer<{ id: number; source: string; status: string; started_at: string; fetched: number; inserted: number; updated: number; error: string | null }[]>(
    () => supabase?.from('data_sync_runs').select('id, source, status, started_at, fetched, inserted, updated, error').like('source', 'online:%').order('id', { ascending: false }).limit(10) ?? null,
    [], ['data_sync_runs'])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  if (profile?.role !== 'admin' || !session) return null

  const save = async (s: OnlineShop, patch: Partial<OnlineShop>) => {
    const { error } = await supabase!.from('online_shops').update(patch).eq('id', s.id)
    setMsg(error ? errText(error) : ''); reload()
  }
  const runNow = async (shop?: string) => {
    setBusy(shop ?? 'all'); setMsg('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-online`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(shop ? { shop } : {}),
      })
      const j = await res.json().catch(() => ({}))
      setMsg((j.results ?? []).map((r: { shop: string; ok: boolean; kept?: number; error?: string }) => `${r.shop} : ${r.ok ? `${r.kept} ${t('productsCount')}` : r.error}`).join(' · ') || `HTTP ${res.status}`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }

  // Pilotage d'Apify par le serveur (le jeton Apify reste un secret côté serveur)
  const apify = async (action: 'apify-start' | 'apify-status', shop: string) => {
    setBusy(shop); setMsg('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-online`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, shop }),
      })
      const j = await res.json().catch(() => ({}))
      const r = j.run
      setMsg(j.ok && r ? `${j.task} : ${r.status}${r.items != null ? ` · ${r.items} ${t('productsCount')}` : ''}${r.finishedAt ? ` · ${fmtDateTime(r.finishedAt, lang)}` : ''}` : j.error ?? `HTTP ${res.status}`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="card stack">
      <div className="row between"><h2>{t('shopsAdmin')}</h2>
        <button className="btn small" disabled={!!busy} onClick={() => runNow()}>{busy === 'all' ? <span className="spinner" /> : <Icon name="refresh" size={14} />} {t('syncNow')}</button>
      </div>
      <ul className="list">
        {shops?.map((s) => (
          <li key={s.id} className="stack" style={{ gap: 6 }}>
            <div className="row between wrap">
              <b>{s.name} <small className="muted">· {s.kind} · <ShopCount id={s.id} /> {t('productsCount')}</small></b>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={s.enabled} onChange={(e) => save(s, { enabled: e.target.checked })} /> {t('enabled')}</label>
            </div>
            <small className="muted">{s.note} {s.last_run_at && `· ${t('lastRun')} : ${fmtDateTime(s.last_run_at, lang)}`}</small>
            {s.kind === 'apify' && (
              <input defaultValue={s.config.task ?? ''} placeholder={t('apifyTask')} aria-label={t('apifyTask')} maxLength={120}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (s.config.task ?? '')) save(s, { config: { ...s.config, task: v || undefined } }) }} />
            )}
            <div className="row wrap">
              <button className="btn small ghost" disabled={!!busy} onClick={() => runNow(s.id)}>{busy === s.id ? <span className="spinner" /> : <Icon name="refresh" size={14} />} {s.kind === 'apify' ? t('importApify') : s.name}</button>
              {s.kind === 'apify' && <>
                <button className="btn small ghost" disabled={!!busy} onClick={() => apify('apify-start', s.id)}><Icon name="plus" size={14} /> {t('startApify')}</button>
                <button className="btn small ghost" disabled={!!busy} onClick={() => apify('apify-status', s.id)}><Icon name="chart" size={14} /> {t('statusApify')}</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
      {msg && <div className="banner info">{msg}</div>}
      <ul className="list">
        {runs?.map((r) => (
          <li key={r.id} className="row between wrap" style={{ fontSize: 13 }}>
            <span>{(r.source ?? '').replace('online:', '')} · {fmtDateTime(r.started_at, lang)}</span>
            <span className={`badge ${r.status === 'success' ? 'b-verified' : r.status === 'error' ? 'b-declared' : 'b-pending'}`}>{r.status}</span>
            <small className="muted" style={{ width: '100%' }}>{r.fetched} · +{r.inserted} · ~{r.updated}{r.error ? ` · ${r.error}` : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ShopCount({ id }: { id: string }) {
  const { data } = useServer<number>(async () => {
    const r = await supabase!.from('online_products').select('id', { count: 'exact', head: true }).eq('shop_id', id)
    return { data: r.count ?? 0, error: r.error }
  }, [id], ['online_products'])
  return <>{data ?? '…'}</>
}
