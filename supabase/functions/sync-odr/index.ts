// Prix officiels du riz (Observatoire du Riz, ministère de l'Agriculture) : bulletins PDF mensuels publiés sur miasa.gov.mg.
// Découverte des bulletins, lecture des tableaux (producteur, grossiste, détaillant), historique sans doublon.
// Appelée chaque jour par pg_cron (x-cron-token) ou par un administrateur connecté.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { areaKey, parseBulletin, periodFromUrl } from './parse.ts'

const UA = 'MadaPrice/1.0 (comparateur de prix Madagascar; +https://github.com/nantymada-star/nanty)'
const SITE = 'https://www.miasa.gov.mg'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

/** Bulletins ODR listés sur le site (catégorie ODR et recherche), du plus récent au plus ancien. */
async function discover(maxPages = 10): Promise<string[]> {
  const pdfs = new Set<string>()
  const posts = new Set<string>()
  const grab = (html: string) => {
    for (const m of html.matchAll(/href="([^"]+?\.pdf)"/gi)) if (/odr/i.test(m[1]) && /bulletin/i.test(m[1])) pdfs.add(new URL(m[1], SITE).href)
    for (const m of html.matchAll(/href="(https:\/\/www\.miasa\.gov\.mg\/bulletin-mensuel-odr[^"#]*)"/gi)) posts.add(m[1])
  }
  for (const base of [`${SITE}/category/donnees-diverses/bulletins-dinformation/odr/`, `${SITE}/?s=bulletin+ODR`]) {
    for (let p = 1; p <= maxPages; p++) {
      const url = p === 1 ? base : base.includes('?s=') ? `${SITE}/page/${p}/?s=bulletin+ODR` : `${base}page/${p}/`
      let html: string
      try { html = await getText(url) } catch { break }
      const before = pdfs.size + posts.size
      grab(html)
      if (pdfs.size + posts.size === before) break
    }
  }
  // Articles dont le PDF n'apparaît pas dans la liste : lire l'article (numéro lu dans l'adresse « …-odr-n-49-… »)
  const haveNo = new Set([...pdfs].map((u) => periodFromUrl(u)?.no).filter((n) => n != null))
  for (const post of posts) {
    const no = Number(post.match(/odr-n-(\d+)/i)?.[1])
    if (no && haveNo.has(no)) continue
    try { grab(await getText(post)) } catch { /* article inaccessible : ignoré */ }
  }
  return [...pdfs].sort((a, b) => (periodFromUrl(b)?.period ?? '').localeCompare(periodFromUrl(a)?.period ?? ''))
}

async function pdfPages(url: string) {
  const res = await fetch(encodeURI(decodeURI(url)), { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()))
  const { text } = await extractText(pdf, { mergePages: false })
  return text as string[]
}

// deno-lint-ignore no-explicit-any
async function importBulletin(db: any, url: string, regionOf: Map<string, string>) {
  const pages = await pdfPages(url)
  const { head, rows } = parseBulletin(pages)
  const meta = head ?? periodFromUrl(url)
  if (!meta) throw new Error('période du bulletin introuvable')
  const now = new Date().toISOString()
  const recs = rows.map((r) => ({
    id: ['odr', r.level, areaKey(r.area), r.product, r.stage, meta.period].join('|'),
    bulletin_no: meta.no ?? periodFromUrl(url)?.no ?? null, bulletin_url: url, period_start: meta.period,
    level: r.level, area: r.area, region: r.level === 'region' ? r.area : r.level === 'district' ? regionOf.get(areaKey(r.area)) ?? null : null,
    product: r.product, stage: r.stage, price: r.price, unit: 'kg', change_pct: r.change_pct,
  }))
  // Doublons possibles (même district cité deux fois) : on garde la première occurrence
  const unique = [...new Map(recs.map((r) => [r.id, r])).values()]
  const { data: existing, error: e0 } = await db.from('odr_prices').select('id, price, first_seen_at, last_verified_at, revisions').eq('bulletin_url', url)
  if (e0) throw e0
  const known = new Map((existing ?? []).map((x: { id: string }) => [x.id, x]))
  let inserted = 0, updated = 0
  const out = unique.map((r) => {
    // deno-lint-ignore no-explicit-any
    const cur: any = known.get(r.id)
    if (!cur) { inserted++; return { ...r, first_seen_at: now, last_verified_at: now, revisions: [] } }
    const changed = Number(cur.price) !== r.price
    if (changed) updated++
    return { ...r, first_seen_at: cur.first_seen_at, last_verified_at: now, revisions: changed ? [...(cur.revisions ?? []), { price: Number(cur.price), seenAt: cur.last_verified_at }] : cur.revisions ?? [] }
  })
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await db.from('odr_prices').upsert(out.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw error
  }
  await db.from('odr_bulletins').upsert({ url, bulletin_no: out[0]?.bulletin_no ?? meta.no, period_start: meta.period, rows_count: out.length, status: out.length ? 'ok' : 'empty', error: null, fetched_at: now })
  return { url, period: meta.period, rows: out.length, inserted, updated }
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

  if (body.action === 'probe' && typeof body.url === 'string') {
    try {
      const pages = await pdfPages(body.url)
      return json({ ok: true, pages: pages.map((p) => p.slice(0, body.chars ?? 4000)), parsed: parseBulletin(pages) })
    } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500) }
  }

  // Liste des bulletins trouvés, et import d'un bulletin précis (rattrapage de l'historique, un appel par bulletin)
  if (body.action === 'list') {
    try {
      const links = await discover()
      const { data: done } = await db.from('odr_bulletins').select('url, status, rows_count')
      return json({ ok: true, links, done })
    } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500) }
  }
  if (body.action === 'import' && typeof body.url === 'string') {
    const { data: markets } = await db.from('markets').select('admin1, admin2')
    const regionOf = new Map<string, string>()
    for (const m of markets ?? []) if (m.admin2 && m.admin1) regionOf.set(areaKey(m.admin2), m.admin1)
    try { return json({ ok: true, ...(await importBulletin(db, body.url, regionOf)) }) } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await db.from('odr_bulletins').upsert({ url: body.url, status: 'error', error: msg.slice(0, 500), fetched_at: new Date().toISOString() })
      return json({ ok: false, error: msg }, 500)
    }
  }

  const t0 = Date.now()
  const { data: run } = await db.from('data_sync_runs').insert({ source: 'odr', trigger, status: 'running' }).select('id').single()
  const finish = (patch: Record<string, unknown>) =>
    db.from('data_sync_runs').update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).eq('id', run!.id)
  try {
    const links = await discover()
    const { data: done } = await db.from('odr_bulletins').select('url, status')
    const ok = new Set((done ?? []).filter((d: { status: string }) => d.status === 'ok').map((d: { url: string }) => d.url))
    const todo = body.force ? links : links.filter((u) => !ok.has(u))
    // Un bulletin par appel : la lecture d'un PDF occupe une bonne part de la mémoire d'une fonction
    const max = Math.min(Number(body.max ?? 1), 2)

    // District → région, d'après les marchés PAM (admin2 → admin1)
    const { data: markets } = await db.from('markets').select('admin1, admin2')
    const regionOf = new Map<string, string>()
    for (const m of markets ?? []) if (m.admin2 && m.admin1) regionOf.set(areaKey(m.admin2), m.admin1)

    const results = []
    let inserted = 0, updated = 0, fetched = 0
    for (const url of todo.slice(0, max)) {
      try {
        const r = await importBulletin(db, url, regionOf)
        results.push(r); inserted += r.inserted; updated += r.updated; fetched += r.rows
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await db.from('odr_bulletins').upsert({ url, status: 'error', error: msg.slice(0, 500), fetched_at: new Date().toISOString() })
        results.push({ url, error: msg })
      }
    }
    const remaining = Math.max(0, todo.length - max)
    await finish({ status: 'success', fetched, inserted, updated, suspects: 0, attempts: 1, error: `${links.length} bulletin(s) trouvés · ${results.length} lus · ${remaining} restant(s)` })
    return json({ ok: true, found: links.length, processed: results, remaining })
  } catch (e) {
    const o = e as { message?: string }
    const msg = e instanceof Error ? e.message : o?.message ?? JSON.stringify(e)
    await finish({ status: 'error', error: msg.slice(0, 1000) })
    return json({ ok: false, error: msg }, 500)
  }
})
