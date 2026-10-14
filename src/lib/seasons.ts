/**
 * Calendrier agricole documenté — synthèse simplifiée, à l'échelle nationale, de :
 *  - FEWS NET, "Madagascar – Seasonal calendar for a typical year"
 *  - FAO GIEWS, "Country brief – Madagascar" (crop calendar)
 * Les dates varient fortement selon la région et l'année. Ce calendrier n'est PAS une observation
 * ni une prévision : il est affiché séparément des prix réels (indice saisonnier calculé).
 * Mois : 0 = janvier.
 */
export interface CropCalendar {
  key: string // nom WFP correspondant (pour relier aux prix)
  mg: string
  fr: string
  plant: number[]
  harvest: number[]
  noteMg: string
  noteFr: string
}

export const CALENDAR_SOURCES = [
  { label: 'FEWS NET – Madagascar', url: 'https://fews.net/southern-africa/madagascar' },
  { label: 'FAO GIEWS – Madagascar', url: 'https://www.fao.org/giews/countrybrief/country.jsp?code=MDG' },
]

export const LEAN_SEASON = [10, 11, 0, 1, 2] // période de soudure : nov.–mars
export const CYCLONE_SEASON = [11, 0, 1, 2] // déc.–mars

export const CROPS: CropCalendar[] = [
  {
    key: 'Rice (local)', mg: 'Vary (vakiambiaty)', fr: 'Riz (saison principale)',
    plant: [9, 10, 11, 0], harvest: [3, 4, 5],
    noteMg: "Fijinjana lehibe Aprily–Jona: matetika ambany indrindra ny vidiny aorian'izay.",
    noteFr: 'Grande récolte avril–juin : les prix sont souvent au plus bas ensuite.',
  },
  {
    key: 'Rice (local)', mg: 'Vary aloha (jeby)', fr: 'Riz de contre-saison',
    plant: [6, 7, 8], harvest: [11, 0, 1],
    noteMg: 'Mamaivay ny tsy fahampiana amin\'ny faritra sasany.', noteFr: 'Atténue la soudure dans certaines régions.',
  },
  {
    key: 'Maize', mg: 'Katsaka', fr: 'Maïs',
    plant: [9, 10, 11], harvest: [1, 2, 3, 4],
    noteMg: 'Atsimo: miankina betsaka amin\'ny orana.', noteFr: 'Sud : très dépendant des pluies.',
  },
  {
    key: 'Cassava (fresh)', mg: 'Mangahazo', fr: 'Manioc',
    plant: [9, 10, 11], harvest: [4, 5, 6, 7, 8, 9],
    noteMg: 'Azo jinjaina mandavan-taona; be indrindra Mey–Oktobra.', noteFr: "Récoltable toute l'année ; pic mai–octobre.",
  },
  {
    key: 'Beans', mg: 'Tsaramaso', fr: 'Haricots',
    plant: [9, 10, 2, 3], harvest: [0, 1, 5, 6],
    noteMg: 'Vanim-potoana roa isan-taona any amin\'ny faritra afovoany.', noteFr: 'Deux saisons par an sur les Hautes Terres.',
  },
  {
    key: 'Sweet potatoes', mg: 'Vomanga', fr: 'Patate douce',
    plant: [10, 11, 0], harvest: [2, 3, 4, 5],
    noteMg: 'Sakafo manampy mandritra ny tsy fahampiana.', noteFr: 'Aliment de complément pendant la soudure.',
  },
  {
    key: 'Groundnuts', mg: 'Voanjo', fr: 'Arachides',
    plant: [10, 11], harvest: [2, 3, 4],
    noteMg: '', noteFr: '',
  },
]

export function inMonths(list: number[], m: number) {
  return list.includes(m)
}
