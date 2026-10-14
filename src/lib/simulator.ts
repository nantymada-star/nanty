/** Simulateur de dépenses et de bénéfices — fonctions pures, testées (simulator.test.ts). */

export interface SimInput {
  quantity: number // quantité achetée (unités : kg, sacs…)
  buyPrice: number // prix d'achat unitaire (Ar)
  sellPrice: number // prix de vente unitaire prévu (Ar)
  lossPct: number // pertes quantitatives / avaries (% de la quantité)
  unsoldPct: number // invendus (% de la quantité vendable)
  transport: number
  handling: number // chargement / déchargement
  storage: number
  packaging: number
  labour: number
  taxes: number
  commissions: number // commissions et frais de marché
  financing: number
  other: number
}

export const EMPTY_SIM: SimInput = {
  quantity: 0, buyPrice: 0, sellPrice: 0, lossPct: 0, unsoldPct: 0,
  transport: 0, handling: 0, storage: 0, packaging: 0, labour: 0, taxes: 0, commissions: 0, financing: 0, other: 0,
}

export interface SimResult {
  purchaseCost: number
  sellableQty: number
  soldQty: number
  revenue: number
  expenses: number // dépenses hors achat
  totalCost: number
  netProfit: number
  marginPct: number | null // null = non calculable
  roiPct: number | null
  breakEvenPrice: number | null
}

const clampPct = (p: number) => Math.min(100, Math.max(0, p || 0))
const n = (x: number) => (Number.isFinite(x) ? x : 0)

export function simulate(i: SimInput): SimResult {
  const qty = Math.max(0, n(i.quantity))
  const purchaseCost = qty * n(i.buyPrice)
  const sellableQty = qty - qty * (clampPct(i.lossPct) / 100)
  const soldQty = sellableQty * (1 - clampPct(i.unsoldPct) / 100)
  const revenue = soldQty * n(i.sellPrice)
  // Chaque poste n'est compté qu'une fois.
  const expenses =
    n(i.transport) + n(i.handling) + n(i.storage) + n(i.packaging) + n(i.labour) +
    n(i.taxes) + n(i.commissions) + n(i.financing) + n(i.other)
  const totalCost = purchaseCost + expenses
  const netProfit = revenue - totalCost
  return {
    purchaseCost,
    sellableQty,
    soldQty,
    revenue,
    expenses,
    totalCost,
    netProfit,
    marginPct: revenue === 0 ? null : (netProfit / revenue) * 100,
    roiPct: totalCost === 0 ? null : (netProfit / totalCost) * 100,
    breakEvenPrice: soldQty === 0 ? null : totalCost / soldQty,
  }
}

/** Prix de vente unitaire nécessaire pour atteindre un bénéfice cible. */
export function priceForTarget(i: SimInput, targetProfit: number): number | null {
  const r = simulate(i)
  return r.soldQty === 0 ? null : (r.totalCost + targetProfit) / r.soldQty
}

export type Scenario = 'pessimistic' | 'realistic' | 'optimistic'

/**
 * Scénarios : variation du prix de vente et des pertes autour de l'hypothèse réaliste.
 * Les écarts sont des paramètres choisis par l'utilisateur.
 */
export function scenario(i: SimInput, s: Scenario, priceSwingPct = 10, lossSwingPct = 5): SimInput {
  if (s === 'realistic') return i
  const sign = s === 'optimistic' ? 1 : -1
  return {
    ...i,
    sellPrice: i.sellPrice * (1 + (sign * priceSwingPct) / 100),
    lossPct: clampPct(i.lossPct - sign * lossSwingPct),
  }
}
