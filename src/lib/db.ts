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
  /** season = avant le mois le plus cher (indice saisonnier réel) ; stock = produit déclaré disponible dans un commerce */
  kind: 'rise' | 'drop' | 'below' | 'above' | 'new' | 'season' | 'stock'
  threshold: number // % pour rise/drop, Ar pour below/above
  /** Nom libre du produit pour les alertes « stock » (prix déclarés). */
  product?: string
  /** Dernière période ayant déclenché une alerte saisonnière (AAAA-MM). */
  lastFiredPeriod?: string
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

/** Historique de consultation (« Tantarako »), stocké sur l'appareil uniquement. */
export interface HistoryEntry {
  id?: number
  at: string
  kind: 'product' | 'search' | 'shop'
  key: string // code produit|marché, texte recherché ou id commerce
  label: string
  link: string
}

/** Fiche commerce corrigée par le commerçant (valeurs « déclarées », datées). */
export interface ShopEdit {
  shopId: string
  phone?: string
  address?: string
  hours?: string
  delivery?: 'yes' | 'no' | ''
  deliveryArea?: string
  updatedAt: string
  updatedBy: string
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
  history: EntityTable<HistoryEntry, 'id'>
  shopEdits: EntityTable<ShopEdit, 'shopId'>
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

db.version(2).stores({
  history: '++id, at, kind, key',
  shopEdits: 'shopId',
})

/** Ajoute une consultation à l'historique (une seule entrée par élément, la plus récente). */
export async function recordHistory(e: Omit<HistoryEntry, 'id' | 'at'>) {
  try {
    await db.transaction('rw', db.history, async () => {
      await db.history.where('key').equals(e.key).filter((x) => x.kind === e.kind).delete()
      await db.history.add({ ...e, at: new Date().toISOString() })
      const n = await db.history.count()
      if (n > 300) {
        const old = await db.history.orderBy('at').limit(n - 300).primaryKeys()
        await db.history.bulkDelete(old)
      }
    })
  } catch {
    /* l'historique est une commodité : ne jamais bloquer l'écran */
  }
}

/** Nombre de consultations d'une fiche commerce sur cet appareil (statistiques locales). */
export async function shopViewCount(shopId: string) {
  return db.kv.get('views:' + shopId).then((r) => (r?.value as number) ?? 0)
}
export async function bumpShopView(shopId: string) {
  try {
    await db.kv.put({ key: 'views:' + shopId, value: (await shopViewCount(shopId)) + 1 })
  } catch {
    /* ignore */
  }
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}
export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value })
}
