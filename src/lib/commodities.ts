/**
 * Noms locaux (malgache / français) et synonymes des produits WFP.
 * Clé = nom WFP en minuscules. Le nom d'origine reste affiché si absent.
 */
const NAMES: Record<string, { mg: string; fr: string; syn?: string[] }> = {
  rice: { mg: 'Vary', fr: 'Riz', syn: ['riz', 'vary'] },
  'rice (local)': { mg: 'Vary gasy', fr: 'Riz local', syn: ['riz', 'vary', 'vary gasy', 'vary malagasy'] },
  'rice (imported)': { mg: 'Vary avy any ivelany', fr: 'Riz importé', syn: ['riz', 'vary', 'vary vahiny', 'vary importé'] },
  'rice (paddy)': { mg: 'Akotry', fr: 'Paddy', syn: ['akotry', 'paddy', 'riz paddy', 'vary'] },
  'rice (local, paddy)': { mg: 'Akotry', fr: 'Paddy', syn: ['akotry', 'paddy', 'vary'] },
  'rice (red)': { mg: 'Vary mena', fr: 'Riz rouge', syn: ['riz', 'vary'] },
  maize: { mg: 'Katsaka', fr: 'Maïs', syn: ['katsaka', 'mais', 'maïs', 'tsako'] },
  'maize (white)': { mg: 'Katsaka fotsy', fr: 'Maïs blanc', syn: ['katsaka', 'mais', 'tsako'] },
  'maize (yellow)': { mg: 'Katsaka mavo', fr: 'Maïs jaune', syn: ['katsaka', 'mais', 'tsako'] },
  'maize flour': { mg: 'Koba katsaka', fr: 'Farine de maïs', syn: ['katsaka', 'koba'] },
  cassava: { mg: 'Mangahazo', fr: 'Manioc', syn: ['mangahazo', 'manioc', 'balahazo'] },
  'cassava (fresh)': { mg: 'Mangahazo lena', fr: 'Manioc frais', syn: ['mangahazo', 'manioc', 'balahazo'] },
  'cassava (dry)': { mg: 'Mangahazo maina', fr: 'Manioc sec', syn: ['mangahazo', 'manioc', 'balahazo', 'tsindrinasa'] },
  'cassava flour': { mg: 'Koba mangahazo', fr: 'Farine de manioc', syn: ['mangahazo', 'manioc'] },
  beans: { mg: 'Tsaramaso', fr: 'Haricots', syn: ['tsaramaso', 'haricot', 'haricots'] },
  'beans (red)': { mg: 'Tsaramaso mena', fr: 'Haricots rouges', syn: ['tsaramaso', 'haricot'] },
  'beans (white)': { mg: 'Tsaramaso fotsy', fr: 'Haricots blancs', syn: ['tsaramaso', 'haricot'] },
  'beans (dry)': { mg: 'Tsaramaso maina', fr: 'Haricots secs', syn: ['tsaramaso', 'haricot'] },
  'sweet potatoes': { mg: 'Vomanga', fr: 'Patate douce', syn: ['vomanga', 'patate'] },
  potatoes: { mg: 'Ovy', fr: 'Pommes de terre', syn: ['ovy', 'pomme de terre', 'ovimbazaha'] },
  'oil (vegetable)': { mg: 'Menaka', fr: 'Huile végétale', syn: ['menaka', 'huile', 'diloilo'] },
  sugar: { mg: 'Siramamy', fr: 'Sucre', syn: ['siramamy', 'sucre'] },
  salt: { mg: 'Sira', fr: 'Sel', syn: ['sira', 'sel'] },
  'wheat flour': { mg: 'Lafarinina', fr: 'Farine de blé', syn: ['lafarinina', 'farine', 'koba'] },
  groundnuts: { mg: 'Voanjo', fr: 'Arachides', syn: ['voanjo', 'arachide', 'cacahuète'] },
  'groundnuts (shelled)': { mg: 'Voanjo voahendy', fr: 'Arachides décortiquées', syn: ['voanjo', 'arachide'] },
  'bambara groundnuts': { mg: 'Voanjobory', fr: 'Pois bambara', syn: ['voanjobory'] },
  cowpeas: { mg: 'Voanemba', fr: 'Niébé', syn: ['voanemba', 'niébé', 'niebe'] },
  peas: { mg: 'Pitipoa', fr: 'Petits pois', syn: ['pitipoa', 'pois'] },
  lentils: { mg: 'Lantilia', fr: 'Lentilles', syn: ['lantilia', 'lentille'] },
  'fuel (diesel)': { mg: 'Gazoaly', fr: 'Gazole', syn: ['gazoaly', 'gasoil', 'gazole', 'diesel', 'solika'] },
  'fuel (petrol-gasoline)': { mg: 'Lasantsy', fr: 'Essence', syn: ['lasantsy', 'essence', 'solika'] },
  'fuel (kerosene)': { mg: 'Solitany', fr: 'Pétrole lampant', syn: ['solitany', 'pétrole', 'petrole', 'kerosene'] },
  'meat (beef)': { mg: "Hen'omby", fr: 'Viande de bœuf', syn: ['henomby', "hen'omby", 'boeuf', 'viande', 'hena'] },
  'meat (pork)': { mg: 'Henan-kisoa', fr: 'Viande de porc', syn: ['kisoa', 'porc', 'hena'] },
  'meat (chicken)': { mg: 'Akoho', fr: 'Poulet', syn: ['akoho', 'poulet'] },
  'meat (goat)': { mg: "Hen'osy", fr: 'Viande de chèvre', syn: ['osy', 'chèvre', 'hena'] },
  eggs: { mg: 'Atody', fr: 'Œufs', syn: ['atody', 'oeuf', 'œuf'] },
  fish: { mg: 'Trondro', fr: 'Poisson', syn: ['trondro', 'poisson', 'hazandrano'] },
  'fish (dry)': { mg: 'Trondro maina', fr: 'Poisson séché', syn: ['trondro', 'poisson'] },
  'fish (fresh)': { mg: 'Trondro vaovao', fr: 'Poisson frais', syn: ['trondro', 'poisson'] },
  bread: { mg: 'Mofo', fr: 'Pain', syn: ['mofo', 'pain'] },
  milk: { mg: 'Ronono', fr: 'Lait', syn: ['ronono', 'lait'] },
  onions: { mg: 'Tongolo', fr: 'Oignons', syn: ['tongolo', 'oignon'] },
  tomatoes: { mg: 'Voatabia', fr: 'Tomates', syn: ['voatabia', 'tomate'] },
  bananas: { mg: 'Akondro', fr: 'Bananes', syn: ['akondro', 'banane'] },
  soap: { mg: 'Savony', fr: 'Savon', syn: ['savony', 'savon'] },
  charcoal: { mg: 'Arina', fr: 'Charbon de bois', syn: ['arina', 'charbon'] },
  'wage (non-qualified labour)': { mg: "Karaman'ny mpiasa tsotra", fr: 'Salaire journalier (non qualifié)', syn: ['karama', 'salaire'] },
  'wage (non-qualified labour, non-agricultural)': { mg: "Karaman'ny mpiasa tsotra", fr: 'Salaire journalier non agricole', syn: ['karama', 'salaire'] },
  'wage (non-qualified labour, agricultural)': { mg: "Karaman'ny mpiasan'ny tany", fr: 'Salaire journalier agricole', syn: ['karama', 'salaire'] },
  'exchange rate': { mg: 'Sandam-bola', fr: 'Taux de change', syn: ['dollar', 'euro'] },
}

