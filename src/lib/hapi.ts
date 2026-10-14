import type { Observation } from './db'

/**
 * Client HDX HAPI (Humanitarian Data Exchange, OCHA) — prix de marché du
 * Programme alimentaire mondial (WFP) pour Madagascar.
 * Endpoint : /api/v2/food-security-nutrition-poverty/food-prices-market-monitor
 * Licence des données : voir https://data.humdata.org/dataset/wfp-food-prices-for-madagascar
 */
export const HAPI_DIRECT = 'https://hapi.humdata.org'
export const HAPI_PROXY = '/hapi-proxy'
export const HAPI_PATH = '/api/v2/food-security-nutrition-poverty/food-prices-market-monitor'
export const PAGE_SIZE = 10000

export interface HapiFoodPrice {
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

export function encodeAppIdentifier(app: string, email: string) {
  return btoa(`${app}:${email}`)
}

export function observationId(r: Pick<HapiFoodPrice, 'market_code' | 'commodity_code' | 'unit' | 'price_type' | 'price_flag' | 'reference_period_start'>) {
  return ['wfp', r.market_code, r.commodity_code, r.unit, r.price_type, r.price_flag, r.reference_period_start.slice(0, 10)].join('|')
}

export interface NormalizeResult {
  ok: Observation[]
  rejected: { row: unknown; reason: string }[]
}

/** Normalise et valide les lignes brutes. Ne modifie jamais les dates de la source. */
export function normalizeRows(rows: HapiFoodPrice[], nowIso: string): NormalizeResult {
  const ok: Observation[] = []
  const rejected: NormalizeResult['rejected'] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const price = typeof r.price === 'string' ? Number(r.price) : r.price
    if (r.location_code !== 'MDG') { rejected.push({ row: r, reason: 'location' }); continue }
    if (r.currency_code !== 'MGA') { rejected.push({ row: r, reason: 'currency' }); continue }
    if (!Number.isFinite(price) || price <= 0) { rejected.push({ row: r, reason: 'price' }); continue }
    if (!r.reference_period_start || Number.isNaN(Date.parse(r.reference_period_start))) {
      rejected.push({ row: r, reason: 'date' }); continue
    }
    const id = observationId(r)
    if (seen.has(id)) { rejected.push({ row: r, reason: 'duplicate' }); continue }
    seen.add(id)
    ok.push({
      id,
      source: 'wfp-hapi',
      marketCode: String(r.market_code),
      marketName: r.market_name,
      admin1: r.admin1_name ?? '',
      admin2: r.admin2_name ?? '',
      lat: r.lat == null ? null : Number(r.lat),
      lon: r.lon == null ? null : Number(r.lon),
      commodityCode: String(r.commodity_code),
      commodityName: r.commodity_name,
      category: r.commodity_category,
      unit: normalizeUnit(r.unit),
      priceType: r.price_type,
      priceFlag: r.price_flag,
      currency: r.currency_code,
      price,
      periodStart: r.reference_period_start.slice(0, 10),
      periodEnd: (r.reference_period_end || r.reference_period_start).slice(0, 10),
      firstSeenAt: nowIso,
      lastVerifiedAt: nowIso,
    })
  }
  return { ok, rejected }
}

export function normalizeUnit(u: string) {
  const s = (u || '').trim()
  const low = s.toLowerCase()
  if (low === 'kg' || low === '1 kg') return 'kg'
  if (low === 'l' || low === '1 l' || low === 'litre') return 'L'
  return s
}

/** Marque les variations suspectes (> x3 ou < /3 par rapport à la médiane de la même série). */
export function flagOutliers(obs: Observation[]): number {
  const groups = new Map<string, Observation[]>()
  for (const o of obs) {
    const k = [o.marketCode, o.commodityCode, o.unit, o.priceType].join('|')
    const g = groups.get(k)
    if (g) g.push(o)
    else groups.set(k, [o])
  }
  let n = 0
  for (const g of groups.values()) {
    if (g.length < 4) continue
    const sorted = g.map((o) => o.price).sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    for (const o of g) {
      if (o.price > med * 3 || o.price < med / 3) {
        o.suspect = 'outlier'
        n++
      }
    }
  }
  return n
}

export class HapiError extends Error {
  status: number
  transient: boolean
  constructor(message: string, status: number, transient: boolean) {
    super(message)
    this.status = status
    this.transient = transient
  }
}

async function fetchPage(base: string, appId: string, startDate: string | null, offset: number, signal?: AbortSignal) {
  const q = new URLSearchParams({
    location_code: 'MDG',
    output_format: 'json',
    limit: String(PAGE_SIZE),
    offset: String(offset),
    app_identifier: appId,
  })
  if (startDate) q.set('start_date', startDate)
  const res = await fetch(`${base}${HAPI_PATH}?${q}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new HapiError(`HTTP ${res.status} ${txt.slice(0, 200)}`, res.status, res.status >= 500 || res.status === 429)
  }
  const text = await res.text()
  if (/^\s*</.test(text)) {
    // Page HTML au lieu de JSON : le relais /hapi-proxy n'existe pas sur cet hébergement.
    throw new HapiError(
      base === HAPI_PROXY
        ? "Relais /hapi-proxy absent sur cet hébergement (page HTML reçue au lieu des données). Voir README, section « CORS et proxy »."
        : 'Réponse HTML inattendue de HDX HAPI',
      0,
      false,
    )
  }
  let json: { data?: HapiFoodPrice[] }
  try {
    json = JSON.parse(text)
  } catch {
    throw new HapiError('Réponse JSON invalide de HDX HAPI', 0, false)
  }
  if (!json || !Array.isArray(json.data)) throw new HapiError('Format de réponse inattendu', 0, false)
  return json.data
}

/**
 * Récupère toutes les pages. Essaie l'appel direct, puis le proxy same-origin
 * (si le navigateur bloque l'appel direct, ex. CORS).
 */
export async function fetchAllFoodPrices(opts: {
  appId: string
  startDate: string | null
  mode: 'auto' | 'direct' | 'proxy'
  signal?: AbortSignal
  onProgress?: (n: number) => void
}): Promise<{ rows: HapiFoodPrice[]; via: string }> {
  const bases = opts.mode === 'direct' ? [HAPI_DIRECT] : opts.mode === 'proxy' ? [HAPI_PROXY] : [HAPI_DIRECT, HAPI_PROXY]
  const errors: string[] = []
  for (const base of bases) {
    try {
      const rows: HapiFoodPrice[] = []
      for (let offset = 0; offset < 500000; offset += PAGE_SIZE) {
        const page = await fetchPage(base, opts.appId, opts.startDate, offset, opts.signal)
        rows.push(...page)
        opts.onProgress?.(rows.length)
        if (page.length < PAGE_SIZE) break
      }
      return { rows, via: base }
    } catch (e) {
      if (opts.signal?.aborted) throw e
      // Erreur HTTP explicite (403 identifiant, 400…) : inutile d'essayer le proxy.
      if (e instanceof HapiError && e.status > 0 && e.status !== 404) throw e
      const label = base === HAPI_PROXY ? 'Relais' : 'Direct'
      // "Failed to fetch" en direct = appel bloqué par le navigateur (CORS) ou réseau indisponible.
      const msg = e instanceof TypeError ? 'appel bloqué par le navigateur (CORS) ou réseau indisponible' : (e as Error).message
      errors.push(`${label} : ${msg}`)
    }
  }
  // Non transitoire : inutile de réessayer tant que l'hébergement n'est pas corrigé.
  throw new HapiError(errors.join(' — '), 0, false)
}
