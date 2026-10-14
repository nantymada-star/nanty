import { describe, expect, it } from 'vitest'
import { normalizeRows } from './hapi'
import { buildSeries, freshnessOf, median, seasonalIndex, shiftMonths, summarize } from './stats'
import { row } from '../test/fixtures'

const obs = (prices: [string, number][], extra = {}) =>
  normalizeRows(prices.map(([d, p]) => row({ reference_period_start: d, reference_period_end: d, price: p, ...extra })), 'now').ok

describe('buildSeries', () => {
  it('dernier prix, variation vs précédent et sur 12 mois', () => {
    const s = [...buildSeries(obs([['2025-01-01', 2000], ['2025-12-01', 2400], ['2026-01-01', 2500]])).values()][0]
    expect(s.latest.price).toBe(2500)
    expect(s.change1).toBeCloseTo(((2500 - 2400) / 2400) * 100)
    expect(s.change12m).toBeCloseTo(25)
  })
  it('préfère "actual" à "aggregate" pour une même période', () => {
    const a = obs([['2026-01-01', 2000]], { price_flag: 'aggregate' })
    const b = obs([['2026-01-01', 2100]])
    const s = [...buildSeries([...a, ...b]).values()][0]
    expect(s.points).toHaveLength(1)
    expect(s.latest.price).toBe(2100)
  })
  it('exclut les valeurs suspectes', () => {
    const o = obs([['2026-01-01', 2000], ['2026-02-01', 9999]])
    o[1].suspect = 'outlier'
    expect([...buildSeries(o).values()][0].latest.price).toBe(2000)
  })
})

describe('freshness', () => {
  it('vérifié si récent, ancien au-delà du seuil', () => {
    const [o] = obs([['2026-09-01', 1]])
    o.periodEnd = '2026-09-30'
    expect(freshnessOf(o, { default: 60 }, Date.parse('2026-10-14'))).toBe('verified')
    expect(freshnessOf(o, { default: 60 }, Date.parse('2027-01-14'))).toBe('stale')
  })
  it('déclaré / en attente pour les relevés utilisateurs', () => {
    const [o] = obs([['2026-10-01', 1]])
    o.source = 'user'; o.moderation = 'pending'
    expect(freshnessOf(o, { default: 60 }, Date.parse('2026-10-14'))).toBe('pending')
    o.moderation = undefined
    expect(freshnessOf(o, { default: 60 }, Date.parse('2026-10-14'))).toBe('declared')
  })
})

describe('helpers', () => {
  it('median / summarize / shiftMonths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(shiftMonths('2026-01-01', -12)).toBe('2025-01-01')
    expect(shiftMonths('2026-03-15', -3)).toBe('2025-12-01')
    const series = [...buildSeries([...obs([['2026-01-01', 10]]), ...obs([['2026-01-01', 30]], { market_code: '2' })]).values()]
    expect(summarize(series)).toEqual({ min: 10, max: 30, median: 20, n: 2 })
  })
  it('indice saisonnier sur années complètes uniquement', () => {
    const pts = obs(Array.from({ length: 12 }, (_, m) => [`2025-${String(m + 1).padStart(2, '0')}-01`, m < 6 ? 120 : 80] as [string, number]))
    const idx = seasonalIndex(pts)
    expect(idx[0].index).toBeCloseTo(1.2)
    expect(idx[11].index).toBeCloseTo(0.8)
    expect(seasonalIndex(pts.slice(0, 5)).every((x) => x.index == null)).toBe(true)
  })
})
