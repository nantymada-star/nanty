// Lecture des fiches hebdomadaires de relevé de l'ODR (formulaire standard : feuilles Saisie_Producteurs,
// Saisie_Grossistes, Saisie_Detaillants) : pur TypeScript, partagé par la fonction serveur et les tests.
// Les colonnes de nom et de téléphone (vendeurs, enquêteurs) ne sont jamais lues.

export type Product = 'paddy' | 'riz_local' | 'riz_importe'
export type Stage = 'producteur' | 'grossiste' | 'detaillant'

export interface FicheAggregate {
  id: string
  survey_date: string
  region: string
  district: string | null
  commune: string | null
  market: string
  product: Product
  stage: Stage
  price: number
  price_min: number
  price_max: number
  n_sellers: number
  varieties: string[]
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const areaKey = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Colonnes du formulaire : 1 région, 3 district, 5 commune, 7 marché, 9 date ; 15/16, 17/18, 19/20 variété/prix
const C = { region: 1, district: 3, commune: 5, market: 7, date: 9 }
/** Paires (colonne variété, colonne prix, produit) par feuille. */
const PAIRS: Record<Stage, [number, number, Product][]> = {
  producteur: [[15, 16, 'paddy'], [17, 18, 'riz_local']],
  grossiste: [[15, 16, 'riz_importe'], [17, 18, 'riz_local'], [19, 20, 'riz_local']],
  detaillant: [[15, 16, 'riz_importe'], [17, 18, 'riz_local'], [19, 20, 'riz_local']],
}

export function sheetStage(name: string): Stage | null {
  const n = fold(name)
  if (!/saisie/.test(n)) return null
  if (/prod/.test(n)) return 'producteur'
  if (/gross/.test(n)) return 'grossiste'
  if (/detail/.test(n)) return 'detaillant'
  return null
}

/** Date Excel (numéro de série) ou texte « 17/07/2026 », « 2026-07-17 » → AAAA-MM-JJ. */
export function cellDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10)
  }
  if (typeof v === 'string') {
    const s = v.trim()
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      // Date réelle seulement (« 31/06 » saisi par erreur → écartée)
      const t = new Date(`${d}T00:00:00Z`)
      return /^20[2-3]\d-/.test(d) && !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d ? d : null
    }
  }
  return null
}

/** Prix en Ar/kg : 2000, « 2 000 », « 2.000 Ar » → 2000 ; « - », vide → null. */
export function cellPrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null
  if (typeof v !== 'string') return null
  const s = v.replace(/[\s  ]/g, '').replace(/(ar|ariary|mga)$/i, '')
  if (!/^\d{1,3}([.,]?\d{3})*$/.test(s)) return null
  const n = Number(s.replace(/[.,]/g, ''))
  return n > 0 ? n : null
}

const text = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())
/** Nom propre : « VAKINANKARATRA » → « Vakinankaratra », « A/bao manampotsy » gardé tel quel hors casse. */
export const title = (s: string) => s.toLowerCase().replace(/(^|[\s'’/-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase())

// Fourchettes plausibles (Ar/kg) : au-delà, erreur de saisie (prix du sac, unité oubliée…)
const RANGE: Record<Product, [number, number]> = { paddy: [300, 8000], riz_local: [600, 15000], riz_importe: [600, 15000] }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const MONTHS: [RegExp, number][] = [
  [/\bjanv/, 1], [/\bfevr?/, 2], [/\bmars\b/, 3], [/\bavr/, 4], [/\bmai\b/, 5], [/\bjuin\b/, 6],
  [/\bjuil/, 7], [/\baout\b|\baou\b/, 8], [/\bsept?/, 9], [/\boct/, 10], [/\bnov/, 11], [/\bdec/, 12],
]
/** Mois cités dans le nom du fichier (« Fiche_ODR ATSINANANA, 01 juillet 2026.xlsx » → [7]). */
export function fileMonths(fileName: string) {
  const n = fold(fileName).replace(/[_.,-]+/g, ' ')
  return MONTHS.filter(([re]) => re.test(n)).map(([, m]) => m)
}
/** Date cohérente avec les mois du nom de fichier (± 1 mois) ; sans mois lisible, toute date est acceptée. */
export function fitsFileMonths(date: string, months: number[]) {
  if (!months.length) return true
  const m = Number(date.slice(5, 7))
  return months.some((x) => [0, 1, 11].includes((m - x + 12) % 12))
}

/**
 * Feuilles d'un classeur → prix agrégés par marché, date, produit et étape (médiane des vendeurs).
 * Avec le nom du fichier : les dates éloignées du mois annoncé (modèle de fiche non mis à jour) sont écartées.
 */
export function parseWorkbook(sheets: { name: string; rows: unknown[][] }[], fileName = '') {
  const months = fileMonths(fileName)
  const groups = new Map<string, { base: Omit<FicheAggregate, 'id' | 'price' | 'price_min' | 'price_max' | 'n_sellers' | 'varieties'>; prices: number[]; varieties: Set<string> }>()
  let skipped = 0
  for (const sh of sheets) {
    const stage = sheetStage(sh.name)
    if (!stage) continue
    for (const row of sh.rows) {
      if (!Array.isArray(row)) continue
      const region = text(row[C.region]), market = text(row[C.market])
      if (!region || !market || /^1\.\d/.test(region)) continue // ligne d'en-tête ou vide
      const date = cellDate(row[C.date])
      for (const [vc, pc, product] of PAIRS[stage]) {
        const price = cellPrice(row[pc])
        if (price == null) continue
        const [lo, hi] = RANGE[product]
        if (!date || price < lo || price > hi || !fitsFileMonths(date, months)) { skipped++; continue }
        const base = {
          survey_date: date, region: title(region), district: text(row[C.district]) ? title(text(row[C.district])) : null,
          commune: text(row[C.commune]) ? title(text(row[C.commune])) : null, market: title(market), product, stage,
        }
        const key = ['fiche', areaKey(`${region} ${base.district ?? ''} ${base.commune ?? ''} ${market}`), product, stage, date].join('|')
        const g = groups.get(key) ?? { base, prices: [], varieties: new Set<string>() }
        g.prices.push(price)
        const v = text(row[vc])
        if (v && v !== '-' && v.length <= 60) g.varieties.add(v)
        groups.set(key, g)
      }
    }
  }
  const rows: FicheAggregate[] = [...groups.entries()].map(([id, g]) => ({
    id, ...g.base, price: median(g.prices), price_min: Math.min(...g.prices), price_max: Math.max(...g.prices),
    n_sellers: g.prices.length, varieties: [...g.varieties].slice(0, 10),
  }))
  return { rows, skipped }
}

/** Pièces jointes à lire : classeurs Excel du groupe, adresse sans paramètre d'affichage. */
export function ficheLinks(links: unknown): string[] {
  if (!Array.isArray(links)) return []
  const out = new Set<string>()
  for (const l of links) {
    if (typeof l !== 'string') continue
    if (!/^https:\/\/groups\.google\.com\/group\/cellule-odr-bdd-minae\/attach\//.test(l)) continue
    const u = new URL(l)
    if (!/\.xlsx?$/i.test(decodeURIComponent(u.pathname))) continue
    const part = u.searchParams.get('part')
    out.add(`${u.origin}${u.pathname}${part ? `?part=${part}` : ''}`)
  }
  return [...out]
}

/** « Oct 13, 2026 » (date affichée par Google Groupes) → 2026-10-13. */
export function postedOn(s: unknown): string | null {
  const m = typeof s === 'string' ? s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}), (20\d\d)\b/) : null
  if (!m) return null
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]) + 1
  return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}
