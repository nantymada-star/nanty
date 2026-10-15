import { db, type Estimate } from './db'
import { matchScore } from './commodities'

/**
 * Import du fichier CSV « Monthly food price estimates by product and market » (Banque mondiale,
 * Real-Time Food Prices, Madagascar : MDG_RTFP_mkt_*.csv, ou le fichier mondial filtré sur MDG).
 * Format large : une ligne par marché et par mois ; pour chaque produit X, colonnes o_X, h_X, l_X, c_X,
 * inflation_X, trust_X. On conserve c_X (estimation de clôture), l_X / h_X (bornes) et trust_X.
 * Ce sont des ESTIMATIONS calculées par la Banque mondiale, jamais affichées comme des relevés réels.
 */

/** Analyse CSV avec guillemets (RFC 4180), ligne par ligne. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const EXCLUDE = new Set(['food_price_index'])

export interface RtfpHeader {
  idx: Record<string, number>
  items: { item: string; c: number; l: number; h: number; trust: number }[]
  dateCol: number
}

export function readHeader(cols: string[]): RtfpHeader {
  const lower = cols.map((c) => c.trim().toLowerCase())
  const idx: Record<string, number> = {}
  lower.forEach((c, i) => (idx[c] = i))
  const dateCol = ['dates', 'date', 'price_date'].map((k) => idx[k]).find((i) => i != null) ?? -1
  const items = lower
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.startsWith('c_') && !EXCLUDE.has(c.slice(2)))
    .map(({ c, i }) => {
      const item = c.slice(2)
      return { item, c: i, l: idx['l_' + item] ?? -1, h: idx['h_' + item] ?? -1, trust: idx['trust_' + item] ?? -1 }
    })
  return { idx, items, dateCol }
}

const num = (v: string | undefined) => {
  if (v == null || v.trim() === '' || /^na$/i.test(v.trim())) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Transforme une ligne en estimations (une par produit renseigné). */
export function rowToEstimates(cells: string[], h: RtfpHeader, cutoff: string, importedAt: string, file: string): Estimate[] {
  const get = (k: string) => (h.idx[k] != null ? cells[h.idx[k]] : undefined)
  const iso3 = (get('iso3') ?? '').trim().toUpperCase()
  if (iso3 && iso3 !== 'MDG') return []
  const country = (get('country') ?? '').trim().toLowerCase()
  if (!iso3 && country && country !== 'madagascar') return []
  let date = h.dateCol >= 0 ? (cells[h.dateCol] ?? '').trim().slice(0, 10) : ''
  if (!date && get('year') && get('month')) date = `${get('year')}-${String(get('month')).padStart(2, '0')}-01`
  if (!/^\d{4}-\d{2}/.test(date)) return []
  date = date.slice(0, 7) + '-01'
  if (date < cutoff) return []
  const market = (get('mkt_name') ?? get('market') ?? '').trim()
  if (!market) return []
  const lat = num(get('lat'))
  const lon = num(get('lon'))
  const out: Estimate[] = []
  for (const it of h.items) {
    const price = num(cells[it.c])
    if (price == null || price <= 0) continue
    out.push({
      id: `wb|${market}|${it.item}|${date.slice(0, 7)}`,
      source: 'wb-rtfp',
      market,
      admin1: (get('adm1_name') ?? '').trim(),
      admin2: (get('adm2_name') ?? '').trim(),
      lat, lon,
      item: it.item,
      date,
      price,
      low: it.l >= 0 ? num(cells[it.l]) : null,
      high: it.h >= 0 ? num(cells[it.h]) : null,
      trust: it.trust >= 0 ? num(cells[it.trust]) : null,
      currency: (get('currency') ?? 'MGA').trim() || 'MGA',
      importedAt,
      file,
    })
  }
  return out
}

/** Importe un fichier (texte complet) par lots, sans bloquer l'interface. */
export async function importRtfp(text: string, file: string, years: number, onProgress?: (lines: number, saved: number) => void) {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) throw new Error('Fichier vide')
  const header = readHeader(parseCsvLine(lines[0]))
  if (header.dateCol < 0 && header.idx.year == null) throw new Error('Colonne de date introuvable (DATES / date / year+month)')
  if (!header.items.length) throw new Error('Aucune colonne c_<produit> : ce n’est pas un fichier RTFP « by product and market »')
  const cutoff = `${new Date().getUTCFullYear() - years}-01-01`
  const importedAt = new Date().toISOString()
  let saved = 0
  let batch: Estimate[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue
    batch.push(...rowToEstimates(parseCsvLine(lines[i]), header, cutoff, importedAt, file))
    if (batch.length >= 5000 || i === lines.length - 1) {
      await db.estimates.bulkPut(batch)
      saved += batch.length
      batch = []
      onProgress?.(i, saved)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  if (batch.length) { await db.estimates.bulkPut(batch); saved += batch.length }
  return { saved, items: header.items.map((x) => x.item), lines: lines.length - 1 }
}

export function itemLabel(item: string) {
  return item.replace(/_/g, ' ')
}

/** Produits RTFP correspondant à un produit WFP (ex. « rice » ↔ « Rice (local) »). */
export function itemsMatching(commodityName: string, items: string[]) {
  return items.filter((it) => matchScore(itemLabel(it), commodityName) >= 50 || matchScore(commodityName.split(' (')[0], itemLabel(it)) >= 60)
}

/** Dernière estimation par marché pour un produit RTFP. */
export function latestByMarket(all: Estimate[], item: string) {
  const by = new Map<string, Estimate>()
  for (const e of all) {
    if (e.item !== item) continue
    const cur = by.get(e.market)
    if (!cur || e.date > cur.date) by.set(e.market, e)
  }
  return [...by.values()].sort((a, b) => a.price - b.price)
}
