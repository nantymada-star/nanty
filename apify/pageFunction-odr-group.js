// MadaPrice — robot Apify « Web Scraper » pour le groupe Google public de la cellule ODR (rapports de prix du riz).
// Page du groupe : fait défiler la liste, met en file chaque discussion. Discussion : titre, date et pièces jointes (pas le texte des messages).
async function pageFunction(context) {
  const { request, log } = context
  const url = request.url
  await context.waitFor(3000)
  if (/\/c\/[^/?#]+/.test(url)) {
    await context.waitFor(2000)
    const title = (document.querySelector('h1, [role="heading"][aria-level="1"], [role="heading"]') || {}).innerText || document.title
    // Date du premier message seulement : le texte des messages (noms, adresses) n'est pas conservé
    const main = (document.querySelector('[role="main"]') || document.body).innerText
    const posted = (main.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, 20\d\d\b/) || [null])[0]
    const links = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href)
      .filter((h) => /attachment|googleusercontent|drive\.google|docs\.google|\.pdf|\.xlsx?|\.docx?/i.test(h)))]
    log.info(`Discussion : ${title}`)
    return { kind: 'thread', url, title: title.trim(), posted, links }
  }
  // Liste : défilement pour charger les discussions plus anciennes
  const scroller = () => [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY))
  for (let i = 0; i < 20; i++) {
    window.scrollTo(0, document.body.scrollHeight)
    for (const s of scroller()) s.scrollTop = s.scrollHeight
    await context.waitFor(1500)
  }
  const threads = [...new Set([...document.querySelectorAll('a[href*="/c/"]')].map((a) => a.href.split(/[?#]/)[0]))]
    .filter((h) => /\/g\/cellule-odr-bdd-minae\/c\//.test(h))
  for (const t of threads) await context.enqueueRequest({ url: t })
  log.info(`${threads.length} discussion(s) trouvée(s)`)
  return { kind: 'list', url, count: threads.length, threads }
}
