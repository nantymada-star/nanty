import Dexie, { type EntityTable } from 'dexie'

/** Un relevé de prix réel (jamais modifié dans sa date d'origine). */
export interface Observation {
  /** clé stable : source|marché|produit|unité|type|flag|période */
  id: string
  source: 'wfp-hapi' | 'user'
  marketCode: string
  marketName: string
  admin1: string
  admin2: string
  lat: number | null
  lon: number | null
  commodityCode: string
  commodityName: string
  category: string
  unit: string
  priceType: string // Retail | Wholesale | Producer | Farm Gate
  priceFlag: string // actual | aggregate | actual,aggregate
  currency: string
  price: number
  periodStart: string // ISO date (début de la période de référence)
  periodEnd: string
  /** Première réception par l'application (UTC ISO). */
  firstSeenAt: string
  /** Dernière fois que la source a confirmé ce relevé (UTC ISO). */
  lastVerifiedAt: string
  /** Valeurs antérieures si la source a révisé le prix. */
  revisions?: { price: number; seenAt: string }[]
  /** Valeur suspecte détectée lors de la normalisation. */
  suspect?: string
  /** Statut de modération pour les relevés utilisateurs. */
  moderation?: 'pending' | 'approved' | 'rejected'
  note?: string
}

export interface Market {
  code: string
  name: string
  admin1: string
  admin2: string
  lat: number | null
  lon: number | null
}

export interface SyncRun {
  id?: number
  source: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'running' | 'success' | 'error' | 'partial'
  fetched: number
  inserted: number
  updated: number
  suspects: number
  attempts: number
  error?: string
  trigger: string
}

export interface Favorite {
  id: string // commodityCode|marketCode|unit|priceType
  commodityCode: string
  marketCode: string
  unit: string
  priceType: string
  createdAt: string
}

export interface PriceAlert {
  id?: number
  commodityCode: string
  marketCode: string | '*'
  unit: string
  priceType: string
  kind: 'rise' | 'drop' | 'below' | 'above' | 'new'
  threshold: number // % pour rise/drop, Ar pour below/above
  active: boolean
  createdAt: string
  lastFiredObsId?: string
}

export interface AppNotification {
  id?: number
  createdAt: string
  title: string
  body: string
  /** Date réelle du relevé déclencheur */
  observedPeriod?: string
  link?: string
  read: boolean
  kind: string
}

export interface Simulation {
  id?: number
  name: string
  createdAt: string
  input: unknown
}

/** Prix déclaré dans un commerce OSM (espace commerçant / contribution). */
export interface ShopPrice {
  id?: number
  shopId: string // osm type/id
  shopName: string
  product: string
  unit: string
  price: number
  priceType: 'Retail' | 'Wholesale'
  stock: 'declared' | 'unknown' | 'out'
  delivery: boolean
  declaredAt: string
  declaredBy: string
}

export interface Shop {
  id: string // node/123
  name: string
  kind: string // shop=* or amenity=*
  lat: number
  lon: number
  tags: Record<string, string>
  fetchedAt: string
}

export interface KV {
  key: string
  value: unknown
}

export const db = new Dexie('madaprice') as Dexie & {
  observations: EntityTable<Observation, 'id'>
  markets: EntityTable<Market, 'code'>
  syncRuns: EntityTable<SyncRun, 'id'>
  favorites: EntityTable<Favorite, 'id'>
  alerts: EntityTable<PriceAlert, 'id'>
  notifications: EntityTable<AppNotification, 'id'>
  simulations: EntityTable<Simulation, 'id'>
  shopPrices: EntityTable<ShopPrice, 'id'>
  shops: EntityTable<Shop, 'id'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  observations:
    'id, source, marketCode, commodityCode, [commodityCode+marketCode], admin1, periodStart, firstSeenAt, moderation',
  markets: 'code, name, admin1',
  syncRuns: '++id, source, startedAt, status',
  favorites: 'id, commodityCode',
  alerts: '++id, commodityCode',
  notifications: '++id, createdAt, read',
  simulations: '++id, createdAt',
  shopPrices: '++id, shopId, product, declaredAt',
  shops: 'id, kind, fetchedAt',
  kv: 'key',
})

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}
export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value })
}
