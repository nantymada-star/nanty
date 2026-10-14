import { describe, expect, it } from 'vitest'
import { EMPTY_SIM, priceForTarget, scenario, simulate } from './simulator'

describe('simulate', () => {
  it('calcule les formules du cahier des charges', () => {
    const r = simulate({ ...EMPTY_SIM, quantity: 10, buyPrice: 58000, sellPrice: 70000, transport: 50000, other: 20000 })
    expect(r.purchaseCost).toBe(580000)
    expect(r.sellableQty).toBe(10)
    expect(r.revenue).toBe(700000)
    expect(r.totalCost).toBe(650000)
    expect(r.netProfit).toBe(50000)
    expect(r.marginPct).toBeCloseTo((50000 / 700000) * 100, 10)
    expect(r.roiPct).toBeCloseTo((50000 / 650000) * 100, 10)
    expect(r.breakEvenPrice).toBe(65000)
  })

  it('applique les pertes puis les invendus', () => {
    const r = simulate({ ...EMPTY_SIM, quantity: 100, buyPrice: 1000, sellPrice: 1500, lossPct: 10, unsoldPct: 50 })
    expect(r.sellableQty).toBe(90)
    expect(r.soldQty).toBe(45)
    expect(r.revenue).toBe(67500)
    expect(r.netProfit).toBe(67500 - 100000)
  })

  it('retourne "non calculable" (null) si le dénominateur est nul', () => {
    const r = simulate(EMPTY_SIM)
    expect(r.marginPct).toBeNull()
    expect(r.roiPct).toBeNull()
    expect(r.breakEvenPrice).toBeNull()
  })

  it('borne les pourcentages et ignore les valeurs non numériques', () => {
    const r = simulate({ ...EMPTY_SIM, quantity: 10, buyPrice: 1, sellPrice: 1, lossPct: 150, transport: NaN })
    expect(r.sellableQty).toBe(0)
    expect(r.expenses).toBe(0)
  })

  it('compte chaque dépense une seule fois', () => {
    const r = simulate({ ...EMPTY_SIM, transport: 1, handling: 2, storage: 3, packaging: 4, labour: 5, taxes: 6, commissions: 7, financing: 8, other: 9 })
    expect(r.expenses).toBe(45)
    expect(r.totalCost).toBe(45)
  })
})

describe('priceForTarget / scenario', () => {
  it('prix nécessaire pour un bénéfice cible', () => {
    const i = { ...EMPTY_SIM, quantity: 10, buyPrice: 58000, sellPrice: 70000, transport: 50000, other: 20000 }
    expect(priceForTarget(i, 100000)).toBe(75000)
    expect(priceForTarget(EMPTY_SIM, 1)).toBeNull()
  })
  it('scénarios pessimiste / optimiste', () => {
    const i = { ...EMPTY_SIM, sellPrice: 1000, lossPct: 5 }
    expect(scenario(i, 'realistic')).toEqual(i)
    expect(scenario(i, 'pessimistic').sellPrice).toBe(900)
    expect(scenario(i, 'pessimistic').lossPct).toBe(10)
    expect(scenario(i, 'optimistic').sellPrice).toBeCloseTo(1100)
    expect(scenario(i, 'optimistic').lossPct).toBe(0)
  })
})
