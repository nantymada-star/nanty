import type { Lang } from './commodities'

export const TZ = 'Indian/Antananarivo'

const MONTHS: Record<Lang, string[]> = {
  mg: ['Janoary', 'Febroary', 'Martsa', 'Aprily', 'Mey', 'Jona', 'Jolay', 'Aogositra', 'Septambra', 'Oktobra', 'Novambra', 'Desambra'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
}
export const MONTHS_SHORT: Record<Lang, string[]> = {
  mg: ['Jan', 'Feb', 'Mar', 'Apr', 'Mey', 'Jon', 'Jol', 'Aog', 'Sep', 'Okt', 'Nov', 'Des'],
  fr: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
}

export function monthName(m: number, lang: Lang) {
  return MONTHS[lang][m]
}

/** 1250 -> "1 250" (séparateur d'espace insécable fin, usage malgache/français). */
export function fmtNum(n: number, digits = 0) {
  if (!Number.isFinite(n)) return '—'
  const fixed = Math.abs(n).toFixed(digits)
  const [int, dec] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '−' : '') + grouped + (dec ? ',' + dec : '')
}

export function fmtAr(n: number, digits = 0) {
  return `${fmtNum(n, digits)} Ar`
}

export function fmtPct(n: number | null, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n > 0 ? '+' : ''}${fmtNum(n, digits)} %`
}

function parts(d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return { y: g('year'), m: g('month') - 1, d: g('day'), h: g('hour') % 24, min: g('minute') }
}

/** Date seule (ISO "YYYY-MM-DD" de la source, sans conversion de fuseau). */
export function fmtDay(iso: string, lang: Lang) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[lang][m - 1]} ${y}`
}

/** Mois de référence d'un relevé mensuel. */
export function fmtMonth(iso: string, lang: Lang) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  return `${MONTHS[lang][m - 1]} ${y}`
}

/** Période de référence telle que publiée par la source. */
export function fmtPeriod(start: string, end: string, lang: Lang) {
  if (start.slice(0, 7) === end.slice(0, 7) && start.slice(8, 10) === '01') return fmtMonth(start, lang)
  if (start === end) return fmtDay(start, lang)
  return `${fmtDay(start, lang)} – ${fmtDay(end, lang)}`
}

/** Horodatage UTC affiché à l'heure de Madagascar. */
export function fmtDateTime(isoUtc: string, lang: Lang) {
  const p = parts(new Date(isoUtc))
  const hh = String(p.h).padStart(2, '0')
  const mm = String(p.min).padStart(2, '0')
  return `${p.d} ${MONTHS_SHORT[lang][p.m]} ${p.y}, ${hh}:${mm}`
}

export function fmtAgo(isoUtc: string, lang: Lang, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(isoUtc)) / 1000))
  const L = lang === 'mg'
  if (s < 60) return L ? 'vao izao' : "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return L ? `${m} min lasa izay` : `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return L ? `${h} ora lasa izay` : `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d < 60) return L ? `${d} andro lasa izay` : `il y a ${d} j`
  const mo = Math.round(d / 30)
  return L ? `${mo} volana lasa izay` : `il y a ${mo} mois`
}

export function daysBetween(isoA: string, isoB: string) {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000)
}
