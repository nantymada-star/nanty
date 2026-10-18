// MadaPrice — fonction de page pour l'acteur Apify « Web Scraper » (apify/web-scraper).
// Extrait les produits d'une page de catégorie ou de produit, quel que soit le CMS :
//   1) données structurées schema.org (JSON-LD « Product »),
//   2) vignettes PrestaShop (.product-miniature : KIBO…),
//   3) vignettes WooCommerce (li.product : Supermarché.mg…).
// Chaque élément renvoyé : { ref, name, price, currency, url, image, category, inStock }.
// La fonction serveur sync-online lit ce jeu de données et ne garde que les prix en Ariary.
async function pageFunction(context) {
  const { request, log, jQuery: $ } = context
  const category = $('h1').first().text().trim() || document.title
  const abs = (u) => { try { return u ? new URL(u, location.href).href : null } catch { return null } }
  const text = (el, sel) => $(el).find(sel).first().text().replace(/\s+/g, ' ').trim()
  const jsonld = [], presta = [], woo = []

  // 1) JSON-LD
  $('script[type="application/ld+json"]').each((_, s) => {
    let data
    try { data = JSON.parse(s.textContent) } catch { return }
    const list = [].concat(data['@graph'] || data).flatMap((d) => (d['@type'] === 'ItemList' ? (d.itemListElement || []).map((x) => x.item || x) : [d]))
    for (const p of list) {
      if (!p || p['@type'] !== 'Product') continue
      const offer = [].concat(p.offers || [])[0] || {}
      jsonld.push({
        ref: p.sku || p.productID || abs(p.url) || null, name: p.name, price: offer.price ?? offer.lowPrice ?? null,
        currency: offer.priceCurrency || 'MGA', url: abs(p.url) || request.url, image: abs([].concat(p.image || [])[0]),
        category, inStock: offer.availability ? /InStock/i.test(offer.availability) : null,
      })
    }
  })

  // 2) PrestaShop
  $('.product-miniature, article[data-id-product]').each((_, el) => {
    const a = $(el).find('.product-title a, h2 a, h3 a').first()
    presta.push({
      ref: $(el).attr('data-id-product') || abs(a.attr('href')), name: a.text().trim() || text(el, '.product-title'),
      price: text(el, '.price, [itemprop="price"]'), currency: 'MGA', url: abs(a.attr('href')),
      image: abs($(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src')),
      category, inStock: $(el).find('.out-of-stock, .product-unavailable').length ? false : null,
    })
  })

  // 3) WooCommerce
  $('li.product, .wc-block-grid__product').each((_, el) => {
    const a = $(el).find('a.woocommerce-LoopProduct-link, a').first()
    const priceEl = $(el).find('.price ins .amount, .price .amount, .wc-block-grid__product-price').first()
    woo.push({
      ref: $(el).find('[data-product_id]').attr('data-product_id') || abs(a.attr('href')),
      name: text(el, '.woocommerce-loop-product__title, h2, h3, .wc-block-grid__product-title'),
      price: priceEl.text().trim(), currency: 'MGA', url: abs(a.attr('href')),
      image: abs($(el).find('img').first().attr('src')), category,
      inStock: $(el).hasClass('outofstock') ? false : $(el).hasClass('instock') ? true : null,
    })
  })

  // Une seule méthode par page (vignettes du CMS en priorité) pour éviter les doublons d'identifiants
  const out = presta.length ? presta : woo.length ? woo : jsonld
  const items = out.filter((x) => x.name && x.price)
  log.info(`${items.length} produit(s) sur ${request.url}`)
  return items
}
