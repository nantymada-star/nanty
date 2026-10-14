import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { normalizeRows } from './hapi'
import { evaluateAlerts, upsertObservations } from './sync'
import { row } from '../test/fixtures'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('upsertObservations', () => {
  it('insère, conserve la date de première réception et journalise les révisions', async () => {
    const a = normalizeRows([row({ price: '2500' })], '2026-10-01T00:00:00.000Z').ok
    expect((await upsertObservations(a, '2026-10-01T00:00:00.000Z')).inserted).toBe(1)
    const b = normalizeRows([row({ price: '2600' })], '2026-10-02T00:00:00.000Z').ok
    const r = await upsertObservations(b, '2026-10-02T00:00:00.000Z')
    expect(r).toMatchObject({ inserted: 0, updated: 1 })
    const [o] = await db.observations.toArray()
    expect(o.firstSeenAt).toBe('2026-10-01T00:00:00.000Z')
    expect(o.lastVerifiedAt).toBe('2026-10-02T00:00:00.000Z')
    expect(o.price).toBe(2600)
    expect(o.revisions).toEqual([{ price: 2500, seenAt: '2026-10-01T00:00:00.000Z' }])
    expect(o.periodStart).toBe('2026-01-01')
  })
  it('même prix : met seulement à jour la date de vérification', async () => {
    const a = normalizeRows([row({})], 't1').ok
    await upsertObservations(a, 't1')
    const r = await upsertObservations(normalizeRows([row({})], 't2').ok, 't2')
    expect(r).toMatchObject({ inserted: 0, updated: 0 })
    expect((await db.observations.toArray())[0].revisions).toBeUndefined()
  })
})

describe('evaluateAlerts', () => {
  it('déclenche une alerte de baisse au-delà du seuil, une seule fois, avec la date du relevé', async () => {
    const prev = normalizeRows([row({ reference_period_start: '2026-01-01', price: 1000 })], 't').ok
    await upsertObservations(prev, 't')
    await db.alerts.add({ commodityCode: '52', marketCode: '*', unit: 'kg', priceType: 'Retail', kind: 'drop', threshold: 5, active: true, createdAt: 't' })
    const fresh = normalizeRows([row({ reference_period_start: '2026-02-01', reference_period_end: '2026-02-28', price: 900 })], 't').ok
    await upsertObservations(fresh, 't')
    expect(await evaluateAlerts(fresh)).toBe(1)
    expect(await evaluateAlerts(fresh)).toBe(0)
    const [n] = await db.notifications.toArray()
    expect(n.observedPeriod).toBe('2026-02-01')
  })
  it('ne déclenche pas sous le seuil', async () => {
    await upsertObservations(normalizeRows([row({ reference_period_start: '2026-01-01', price: 1000 })], 't').ok, 't')
    await db.alerts.add({ commodityCode: '52', marketCode: '*', unit: 'kg', priceType: 'Retail', kind: 'drop', threshold: 20, active: true, createdAt: 't' })
    const fresh = normalizeRows([row({ reference_period_start: '2026-02-01', price: 900 })], 't').ok
    await upsertObservations(fresh, 't')
    expect(await evaluateAlerts(fresh)).toBe(0)
  })
})
