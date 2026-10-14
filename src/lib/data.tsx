import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Market, type Observation } from './db'
import { buildSeries, compKey, type Series } from './stats'

export interface Commodity {
  code: string
  name: string
  category: string
  units: string[]
  priceTypes: string[]
  markets: number
  latest: string
}

interface DataCtx {
  ready: boolean
  observations: Observation[]
  series: Map<string, Series>
  seriesList: Series[]
  markets: Market[]
  marketByCode: Map<string, Market>
  commodities: Commodity[]
  regions: string[]
  newestPeriod: string | null
  lastFirstSeen: string | null
}

const Ctx = createContext<DataCtx | null>(null)

/** Charge les relevés stockés localement et les garde à jour en direct (liveQuery : sans rechargement). */
export function DataProvider({ children }: { children: ReactNode }) {
  const observations = useLiveQuery(() => db.observations.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])

  const value = useMemo<DataCtx>(() => {
    const obs = observations ?? []
    // Les relevés utilisateurs restent séparés des séries WFP (affichés à part, statut Déclaré/Validé).
    const usable = obs.filter((o) => o.source === 'wfp-hapi')
    const series = buildSeries(usable)
    const seriesList = [...series.values()]
    const cm = new Map<string, Commodity>()
    const mk = new Map<string, Set<string>>()
    let newest: string | null = null
    let lastFirst: string | null = null
    for (const o of usable) {
      let c = cm.get(o.commodityCode)
      if (!c) {
        c = { code: o.commodityCode, name: o.commodityName, category: o.category, units: [], priceTypes: [], markets: 0, latest: o.periodStart }
        cm.set(o.commodityCode, c)
        mk.set(o.commodityCode, new Set())
      }
      if (!c.units.includes(o.unit)) c.units.push(o.unit)
      if (!c.priceTypes.includes(o.priceType)) c.priceTypes.push(o.priceType)
      if (o.periodStart > c.latest) c.latest = o.periodStart
      mk.get(o.commodityCode)!.add(o.marketCode)
      if (!newest || o.periodStart > newest) newest = o.periodStart
      if (!lastFirst || o.firstSeenAt > lastFirst) lastFirst = o.firstSeenAt
    }
    for (const c of cm.values()) c.markets = mk.get(c.code)!.size
    const ms = markets ?? []
    return {
      ready: observations !== undefined && markets !== undefined,
      observations: obs,
      series,
      seriesList,
      markets: ms,
      marketByCode: new Map(ms.map((m) => [m.code, m])),
      commodities: [...cm.values()].sort((a, b) => b.markets - a.markets),
      regions: [...new Set(ms.map((m) => m.admin1).filter(Boolean))].sort(),
      newestPeriod: newest,
      lastFirstSeen: lastFirst,
    }
  }, [observations, markets])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const c = useContext(Ctx)
  if (!c) throw new Error('DataProvider manquant')
  return c
}

/** Séries comparables (même produit, unité, type de prix). */
export function comparableGroups(list: Series[]) {
  const g = new Map<string, Series[]>()
  for (const s of list) {
    const k = compKey(s.latest)
    const a = g.get(k)
    if (a) a.push(s)
    else g.set(k, [s])
  }
  return g
}
