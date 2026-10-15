import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, recordHistory } from './db'
import { normalizeRows } from './hapi'
import { buildSeries } from './stats'
import { estimateRange, evaluateSeasonAlerts, evaluateStockAlerts, monthTone, seasonProfile } from './seasonal'
import { row } from '../test/fixtures'

/** Deux marchés, deux années complètes : prix hauts en mars (+20 %), bas en septembre (−20 %). */
function series() {
  const rows = []
  for (const [mc, f] of [['1', 1], ['2', 1.1]] as const)
    for (const y of [2024, 2025])
      for (let m = 1; m <= 12; m++) {
        const k = m === 3 ? 1.2 : m === 9 ? 0.8 : 1
        rows.push(row({ market_code: mc, reference_period_start: `${y}-${String(m).padStart(2, '0')}-01`, price: Math.round(1000 * f * k) }))
      }
  return [...buildSeries(normalizeRows(rows, 'now').ok).values()]
}

beforeEach(async () => { await db.delete(); await db.open() })

describe('seasonProfile / estimateRange', () => {
  it('trouve le mois le plus cher et le moins cher sur les données réelles', () => {
    const p = seasonProfile(series(), '52', 'kg')
    expect(p.hi).toBe(2)
    expect(p.lo).toBe(8)
    expect(p.years).toBe(2)
    expect(p.markets).toBe(2)
  })
  it('filtre par région', () => {
    expect(seasonProfile(series(), '52', 'kg', 'Autre région').hi).toBeNull()
  })
  it('fourchette estimée : prix actuel (décembre) ramené à mars', () => {
    const s = series()
    const r = estimateRange(s, seasonProfile(s, '52', 'kg'), '52', 'kg', 2)!
    expect(r.baseMonth).toBe(11)
    expect(r.central).toBeGreaterThan(r.base)
    expect(r.low).toBeLessThanOrEqual(r.central)
    expect(r.high).toBeGreaterThanOrEqual(r.central)
  })
  it('classe abondance / pénurie', () => {
    expect(monthTone(90)).toBe('abundance')
    expect(monthTone(110)).toBe('shortage')
    expect(monthTone(100)).toBe('normal')
    expect(monthTone(null)).toBe('unknown')
  })
})

describe('alertes saison et disponibilité', () => {
  it('alerte saisonnière le mois précédant le pic, une seule fois par mois', async () => {
    await db.alerts.add({ commodityCode: '52', marketCode: '*', unit: 'kg', priceType: 'Retail', kind: 'season', threshold: 0, active: true, createdAt: 't' })
    const feb = new Date('2026-02-10T00:00:00Z')
    expect(await evaluateSeasonAlerts(series(), 'mg', feb)).toBe(1)
    expect(await evaluateSeasonAlerts(series(), 'mg', feb)).toBe(0)
    expect(await evaluateSeasonAlerts(series(), 'mg', new Date('2026-06-10T00:00:00Z'))).toBe(0)
    const [n] = await db.notifications.toArray()
    expect(n.kind).toBe('season')
  })
  it('alerte de disponibilité sur un prix déclaré en stock', async () => {
    await db.alerts.add({ commodityCode: '', marketCode: '*', unit: '', priceType: '', kind: 'stock', product: 'ciment', threshold: 0, active: true, createdAt: 't' })
    const base = { shopId: 'node/1', shopName: 'Test', unit: 'sac', price: 38000, priceType: 'Retail' as const, delivery: false, declaredAt: 't', declaredBy: 'x' }
    expect(await evaluateStockAlerts({ ...base, product: 'Ciment 50 kg', stock: 'unknown' }, 'fr')).toBe(0)
    expect(await evaluateStockAlerts({ ...base, product: 'Ciment 50 kg', stock: 'declared' }, 'fr')).toBe(1)
    expect(await evaluateStockAlerts({ ...base, product: 'Fer 10', stock: 'declared' }, 'fr')).toBe(0)
  })
})

describe('historique', () => {
  it('garde une seule entrée par élément, la plus récente', async () => {
    await recordHistory({ kind: 'search', key: 'vary', label: 'vary', link: '/hitady?q=vary' })
    await recordHistory({ kind: 'search', key: 'vary', label: 'vary', link: '/hitady?q=vary' })
    await recordHistory({ kind: 'product', key: 'vary', label: 'Vary', link: '/x' })
    expect(await db.history.count()).toBe(2)
  })
})