const CATEGORIES: Record<string, { mg: string; fr: string }> = {
  'cereals and tubers': { mg: 'Voamaina sy fakany', fr: 'Céréales et tubercules' },
  'meat, fish and eggs': { mg: 'Hena, trondro, atody', fr: 'Viande, poisson, œufs' },
  'milk and dairy': { mg: 'Ronono', fr: 'Lait et produits laitiers' },
  'miscellaneous food': { mg: 'Sakafo hafa', fr: 'Autres aliments' },
  'non-food': { mg: 'Tsy sakafo', fr: 'Non alimentaire' },
  'oil and fats': { mg: 'Menaka', fr: 'Huiles et graisses' },
  'pulses and nuts': { mg: 'Tsaramaso sy voanjo', fr: 'Légumineuses et noix' },
  'vegetables and fruits': { mg: 'Legioma sy voankazo', fr: 'Légumes et fruits' },
}

export type Lang = 'mg' | 'fr'

export function commodityLabel(name: string, lang: Lang) {
  const e = NAMES[name.toLowerCase().trim()]
  if (e) return e[lang]
  // ex. "Rice (local) - Retail" ou variantes : on tente la racine
  const root = name.toLowerCase().split(' - ')[0].trim()
  return NAMES[root]?.[lang] ?? name
}

export function categoryLabel(cat: string, lang: Lang) {
  return CATEGORIES[cat]?.[lang] ?? cat
}

