// Synchronisation serveur des prix WFP (HDX HAPI) vers la table public.price_observations.
// Appelée chaque jour par pg_cron (en-tête x-cron-token vérifié contre Vault) ou par un administrateur connecté.
// Secret requis : HAPI_APP_IDENTIFIER (base64 « app:email »), saisi dans le tableau de bord Supabase.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const HAPI = 'https://hapi.humdata.org/api/v2/food-security-nutrition-poverty/food-prices-market-monitor'
const PAGE = 10000
const HISTORY_YEARS = 4

interface Row {
  location_code: string
  admin1_name: string | null
  admin2_name: string | null
  market_code: string
  market_name: string
  commodity_code: string
  commodity_name: string
  commodity_category: string
  currency_code: string
  unit: string
  price_flag: string
  price_type: string
  price: number | string
  lat: number | null
  lon: number | null
  reference_period_start: string
  reference_period_end: string
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function normalizeUnit(u: string) {
  const l = (u || '').trim().toLowerCase()
  if (l === 'kg' || l === '1 kg') return 'kg'
  if (l === 'l' || l === '1 l' || l === 'litre') return 'L'
  return (u || '').trim()
}

/** Même normalisation que l'application (src/lib/hapi.ts) : la date d'origine n'est jamais modifiée. */
function normalize(rows: Row[]) {
  const ok = new Map<string, Record<string, unknown>>()
  let rejected = 0
  for (const r of rows) {
    const price = typeof r.price === 'string' ? Number(r.price) : r.price
    if (r.location_code !== 'MDG' || r.currency_code !== 'MGA' || !Number.isFinite(price) || price <= 0 || !r.reference_period_start) { rejected++; continue }
    const ps = r.reference_period_start.slice(0, 10)
    const id = ['wfp', r.market_code, r.commodity_code, r.unit, r.price_type, r.price_flag, ps].join('|')
    if (ok.has(id)) { rejected++; continue }
    ok.set(id, {
      id, source: 'wfp-hapi', market_code: String(r.market_code), market_name: r.market_name,
      admin1: r.admin1_name ?? '', admin2: r.admin2_name ?? '', lat: r.lat, lon: r.lon,
      commodity_code: String(r.commodity_code), commodity_name: r.commodity_name, category: r.commodity_category,
      unit: normalizeUnit(r.unit), price_type: r.price_type, price_flag: r.price_flag, currency: r.currency_code, price,
      period_start: ps, period_end: (r.reference_period_end || r.reference_period_start).slice(0, 10), suspect: null,
    })
  }
  return { rows: [...ok.values()], rejected }
}

/** Valeurs à plus de ×3 ou ÷3 de la médiane d'une série (≥ 4 points) : marquées « suspectes ». */
function flagOutliers(rows: Record<string, unknown>[]) {
  const g = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const k = [r.market_code, r.commodity_code, r.unit, r.price_type].join('|')
    g.set(k, [...(g.get(k) ?? []), r])
  }
  let n = 0
  for (const list of g.values()) {
    if (list.length < 4) continue
    const s = list.map((r) => r.price as number).sort((a, b) => a - b)
    const med = s[Math.floor(s.length / 2)]
    for (const r of list) {
      const p = r.price as number
      r.suspect = p > med * 3 || p < med / 3 ? 'outlier' : null
      if (r.suspect) n++
    }
  }
  return n
}

