import { describe, expect, it } from 'vitest'
import { encodeAppIdentifier, flagOutliers, normalizeRows, observationId } from './hapi'
import { row } from '../test/fixtures'

describe('normalizeRows', () => {
  it('normalise sans modifier la date d’origine', () => {
    const { ok } = normalizeRows([row({})], '2026-10-14T10:00:00.000Z')
    expect(ok).toHaveLength(1)
    expect(ok[0].periodStart).toBe('2026-01-01')
    expect(ok[0].periodEnd).toBe('2026-01-31')
    expect(ok[0].price).toBe(2500)
    expect(ok[0].unit).toBe('kg')
    expect(ok[0].firstSeenAt).toBe('2026-10-14T10:00:00.000Z')
  })
  it('rejette autre pays, autre devise, prix invalide, doublons', () => {
    const { ok, rejected } = normalizeRows(
      [row({ location_code: 'MOZ' }), row({ currency_code: 'USD' }), row({ price: '0' }), row({ price: 'abc' }), row({}), row({})],
      'now',
    )
    expect(ok).toHaveLength(1)
    expect(rejected.map((r) => r.reason)).toEqual(['location', 'currency', 'price', 'price', 'duplicate'])
  })
  it('id stable par marché/produit/unité/type/période', () => {
    expect(observationId(row({}))).toBe('wfp|1001|52|KG|Retail|actual|2026-01-01')
  })
})

describe('flagOutliers', () => {
  it('marque une erreur d’unité probable (x10)', () => {
    const months = ['01', '02', '03', '04', '05']
    const { ok } = normalizeRows(months.map((m, i) => row({ reference_period_start: `2026-${m}-01`, price: i === 4 ? 25000 : 2500 })), 'now')
    expect(flagOutliers(ok)).toBe(1)
    expect(ok[4].suspect).toBe('outlier')
  })
})

describe('encodeAppIdentifier', () => {
  it('base64("app:email") comme HDX HAPI', () => {
    expect(atob(encodeAppIdentifier('MadaPrice', 'a@b.mg'))).toBe('MadaPrice:a@b.mg')
  })
})

describe('fetchAllFoodPrices — erreurs d’hébergement', () => {
  it('explique clairement quand le direct est bloqué et que le relais renvoie une page HTML', async () => {
    const { fetchAllFoodPrices } = await import('./hapi')
    const orig = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      if (String(url).startsWith('https://')) throw new TypeError('Failed to fetch')
      return new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    }) as typeof fetch
    try {
      await expect(fetchAllFoodPrices({ appId: 'x', startDate: null, mode: 'auto' })).rejects.toThrow(/CORS.*Relais \/hapi-proxy absent/)
    } finally {
      globalThis.fetch = orig
    }
  })
})
