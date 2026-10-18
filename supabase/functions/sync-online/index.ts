// Synchronisation des prix affichés par les boutiques en ligne malgaches vers public.online_products.
// Deux sources : API publique WooCommerce Store (aucune clé) et jeux de données Apify (secret APIFY_TOKEN).
// Appelée chaque jour par pg_cron (en-tête x-cron-token) ou par un administrateur connecté ({"shop":"id"} pour une seule boutique).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { fromApify, fromWoo, isNonGrocery, normalizeItem, suspectChange, type OnlineProduct, type RawItem } from './parse.ts'

const UA = 'MadaPrice/1.0 (comparateur de prix Madagascar; +https://github.com/nantymada-star/nanty)'
const MAX_PAGES = 50

interface Shop { id: string; name: string; url: string; kind: 'woocommerce' | 'apify'; config: Record<string, unknown>; enabled: boolean }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(url: string, headers: Record<string, string> = {}) {
  let last = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA, ...headers } })
      if (res.ok) return await res.json()
      last = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
      if (res.status < 500 && res.status !== 429) break
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
    await sleep(1500 * attempt)
  }
  throw new Error(`${new URL(url).host} : ${last}`)
}

async function collectWoo(shop: Shop): Promise<RawItem[]> {
  const cats = Array.isArray(shop.config.categories) ? (shop.config.categories as number[]) : [null]
  const byId = new Map<string, RawItem>()
  for (const c of cats) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const q = new URLSearchParams({ per_page: '100', page: String(page) })
      if (c != null) q.set('category', String(c))
      const list = await getJson(`${shop.url.replace(/\/$/, '')}/wp-json/wc/store/v1/products?${q}`)
      if (!Array.isArray(list)) throw new Error('Réponse WooCommerce inattendue')
      for (const p of list) byId.set(String(p?.id), fromWoo(p))
      if (list.length < 100) break
      await sleep(300) // politesse envers le site
    }
  }
  return [...byId.values()]
}

function apifyAuth() {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('Secret APIFY_TOKEN manquant (Supabase > Edge Functions > Secrets)')
  return { Authorization: `Bearer ${token}` }
}

/** Tâches Apify du compte (identifiant « utilisateur~nom »). */
async function listApifyTasks() {
  const r = await getJson('https://api.apify.com/v2/actor-tasks?limit=100&desc=1', apifyAuth())
  // deno-lint-ignore no-explicit-any
  return ((r?.data?.items ?? []) as any[]).map((t) => ({ id: t.id as string, task: `${t.username}~${t.name}`, name: t.name as string, modifiedAt: t.modifiedAt as string }))
}

/** Tâche de la boutique : config.task, sinon la tâche dont le nom contient l'identifiant de la boutique (enregistrée ensuite). */
// deno-lint-ignore no-explicit-any
async function resolveTask(db: any, shop: Shop): Promise<string> {
  if (shop.config.task) return shop.config.task as string
  const key = shop.id.split('-')[0]
  const found = (await listApifyTasks()).find((t) => t.name.toLowerCase().includes(key))
  if (!found) throw new Error(`Aucune tâche Apify dont le nom contient « ${key} » (config.task à renseigner)`)
  shop.config = { ...shop.config, task: found.task }
  await db.from('online_shops').update({ config: shop.config }).eq('id', shop.id)
  return found.task
}

