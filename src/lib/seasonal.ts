import { db, type ShopPrice } from './db'
import { median, seasonalIndex, type Series } from './stats'
import { commodityLabel, stripAccents, type Lang } from './commodities'
import { fmtAr, monthName } from './format'
import { getSettings } from './settings'

export interface SeasonProfile {
  months: { m: number; v: number | null; lo: number | null; hi: number | null; markets: number }[]
  hi: number | null // mois le plus cher (0-11)
  lo: number | null // mois le moins cher
  years: number
  markets: number
}

/**
 * Profil saisonnier calculé sur les relevés réels (détail, une unité) :
 * moyenne des indices par marché, avec la plage min–max entre marchés.
 * Filtre optionnel par région (admin1).
 */
export function seasonProfile(seriesList: Series[], code: string, unit: string, region = ''): SeasonProfile {
  const ss = seriesList.filter(
    (s) => s.latest.commodityCode === code && s.latest.priceType === 'Retail' && s.latest.unit === unit && (!region || s.latest.admin1 === region),
  )
  const per = ss.map((s) => seasonalIndex(s.points))
  const months = Array.from({ length: 12 }, (_, m) => {
    const vals = per.map((p) => p[m].index).filter((v): v is number => v != null)
    const years = Math.max(0, ...per.map((p) => p[m].n))
    return {
      m,
      v: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 100 : null,
      lo: vals.length ? Math.min(...vals) * 100 : null,
      hi: vals.length ? Math.max(...vals) * 100 : null,
      markets: vals.length,
      years,
    }
  })
  const ok = months.filter((x) => x.v != null)
  if (ok.length < 10) return { months, hi: null, lo: null, years: 0, markets: 0 }
  const hi = ok.reduce((a, b) => (b.v! > a.v! ? b : a))
  const lo = ok.reduce((a, b) => (b.v! < a.v! ? b : a))
  return { months, hi: hi.m, lo: lo.m, years: Math.max(...ok.map((x) => x.years)), markets: Math.max(...ok.map((x) => x.markets)) }
}

/**
 * Fourchette de prix ESTIMÉE pour un mois cible : prix médian actuel ramené au mois cible
 * par le rapport des indices saisonniers, bornée par la dispersion entre marchés.
 * Ce n'est pas une prévision garantie ; null si les données sont insuffisantes.
 */
export function estimateRange(seriesList: Series[], profile: SeasonProfile, code: string, unit: string, target: number, region = '') {
  const ss = seriesList.filter(
    (s) => s.latest.commodityCode === code && s.latest.priceType === 'Retail' && s.latest.unit === unit && (!region || s.latest.admin1 === region),
  )
  const base = median(ss.map((s) => s.latest.price))
  if (base == null || !ss.length) return null
  const baseMonth = Number(ss.map((s) => s.latest.periodStart).sort().reverse()[0].slice(5, 7)) - 1
  const cur = profile.months[baseMonth]
  const tg = profile.months[target]
  if (cur.v == null || tg.v == null || tg.lo == null || tg.hi == null) return null
  return { low: (base * tg.lo) / cur.v, high: (base * tg.hi) / cur.v, central: (base * tg.v) / cur.v, base, baseMonth }
}

/** Mois classés « abondance » (indice ≤ 97) ou « pénurie » (≥ 103) à partir des prix observés. */
export function monthTone(v: number | null): 'abundance' | 'shortage' | 'normal' | 'unknown' {
  if (v == null) return 'unknown'
  if (v <= 97) return 'abundance'
  if (v >= 103) return 'shortage'
  return 'normal'
}

async function notify(title: string, body: string, kind: string, link?: string, observedPeriod?: string) {
  await db.notifications.add({ createdAt: new Date().toISOString(), title, body, kind, link, observedPeriod, read: false })
  try {
    if (getSettings().notifConsent && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.svg' })
  } catch {
    /* indisponible */
  }
}

/**
 * Alertes saisonnières : prévient une fois par mois pendant le mois qui précède le mois
 * historiquement le plus cher, et pendant ce mois.
 */
export async function evaluateSeasonAlerts(seriesList: Series[], lang: Lang, now = new Date()) {
  const alerts = (await db.alerts.toArray()).filter((a) => a.active && a.kind === 'season')
  const ym = now.toISOString().slice(0, 7)
  const m = now.getUTCMonth()
  let fired = 0
  for (const a of alerts) {
    if (a.lastFiredPeriod === ym) continue
    const prof = seasonProfile(seriesList, a.commodityCode, a.unit)
    if (prof.hi == null) continue
    const before = (prof.hi + 11) % 12
    if (m !== before && m !== prof.hi) continue
    const s = seriesList.find((x) => x.latest.commodityCode === a.commodityCode)
    const name = s ? commodityLabel(s.latest.commodityName, lang) : a.commodityCode
    const range = estimateRange(seriesList, prof, a.commodityCode, a.unit, prof.hi)
    const rangeTxt = range ? ` ${lang === 'mg' ? 'Tombana' : 'Estimation'} : ${fmtAr(range.low)} – ${fmtAr(range.high)} / ${a.unit}.` : ''
    await notify(
      lang === 'mg' ? 'Fotoana mety hivarotana' : 'Opportunité saisonnière',
      lang === 'mg'
        ? `${name} : matetika ambony indrindra ny vidiny amin'ny ${monthName(prof.hi, lang)} (${prof.years} taona voadinika).${rangeTxt} Tsy antoka.`
        : `${name} : prix généralement au plus haut en ${monthName(prof.hi, lang)} (${prof.years} an(s) analysé(s)).${rangeTxt} Sans garantie.`,
      'season',
      `/vanim-potoana?c=${encodeURIComponent(a.commodityCode)}`,
    )
    await db.alerts.update(a.id!, { lastFiredPeriod: ym })
    fired++
  }
  return fired
}

/** Alertes de disponibilité : un commerce déclare un produit en stock. */
export async function evaluateStockAlerts(p: ShopPrice, lang: Lang) {
  if (p.stock !== 'declared') return 0
  const alerts = (await db.alerts.toArray()).filter((a) => a.active && a.kind === 'stock' && a.product)
  const name = stripAccents(p.product)
  let fired = 0
  for (const a of alerts) {
    if (!name.includes(stripAccents(a.product!))) continue
    await notify(
      lang === 'mg' ? 'Misy indray ny entana' : 'Produit disponible',
      `${p.product} — ${p.shopName} : ${fmtAr(p.price)} / ${p.unit} (${lang === 'mg' ? 'voalaza' : 'déclaré'})`,
      'stock',
      `/fivarotana/${p.shopId}`,
    )
    fired++
  }
  return fired
}
