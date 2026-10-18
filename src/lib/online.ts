import type { MsgKey } from '../i18n'

/** Produit d'une boutique en ligne (table public.online_products, remplie par la fonction serveur sync-online). */
export interface OnlineProduct {
  id: string
  shop_id: string
  name: string
  url: string | null
  image_url: string | null
  category: string
  product_group: string | null
  size_qty: number | null
  size_unit: 'kg' | 'L' | 'pièce' | null
  price: number
  unit_price: number | null
  in_stock: boolean | null
  suspect: string | null
  first_seen_at: string
  last_seen_at: string
  last_changed_at: string
}

export interface OnlineShop {
  id: string
  name: string
  url: string
  kind: 'woocommerce' | 'apify'
  config: { task?: string; actor?: string; categories?: number[] }
  area: string
  enabled: boolean
  note: string | null
  last_run_at: string | null
}

export const GROUPS = [
  'riz', 'huile', 'sucre', 'farine', 'pates', 'lait', 'yaourt', 'fromage-beurre', 'cafe-the', 'sel-epices', 'haricot', 'mais',
  'conserve', 'oeuf', 'viande-poisson', 'fruits-legumes', 'eau', 'boisson', 'biscuit-snack', 'bebe', 'savon-lessive', 'hygiene', 'gaz',
] as const

export const groupKey = (g: string | null) => (`g_${g ?? 'other'}` as MsgKey)

/** Produits PAM (codes WFP) → rayon des boutiques en ligne correspondant, pour les liens sans ambiguïté. */
const WFP_TO_GROUP: Record<string, string> = {
  '71': 'riz', '64': 'riz', '757': 'huile', '101': 'huile',
  '120': 'haricot', '1330': 'haricot', '1332': 'haricot', '490': 'haricot', '776': 'haricot', '777': 'haricot',
  '51': 'mais', '871': 'mais',
}
export const groupForCommodity = (code: string) => WFP_TO_GROUP[code] ?? null

/** Ancienneté du dernier relevé en ligne : au-delà de 7 jours sans être revu, le prix est « ancien ». */
export const isStaleOnline = (p: Pick<OnlineProduct, 'last_seen_at'>, now = Date.now()) => now - new Date(p.last_seen_at).getTime() > 7 * 86400000

export const unitLabelOnline = (u: OnlineProduct['size_unit']) => (u === 'pièce' ? 'pièce' : u ?? '')
