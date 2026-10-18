// Normalisation des produits de boutiques en ligne : pur TypeScript, partagé par la fonction serveur et les tests (vitest).

export interface RawItem {
  ref?: string | number | null
  name?: string | null
  price?: string | number | null
  currency?: string | null
  url?: string | null
  image?: string | null
  category?: string | null
  inStock?: boolean | null
  categories?: string[]
}

export interface OnlineProduct {
  id: string
  shop_id: string
  ref: string
  name: string
  url: string | null
  image_url: string | null
  category: string
  product_group: string | null
  size_qty: number | null
  size_unit: 'kg' | 'L' | 'pièce' | null
  price: number
  unit_price: number | null
  currency: string
  in_stock: boolean | null
  search_text: string
  barcode: string | null
  match_key: string
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç' }
export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** « 12 500 Ar », « 12.500 MGA », 12500 → 12500. Les Ariary n'ont pas de décimales affichées en pratique. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v !== 'string') return null
  const s = v.replace(/[\s\u00a0\u202f]/g, '').replace(/(Ar|MGA|Ariary)$/i, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  // Séparateurs de milliers « . » ou « , » suivis d'exactement 3 chiffres ; sinon décimale
  const n = /^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Contenance lue dans le nom : « 5kg », « 90G », « 1,5 L », « 6 x 33cl », « 300 ml ». */
export function parseSize(name: string): { qty: number; unit: 'kg' | 'L' } | null {
  const s = name.toLowerCase().replace(',', '.')
  const pack = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|grs|gm|l|cl|ml|litres?)\b/)
  const one = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grs|gm|l|cl|ml|litres?)\b/)
  const m = pack ? { n: Number(pack[1]), q: Number(pack[2]), u: pack[3] } : one ? { n: 1, q: Number(one[1]), u: one[2] } : null
  if (!m || !(m.q > 0)) return null
  const u = m.u
  let qty: number, unit: 'kg' | 'L'
  if (u === 'kg') { qty = m.q; unit = 'kg' }
  else if (u === 'g' || u === 'gr' || u === 'grs' || u === 'gm') { qty = m.q / 1000; unit = 'kg' }
  else if (u === 'cl') { qty = m.q / 100; unit = 'L' }
  else if (u === 'ml') { qty = m.q / 1000; unit = 'L' }
  else { qty = m.q; unit = 'L' }
  qty *= m.n
  // Contenances invraisemblables (référence produit lue comme un poids…) : ignorées
  if (qty <= 0 || qty > 100) return null
  return { qty: Math.round(qty * 10000) / 10000, unit }
}

