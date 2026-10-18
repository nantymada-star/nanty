import { describe, expect, it } from 'vitest'
import { fromApify, fromWoo, normalizeItem, parsePrice, parseSize, productGroup, suspectChange } from '../../supabase/functions/sync-online/parse'

describe('prix en ligne : lecture', () => {
  it('lit les prix en Ariary', () => {
    expect(parsePrice('12 500 Ar')).toBe(12500)
    expect(parsePrice('12.500 MGA')).toBe(12500)
    expect(parsePrice('1 250 Ar')).toBe(1250)
    expect(parsePrice(900)).toBe(900)
    expect(parsePrice('gratuit')).toBeNull()
    expect(parsePrice(0)).toBeNull()
  })
  it('lit la contenance', () => {
    expect(parseSize('YAOURT IZI COCO 90G')).toEqual({ qty: 0.09, unit: 'kg' })
    expect(parseSize('Nickel Lessive Machine 1,5 L')).toEqual({ qty: 1.5, unit: 'L' })
    expect(parseSize('Riz Makalioka 5kg')).toEqual({ qty: 5, unit: 'kg' })
    expect(parseSize('Coca-Cola 6 x 33cl')).toEqual({ qty: 1.98, unit: 'L' })
    expect(parseSize('Lave Mains Citron 300 ml')).toEqual({ qty: 0.3, unit: 'L' })
    expect(parseSize('VGG CHICKEN LUNCHEON MEAT')).toBeNull()
  })
  it('classe les produits', () => {
    expect(productGroup('YAOURT IZI NATURE SUCRE 90G')).toBe('yaourt')
    expect(productGroup('ISHA SARDINE EN HUILE VEGETALE')).toBe('conserve')
    expect(productGroup('ISHA MAIS DOUX 340G', 'Conserves')).toBe('conserve')
    expect(productGroup('Huile de tournesol 1L')).toBe('huile')
    expect(productGroup('Huile essentielle lavande')).not.toBe('huile')
    expect(productGroup('Café moulu 250g')).toBe('cafe-the')
    expect(productGroup('Charge Gaz Butane Vitogaz')).toBe('gaz')
    expect(productGroup('Riz rouge vary mena 1kg')).toBe('riz')
    expect(productGroup('Objet inconnu')).toBeNull()
  })
})

describe('prix en ligne : normalisation', () => {
  it('WooCommerce Store API', () => {
    const p = normalizeItem('bonmarche', fromWoo({
      id: 2125, name: 'YAOURT IZI COCO 90G', permalink: 'https://bonmarche.mg/produit/x', is_in_stock: true,
      prices: { price: '900', currency_code: 'MGA', currency_minor_unit: 0 }, categories: [{ name: 'Produit laitiers' }], images: [],
    }))!
    expect(p).toMatchObject({ id: 'bonmarche|2125', price: 900, unit_price: 10000, size_unit: 'kg', product_group: 'yaourt', in_stock: true })
  })
  it('gère les unités mineures et les entités HTML', () => {
    const p = normalizeItem('s', fromWoo({ id: 1, name: 'Biscuit &amp; gâteau 200g', prices: { price: '150000', currency_code: 'MGA', currency_minor_unit: 2 } }))!
    expect(p.price).toBe(1500)
    expect(p.name).toBe('Biscuit & gâteau 200g')
  })
  it('gaz : prix par recharge', () => {
    const p = normalizeItem('s', { ref: 4222, name: 'Charge Gaz Butane Vitogaz', price: 33000 })!
    expect(p).toMatchObject({ size_unit: 'pièce', unit_price: 33000 })
  })
  it('rejette devise étrangère, prix absurde, nom vide', () => {
    expect(normalizeItem('s', { name: 'Pâtes', price: '0,99', currency: 'EUR' })).toBeNull()
    expect(normalizeItem('s', { name: 'Riz', price: 10 })).toBeNull()
    expect(normalizeItem('s', { name: '', price: 1000 })).toBeNull()
  })
  it('jeu de données Apify', () => {
    const p = normalizeItem('kibo', fromApify({ sku: 'TB-12', title: 'Sucre blanc Top Budget 1kg', priceText: '4 200 Ar', url: 'https://www.kibo.mg/p/12' }))!
    expect(p).toMatchObject({ id: 'kibo|TB-12', price: 4200, unit_price: 4200, product_group: 'sucre' })
  })
  it('variation suspecte', () => {
    expect(suspectChange(1000, 4000)).toBe('jump')
    expect(suspectChange(1000, 1200)).toBeNull()
    expect(suspectChange(null, 1200)).toBeNull()
  })
})

describe('prix en ligne : exclusions', () => {
  it('écarte l’électroménager', () => {
    expect(normalizeItem('s', { name: 'MOULINEX ELECTRIC KETTLE 0.8L', price: 99000, category: 'Bouilloires' })).toBeNull()
    expect(normalizeItem('s', { name: 'Distributeur d’eau de table VISTA', price: 300000, category: 'Distributeurs d&#039;eau' })).toBeNull()
    expect(normalizeItem('s', { name: 'LeCafe GOLD 100g', price: 9000, categories: ['Boissons', 'Café'] })).not.toBeNull()
    expect(normalizeItem('s', { name: 'Cafetière 1.2L VISTA', price: 90000, categories: ['Petit déjeuner', 'Cafetières'] })).toBeNull()
  })
})

describe('prix en ligne : pages KIBO', () => {
  it('classe d’après le nom avant la catégorie', () => {
    expect(productGroup('Boisson aloe vera king zéro sucre original 500ml', 'Sucres')).toBe('boisson')
    expect(productGroup("Cire orientale à l'huile d'argan et au sucre 250ml", 'Sucres')).toBe('hygiene')
    expect(productGroup('Sucre roux en poudre 1kg', 'Sucres')).toBe('sucre')
    expect(productGroup('Edulcorant à la sucralose 120 sticks', 'Sucres')).toBe('sucre')
  })
})