// deno-lint-ignore no-explicit-any
async function collectApify(db: any, shop: Shop): Promise<{ items: RawItem[]; note: string | null }> {
  const auth = apifyAuth()
  const actor = shop.config.actor as string | undefined
  const task = actor ? undefined : await resolveTask(db, shop)
  const base = task ? `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(task)}` : `https://api.apify.com/v2/acts/${encodeURIComponent(actor!)}`
  const run = await getJson(`${base}/runs/last?status=SUCCEEDED`, auth)
  const ds = run?.data?.defaultDatasetId
  if (!ds) throw new Error('Aucune exécution Apify réussie pour cette tâche')
  const items: RawItem[] = []
  for (let offset = 0; offset < 100000; offset += 1000) {
    const page = await getJson(`https://api.apify.com/v2/datasets/${ds}/items?clean=true&format=json&limit=1000&offset=${offset}`, auth)
    if (!Array.isArray(page)) throw new Error('Jeu de données Apify inattendu')
    items.push(...page.map(fromApify))
    if (page.length < 1000) break
  }
  const finished = run.data.finishedAt ? new Date(run.data.finishedAt) : null
  const ageDays = finished ? (Date.now() - finished.getTime()) / 86400000 : null
  return { items, note: ageDays != null && ageDays > 3 ? `Dernière collecte Apify du ${finished!.toISOString().slice(0, 10)} (plus de 3 jours)` : null }
}

