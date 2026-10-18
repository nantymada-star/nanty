import type { MsgKey } from '../i18n'

/** Prix officiel du riz (table public.odr_prices, remplie par la fonction serveur sync-odr). */
export interface OdrRow {
  id: string
  bulletin_no: number | null
  bulletin_url: string
  period_start: string
  level: 'national' | 'region' | 'district'
  area: string
  region: string | null
  product: 'paddy' | 'riz_local' | 'riz_importe'
  stage: 'producteur' | 'grossiste' | 'detaillant'
  price: number
  change_pct: number | null
}

export const ODR_PRODUCTS = ['riz_local', 'paddy', 'riz_importe'] as const
export const ODR_STAGES = ['producteur', 'grossiste', 'detaillant'] as const
export const productKey = (p: string) => `odr_${p}` as MsgKey
export const stageKey = (s: string) => `odr_${s}` as MsgKey

/** Produits PAM (riz) → produit ODR correspondant. */
export const odrForCommodity = (code: string) => (code === '71' ? 'riz_local' : code === '64' ? 'riz_importe' : null)

/** Dernière période disponible, et lignes de cette période. */
export function latest(rows: OdrRow[]) {
  const period = rows.reduce((m, r) => (r.period_start > m ? r.period_start : m), '')
  return { period, rows: rows.filter((r) => r.period_start === period) }
}

/** Chaîne de prix d'une zone : producteur → grossiste → détaillant, avec la marge entre deux étapes. */
export function chain(rows: OdrRow[], product: string, area: string) {
  const at = (stage: string) => rows.find((r) => r.product === product && r.area === area && r.stage === stage)?.price ?? null
  const p = at('producteur'), g = at('grossiste'), d = at('detaillant')
  const margin = (a: number | null, b: number | null) => (a && b ? b - a : null)
  return { producteur: p, grossiste: g, detaillant: d, m1: margin(p, g), m2: margin(g, d) }
}

/** Relevé hebdomadaire de terrain ODR agrégé par marché (table public.odr_fiche_prices, fonction sync-odr-fiches). */
export interface FicheRow {
  id: string
  survey_date: string
  region: string
  district: string | null
  commune: string | null
  market: string
  product: 'paddy' | 'riz_local' | 'riz_importe'
  stage: 'producteur' | 'grossiste' | 'detaillant'
  price: number
  price_min: number
  price_max: number
  n_sellers: number
  varieties: string[]
  thread_url: string | null
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000

/**
 * Dernière semaine relevée de chaque région : médiane des marchés par étape (relevés des 7 jours précédant
 * la date la plus récente de la région), nombre de marchés et lien vers la discussion d'origine.
 */
export function weeklyByRegion(rows: FicheRow[], product: string) {
  const byRegion = new Map<string, FicheRow[]>()
  for (const r of rows) if (r.product === product) byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r])
  return [...byRegion.entries()].map(([region, rs]) => {
    const last = rs.reduce((m, r) => (r.survey_date > m ? r.survey_date : m), '')
    const week = rs.filter((r) => daysBetween(r.survey_date, last) < 7)
    const stage = (s: string) => {
      const xs = week.filter((r) => r.stage === s).map((r) => Number(r.price))
      return xs.length ? { price: med(xs), markets: xs.length } : null
    }
    const from = week.reduce((m, r) => (r.survey_date < m ? r.survey_date : m), last)
    return {
      region, from, to: last, markets: new Set(week.map((r) => r.market)).size,
      producteur: stage('producteur'), grossiste: stage('grossiste'), detaillant: stage('detaillant'),
      thread: week.find((r) => r.thread_url)?.thread_url ?? null,
    }
  }).sort((a, b) => a.region.localeCompare(b.region))
}