async function fetchAll(appId: string, startDate: string) {
  const all: Row[] = []
  for (let offset = 0; offset < 500000; offset += PAGE) {
    const q = new URLSearchParams({ location_code: 'MDG', output_format: 'json', limit: String(PAGE), offset: String(offset), app_identifier: appId, start_date: startDate })
    let res: Response | null = null
    let lastErr = ''
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        res = await fetch(`${HAPI}?${q}`, { headers: { Accept: 'application/json' } })
        if (res.ok) break
        lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
        if (res.status < 500 && res.status !== 429) throw new Error(lastErr)
      } catch (e) {
        lastErr = (e as Error).message
        if (/HTTP 4\d\d/.test(lastErr) && !/HTTP 429/.test(lastErr)) throw e
      }
      res = null
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)))
    }
    if (!res) throw new Error(lastErr || 'HDX HAPI injoignable')
    const body = await res.json()
    if (!Array.isArray(body?.data)) throw new Error('Réponse HDX inattendue')
    all.push(...body.data)
    if (body.data.length < PAGE) break
  }
  return all
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, service, { auth: { persistSession: false } })

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

  const t0 = Date.now()
  const { data: run } = await db.from('data_sync_runs').insert({ source: 'wfp-hapi', trigger, status: 'running' }).select('id').single()
  const finish = (patch: Record<string, unknown>) =>
    db.from('data_sync_runs').update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).eq('id', run!.id)

  try {
    const appId = Deno.env.get('HAPI_APP_IDENTIFIER')
    if (!appId) throw new Error('Secret HAPI_APP_IDENTIFIER manquant (Supabase > Edge Functions > Secrets)')

    // Historique initial ou chevauchement de 3 mois (capte les révisions de la source)
    const { data: last } = await db.from('price_observations').select('period_start').order('period_start', { ascending: false }).limit(1)
    let startDate = `${new Date().getUTCFullYear() - HISTORY_YEARS}-01-01`
    if (last?.length) {
      const d = new Date(last[0].period_start + 'T00:00:00Z')
      d.setUTCMonth(d.getUTCMonth() - 3)
      startDate = d.toISOString().slice(0, 7) + '-01'
    }

    const raw = await fetchAll(appId, startDate)
    const { rows, rejected } = normalize(raw)
    const suspects = flagOutliers(rows)
    const now = new Date().toISOString()
    let inserted = 0
    let updated = 0

    // Lignes déjà connues sur la même période : lues par pages (une liste d'id dans l'URL dépasserait sa longueur max)
    const byId = new Map<string, { id: string; price: number; first_seen_at: string; last_verified_at: string; revisions: unknown[] | null }>()
    // HDX renvoie aussi les périodes qui chevauchent startDate : on part de la plus ancienne date reçue
    const minStart = rows.reduce((m, r) => ((r.period_start as string) < m ? (r.period_start as string) : m), startDate)
    for (let from = 0; ; from += 1000) {
      const { data: page, error: e1 } = await db.from('price_observations')
        .select('id, price, first_seen_at, last_verified_at, revisions')
        .eq('source', 'wfp-hapi').gte('period_start', minStart).order('id').range(from, from + 999)
      if (e1) throw e1
      for (const x of page ?? []) byId.set(x.id, x)
      if (!page || page.length < 1000) break
    }

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const out = chunk.map((r) => {
        const cur = byId.get(r.id as string)
        if (!cur) { inserted++; return { ...r, first_seen_at: now, last_verified_at: now, revisions: [] } }
        const changed = Number(cur.price) !== Number(r.price)
        if (changed) updated++
        return {
          ...r,
          first_seen_at: cur.first_seen_at,
          last_verified_at: now,
          revisions: changed ? [...(cur.revisions ?? []), { price: Number(cur.price), seenAt: cur.last_verified_at }] : cur.revisions ?? [],
        }
      })
      const { error: e2 } = await db.from('price_observations').upsert(out, { onConflict: 'id' })
      if (e2) throw e2
    }

    const markets = new Map<string, Record<string, unknown>>()
    for (const r of rows) markets.set(r.market_code as string, { code: r.market_code, name: r.market_name, admin1: r.admin1, admin2: r.admin2, lat: r.lat, lon: r.lon, updated_at: now })
    if (markets.size) await db.from('markets').upsert([...markets.values()], { onConflict: 'code' })

    await finish({ status: 'success', fetched: raw.length, inserted, updated, suspects, attempts: 1, error: rejected ? `${rejected} ligne(s) rejetée(s)` : null })
    return json({ ok: true, fetched: raw.length, inserted, updated, suspects, rejected, startDate })
  } catch (e) {
    const o = e as { message?: string; details?: string; hint?: string; code?: string }
    const msg = e instanceof Error ? e.message
      : o?.message ? [o.code, o.message, o.details, o.hint].filter(Boolean).join(' · ') : JSON.stringify(e)
    await finish({ status: 'error', error: msg.slice(0, 1000) })
    return json({ ok: false, error: msg }, 500)
  }
})