// deno-lint-ignore no-explicit-any
async function syncShop(db: any, shop: Shop, trigger: string) {
  const t0 = Date.now()
  const { data: run } = await db.from('data_sync_runs').insert({ source: `online:${shop.id}`, trigger, status: 'running' }).select('id').single()
  const finish = (patch: Record<string, unknown>) =>
    db.from('data_sync_runs').update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).eq('id', run!.id)
  try {
    let raw: RawItem[]
    let note: string | null = null
    if (shop.kind === 'woocommerce') raw = await collectWoo(shop)
    else ({ items: raw, note } = await collectApify(db, shop))

    const products = new Map<string, OnlineProduct>()
    let rejected = 0
    for (const r of raw) {
      const p = normalizeItem(shop.id, r)
      if (p) products.set(p.id, p); else rejected++
    }

    // Produits déjà connus de cette boutique (lus par pages)
    const known = new Map<string, { id: string; name: string; category: string; price: number; first_seen_at: string; last_changed_at: string }>()
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await db.from('online_products').select('id, name, category, price, first_seen_at, last_changed_at')
        .eq('shop_id', shop.id).order('id').range(from, from + 999)
      if (error) throw error
      for (const x of page ?? []) known.set(x.id, x)
      if (!page || page.length < 1000) break
    }

    // Retire les articles déjà stockés qui relèvent désormais des exclusions (appareils, etc.)
    const excluded = [...known.values()].filter((k) => isNonGrocery(k.name, [k.category])).map((k) => k.id)
    for (let i = 0; i < excluded.length; i += 100) {
      const { error } = await db.from('online_products').delete().in('id', excluded.slice(i, i + 100))
      if (error) throw error
    }

    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    let inserted = 0, updated = 0, suspects = 0
    const rows = [...products.values()].map((p) => {
      const cur = known.get(p.id)
      if (!cur) { inserted++; return { ...p, suspect: null, first_seen_at: now, last_seen_at: now, last_changed_at: now } }
      const changed = Number(cur.price) !== p.price
      if (changed) updated++
      const suspect = changed ? suspectChange(Number(cur.price), p.price) : null
      if (suspect) suspects++
      return { ...p, suspect, first_seen_at: cur.first_seen_at, last_seen_at: now, last_changed_at: changed ? now : cur.last_changed_at }
    })
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error: e1 } = await db.from('online_products').upsert(chunk, { onConflict: 'id' })
      if (e1) throw e1
      const { error: e2 } = await db.from('online_price_points')
        .upsert(chunk.map((r) => ({ product_id: r.id, seen_on: today, price: r.price })), { onConflict: 'product_id,seen_on' })
      if (e2) throw e2
    }
    // Valeurs suspectes par médiane (historique du produit, même produit dans les autres boutiques)
    const { data: flagged, error: e3 } = await db.rpc('online_flag_outliers', { p_shop: shop.id })
    if (e3) throw e3
    suspects = Number(flagged ?? suspects)
    await db.from('online_shops').update({ last_run_at: now }).eq('id', shop.id)
    const msg = [rejected ? `${rejected} ligne(s) rejetée(s)` : null, note].filter(Boolean).join(' · ') || null
    await finish({ status: 'success', fetched: raw.length, inserted, updated, suspects, attempts: 1, error: msg })
    return { shop: shop.id, ok: true, fetched: raw.length, kept: rows.length, inserted, updated, suspects, rejected }
  } catch (e) {
    const o = e as { message?: string; details?: string; hint?: string; code?: string }
    const msg = e instanceof Error ? e.message
      : o?.message ? [o.code, o.message, o.details, o.hint].filter(Boolean).join(' · ') : JSON.stringify(e)
    await finish({ status: 'error', error: msg.slice(0, 1000) })
    return { shop: shop.id, ok: false, error: msg }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // --- Autorisation : jeton cron (Vault) ou administrateur connecté ---
  let trigger = 'cron'
  const cronToken = req.headers.get('x-cron-token')
  if (cronToken) {
    const { data: okToken } = await db.rpc('check_cron_token', { t: cronToken })
    if (!okToken) return json({ error: 'jeton invalide' }, 401)
  } else {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await db.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'non authentifié' }, 401)
    const { data: prof } = await db.from('profiles').select('role').eq('id', u.user.id).single()
    if (prof?.role !== 'admin') return json({ error: 'réservé aux administrateurs' }, 403)
    trigger = 'admin'
  }

  const body = await req.json().catch(() => ({}))
  const only = typeof body?.shop === 'string' ? body.shop : null

  // Pilotage d'Apify : liste des tâches, lancement d'une collecte, état de la dernière exécution
  try {
    if (body?.action === 'apify-tasks') return json({ ok: true, tasks: await listApifyTasks() })
    if ((body?.action === 'apify-start' || body?.action === 'apify-status') && only) {
      const { data: shop } = await db.from('online_shops').select('id, name, url, kind, config, enabled').eq('id', only).single()
      if (!shop || shop.kind !== 'apify') return json({ ok: false, error: 'boutique Apify inconnue' }, 404)
      const task = await resolveTask(db, shop as Shop)
      const url = `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(task)}/runs`
      if (body.action === 'apify-start') {
        // Entrée fournie (apify/input-*.json) : enregistrée dans la tâche, pour les lancements planifiés aussi
        if (body.input && typeof body.input === 'object') {
          const put = await fetch(`https://api.apify.com/v2/actor-tasks/${encodeURIComponent(task)}/input`, {
            method: 'PUT', headers: { ...apifyAuth(), 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(body.input),
          })
          if (!put.ok) return json({ ok: false, error: `Mise à jour de la tâche : HTTP ${put.status} ${(await put.text()).slice(0, 200)}` }, 502)
        }
        const res = await fetch(url, { method: 'POST', headers: { ...apifyAuth(), 'Content-Type': 'application/json', 'User-Agent': UA }, body: '{}' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) return json({ ok: false, error: j?.error?.message ?? `HTTP ${res.status}` }, 502)
        return json({ ok: true, task, run: { id: j.data?.id, status: j.data?.status, startedAt: j.data?.startedAt } })
      }
      const last = await getJson(`${url}/last`, apifyAuth())
      const d = last?.data ?? {}
      let items: number | null = null
      if (d.defaultDatasetId) {
        const info = await getJson(`https://api.apify.com/v2/datasets/${d.defaultDatasetId}`, apifyAuth())
        items = info?.data?.itemCount ?? null
      }
      return json({ ok: true, task, run: { id: d.id, status: d.status, startedAt: d.startedAt, finishedAt: d.finishedAt, items, stats: { requestsFinished: d.stats?.requestsFinished, requestsFailed: d.stats?.requestsFailed } } })
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
  let q = db.from('online_shops').select('id, name, url, kind, config, enabled').order('id')
  q = only ? q.eq('id', only) : q.eq('enabled', true)
  const { data: shops, error } = await q
  if (error) return json({ ok: false, error: error.message }, 500)

  const results = []
  for (const s of (shops ?? []) as Shop[]) results.push(await syncShop(db, s, trigger))
  return json({ ok: results.every((r) => r.ok), results })
})
