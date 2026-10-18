import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { evaluateOnlineAlerts, localOffers, queryLocalOnline } from './onlineCache'
import type { OnlineProduct } from './online'

const P = (o: Partial<OnlineProduct>): OnlineProduct => ({
  id: 'kibo|1', shop_id: 'kibo', name: 'Huile Tournesol 1L', url: null, image_url: null, category: '', product_group: 'huile',
  size_qty: 1, size_unit: 'L', price: 9900, unit_price: 9900, in_stock: null, suspect: null, match_key: 'n:huile tournesol|1L',
  search_text: 'huile tournesol 1l', first_seen_at: '2026-10-18T00:00:00Z', last_seen_at: '2026-10-18T00:00:00Z', last_changed_at: '2026-10-18T00:00:00Z', ...o,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.onlineProducts.bulkPut([
    P({}),
    P({ id: 'bonmarche|7', shop_id: 'bonmarche', price: 10500, unit_price: 10500 }),
    P({ id: 'kibo|2', name: 'Riz rouge 5kg', product_group: 'riz', size_qty: 5, size_unit: 'kg', price: 17500, unit_price: 3500, match_key: 'n:riz rouge|5kg', search_text: 'riz rouge 5kg' }),
  ])
})

describe('copie locale des prix en ligne', () => {
  it('recherche sans accents, filtre et tri par prix au kg/L', async () => {
    expect((await queryLocalOnline({ q: 'HUILE' })).map((p) => p.id)).toEqual(['kibo|1', 'bonmarche|7'])
    expect((await queryLocalOnline({ group: 'riz' })).map((p) => p.id)).toEqual(['kibo|2'])
    expect((await queryLocalOnline({ shop: 'bonmarche' })).length).toBe(1)
    expect((await queryLocalOnline({})).map((p) => p.id)[0]).toBe('kibo|2')
  })
  it('regroupe le même produit entre boutiques', async () => {
    expect((await localOffers('n:huile tournesol|1L')).map((p) => p.price)).toEqual([9900, 10500])
  })
  it('alerte une seule fois quand le prix passe sous le seuil', async () => {
    await db.alerts.add({ commodityCode: '', marketCode: '*', unit: 'L', priceType: 'online', kind: 'online', onlineKey: 'n:huile tournesol|1L', product: 'Huile', threshold: 10000, active: true, createdAt: '' })
    const rows = await db.onlineProducts.toArray()
    expect(await evaluateOnlineAlerts(rows)).toBe(1)
    expect(await evaluateOnlineAlerts(rows)).toBe(0)
    expect(await db.notifications.count()).toBe(1)
    expect((await db.notifications.toArray())[0].body.replace(/\s/g, ' ')).toContain('9 900')
  })
  it('ignore les prix suspects', async () => {
    await db.alerts.add({ commodityCode: '', marketCode: '*', unit: 'L', priceType: 'online', kind: 'online', onlineKey: 'n:huile tournesol|1L', product: 'Huile', threshold: 10000, active: true, createdAt: '' })
    expect(await evaluateOnlineAlerts([P({ suspect: 'outlier', price: 1000 })])).toBe(0)
  })
})