// Classement MadaPrice : premier motif reconnu. Les groupes riz/huile/haricot/maïs/manioc correspondent aux produits PAM.
const GROUPS: [string, RegExp][] = [
  ['gaz', /\b(gaz|butane|vitogaz)\b/],
  ['conserve', /\b(sardines?|thon|conserves?|luncheon|corned|tomate concentree|mais doux)\b/],
  ['yaourt', /\b(yaourt|yogh?ourt|yogurt)\b/],
  ['bebe', /\b(bebe|baby|infantile|couches?)\b/],
  ['riz', /\b(riz|vary|rice|basmati)\b/],
  ['huile', /\b(huile|oil|menaka)\b(?!.*\b(moteur|essentielle|massage|cheveux|corps|cire|epilat|argan|solaire|bronzante)\b)/],
  ['farine', /\b(farine|lafarinina|flour)\b/],
  ['pates', /\b(pates?|spaghetti|macaroni|coquillettes?|nouilles?|vermicelles?|mi ?sao|noodles?)\b/],
  ['lait', /\b(lait|ronono|milk)\b/],
  ['fromage-beurre', /\b(fromage|beurre|cheese|butter|margarine)\b/],
  ['cafe-the', /\b(cafe|coffee|the (vert|noir|nature)|tea|infusion|cacao)\b/],
  ['hygiene', /\b(dentifrice|cire|epilat\w*|shampo+ing|shampoo|deodorant|papier hygienique|serviettes? hygieniques?|coton)\b/],
  ['eau', /\b(eau|water|rano)\b/],
  ['boisson', /\b(jus|juice|soda|coca|fanta|sprite|boissons?|limonade|sirop|tonic|energy|biere|three horses|thb)\b/],
  ['sucre', /\b(sucres?|edulcorants?|siramamy|sugar)\b/],
  ['sel-epices', /\b(sel|sira|poivre|curry|cubes?|bouillon|epices?|ketchup|mayonnaise|moutarde|vinaigre|sauce|essence|condiments?)\b/],
  ['haricot', /\b(haricots?|niebe|pois|lentilles?|tsaramaso|voanjobory)\b/],
  ['mais', /\b(mais|katsaka|corn)\b/],
  ['biscuit-snack', /\b(biscuits?|gateaux?|cookies?|chips|snacks?|bhujia|crackers?|bonbons?|chocolats?|friandises?|chewing)\b/],
  ['savon-lessive', /\b(savon|lessive|detergent|javel|vaisselle|nettoyant|lave|soap|entretien)\b/],
  ['oeuf', /\b(oeufs?|atody)\b/],
  ['viande-poisson', /\b(viande|poulet|boeuf|porc|poisson|crevettes?|saucisses?|jambon|akoho|trondro)\b/],
  ['fruits-legumes', /\b(tomates?|oignons?|carottes?|pommes? de terre|legumes?|fruits?|bananes?|ail|tongolo)\b/],
]

/** Minuscules sans accents (\b de JavaScript ne reconnaît pas les lettres accentuées). */
export function fold(s: string) {
  return s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Rayon d'après le nom du produit ; le nom de la catégorie du site ne sert qu'en dernier recours. */
export function productGroup(name: string, category = ''): string | null {
  for (const text of [fold(name), fold(`${name} ${category}`)]) {
    for (const [g, re] of GROUPS) if (re.test(text)) return g
  }
  return null
}

/** Code-barres EAN-8/EAN-13/UPC valide (clé de contrôle vérifiée), sinon null. */
export function validEan(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code) || /^0+$/.test(code)) return null
  const d = code.split('').map(Number)
  const check = d.pop()!
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check ? code : null
}

/** Code-barres lu dans l'adresse du produit (« …-7622210449283.html » chez KIBO) ou dans la référence. */
export function extractBarcode(url: string | null | undefined, ref: string | null | undefined) {
  const m = (url ?? '').match(/[-/](\d{8}|\d{12,14})(?:\.html?)?(?:[?#].*)?$/)
  return (m && validEan(m[1])) || validEan(String(ref ?? '').trim()) || null
}

const SIZE_TOKEN = /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(kg|g|gr|grs|gm|l|cl|ml|litres?|pcs?|pieces?|sachets?|sticks?)\b/g
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'et', 'en', 'the', 'of', 'with', 'avec'])

/**
 * Clé de rapprochement entre boutiques : le code-barres s'il existe,
 * sinon les mots du nom (sans accents, sans contenance, triés) + la contenance normalisée.
 */
export function matchKey(name: string, size: { qty: number; unit: 'kg' | 'L' } | null, barcode: string | null) {
  if (barcode) return `ean:${barcode}`
  const words = [...new Set(fold(name).replace(SIZE_TOKEN, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)))].sort()
  return `n:${words.join(' ')}|${size ? `${size.qty}${size.unit}` : '-'}`
}

/** Unité de comparaison : Ar/kg, Ar/L ; Ar/pièce pour le gaz (recharge) et les œufs. */
export function unitPrice(price: number, size: { qty: number; unit: 'kg' | 'L' } | null, group: string | null) {
  if (size) return { size_qty: size.qty, size_unit: size.unit, unit_price: Math.round(price / size.qty) }
  if (group === 'gaz') return { size_qty: 1, size_unit: 'pièce' as const, unit_price: price }
  return { size_qty: null, size_unit: null, unit_price: null }
}

