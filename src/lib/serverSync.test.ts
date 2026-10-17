import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { fromServer, storeServerRows } from './serverSync'

const row = (id: string, price = 2500) => ({
  id, source: 'wfp-hapi', market_code: '1001', market_name: 'Antananarivo', admin1: 'Analamanga', admin2: 'Antananarivo', lat: -18.9, lon: 47.5,
  commodity_code: '52', commodity_name: 'Rice (local)', category: 'cereals and tubers', unit: 'kg', price_type: 'Retail', price_flag: 'actual',
  currency: 'MGA', price: String(price), period_start: '2026-09-01', period_end: '2026-09-30',
  first_seen_at: '2026-10-01T03:10:00Z', last_verified_at: '2026-10-17T03:10:00Z', revisions: [], suspect: null,
})

beforeEach(async () => { await db.delete(); await db.open() })

describe('lecture depuis la base partagée', () => {
  it('conserve les dates du serveur et convertit le prix', () => {
    const o = fromServer(row('a'))
    expect(o).toMatchObject({ id: 'a', source: 'wfp-hapi', price: 2500, periodStart: '2026-09-01', firstSeenAt: '2026-10-01T03:10:00Z' })
    expect(o.revisions).toBeUndefined()
    expect(o.suspect).toBeUndefined()
  })
  it('signale seulement les relevés nouveaux pour cet appareil', async () => {
    expect((await storeServerRows([row('a'), row('b')])).map((o) => o.id)).toEqual(['a', 'b'])
    expect((await storeServerRows([row('a', 2600), row('c')])).map((o) => o.id)).toEqual(['c'])
    expect((await db.observations.get('a'))!.price).toBe(2600)
  })
})
