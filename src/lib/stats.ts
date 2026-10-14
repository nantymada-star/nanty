import type { Observation } from './db'

export type Freshness = 'verified' | 'declared' | 'estimated' | 'stale' | 'pending'

/** Seuils de fraîcheur (jours) par catégorie ; données WFP mensuelles => 60 j par défaut. */
export const DEFAULT_STALE_DAYS: Record<string, number> = {
  default: 60,
  'non-food': 60,
  'cereals and tubers': 60,
}

export function freshnessOf(o: Observation, staleDays: Record<string, number>, now = Date.now()): Freshness {
  const limit = staleDays[o.category] ?? staleDays.default ?? 60
  const ageDays = (now - Date.parse(o.periodEnd)) / 86400000
  if (o.source === 'user') {
    if (o.moderation === 'pending') return 'pending'
    if (ageDays > limit) return 'stale'
    return o.moderation === 'approved' ? 'verified' : 'declared'
  }
  if (ageDays > limit) return 'stale'
  return 'verified'
}

export const seriesKey = (o: Pick<Observation, 'marketCode' | 'commodityCode' | 'unit' | 'priceType'>) =>
  `${o.commodityCode}|${o.marketCode}|${o.unit}|${o.priceType}`

/** Clé de comparabilité : même produit, même unité, même type de prix. */
export const compKey = (o: Pick<Observation, 'commodityCode' | 'unit' | 'priceType'>) => `${o.commodityCode}|${o.unit}|${o.priceType}`

/** Une observation par période : on préfère "actual" à "aggregate". */
function dedupePeriod(list: Observation[]) {
  const byPeriod = new Map<string, Observation>()
  for (const o of list) {
    if (o.suspect || o.moderation === 'rejected' || o.moderation === 'pending') continue
    const k = o.periodStart
    const cur = byPeriod.get(k)
    if (!cur || (cur.priceFlag !== 'actual' && o.priceFlag === 'actual')) byPeriod.set(k, o)
  }
  return [...byPeriod.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
}

export interface Series {
  key: string
  points: Observation[] // triés par date croissante
  latest: Observation
  prev?: Observation
  change1: number | null // vs relevé précédent (%)
  change12m: number | null // vs même mois N-1 (%)
}

export function buildSeries(obs: Observation[]): Map<string, Series> {
  const groups = new Map<string, Observation[]>()
  for (const o of obs) {
    const k = seriesKey(o)
    const g = groups.get(k)
    if (g) g.push(o)
    else groups.set(k, [o])
  }
  const out = new Map<string, Series>()
  for (const [k, g] of groups) {
    const points = dedupePeriod(g)
    if (!points.length) continue
    const latest = points[points.length - 1]
    const prev = points.length > 1 ? points[points.length - 2] : undefined
    const target = shiftMonths(latest.periodStart, -12)
    const yearAgo = points.find((p) => p.periodStart.slice(0, 7) === target.slice(0, 7))
    out.set(k, {
      key: k,
      points,
      latest,
      prev,
      change1: prev ? pct(latest.price, prev.price) : null,
      change12m: yearAgo ? pct(latest.price, yearAgo.price) : null,
    })
  }
  return out
}

export function pct(a: number, b: number) {
  return b === 0 ? null : ((a - b) / b) * 100
}

export function shiftMonths(iso: string, n: number) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}

export function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Min / médiane / max uniquement sur des séries comparables (même clé de comparabilité). */
export function summarize(series: Series[]) {
  const prices = series.map((s) => s.latest.price)
  if (!prices.length) return null
  return { min: Math.min(...prices), max: Math.max(...prices), median: median(prices)!, n: prices.length }
}

/**
 * Indice saisonnier par mois (1 = moyenne annuelle), calculé sur les relevés réels :
 * pour chaque année complète d'une série, prix du mois / moyenne de l'année.
 */
export function seasonalIndex(points: Observation[]): { month: number; index: number | null; n: number }[] {
  const byYear = new Map<number, Map<number, number>>()
  for (const p of points) {
    const y = Number(p.periodStart.slice(0, 4))
    const m = Number(p.periodStart.slice(5, 7)) - 1
    if (!byYear.has(y)) byYear.set(y, new Map())
    byYear.get(y)!.set(m, p.price)
  }
  const acc: number[][] = Array.from({ length: 12 }, () => [])
  for (const months of byYear.values()) {
    if (months.size < 8) continue // année trop incomplète
    const mean = [...months.values()].reduce((a, b) => a + b, 0) / months.size
    for (const [m, v] of months) acc[m].push(v / mean)
  }
  return acc.map((xs, month) => ({ month, n: xs.length, index: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }))
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