export function normalizeItem(shopId: string, it: RawItem): OnlineProduct | null {
  const name = decodeEntities(String(it.name ?? '')).replace(/\s+/g, ' ').trim()
  const price = parsePrice(it.price)
  const currency = (it.currency || 'MGA').toUpperCase()
  if (!name || name.length > 300 || price == null || currency !== 'MGA') return null
  if (isNonGrocery(name, it.categories ?? [String(it.category ?? '')])) return null
  // Garde-fou : un produit de supermarché entre 50 Ar et 50 millions d'Ar
  if (price < 50 || price > 50_000_000) return null
  const ref = String(it.ref ?? '').trim() || String(it.url ?? '').trim() || name.toLowerCase()
  const category = decodeEntities(String(it.category ?? '')).trim()
  const group = productGroup(name, category)
  const size = parseSize(name)
  const url = it.url && /^https?:\/\//.test(it.url) ? it.url : null
  const image = it.image && /^https?:\/\//.test(it.image) ? it.image : null
  const barcode = extractBarcode(url, it.ref == null ? null : String(it.ref))
  return {
    id: `${shopId}|${ref}`.slice(0, 500), shop_id: shopId, ref: ref.slice(0, 400), name, url, image_url: image, category,
    product_group: group, ...unitPrice(price, size, group), price, currency, in_stock: it.inStock ?? null,
    search_text: fold(`${name} ${category}`),
    barcode, match_key: matchKey(name, size, barcode),
  }
}

// Articles hors courses du quotidien (électroménager rangé dans les rayons alimentaires de certains sites)
const NON_GROCERY = /\b(electromenager|bouilloires?|kettle|cafetieres?|coffee maker|distributeurs? d.eau|toasters?|grille-pain|mixeurs?|blenders?|friteuses?|fours?|micro-ondes|cuisinieres?|refrigerateurs?|congelateurs?|climatiseurs?|fers? a repasser|filtres? (a eau|robinet|ceramique)|pose verre|consignes?)\b/

/** Vrai si le nom ou une des catégories désigne un appareil plutôt qu'un produit de consommation courante. */
export function isNonGrocery(name: string, categories: string[] = []) {
  return NON_GROCERY.test(fold(decodeEntities([name, ...categories].join(' '))))
}

/** Produit WooCommerce Store API (/wp-json/wc/store/v1/products) → élément brut. */
// deno-lint-ignore no-explicit-any
export function fromWoo(p: any): RawItem {
  const minor = Number(p?.prices?.currency_minor_unit ?? 0)
  const raw = Number(p?.prices?.price)
  return {
    ref: p?.id, name: p?.name,
    price: Number.isFinite(raw) ? raw / 10 ** minor : null,
    currency: p?.prices?.currency_code, url: p?.permalink, image: p?.images?.[0]?.src,
    category: p?.categories?.[0]?.name, inStock: typeof p?.is_in_stock === 'boolean' ? p.is_in_stock : null,
    // deno-lint-ignore no-explicit-any
    categories: Array.isArray(p?.categories) ? p.categories.map((c: any) => String(c?.name ?? '')) : [],
  }
}

/** Élément d'un jeu de données Apify (sortie de apify/pageFunction.js ou d'un acteur proche). */
// deno-lint-ignore no-explicit-any
export function fromApify(x: any): RawItem {
  return {
    ref: x?.ref ?? x?.sku ?? x?.id ?? x?.productId ?? null,
    name: x?.name ?? x?.title ?? null,
    price: x?.price ?? x?.priceText ?? x?.offers?.price ?? null,
    currency: x?.currency ?? x?.offers?.priceCurrency ?? 'MGA',
    url: x?.url ?? null, image: x?.image ?? x?.imageUrl ?? null,
    category: x?.category ?? null,
    inStock: typeof x?.inStock === 'boolean' ? x.inStock : null,
  }
}

/** Variation suspecte : prix multiplié ou divisé par plus de 3 depuis le dernier relevé. */
export function suspectChange(prev: number | null | undefined, next: number) {
  return prev != null && prev > 0 && (next > prev * 3 || next < prev / 3) ? 'jump' : null
}
