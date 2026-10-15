import { db, getKV, setKV, type OfficialPrice } from './db'

/** Produits à prix officiel ou réglementé. staleDays : au-delà, le prix est signalé « Ancien ». */
export interface OfficialPreset {
  key: string
  mg: string
  fr: string
  unit: string
  group: 'fuel' | 'rice' | 'export'
  staleDays: number
  sourceName: string
  sourceUrl: string
  /** Mots pour relier aux produits WFP (noms anglais). */
  match: string[]
}

export const OFFICIAL_PRESETS: OfficialPreset[] = [
  { key: 'fuel_sp95', mg: 'Lasantsy (SP95)', fr: 'Supercarburant (SP95)', unit: 'L', group: 'fuel', staleDays: 45, sourceName: 'OMH', sourceUrl: '', match: ['petrol', 'gasoline'] },
  { key: 'fuel_gasoil', mg: 'Gazoaly', fr: 'Gasoil', unit: 'L', group: 'fuel', staleDays: 45, sourceName: 'OMH', sourceUrl: '', match: ['diesel'] },
  { key: 'fuel_petrole', mg: 'Solitany (pétrole lampant)', fr: 'Pétrole lampant', unit: 'L', group: 'fuel', staleDays: 45, sourceName: 'OMH', sourceUrl: '', match: ['kerosene'] },
  { key: 'rice_paddy_odr', mg: 'Akotry (ODR)', fr: 'Paddy (ODR)', unit: 'kg', group: 'rice', staleDays: 45, sourceName: 'Observatoire du Riz – MIASA', sourceUrl: 'https://www.miasa.gov.mg', match: ['paddy'] },
  { key: 'rice_local_odr', mg: 'Vary gasy (ODR)', fr: 'Riz local (ODR)', unit: 'kg', group: 'rice', staleDays: 45, sourceName: 'Observatoire du Riz – MIASA', sourceUrl: 'https://www.miasa.gov.mg', match: ['rice (local)'] },
  { key: 'rice_imported_odr', mg: 'Vary vahiny (ODR)', fr: 'Riz importé (ODR)', unit: 'kg', group: 'rice', staleDays: 45, sourceName: 'Observatoire du Riz – MIASA', sourceUrl: 'https://www.miasa.gov.mg', match: ['rice (imported)'] },
  { key: 'vanilla_green_floor', mg: 'Lavanila maitso (vidiny farany ambany, > 13 cm)', fr: 'Vanille verte – prix plancher (> 13 cm)', unit: 'kg', group: 'export', staleDays: 365, sourceName: 'Conseil des ministres', sourceUrl: '', match: ['vanilla'] },
]

export const presetOf = (key: string) => OFFICIAL_PRESETS.find((p) => p.key === key)

/**
 * Valeurs initiales relevées dans la presse, datées et sourcées (mention « Gazety / Presse »).
 * Elles deviennent « Ancien » automatiquement après leur délai ; l'administrateur saisit les nouvelles.
 */
export const OFFICIAL_SEEDS: Omit<OfficialPrice, 'id' | 'enteredAt' | 'enteredBy'>[] = [
  { key: 'fuel_sp95', label: 'SP95', unit: 'L', price: 4900, area: '', effectiveFrom: '2026-03', sourceType: 'press', sourceName: "L'Express de Madagascar (annonce OMH)", sourceUrl: 'https://www.lexpress.mg/2026/03/prix-du-carburant-une-baisse-de-200.html' },
  { key: 'fuel_gasoil', label: 'Gasoil', unit: 'L', price: 4660, area: '', effectiveFrom: '2026-03', sourceType: 'press', sourceName: "L'Express de Madagascar (annonce OMH)", sourceUrl: 'https://www.lexpress.mg/2026/03/prix-du-carburant-une-baisse-de-200.html' },
  { key: 'fuel_petrole', label: 'Pétrole lampant', unit: 'L', price: 3510, area: '', effectiveFrom: '2026-03', sourceType: 'press', sourceName: "L'Express de Madagascar (annonce OMH)", sourceUrl: 'https://www.lexpress.mg/2026/03/prix-du-carburant-une-baisse-de-200.html' },
  { key: 'vanilla_green_floor', label: 'Vanille verte > 13 cm', unit: 'kg', price: 10000, area: '', effectiveFrom: '2026-06', sourceType: 'press', sourceName: 'Capmad (décision du Conseil des ministres)', sourceUrl: 'https://capmad.com/article/madagascar-retablit-un-prix-plancher-sur-la-vanille-verte-avant-une-campagne-20262027-sous-pression' },
]

export async function ensureOfficialSeeds() {
  if (await getKV<boolean>('seed:official:v1', false)) return 0
  const now = new Date().toISOString()
  await db.officialPrices.bulkAdd(OFFICIAL_SEEDS.map((s) => ({ ...s, enteredAt: now, enteredBy: 'MadaPrice (presse)' })))
  await setKV('seed:official:v1', true)
  return OFFICIAL_SEEDS.length
}

/** Prix en vigueur par produit et zone : date d'effet la plus récente. */
export function currentOfficial(all: OfficialPrice[]) {
  const by = new Map<string, OfficialPrice>()
  for (const p of all) {
    const k = `${p.key}|${p.area}`
    const cur = by.get(k)
    if (!cur || p.effectiveFrom > cur.effectiveFrom || (p.effectiveFrom === cur.effectiveFrom && p.enteredAt > cur.enteredAt)) by.set(k, p)
  }
  return [...by.values()]
}

export function officialIsStale(p: OfficialPrice, now = Date.now()) {
  const d = presetOf(p.key)?.staleDays ?? 60
  const start = Date.parse(p.effectiveFrom.length === 7 ? p.effectiveFrom + '-01' : p.effectiveFrom)
  return now - start > d * 86400000
}

/** Prix officiels liés à un produit WFP (par nom anglais). */
export function officialFor(commodityName: string, all: OfficialPrice[]) {
  const n = commodityName.toLowerCase()
  return currentOfficial(all).filter((p) => presetOf(p.key)?.match.some((m) => n.includes(m)))
}
