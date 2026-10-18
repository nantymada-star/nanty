// Fiches hebdomadaires de relevé des prix du riz déposées par les points focaux régionaux de l'ODR
// sur le groupe Google public « cellule-odr-bdd-minae » (discussions découvertes par la tâche Apify « odr-groupe »).
// Actions : crawl (lance la tâche Apify), sync (enregistre les pièces jointes trouvées et lit quelques fiches en attente),
// import (une fiche précise), probe (aperçu brut d'une fiche, pour l'administrateur).
// Appelée par pg_cron (x-cron-token) ou par un administrateur connecté.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as XLSX from 'npm:xlsx@0.18.5'
import { ficheLinks, parseWorkbook, postedOn } from './parse.ts'

const UA = 'MadaPrice/1.0 (comparateur de prix Madagascar; +https://github.com/nantymada-star/nanty)'
const TASK = 'odr-groupe'
const ATTACH = /^https:\/\/groups\.google\.com\/group\/cellule-odr-bdd-minae\/attach\//
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const errText = (e: unknown) => {
  const o = e as { message?: string; details?: string; hint?: string; code?: string }
  return e instanceof Error ? e.message : o?.message ? [o.code, o.message, o.details, o.hint].filter(Boolean).join(' · ') : JSON.stringify(e)
}

function apifyAuth() {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('Secret APIFY_TOKEN manquant (Supabase > Edge Functions > Secrets)')
  return { Authorization: `Bearer ${token}`, 'User-Agent': UA }
}
async function apify(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.apify.com/v2${path}`, { ...init, headers: { ...apifyAuth(), 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Apify : ${j?.error?.message ?? `HTTP ${res.status}`}`)
  return j
}
async function taskId() {
  const r = await apify('/actor-tasks?limit=100&desc=1')
  // deno-lint-ignore no-explicit-any
  const t = (r?.data?.items ?? []).find((x: any) => x.name === TASK)
  if (!t) throw new Error(`Tâche Apify « ${TASK} » introuvable`)
  return t.id as string
}

async function sheets(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array', cellDates: false })
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][] }))
}

/** Pièces jointes Excel des discussions de la dernière collecte Apify réussie → odr_fiche_files (en attente si nouvelles). */
// deno-lint-ignore no-explicit-any
async function registerFiles(db: any) {
  const run = await apify(`/actor-tasks/${await taskId()}/runs/last?status=SUCCEEDED`)
  const ds = run?.data?.defaultDatasetId
  if (!ds) return { threads: 0, files: 0, added: 0 }
  // deno-lint-ignore no-explicit-any
  const items: any[] = await apify(`/datasets/${ds}/items?clean=true&format=json&limit=2000&fields=kind,url,title,posted,text,links`)
  const files = new Map<string, Record<string, unknown>>()
  let threads = 0
  for (const it of items) {
    if (it?.kind !== 'thread') continue
    threads++
    const posted = postedOn(it.posted) ?? postedOn(it.text)
    for (const url of ficheLinks(it.links)) {
      files.set(url, {
        url, file_name: decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').slice(0, 300),
        thread_url: typeof it.url === 'string' ? it.url : null, thread_title: String(it.title ?? '').slice(0, 300), posted_on: posted,
      })
    }
  }
  const { data: known, error } = await db.from('odr_fiche_files').select('url')
  if (error) throw error
  const have = new Set((known ?? []).map((k: { url: string }) => k.url))
  const fresh = [...files.values()].filter((f) => !have.has(f.url as string))
  if (fresh.length) {
    const { error: e2 } = await db.from('odr_fiche_files').insert(fresh)
    if (e2) throw e2
  }
  return { threads, files: files.size, added: fresh.length }
}

