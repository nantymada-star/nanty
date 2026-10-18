import { db, getKV, setKV } from './db'
import { supabase } from './supabase'
import { notify } from './sync'
import { fmtAr } from './format'
import { getSettings } from './settings'
import { fold } from '../../supabase/functions/sync-online/parse'
import type { OnlineProduct } from './online'

/**
 * Copie locale des prix en ligne (mode hors ligne) : lecture incrémentale (last_seen_at, id),
 * au plus toutes les 6 heures sauf demande explicite. Les dates du serveur sont conservées telles quelles.
 */
const CURSOR = 'online:cursor'
const LAST = 'online:lastSync'
const PAGE = 1000
const MIN_INTERVAL = 6 * 3600_000
const COLS = 'id, shop_id, name, url, image_url, category, product_group, size_qty, size_unit, price, unit_price, in_stock, suspect, barcode, match_key, search_text, first_seen_at, last_seen_at, last_changed_at'
const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export async function syncOnlineCache(force = false) {
  if (!supabase) return 0
  const last = await getKV<string | null>(LAST, null)
  if (!force && last && Date.now() - new Date(last).getTime() < MIN_INTERVAL) return 0
  let cursor = await getKV<{ ts: string; id: string } | null>(CURSOR, null)
  let n = 0
  const changed: OnlineProduct[] = []
  for (let guard = 0; guard < 200; guard++) {
    let q = supabase.from('online_products').select(COLS).order('last_seen_at').order('id').limit(PAGE)
    if (cursor) q = q.or(`last_seen_at.gt.${quote(cursor.ts)},and(last_seen_at.eq.${quote(cursor.ts)},id.gt.${quote(cursor.id)})`)
    const { data, error } = await q
    if (error) throw error
    const rows = ((data ?? []) as OnlineProduct[]).map((r) => ({ ...r, price: Number(r.price), unit_price: r.unit_price == null ? null : Number(r.unit_price) }))
    if (!rows.length) break
    const before = await db.onlineProducts.bulkGet(rows.map((r) => r.id))
    rows.forEach((r, i) => { if (!before[i] || before[i]!.price !== r.price) changed.push(r) })
    await db.onlineProducts.bulkPut(rows)
    n += rows.length
    cursor = { ts: rows[rows.length - 1].last_seen_at, id: rows[rows.length - 1].id }
    await setKV(CURSOR, cursor)
    if (rows.length < PAGE) break
  }
  await setKV(LAST, new Date().toISOString())
  if (changed.length) await evaluateOnlineAlerts(changed)
  return n
}

/** Alertes « prix en ligne » : notification quand un produit suivi passe sous le seuil. Une seule par prix. */
export async function evaluateOnlineAlerts(rows: OnlineProduct[]) {
  const alerts = (await db.alerts.toArray()).filter((a) => a.active && a.kind === 'online' && a.onlineKey)
  if (!alerts.length) return 0
  const lang = getSettings().lang
  let fired = 0
  for (const a of alerts) {
    const hit = rows.filter((r) => r.match_key === a.onlineKey && !r.suspect && r.price <= a.threshold).sort((x, y) => x.price - y.price)[0]
    if (!hit) continue
    const tag = `${hit.id}|${hit.price}`
    if (a.lastFiredObsId === tag) continue
    await notify(
      lang === 'mg' ? 'Nidina ny vidiny an-tserasera' : 'Prix en ligne sous votre seuil',
      `${hit.name} — ${hit.shop_id} : ${fmtAr(hit.price)} (${lang === 'mg' ? 'hita an-tserasera' : 'affiché en ligne'})`,
      'alert',
      hit.last_seen_at.slice(0, 10),
      `/an-tserasera?q=${encodeURIComponent(hit.name)}`,
    )
    await db.alerts.update(a.id!, { lastFiredObsId: tag })
    fired++
  }
  return fired
}

export interface OnlineFilter { q?: string; group?: string; shop?: string; sort?: 'unit' | 'price' | 'recent'; limit?: number }

/** Même recherche que l'écran en ligne, sur la copie locale (hors ligne). */
export async function queryLocalOnline(f: OnlineFilter) {
  const words = fold(f.q ?? '').split(/\s+/).filter((x) => x.length > 1)
  let list = await (f.group && f.group !== 'other' ? db.onlineProducts.where('product_group').equals(f.group).toArray() : db.onlineProducts.toArray())
  if (f.group === 'other') list = list.filter((p) => !p.product_group)
  if (f.shop) list = list.filter((p) => p.shop_id === f.shop)
  if (words.length) list = list.filter((p) => { const s = p.search_text ?? fold(p.name); return words.every((w) => s.includes(w)) })
  const sort = f.sort ?? 'unit'
  list.sort(sort === 'unit' ? (a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity) || a.id.localeCompare(b.id)
    : sort === 'price' ? (a, b) => a.price - b.price : (a, b) => b.last_changed_at.localeCompare(a.last_changed_at))
  return list.slice(0, f.limit ?? 50)
}

/** Offres locales d'un même produit (clé de rapprochement), de la moins chère à la plus chère. */
export const localOffers = (key: string) => db.onlineProducts.where('match_key').equals(key).sortBy('price')
