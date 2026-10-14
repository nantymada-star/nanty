import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../i18n'
import { commodityLabel, matchScore, osmKindsForQuery } from './commodities'
import { fmtAr, fmtNum, fmtPeriod } from './format'
import { isOpenNow } from './geo'

describe('i18n', () => {
  it('chaque texte existe en malgache et en français, non vides', () => {
    for (const [k, [mg, fr]] of Object.entries(MESSAGES)) {
      expect(mg.trim(), k).not.toBe('')
      expect(fr.trim(), k).not.toBe('')
    }
  })
})

describe('commodities', () => {
  it('noms malgaches et synonymes', () => {
    expect(commodityLabel('Rice (local)', 'mg')).toBe('Vary gasy')
    expect(commodityLabel('Rice (local)', 'fr')).toBe('Riz local')
    expect(commodityLabel('Unknown thing', 'mg')).toBe('Unknown thing')
    expect(matchScore('vary', 'Rice (imported)')).toBeGreaterThan(0)
    expect(matchScore('riz', 'Rice (local)')).toBeGreaterThan(0)
    expect(matchScore('mangahazo', 'Cassava (dry)')).toBeGreaterThan(0)
    expect(matchScore('vary', 'Sugar')).toBe(0)
  })
  it('types de commerces selon le produit', () => {
    expect(osmKindsForQuery('ciment')).toContain('shop=hardware')
    expect(osmKindsForQuery('zezika')).toContain('shop=agrarian')
    expect(osmKindsForQuery('vary')).toContain('amenity=marketplace')
  })
})

describe('format', () => {
  it('ariary et périodes', () => {
    expect(fmtNum(1250)).toBe('1 250')
    expect(fmtAr(58000)).toBe('58 000 Ar')
    expect(fmtPeriod('2026-01-01', '2026-01-31', 'mg')).toBe('Janoary 2026')
    expect(fmtPeriod('2026-03-01', '2026-03-31', 'fr')).toBe('mars 2026')
  })
})

describe('isOpenNow (heure de Madagascar, UTC+3)', () => {
  // mercredi 14 oct. 2026 07:00 UTC = 10:00 à Antananarivo
  const wed10 = new Date('2026-10-14T07:00:00Z')
  it('interprète les horaires OSM simples', () => {
    expect(isOpenNow('Mo-Fr 08:00-18:00', wed10)).toBe(true)
    expect(isOpenNow('Mo-Fr 11:00-18:00', wed10)).toBe(false)
    expect(isOpenNow('Sa-Su 08:00-12:00', wed10)).toBe(false)
    expect(isOpenNow('24/7', wed10)).toBe(true)
    expect(isOpenNow(undefined, wed10)).toBeNull()
    expect(isOpenNow('sunrise-sunset', wed10)).toBeNull()
  })
})