// deno-lint-ignore no-explicit-any
async function importFile(db: any, url: string) {
  const { data: f } = await db.from('odr_fiche_files').select('url, thread_url, file_name').eq('url', url).maybeSingle()
  if (!f) {
    const { error } = await db.from('odr_fiche_files').insert({ url, file_name: decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') })
    if (error) throw error
  }
  const now = new Date().toISOString()
  try {
    const fileName = f?.file_name ?? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    const { rows, skipped } = parseWorkbook(await sheets(url), fileName)
    const { data: existing, error: e0 } = await db.from('odr_fiche_prices').select('id, first_seen_at').in('id', rows.map((r) => r.id).slice(0, 1000))
    if (e0) throw e0
    const first = new Map((existing ?? []).map((x: { id: string; first_seen_at: string }) => [x.id, x.first_seen_at]))
    const out = rows.map((r) => ({ ...r, file_url: url, thread_url: f?.thread_url ?? null, first_seen_at: first.get(r.id) ?? now, last_verified_at: now }))
    for (let i = 0; i < out.length; i += 500) {
      const { error } = await db.from('odr_fiche_prices').upsert(out.slice(i, i + 500), { onConflict: 'id' })
      if (error) throw error
    }
    // Nouvelle lecture d'une fiche : retire ses lignes qui ne sont plus produites (règle de lecture corrigée)
    const keep = new Set(out.map((r) => r.id))
    const { data: prev, error: e1 } = await db.from('odr_fiche_prices').select('id').eq('file_url', url)
    if (e1) throw e1
    const stale = (prev ?? []).map((x: { id: string }) => x.id).filter((id: string) => !keep.has(id))
    for (let i = 0; i < stale.length; i += 200) {
      const { error } = await db.from('odr_fiche_prices').delete().in('id', stale.slice(i, i + 200))
      if (error) throw error
    }
    await db.from('odr_fiche_files').update({ status: out.length ? 'ok' : 'empty', rows_count: out.length, error: skipped ? `${skipped} valeur(s) écartée(s) (date absente ou incohérente, prix hors fourchette)` : null, fetched_at: now }).eq('url', url)
    return { url, rows: out.length, inserted: out.length - first.size, skipped }
  } catch (e) {
    const msg = errText(e)
    await db.from('odr_fiche_files').update({ status: 'error', error: msg.slice(0, 500), fetched_at: now }).eq('url', url)
    return { url, error: msg }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
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

  try {
    if (body.action === 'probe' && typeof body.url === 'string') {
      if (!ATTACH.test(body.url)) return json({ ok: false, error: 'adresse non autorisée' }, 400)
      const s = await sheets(body.url)
      return json({ ok: true, sheets: s.map((x) => ({ name: x.name, n: x.rows.length })), parsed: parseWorkbook(s, decodeURIComponent(new URL(body.url).pathname.split('/').pop() ?? '')) })
    }
    if (body.action === 'crawl') {
      const r = await apify(`/actor-tasks/${await taskId()}/runs`, { method: 'POST', body: '{}' })
      return json({ ok: true, run: { id: r.data?.id, status: r.data?.status } })
    }
    if (body.action === 'import' && typeof body.url === 'string') {
      if (!ATTACH.test(body.url)) return json({ ok: false, error: 'adresse non autorisée' }, 400)
      return json({ ok: true, ...(await importFile(db, body.url)) })
    }
  } catch (e) { return json({ ok: false, error: errText(e) }, 500) }

  // sync : nouvelles pièces jointes puis quelques fiches en attente (mémoire limitée d'une fonction)
  const t0 = Date.now()
  const { data: run } = await db.from('data_sync_runs').insert({ source: 'odr-fiches', trigger, status: 'running' }).select('id').single()
  const finish = (patch: Record<string, unknown>) =>
    db.from('data_sync_runs').update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).eq('id', run!.id)
  try {
    const reg = await registerFiles(db)
    const max = Math.min(Number(body.max ?? 4), 8)
    const { data: todo, error } = await db.from('odr_fiche_files').select('url').eq('status', 'pending').order('posted_on', { ascending: false, nullsFirst: false }).limit(max)
    if (error) throw error
    const results = []
    for (const t of todo ?? []) results.push(await importFile(db, t.url))
    const { count } = await db.from('odr_fiche_files').select('url', { count: 'exact', head: true }).eq('status', 'pending')
    // deno-lint-ignore no-explicit-any
    const ok = results.filter((r: any) => !r.error) as { rows: number; inserted: number }[]
    await finish({
      status: 'success', fetched: ok.reduce((s, r) => s + r.rows, 0), inserted: ok.reduce((s, r) => s + r.inserted, 0), updated: 0, suspects: 0, attempts: 1,
      error: `${reg.threads} discussion(s) · ${reg.added} nouvelle(s) fiche(s) · ${results.length} lue(s) · ${count ?? 0} en attente`,
    })
    return json({ ok: true, ...reg, processed: results, pending: count ?? 0 })
  } catch (e) {
    const msg = errText(e)
    await finish({ status: 'error', error: msg.slice(0, 1000) })
    return json({ ok: false, error: msg }, 500)
  }
})
