// Lecture des bulletins mensuels de l'Observatoire du Riz (ODR) : pur TypeScript, partagé par la fonction serveur et les tests.

export type OdrProduct = 'paddy' | 'riz_local' | 'riz_importe'
export type OdrStage = 'producteur' | 'grossiste' | 'detaillant'

export interface OdrPrice {
  level: 'region' | 'district' | 'national'
  area: string
  product: OdrProduct
  stage: OdrStage
  price: number
  change_pct: number | null
}

/** Colonnes du tableau 1 et des tableaux par district, dans l'ordre du bulletin. */
export const COLUMNS: [OdrProduct, OdrStage][] = [
  ['paddy', 'producteur'],
  ['riz_local', 'producteur'], ['riz_local', 'grossiste'], ['riz_local', 'detaillant'],
  ['riz_importe', 'grossiste'], ['riz_importe', 'detaillant'],
]

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
}
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'")

/** « BULLETIN MENSUEL ODR N°40 SEPTEMBRE 2024 » → { no: 40, period: '2024-09-01' }. */
export function bulletinPeriod(text: string): { no: number | null; period: string } | null {
  const t = fold(text)
  const m = t.match(/bulletin\s+mensuel\s+odr\s+(?:n\s*[°o.]\s*(\d+)\s+)?([a-z]+)\s+(20\d\d)/)
  if (!m || !MONTHS[m[2]]) return null
  return { no: m[1] ? Number(m[1]) : null, period: `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-01` }
}

/** Même chose depuis le nom du fichier « Bulletin_N°40_ODR_Septembre_2024.pdf ». */
export function periodFromUrl(url: string) {
  const t = fold(decodeURIComponent(url))
  const m = t.match(/n\s*[°o]?\s*(\d+)_odr_([a-z]+)_(20\d\d)/)
  if (!m || !MONTHS[m[2]]) return null
  return { no: Number(m[1]), period: `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-01` }
}

const pct = (s: string) => (s === '-' ? null : Number(s.replace(',', '.')))
const isValue = (t: string) => t === 'NA' || t === 'ND' || t === '-' || /^\d+$/.test(t)
const isNum = (t: string) => /^-?\d+(,\d+)?$/.test(t)

/**
 * Découpe une ligne de tableau : nom de la zone puis 12 cellules.
 * Les milliers peuvent être séparés par un espace (« 2 648 ») ou non (« 2648 ») selon les bulletins.
 */
export function splitRow(line: string): { name: string; cells: string[] } | null {
  const parts = line.trim().split(/\s+/)
  const first = parts.findIndex((t) => isValue(t) || isNum(t))
  if (first < 1) return null
  const name = parts.slice(0, first).join(' ')
  if (!/^[A-Za-zÀ-ÿ'’ -]+$/.test(name)) return null
  const raw = parts.slice(first)
  const cells: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]
    // « 2 » + « 648 » → « 2648 » (groupe de milliers) ; un écart « 0 » n'est jamais suivi d'un groupe de 3 chiffres
    if (/^[1-9]\d{0,2}$/.test(t) && /^\d{3}$/.test(raw[i + 1] ?? '')) {
      cells.push(t + raw[i + 1]); i++
    } else cells.push(t)
  }
  if (cells.length !== 12 || !cells.every((c) => isValue(c) || isNum(c))) return null
  return { name, cells }
}

/** Tableau par région (prix + écart %) ou par district (mois courant + mois précédent) ? */
export function classify(cells: string[]): 'region' | 'district' | 'ambiguous' {
  const hasNA = cells.some((c) => c === 'NA' || c === 'ND')
  const odd = cells.filter((_, i) => i % 2 === 1).filter((c) => c !== '-')
  const pctLike = odd.every((c) => c.includes(',') || Math.abs(Number(c)) < 100)
  const priceLike = odd.every((c) => /^\d+$/.test(c) && Number(c) >= 200)
  if (hasNA || (odd.length && pctLike)) return 'region'
  if (odd.length && priceLike) return 'district'
  return 'ambiguous'
}

function regionRow(name: string, cells: string[]): OdrPrice[] {
  const level = fold(name) === 'ensemble' ? 'national' : 'region'
  const out: OdrPrice[] = []
  COLUMNS.forEach(([product, stage], i) => {
    const v = cells[i * 2]
    if (!/^\d+$/.test(v)) return
    out.push({ level, area: level === 'national' ? 'Madagascar' : name, product, stage, price: Number(v), change_pct: pct(cells[i * 2 + 1]) })
  })
  return out
}

function districtRow(name: string, cells: string[]): OdrPrice[] {
  const out: OdrPrice[] = []
  COLUMNS.forEach(([product, stage], i) => {
    const cur = cells[i * 2], prev = cells[i * 2 + 1]
    if (!/^\d+$/.test(cur)) return
    const price = Number(cur)
    const p = /^\d+$/.test(prev) ? Number(prev) : null
    out.push({ level: 'district', area: name, product, stage, price, change_pct: p ? Math.round(((price - p) / p) * 1000) / 10 : null })
  })
  return out
}

const SKIP = /^(region|districts?|ensemble des|source|tableau|nd|na)$/

/** Tableau 1 (par région), quel que soit le format des milliers. */
export function parseRegionTable(text: string): OdrPrice[] {
  return text.split('\n').flatMap((line) => {
    const r = splitRow(line)
    return r && !SKIP.test(fold(r.name)) && classify(r.cells) === 'region' ? regionRow(r.name, r.cells) : []
  })
}

/** Tableaux par district (seul le mois courant est retenu ; le précédent est dans le bulletin précédent). */
export function parseDistrictTables(text: string): OdrPrice[] {
  return text.split('\n').flatMap((line) => {
    const r = splitRow(line)
    return r && !SKIP.test(fold(r.name)) && classify(r.cells) === 'district' ? districtRow(r.name, r.cells) : []
  })
}

/** Garde-fous : prix du riz entre 200 et 20 000 Ar/kg ; le paddy ne dépasse pas le riz blanc de la même zone. */
export function sanity(rows: OdrPrice[]) {
  return rows.filter((r) => r.price >= 200 && r.price <= 20000)
}

export function parseBulletin(pages: string[]) {
  const all = pages.join('\n')
  const head = bulletinPeriod(all)
  // Section courante d'après les en-têtes, pour les lignes ambiguës (aucun écart ni mois précédent renseigné)
  let mode: 'region' | 'district' | null = null
  const rows: OdrPrice[] = []
  for (const line of all.split('\n')) {
    const t = fold(line.trim())
    if (/^region\b/.test(t)) mode = 'region'
    else if (/^districts?\b/.test(t)) mode = 'district'
    else if (/^tableau 2\b/.test(t)) mode = null
    const r = splitRow(line)
    if (!r || SKIP.test(fold(r.name))) continue
    const kind = classify(r.cells)
    const k = kind === 'ambiguous' ? mode : kind
    if (k === 'region') rows.push(...regionRow(r.name, r.cells))
    else if (k === 'district') rows.push(...districtRow(r.name, r.cells))
  }
  return { head, rows: sanity(rows) }
}

export const areaKey = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
