import { db, getKV, setKV, type Observation, type SyncRun } from './db'
import { supabase } from './supabase'
import { evaluateAlerts } from './sync'

/**
 * Lecture des relevés WFP depuis la base partagée (synchronisée chaque jour par le serveur).
 * Incrémental : curseur (last_verified_at, id) ; les dates d'origine viennent du serveur, inchangées.
 */
export const SERVER_SOURCE = 'server'
const CURSOR = 'server:cursor'
const PAGE = 1000

interface ServerObs {
  id: string
  source: string
  market_code: string
  market_name: string
  admin1: string
  admin2: string
  lat: number | null
  lon: number | null
  commodity_code: string
  commodity_name: string
  category: string
  unit: string
  price_type: string
  price_flag: string
  currency: string
  price: number | string
  period_start: string
  period_end: string
  first_seen_at: string
  last_verified_at: string
  revisions: { price: number; seenAt: string }[] | null
  suspect: string | null
}

export function fromServer(r: ServerObs): Observation {
  return {
    id: r.id,
    source: 'wfp-hapi',
    marketCode: r.market_code,
    marketName: r.market_name,
    admin1: r.admin1 ?? '',
    admin2: r.admin2 ?? '',
    lat: r.lat,
    lon: r.lon,
    commodityCode: r.commodity_code,
    commodityName: r.commodity_name,
    category: r.category ?? '',
    unit: r.unit,
    priceType: r.price_type,
    priceFlag: r.price_flag,
    currency: r.currency,
    price: Number(r.price),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    firstSeenAt: r.first_seen_at,
    lastVerifiedAt: r.last_verified_at,
    revisions: r.revisions?.length ? r.revisions : undefined,
    suspect: r.suspect ?? undefined,
  }
}

const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Enregistre localement ; renvoie les relevés nouveaux pour cet appareil. */
export async function storeServerRows(rows: ServerObs[]) {
  const obs = rows.map(fromServer)
  const existing = await db.observations.bulkGet(obs.map((o) => o.id))
  const fresh = obs.filter((_, i) => !existing[i])
  await db.observations.bulkPut(obs)
  return fresh
}

export async function syncFromServer(trigger: string, onProgress?: (n: number) => void): Promise<SyncRun | null> {
  if (!supabase) return null
  const t0 = Date.now()
  const run: SyncRun = { source: SERVER_SOURCE, startedAt: new Date().toISOString(), status: 'running', fetched: 0, inserted: 0, updated: 0, suspects: 0, attempts: 1, trigger }
  run.id = (await db.syncRuns.add(run)) as number
  try {
    let cursor = await getKV<{ ts: string; id: string } | null>(CURSOR, null)
    const fresh: Observation[] = []
    for (let guard = 0; guard < 500; guard++) {
      let q = supabase.from('price_observations').select('*').order('last_verified_at').order('id').limit(PAGE)
      if (cursor) q = q.or(`last_verified_at.gt.${quote(cursor.ts)},and(last_verified_at.eq.${quote(cursor.ts)},id.gt.${quote(cursor.id)})`)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as ServerObs[]
      if (!rows.length) break
      fresh.push(...(await storeServerRows(rows)))
      run.fetched += rows.length
      const last = rows[rows.length - 1]
      cursor = { ts: last.last_verified_at, id: last.id }
      await setKV(CURSOR, cursor)
      onProgress?.(run.fetched)
      if (rows.length < PAGE) break
    }
    const { data: markets } = await supabase.from('markets').select('*')
    if (markets?.length) await db.markets.bulkPut(markets.map((m) => ({ code: m.code, name: m.name, admin1: m.admin1, admin2: m.admin2, lat: m.lat, lon: m.lon })))
    // Dernière synchronisation serveur réussie (affichée à l'utilisateur)
    const { data: lastRun } = await supabase.from('data_sync_runs').select('finished_at,status,error').eq('status', 'success').order('id', { ascending: false }).limit(1)
    run.inserted = fresh.length
    run.updated = run.fetched - fresh.length
    run.suspects = fresh.filter((o) => o.suspect).length
    run.status = 'success'
    run.finishedAt = new Date().toISOString()
    run.durationMs = Date.now() - t0
    run.error = lastRun?.[0]?.finished_at ? `serveur : ${lastRun[0].finished_at}` : 'serveur : aucune synchronisation réussie'
    await db.syncRuns.put(run)
    await setKV('lastSuccess:wfp-hapi', run.finishedAt)
    await setKV('lastAttempt:wfp-hapi', run.finishedAt)
    if (trigger !== 'initial') await evaluateAlerts(fresh)
    return run
  } catch (e) {
    Object.assign(run, { status: 'error', error: (e as Error).message, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0 })
    await db.syncRuns.put(run)
    await setKV('lastAttempt:wfp-hapi', run.finishedAt)
    return run
  }
}

/** Temps réel : nouveaux relevés poussés par le serveur, sans recharger la page. */
export function subscribeServerPrices(onFresh?: (n: number) => void) {
  if (!supabase) return () => {}
  let buffer: ServerObs[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async () => {
    const rows = buffer
    buffer = []
    timer = null
    const fresh = await storeServerRows(rows)
    const last = rows.reduce((m, r) => (r.last_verified_at > m.ts || (r.last_verified_at === m.ts && r.id > m.id) ? { ts: r.last_verified_at, id: r.id } : m), (await getKV<{ ts: string; id: string } | null>(CURSOR, null)) ?? { ts: '', id: '' })
    await setKV(CURSOR, last)
    if (fresh.length) { await evaluateAlerts(fresh); onFresh?.(fresh.length) }
  }
  const ch = supabase
    .channel('price_observations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'price_observations' }, (p) => {
      if (p.new && (p.new as ServerObs).id) buffer.push(p.new as ServerObs)
      if (!timer) timer = setTimeout(flush, 1500)
    })
    .subscribe()
  return () => { supabase?.removeChannel(ch) }
}
