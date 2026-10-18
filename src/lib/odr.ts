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