export function unitLabel(u: string, lang: Lang) {
  const low = u.toLowerCase()
  if (low === 'kg') return 'kg'
  if (low === 'l') return lang === 'mg' ? 'litatra' : 'litre'
  if (low === 'unit' || low === 'pcs' || low === 'piece') return lang === 'mg' ? 'isa' : 'pièce'
  if (low === 'day') return lang === 'mg' ? 'andro' : 'jour'
  if (low.includes('kapoaka')) return 'kapoaka'
  return u
}

export function priceTypeLabel(t: string, lang: Lang) {
  const m: Record<string, [string, string]> = {
    Retail: ['Antsinjarany', 'Détail'],
    Wholesale: ['Ambongadiny', 'Gros'],
    Producer: ['Mpamokatra', 'Producteur'],
    'Farm Gate': ['Eny an-tsaha', 'Bord champ'],
  }
  const v = m[t]
  return v ? (lang === 'mg' ? v[0] : v[1]) : t
}

export function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Score de correspondance d'une requête avec un nom WFP (noms mg/fr/en + synonymes). */
export function matchScore(query: string, wfpName: string): number {
  const q = stripAccents(query).replace(/['’]/g, '').trim()
  if (!q) return 1
  const e = NAMES[wfpName.toLowerCase().trim()]
  const hay = [wfpName, e?.mg, e?.fr, ...(e?.syn ?? [])].filter(Boolean).map((x) => stripAccents(x!).replace(/['’]/g, ''))
  let best = 0
  const words = q.split(/\s+/).filter((w) => w.length > 1)
  for (const h of hay) {
    if (h === q) best = Math.max(best, 100)
    else if (h.startsWith(q)) best = Math.max(best, 80)
    else if (h.includes(q)) best = Math.max(best, 60)
    else if (words.length && words.every((w) => h.includes(w))) best = Math.max(best, 50)
    else if (words.some((w) => w.length > 2 && h.includes(w))) best = Math.max(best, 30)
  }
  return best
}

/**
 * Types de commerces OpenStreetMap susceptibles de vendre un produit.
 * Il s'agit d'une probabilité selon le type de commerce, jamais d'un stock confirmé.
 */
export function osmKindsForQuery(query: string): string[] {
  const q = stripAccents(query)
  const food = ['shop=supermarket', 'shop=convenience', 'shop=general', 'shop=grocery', 'shop=wholesale', 'amenity=marketplace']
  if (/(ciment|simenitra|sable|fasika|vy |fer|brique|biriky|fanorenana|construction|quincaillerie|tole|tafo)/.test(q))
    return ['shop=hardware', 'shop=doityourself', 'shop=trade', 'shop=building_materials']
  if (/(engrais|zezika|semence|voa |agricole|fambolena|pesticide)/.test(q)) return ['shop=agrarian', 'shop=farm', 'shop=garden_centre']
  if (/(essence|lasantsy|gazoaly|gasoil|gazole|diesel|carburant|solika)/.test(q)) return ['amenity=fuel']
  if (/(akoho|poulet|hena|viande|boeuf|kisoa)/.test(q)) return ['shop=butcher', ...food]
  if (/(mofo|pain|boulangerie)/.test(q)) return ['shop=bakery', ...food]
  if (/(fanafody|pharmacie|medicament)/.test(q)) return ['amenity=pharmacy', 'shop=chemist']
  if (/(trondro|poisson)/.test(q)) return ['shop=seafood', ...food]
  return food
}

export const OSM_KIND_LABEL: Record<string, [string, string]> = {
  supermarket: ['Supermarché', 'Supermarché'],
  convenience: ['Fivarotana kely', 'Épicerie'],
  general: ['Fivarotana kely', 'Magasin général'],
  grocery: ['Epicerie', 'Épicerie'],
  wholesale: ['Ambongadiny', 'Grossiste'],
  marketplace: ['Tsena', 'Marché'],
  hardware: ['Fivarotana fitaovana', 'Quincaillerie'],
  doityourself: ['Fitaovana fanorenana', 'Bricolage'],
  trade: ['Mpamatsy', 'Fournisseur pro'],
  building_materials: ['Akora fanorenana', 'Matériaux'],
  agrarian: ['Fitaovam-pambolena', 'Fournitures agricoles'],
  farm: ['Toeram-pambolena', 'Ferme'],
  garden_centre: ['Zaridaina', 'Jardinerie'],
  fuel: ['Toby solika', 'Station-service'],
  butcher: ['Mpivaro-kena', 'Boucherie'],
  bakery: ['Mpanao mofo', 'Boulangerie'],
  pharmacy: ['Fivarotam-panafody', 'Pharmacie'],
  chemist: ['Fivarotana', 'Droguerie'],
  seafood: ['Mpivarotra trondro', 'Poissonnerie'],
}
