import type { HapiFoodPrice } from '../lib/hapi'

/** Ligne au format exact de la réponse HDX HAPI v2 (schéma FoodPriceResponse). Utilisé uniquement par les tests. */
export function row(p: Partial<HapiFoodPrice>): HapiFoodPrice {
  return {
    location_code: 'MDG', admin1_name: 'Analamanga', admin2_name: 'Antananarivo Renivohitra',
    market_code: '1001', market_name: 'Antananarivo', commodity_code: '52', commodity_name: 'Rice (local)',
    commodity_category: 'cereals and tubers', currency_code: 'MGA', unit: 'KG', price_flag: 'actual', price_type: 'Retail',
    price: '2500', lat: -18.9, lon: 47.5, reference_period_start: '2026-01-01T00:00:00', reference_period_end: '2026-01-31T00:00:00',
    ...p,
  }
}
