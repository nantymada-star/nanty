import { describe, expect, it } from 'vitest'
import { cellDate, cellPrice, ficheLinks, fileMonths, fitsFileMonths, parseWorkbook, postedOn, sheetStage } from '../../supabase/functions/sync-odr-fiches/parse'
import { weeklyByRegion, type FicheRow } from './odr'

// Extraits réels (fiche Atsinanana, juillet 2026) ; noms et téléphones remplacés : ils ne sont jamais lus.
const HEAD = ['Num', '1.1.lib', '1.1.code', '1.2.lib', '1.2.code', '1.3.lib', '1.3.code', '1.4.lib', '1.4.code', '1.6', '1.7.a', '1.7.b', '1.7.c', '2.1', '2.2', '2.3.a', '2.3.b', '2.4.a', '2.4.b']
const loc = ['Atsinanana', 31, 'Brickaville', 313, 'Brickaville', 31301, 'Brickaville', '01', 46218, 'X', 'Chef CIRAE', '000', 1, 'Y']
const SHEETS = [
  { name: 'Sommaire', rows: [['Sommaire'], ['Saisie_Producteurs']] },
  { name: 'Saisie_Producteurs', rows: [HEAD,
    ['Q02', ...loc.slice(0, 12), 1, 'Y', 'Ramilona', 1500, 'Korotsaka', 2000, 'Prix stable'],
    [null, ...loc.slice(0, 12), 2, 'Y', 'Fotsiavarina', 1500, 'Ramaditra', 2000],
    [null, ...loc.slice(0, 12), 3, 'Y', 'Mazankatoka', '1 450', 'Ramilona', 2000],
    [null, ...loc.slice(0, 12), 4, 'Y', '-', '-', 'Ramilona', 200000]] },
  { name: 'Saisie_Grossistes', rows: [HEAD,
    ['Q02', ...loc.slice(0, 12), 1, 'Y', 'Stock', 2060, 'Makalioka fotsy', 2190, 'Ramaditra', 2150],
    [null, ...loc.slice(0, 12), 2, 'Y', 'Stock', 2060, 'Makalioka mena', 2190, 'Mandriravina', 2150]] },
  { name: 'Saisie_Detaillants', rows: [HEAD, [null, 'SAVA', 62, 'Sambava', 621, 'CU Sambava', 62101, 'Sambava ville', '01', null, 'X', '', '', 1, 'Y', null, null, 'VARY GASY', 2450]] },
]

describe('fiches hebdomadaires ODR', () => {
  it('reconnaît les feuilles, les dates Excel et les prix', () => {
    expect(sheetStage('Saisie_Producteurs')).toBe('producteur')
    expect(sheetStage('Saisie Détaillants')).toBe('detaillant')
    expect(sheetStage('Sommaire')).toBeNull()
    expect(cellDate(46218)).toBe('2026-07-15')
    expect(cellDate('17/07/2026')).toBe('2026-07-17')
    expect(cellDate('Prix stable')).toBeNull()
    expect(cellDate('31/06/2026')).toBeNull()
    expect(cellPrice('2 000')).toBe(2000)
    expect(cellPrice('2.150 Ar')).toBe(2150)
    expect(cellPrice('-')).toBeNull()
  })

  it('agrège les vendeurs par marché et étape, sans aucun nom de personne', () => {
    const { rows, skipped } = parseWorkbook(SHEETS)
    const paddy = rows.find((r) => r.product === 'paddy' && r.stage === 'producteur')!
    expect(paddy).toMatchObject({ region: 'Atsinanana', district: 'Brickaville', market: 'Brickaville', survey_date: '2026-07-15', price: 1500, price_min: 1450, price_max: 1500, n_sellers: 3 })
    expect(paddy.varieties).toEqual(['Ramilona', 'Fotsiavarina', 'Mazankatoka'])
    const local = rows.find((r) => r.product === 'riz_local' && r.stage === 'producteur')!
    expect(local.n_sellers).toBe(3) // 200 000 Ar/kg écarté
    const gros = rows.find((r) => r.product === 'riz_local' && r.stage === 'grossiste')!
    expect(gros).toMatchObject({ price: 2170, n_sellers: 4 })
    expect(rows.find((r) => r.product === 'riz_importe')?.price).toBe(2060)
    expect(skipped).toBe(2) // prix hors fourchette + ligne sans date
    expect(JSON.stringify(rows)).not.toMatch(/"X"|"Y"|CIRAE/)
  })

  it('écarte les dates éloignées du mois annoncé dans le nom du fichier', () => {
    expect(fileMonths('Fiche_ODR ATSINANANA, 01 juillet 2026.xlsx')).toEqual([7])
    expect(fileMonths('Fiche_ODR_Sava_du 31 Août au 06 Sept 26.xlsx')).toEqual([8, 9])
    expect(fileMonths('FICHE_ODR_ 03 au 09 août 2026.xlsx')).toEqual([8])
    expect(fileMonths('Fiche_ODR Vakin.xlsx')).toEqual([])
    expect(fitsFileMonths('2026-01-20', [7])).toBe(false)
    expect(fitsFileMonths('2026-06-30', [7])).toBe(true)
    expect(fitsFileMonths('2026-01-02', [12])).toBe(true)
    expect(parseWorkbook(SHEETS, 'Fiche_ODR ATSINANANA, 10 janvier 2026.xlsx').rows.filter((r) => r.region === 'Atsinanana')).toHaveLength(0)
    expect(parseWorkbook(SHEETS, 'Fiche_ODR ATSINANANA, 15 juillet 2026.xlsx').rows.length).toBeGreaterThan(0)
  })

  it('garde seulement les classeurs Excel du groupe', () => {
    expect(ficheLinks([
      'https://groups.google.com/group/cellule-odr-bdd-minae/attach/9147efa10727/Fiche_ODR%20Vakin.xlsx?part=0.1&view=1',
      'https://groups.google.com/group/cellule-odr-bdd-minae/attach/7236ca8dc010f/RAPPORT%20NARRATIF.docx?part=0.1',
      'https://example.com/x.xlsx',
    ])).toEqual(['https://groups.google.com/group/cellule-odr-bdd-minae/attach/9147efa10727/Fiche_ODR%20Vakin.xlsx?part=0.1'])
    expect(postedOn('unread,\nOct 13, 2026, 12:35:23 PM')).toBe('2026-10-13')
  })

  it('résume la dernière semaine de chaque région', () => {
    const r = (id: string, d: string, stage: FicheRow['stage'], price: number, market = id): FicheRow => ({
      id, survey_date: d, region: 'Boeny', district: null, commune: null, market, product: 'riz_local', stage, price, price_min: price, price_max: price, n_sellers: 3, varieties: [], thread_url: 'https://groups.google.com/g/cellule-odr-bdd-minae/c/abc',
    })
    const w = weeklyByRegion([r('a', '2026-08-03', 'detaillant', 2400), r('b', '2026-08-06', 'detaillant', 2600), r('c', '2026-08-05', 'detaillant', 2500), r('d', '2026-07-20', 'detaillant', 9999)], 'riz_local')
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ region: 'Boeny', from: '2026-08-03', to: '2026-08-06', markets: 3, detaillant: { price: 2500, markets: 3 }, producteur: null })
  })
})
