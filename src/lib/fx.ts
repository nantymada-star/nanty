import { db, getKV, setKV, type FxRate } from './db'

/**
 * Taux de change ariary via l'API ouverte Frankfurter (CORS autorisé), qui relaie notamment
 * la Banky Foiben'i Madagasikara (fournisseur « BFM », cours MID de référence).
 * On demande d'abord le cours BFM ; à défaut, le cours agrégé de Frankfurter (« blended »).
 * Réponse de /v2/rate/{base}/{quote} : { date, base, quote, rate }.
 */
export const FX_API = 'https://api.frankfurter.dev/v2'
export const FX_CURRENCIES = ['EUR', 'USD', 'CNY', 'ZAR', 'MUR'] as const

interface RateRecord {
  date: string
  base: string
  quote: string
  rate: number
}

export function parseRate(json: unknown): RateRecord | null {
  const r = json as Partial<RateRecord> | null
  if (!r || typeof r.rate !== 'number' || !Number.isFinite(r.rate) || r.rate <= 0) return null
  if (typeof r.date !== 'string' || Number.isNaN(Date.parse(r.date))) return null
  if (r.quote !== 'MGA' || typeof r.base !== 'string') return null
  return { date: r.date.slice(0, 10), base: r.base, quote: r.quote, rate: r.rate }
}

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Récupère le dernier cours de chaque devise et l'enregistre (sans écraser l'historique). */
export async function syncFx(signal?: AbortSignal) {
  const now = new Date().toISOString()
  const saved: FxRate[] = []
  const errors: string[] = []
  for (const base of FX_CURRENCIES) {
    let rec: RateRecord | null = null
    let provider = 'BFM'
    try {
      rec = parseRate(await getJson(`${FX_API}/providers/bfm/rate/${base}/MGA`, signal))
    } catch {
      rec = null
    }
    if (!rec) {
      provider = 'blended'
      try {
        rec = parseRate(await getJson(`${FX_API}/rate/${base}/MGA`, signal))
      } catch (e) {
        errors.push(`${base}: ${(e as Error).message}`)
      }
    }
    if (rec) saved.push({ id: `${base}|${rec.date}|${provider}`, base, rate: rec.rate, date: rec.date, provider, fetchedAt: now })
  }
  if (saved.length) await db.fxRates.bulkPut(saved)
  await setKV('fx:lastAttempt', now)
  if (saved.length) await setKV('fx:lastSuccess', now)
  return { saved: saved.length, errors }
}

/** Historique mensuel d'un an (agrégé) pour la courbe. Réponse : tableau de { date, base, quote, rate }. */
export async function syncFxHistory(base: string, signal?: AbortSignal) {
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const json = await getJson(`${FX_API}/rates?base=${base}&quotes=MGA&from=${from}&group=month`, signal)
  const list = (Array.isArray(json) ? json : []).map(parseRate).filter((r): r is RateRecord => !!r)
  const now = new Date().toISOString()
  await db.fxRates.bulkPut(list.map((r) => ({ id: `${base}|${r.date}|blended`, base, rate: r.rate, date: r.date, provider: 'blended', fetchedAt: now })))
  return list.length
}

/** Actualise au plus une fois toutes les 6 heures (la BFM publie en semaine). */
export async function syncFxIfDue() {
  const last = await getKV<string | null>('fx:lastAttempt', null)
  if (last && Date.now() - Date.parse(last) < 6 * 3600000) return null
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  return syncFx()
}

/** Dernier cours connu par devise (BFM prioritaire à date égale). */
export function latestRates(all: FxRate[]) {
  const by = new Map<string, FxRate>()
  for (const r of all) {
    const cur = by.get(r.base)
    if (!cur || r.date > cur.date || (r.date === cur.date && r.provider === 'BFM')) by.set(r.base, r)
  }
  return by
}
