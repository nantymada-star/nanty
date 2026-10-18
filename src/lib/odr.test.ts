import { describe, expect, it } from 'vitest'
import { bulletinPeriod, parseBulletin, parseDistrictTables, parseRegionTable, periodFromUrl } from '../../supabase/functions/sync-odr/parse'
import { ODR_DISTRICTS, ODR_MAY25_DISTRICTS, ODR_MAY25_TABLE1, ODR_PAGE1, ODR_TABLE1 } from '../test/odrSample'

describe('bulletins ODR', () => {
  it('lit le numéro et la période', () => {
    expect(bulletinPeriod(ODR_PAGE1)).toEqual({ no: 40, period: '2024-09-01' })
    expect(periodFromUrl('https://www.miasa.gov.mg/wp-content/uploads/2026/05/Bulletin_N°49_ODR_Juin_2025.pdf')).toEqual({ no: 49, period: '2025-06-01' })
    expect(periodFromUrl('https://x/Bulletin_N%C2%B036_ODR_Mai_2024.pdf')).toEqual({ no: 36, period: '2024-05-01' })
  })
  it('lit le tableau par région (milliers séparés, NA/ND, écarts)', () => {
    const r = parseRegionTable(ODR_TABLE1)
    const get = (area: string, product: string, stage: string) => r.find((x) => x.area === area && x.product === product && x.stage === stage)
    expect(get('Atsinanana', 'paddy', 'producteur')).toMatchObject({ price: 2014, change_pct: 9.5, level: 'region' })
    expect(get('Atsinanana', 'riz_importe', 'detaillant')).toMatchObject({ price: 2979, change_pct: 6.8 })
    expect(get('Analamanga', 'riz_local', 'grossiste')).toMatchObject({ price: 2825, change_pct: 8.8 })
    expect(get('Analamanga', 'riz_importe', 'detaillant')).toMatchObject({ price: 3344, change_pct: -2.8 })
    expect(get('Analamanga', 'paddy', 'producteur')).toBeUndefined()
    expect(get('Amoron i Mania', 'riz_local', 'detaillant')).toMatchObject({ price: 2911 })
    expect(get('Madagascar', 'paddy', 'producteur')).toMatchObject({ price: 1598, level: 'national' })
    expect(r.filter((x) => x.level === 'national')).toHaveLength(4)
  })
  it('ne confond pas les lignes de district avec celles des régions', () => {
    expect(parseRegionTable(ODR_DISTRICTS)).toEqual([])
    expect(parseDistrictTables(ODR_TABLE1)).toEqual([])
  })
  it('lit les tableaux par district (mois courant)', () => {
    const d = parseDistrictTables(ODR_DISTRICTS)
    expect(d.find((x) => x.area === 'Ambatondrazaka' && x.product === 'paddy')).toMatchObject({ price: 1667, change_pct: 16 })
    expect(d.find((x) => x.area === 'Ambatondrazaka' && x.stage === 'grossiste')).toMatchObject({ price: 2623 })
    expect(d.find((x) => x.area === 'Ambatofinandrahana' && x.stage === 'grossiste')).toMatchObject({ price: 2850 })
    expect(d.find((x) => x.area === 'Ambatofinandrahana' && x.stage === 'producteur' && x.product === 'riz_local')).toBeUndefined()
    expect(d.find((x) => x.area === 'Anosibe-an’ala' && x.product === 'paddy')).toBeUndefined()
  })
  it('lit aussi le format de mai 2025 (milliers inversés)', () => {
    const b = parseBulletin([ODR_MAY25_TABLE1, ODR_MAY25_DISTRICTS])
    const get = (area: string, product: string, stage: string) => b.rows.find((x) => x.area === area && x.product === product && x.stage === stage)
    expect(get('Alaotra Mangoro', 'paddy', 'producteur')).toMatchObject({ price: 1560, level: 'region', change_pct: null })
    expect(get('Alaotra Mangoro', 'riz_local', 'grossiste')).toMatchObject({ price: 2546, change_pct: -8.2 })
    expect(get('Atsimo Atsinanana', 'riz_importe', 'detaillant')).toMatchObject({ price: 3080 })
    expect(get('Madagascar', 'riz_importe', 'detaillant')).toMatchObject({ price: 2860, level: 'national' })
    expect(get('Ambatofinandrahana', 'paddy', 'producteur')).toMatchObject({ price: 1550, level: 'district', change_pct: -9.2 })
    expect(get('Ambatondrazaka', 'riz_importe', 'detaillant')).toMatchObject({ price: 2625, change_pct: 0 })
    expect(get('Ambatondrazaka', 'riz_local', 'producteur')).toBeUndefined()
  })
  it('assemble un bulletin', () => {
    const b = parseBulletin([ODR_PAGE1, ODR_TABLE1, ODR_DISTRICTS])
    expect(b.head).toEqual({ no: 40, period: '2024-09-01' })
    expect(b.rows.length).toBeGreaterThan(25)
  })
})

import { chain, latest, odrForCommodity, type OdrRow } from './odr'
describe('prix officiels ODR côté application', () => {
  const R = (o: Partial<OdrRow>): OdrRow => ({ id: '', bulletin_no: 40, bulletin_url: '', period_start: '2024-09-01', level: 'national', area: 'Madagascar', region: null, product: 'riz_local', stage: 'grossiste', price: 2789, change_pct: null, ...o })
  it('garde la dernière période et calcule la chaîne de prix', () => {
    const rows = [R({ stage: 'producteur', price: 2665 }), R({}), R({ stage: 'detaillant', price: 2942 }), R({ period_start: '2024-08-01', price: 2600 })]
    const l = latest(rows)
    expect(l.period).toBe('2024-09-01')
    expect(chain(l.rows, 'riz_local', 'Madagascar')).toEqual({ producteur: 2665, grossiste: 2789, detaillant: 2942, m1: 124, m2: 153 })
    expect(odrForCommodity('71')).toBe('riz_local')
    expect(odrForCommodity('51')).toBeNull()
  })
})
