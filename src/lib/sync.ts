import { useSyncExternalStore } from 'react'
import { db, getKV, setKV, type Observation, type SyncRun } from './db'
import { fetchAllFoodPrices, flagOutliers, HapiError, normalizeRows } from './hapi'
import { getSettings } from './settings'
import { supabase } from './supabase'
import { syncFromServer } from './serverSync'
import { buildSeries, seriesKey, shiftMonths } from './stats'
import { commodityLabel } from './commodities'
import { fmtAr, fmtPeriod } from './format'

export const SOURCE_WFP = 'wfp-hapi'

interface LiveState {
  running: boolean
  progress: number
  lastError: string | null
}
let live: LiveState = { running: false, progress: 0, lastError: null }
const subs = new Set<() => void>()
function setLive(p: Partial<LiveState>) {
  live = { ...live, ...p }
  subs.forEach((f) => f())
}
export function useSyncState() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => live,
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Calcule la date de début de la requête : historique initial ou chevauchement de 3 mois. */
export async function computeStartDate(): Promise<string> {
  const last = await db.observations.where('source').equals('wfp-hapi').toArray()
  const s = getSettings()
  if (!last.length) {
    const y = new Date().getUTCFullYear() - s.historyYears
    return `${y}-01-01`
  }
  const maxStart = last.reduce((m, o) => (o.periodStart > m ? o.periodStart : m), '0000')
  return shiftMonths(maxStart, -3)
}

/** Insère ou met à jour en conservant la date d'origine et l'historique des révisions. */
export async function upsertObservations(incoming: Observation[], nowIso: string) {
  let inserted = 0
  let updated = 0
  const fresh: Observation[] = []
  const existing = await db.observations.bulkGet(incoming.map((o) => o.id))
  const toPut: Observation[] = []
  incoming.forEach((o, i) => {
    const cur = existing[i]
    if (!cur) {
      inserted++
      fresh.push(o)
      toPut.push(o)
    } else if (cur.price !== o.price) {
      updated++
      toPut.push({
        ...cur,
        price: o.price,
        lastVerifiedAt: nowIso,
        revisions: [...(cur.revisions ?? []), { price: cur.price, seenAt: cur.lastVerifiedAt }],
      })
    } else {
      toPut.push({ ...cur, lastVerifiedAt: nowIso })
    }
  })
  await db.observations.bulkPut(toPut)
  return { inserted, updated, fresh }
}

async function refreshMarkets(obs: Observation[]) {
  const m = new Map<string, Observation>()
  for (const o of obs) m.set(o.marketCode, o)
  await db.markets.bulkPut(
    [...m.values()].map((o) => ({ code: o.marketCode, name: o.marketName, admin1: o.admin1, admin2: o.admin2, lat: o.lat, lon: o.lon })),
  )
}

/** Recalcule les valeurs suspectes sur les séries touchées. */
async function reflagSeries(touched: Observation[]) {
  const pairs = new Set(touched.map((o) => `${o.commodityCode}|${o.marketCode}`))
  let n = 0
  for (const p of pairs) {
    const [c, m] = p.split('|')
    const all = await db.observations.where('[commodityCode+marketCode]').equals([c, m]).toArray()
    all.forEach((o) => delete o.suspect)
    n += flagOutliers(all)
    await db.observations.bulkPut(all)
  }
  return n
}

export async function notify(title: string, body: string, kind: string, observedPeriod?: string, link?: string) {
  await db.notifications.add({ createdAt: new Date().toISOString(), title, body, kind, observedPeriod, link, read: false })
  try {
    if (getSettings().notifConsent && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.svg', tag: kind + (link ?? '') })
    }
  } catch {
    /* notifications système indisponibles */
  }
}

/** Évalue les alertes sur les nouveaux relevés. Une seule notification par alerte et par relevé. */
export async function evaluateAlerts(fresh: Observation[]) {
  if (!fresh.length) return 0
  const alerts = await db.alerts.toArray()
  const active = alerts.filter((a) => a.active)
  if (!active.length) return 0
  const lang = getSettings().lang
  let fired = 0
  for (const a of active) {
    const cands = fresh
      .filter((o) => o.commodityCode === a.commodityCode && (a.marketCode === '*' || o.marketCode === a.marketCode))
      .filter((o) => o.unit === a.unit && o.priceType === a.priceType && !o.suspect)
      .sort((x, y) => y.periodStart.localeCompare(x.periodStart))
    for (const o of cands) {
      if (a.lastFiredObsId === o.id) continue
      const all = await db.observations.where('[commodityCode+marketCode]').equals([o.commodityCode, o.marketCode]).toArray()
      const s = buildSeries(all).get(seriesKey(o))
      const ch = s && s.latest.id === o.id ? s.change1 : null
      const name = commodityLabel(o.commodityName, lang)
      const when = fmtPeriod(o.periodStart, o.periodEnd, lang)
      let hit = false
      let title = ''
      if (a.kind === 'new') { hit = true; title = lang === 'mg' ? 'Vidiny vaovao voaray' : 'Nouveau relevé disponible' }
      if (a.kind === 'rise' && ch != null && ch >= a.threshold) { hit = true; title = lang === 'mg' ? "Fiakaran'ny vidiny" : 'Hausse de prix détectée' }
      if (a.kind === 'drop' && ch != null && -ch >= a.threshold) { hit = true; title = lang === 'mg' ? "Fihenan'ny vidiny" : 'Baisse de prix détectée' }
      if (a.kind === 'below' && o.price <= a.threshold) { hit = true; title = lang === 'mg' ? 'Tratra ny vidiny tadiavina' : 'Prix cible atteint' }
      if (a.kind === 'above' && o.price >= a.threshold) { hit = true; title = lang === 'mg' ? 'Nihoatra ny fetra ny vidiny' : 'Seuil de prix dépassé' }
      if (!hit) continue
      const chTxt = ch != null ? ` (${ch > 0 ? '+' : ''}${ch.toFixed(1)} %)` : ''
      await notify(
        title,
        `${name} — ${o.marketName} : ${fmtAr(o.price)} / ${o.unit}${chTxt}. ${lang === 'mg' ? 'Daty' : 'Période'} : ${when}`,
        'alert',
        o.periodStart,
        `/vokatra/${encodeURIComponent(o.commodityCode)}?market=${encodeURIComponent(o.marketCode)}`,
      )
      await db.alerts.update(a.id!, { lastFiredObsId: o.id })
      fired++
      break
    }
  }
  return fired
}

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (locks?.request) {
    return locks.request('madaprice-sync', { ifAvailable: true }, async (lock) => (lock ? fn() : null)) as Promise<T | null>
  }
  return fn()
}

