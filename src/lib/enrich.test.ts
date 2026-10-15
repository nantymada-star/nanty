import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { latestRates, parseRate } from './fx'
import { currentOfficial, ensureOfficialSeeds, officialFor, officialIsStale } from './official'
import { importRtfp, itemsMatching, latestByMarket, parseCsvLine, readHeader, rowToEstimates } from './rtfp'

beforeEach(async () => { await db.delete(); await db.open() })

// En-tête au format du dictionnaire RTFP « by product and market » (Banque mondiale) — fichier d'exemple pour le test
const HEADER = 'ISO3,country,adm1_name,adm2_name,mkt_name,lat,lon,DATES,year,month,currency,o_rice,h_rice,l_rice,c_rice,inflation_rice,trust_rice,o_maize,h_maize,l_maize,c_maize,inflation_maize,trust_maize,c_food_price_index'

describe('RTFP (Banque mondiale)', () => {
  it('lit l’en-tête : produits c_*, sans l’indice global', () => {
    const h = readHeader(parseCsvLine(HEADER))
    expect(h.items.map((i) => i.item)).toEqual(['rice', 'maize'])
    expect(h.dateCol).toBe(7)
  })
  it('gère les guillemets CSV', () => {
    expect(parseCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"'])
  })
  it('transforme une ligne en estimations, ignore les vides et les autres pays', () => {
    const h = readHeader(parseCsvLine(HEADER))
    const line = 'MDG,Madagascar,Analamanga,Antananarivo,Antananarivo,-18.9,47.5,2026-05-01,2026,5,MGA,2400,2600,2300,2500,3.1,8.2,,,,,,,1.2'
    const e = rowToEstimates(parseCsvLine(line), h, '2020-01-01', 'now', 'f.csv')
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ item: 'rice', price: 2500, low: 2300, high: 2600, trust: 8.2, date: '2026-05-01', market: 'Antananarivo' })
    expect(rowToEstimates(parseCsvLine(line.replace('MDG', 'KEN')), h, '2020-01-01', 'now', 'f')).toHaveLength(0)
    expect(rowToEstimates(parseCsvLine(line), h, '2027-01-01', 'now', 'f')).toHaveLength(0)
  })
  it('importe un fichier complet et rejette un fichier qui n’est pas au bon format', async () => {
    const csv = [HEADER,
      'MDG,Madagascar,Analamanga,Antananarivo,Antananarivo,-18.9,47.5,2026-04-01,2026,4,MGA,,,,2450,,8,,,,1500,,7,',
      'MDG,Madagascar,Analamanga,Antananarivo,Antananarivo,-18.9,47.5,2026-05-01,2026,5,MGA,,,,2500,,8,,,,1550,,7,',
      'MDG,Madagascar,Boeny,Mahajanga I,Mahajanga,-15.7,46.3,2026-05-01,2026,5,MGA,,,,2300,,6,,,,,,,'].join('\n')
    const r = await importRtfp(csv, 'test.csv', 5)
    expect(r.saved).toBe(5)
    const rice = await db.estimates.where('item').equals('rice').toArray()
    expect(latestByMarket(rice, 'rice').map((e) => [e.market, e.price])).toEqual([['Mahajanga', 2300], ['Antananarivo', 2500]])
    await expect(importRtfp('a,b\n1,2', 'x.csv', 5)).rejects.toThrow()
  })
  it('relie les produits RTFP aux produits WFP', () => {
    expect(itemsMatching('Rice (local)', ['rice', 'maize', 'oil'])).toEqual(['rice'])
    expect(itemsMatching('Maize', ['rice', 'maize'])).toEqual(['maize'])
  })
})

describe('Taux de change', () => {
  it('valide la réponse { date, base, quote, rate }', () => {
    expect(parseRate({ date: '2026-10-14', base: 'USD', quote: 'MGA', rate: 4400.38 })).toMatchObject({ rate: 4400.38 })
    expect(parseRate({ date: '2026-10-14', base: 'USD', quote: 'EUR', rate: 1 })).toBeNull()
    expect(parseRate({ date: 'x', base: 'USD', quote: 'MGA', rate: 1 })).toBeNull()
    expect(parseRate({ status: 404 })).toBeNull()
  })
  it('garde le cours le plus récent, BFM prioritaire à date égale', () => {
    const m = latestRates([
      { id: '1', base: 'USD', rate: 4300, date: '2026-10-10', provider: 'BFM', fetchedAt: '' },
      { id: '2', base: 'USD', rate: 4410, date: '2026-10-14', provider: 'blended', fetchedAt: '' },
      { id: '3', base: 'USD', rate: 4400, date: '2026-10-14', provider: 'BFM', fetchedAt: '' },
    ])
    expect(m.get('USD')!.rate).toBe(4400)
  })
})

describe('Prix officiels', () => {
  it('ajoute les valeurs initiales sourcées une seule fois', async () => {
    expect(await ensureOfficialSeeds()).toBe(4)
    expect(await ensureOfficialSeeds()).toBe(0)
    const all = await db.officialPrices.toArray()
    expect(all.every((p) => p.sourceType === 'press' && p.sourceUrl.startsWith('https://'))).toBe(true)
  })
  it('prix en vigueur = date d’effet la plus récente ; ancien après le délai', async () => {
    await ensureOfficialSeeds()
    await db.officialPrices.add({ key: 'fuel_gasoil', label: 'Gasoil', unit: 'L', price: 4800, area: '', effectiveFrom: '2026-10-01', sourceType: 'official', sourceName: 'OMH', sourceUrl: '', enteredAt: 'x', enteredBy: 'a' })
    const cur = currentOfficial(await db.officialPrices.toArray())
    const g = cur.find((p) => p.key === 'fuel_gasoil')!
    expect(g.price).toBe(4800)
    expect(officialIsStale(g, Date.parse('2026-10-15'))).toBe(false)
    expect(officialIsStale(g, Date.parse('2027-01-15'))).toBe(true)
    expect(officialFor('Fuel (diesel)', await db.officialPrices.toArray()).map((p) => p.price)).toEqual([4800])
    expect(officialFor('Sugar', await db.officialPrices.toArray())).toEqual([])
  })
})