/** Synchronise la source WFP (HDX HAPI). Journalise chaque exécution dans syncRuns. */
export async function syncWfp(trigger: string): Promise<SyncRun | null> {
  if (live.running) return null
  const s = getSettings()
  // Source par défaut : la base partagée (aucun identifiant HDX ni relais nécessaire sur l'appareil)
  if (s.dataSource !== 'hapi' && supabase) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setLive({ lastError: 'offline' }); return null }
    setLive({ running: true, progress: 0, lastError: null })
    try {
      const r = await syncFromServer(trigger, (n) => setLive({ progress: n }))
      setLive({ running: false, lastError: r?.status === 'error' ? r.error ?? 'error' : null })
      return r
    } catch (e) {
      setLive({ running: false, lastError: (e as Error).message })
      return null
    }
  }
  if (!s.appId) {
    setLive({ lastError: 'no-app-id' })
    return null
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setLive({ lastError: 'offline' })
    return null
  }
  return withLock(async () => {
    setLive({ running: true, progress: 0, lastError: null })
    const t0 = Date.now()
    const run: SyncRun = {
      source: SOURCE_WFP, startedAt: new Date().toISOString(), status: 'running',
      fetched: 0, inserted: 0, updated: 0, suspects: 0, attempts: 0, trigger,
    }
    run.id = (await db.syncRuns.add(run)) as number
    try {
      const startDate = await computeStartDate()
      let rows: Awaited<ReturnType<typeof fetchAllFoodPrices>> | null = null
      let lastErr: unknown
      for (let attempt = 1; attempt <= 4; attempt++) {
        run.attempts = attempt
        try {
          rows = await fetchAllFoodPrices({ appId: s.appId, startDate, mode: s.hapiMode, onProgress: (n) => setLive({ progress: n }) })
          break
        } catch (e) {
          lastErr = e
          const transient = !(e instanceof HapiError) || e.transient
          if (!transient || attempt === 4) break
          await sleep(2000 * 2 ** (attempt - 1))
        }
      }
      if (!rows) throw lastErr
      const nowIso = new Date().toISOString()
      const { ok, rejected } = normalizeRows(rows.rows, nowIso)
      const { inserted, updated, fresh } = await upsertObservations(ok, nowIso)
      await refreshMarkets(ok)
      const suspects = await reflagSeries(ok)
      Object.assign(run, {
        status: rejected.length && !ok.length ? 'partial' : 'success',
        fetched: rows.rows.length, inserted, updated, suspects,
        finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
        error: rejected.length ? `${rejected.length} ligne(s) rejetée(s) — via ${rows.via}` : `via ${rows.via}`,
      })
      await db.syncRuns.put(run)
      await setKV('lastSuccess:' + SOURCE_WFP, run.finishedAt)
      await setKV('lastAttempt:' + SOURCE_WFP, run.finishedAt)
      if (inserted && trigger !== 'initial') {
        const lang = s.lang
        await notify(
          lang === 'mg' ? 'Vidiny vaovao misy!' : 'Nouveaux prix disponibles !',
          lang === 'mg' ? `Vidiny vaovao ${inserted} avy amin'ny WFP.` : `${inserted} nouveaux relevés WFP reçus.`,
          'sync',
          fresh.reduce((m, o) => (o.periodStart > m ? o.periodStart : m), ''),
          '/vidiny',
        )
      }
      await evaluateAlerts(fresh)
      setLive({ running: false })
      return run
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      Object.assign(run, { status: 'error', error: msg, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0 })
      await db.syncRuns.put(run)
      await setKV('lastAttempt:' + SOURCE_WFP, run.finishedAt)
      const prevFails = await getKV<number>('fails:' + SOURCE_WFP, 0)
      await setKV('fails:' + SOURCE_WFP, prevFails + 1)
      if (prevFails + 1 >= 3) {
        await notify(
          s.lang === 'mg' ? 'Tsy mandeha ny loharano WFP' : 'La source WFP ne répond plus',
          s.lang === 'mg' ? `Tsy nahomby intelo nifanesy ny fampifanarahana: ${msg}` : `Trois échecs consécutifs : ${msg}`,
          'admin', undefined, '/admin',
        )
      }
      setLive({ running: false, lastError: msg })
      return run
    } finally {
      if (run.status === 'success') await setKV('fails:' + SOURCE_WFP, 0)
    }
  })
}

/** Lance la synchronisation si la dernière réussite date de plus de `minutes`. */
export async function syncIfDue(minutes: number, trigger: string) {
  const last = await getKV<string | null>('lastAttempt:' + SOURCE_WFP, null)
  const any = await db.observations.limit(1).count()
  if (!any) return syncWfp('initial')
  if (!last || Date.now() - Date.parse(last) > minutes * 60000) return syncWfp(trigger)
  return null
}
