// Parcours navigateur de bout en bout. Les réponses réseau externes (HDX, OSM, OSRM) sont simulées
// UNIQUEMENT pour ce test, car le conteneur de test n'a pas accès à Internet.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const OUT = process.argv[2] || 'e2e/shots'
fs.mkdirSync(OUT, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe', detached: true })
await new Promise((r) => setTimeout(r, 2500))

const rows = []
const markets = [['1001', 'Antananarivo', 'Analamanga', -18.91, 47.52], ['1002', 'Toamasina', 'Atsinanana', -18.15, 49.40], ['1003', 'Toliara', 'Atsimo Andrefana', -23.35, 43.67]]
const comms = [['52', 'Rice (local)', 'cereals and tubers', 'KG', 2400], ['66', 'Maize', 'cereals and tubers', 'KG', 1500], ['96', 'Oil (vegetable)', 'oil and fats', 'L', 9000]]
for (const [mc, mn, a1, lat, lon] of markets) for (const [cc, cn, cat, unit, base] of comms) for (let i = 0; i < 30; i++) {
  const y = 2024 + Math.floor((i + 4) / 12), m = ((i + 4) % 12) + 1
  const d = `${y}-${String(m).padStart(2, '0')}-01`
  rows.push({ location_code: 'MDG', admin1_name: a1, admin2_name: mn, market_code: mc, market_name: mn, commodity_code: cc, commodity_name: cn, commodity_category: cat,
    currency_code: 'MGA', unit, price_flag: 'actual', price_type: 'Retail', price: String(Math.round(base * (1 + 0.15 * Math.sin(m / 2)) * (mc === '1003' ? 1.2 : 1) + i * 10)),
    lat, lon, reference_period_start: d + 'T00:00:00', reference_period_end: d.slice(0, 8) + '28T00:00:00' })
}
let hapiCalls = []
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); if (process.env.DEBUG) console.log('PAGEERROR', e.message) })
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
await page.route('https://hapi.humdata.org/**', (r) => {
  const u = new URL(r.request().url()); hapiCalls.push(u.search)
  const off = Number(u.searchParams.get('offset') || 0)
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: rows.slice(off, off + 10000) }) })
})
await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64') }))
await page.route('https://overpass-api.de/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [
  { type: 'node', id: 1, lat: -18.912, lon: 47.521, tags: { shop: 'supermarket', name: 'Test Supermarket', opening_hours: 'Mo-Su 08:00-20:00', phone: '+261 20 00 000 00' } },
  { type: 'way', id: 2, center: { lat: -18.915, lon: 47.525 }, tags: { amenity: 'marketplace', name: 'Test Tsena' } }] }) }))
await page.route('https://router.project-osrm.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: 2300, duration: 480, geometry: { coordinates: [[47.52, -18.91], [47.521, -18.912]] } }] }) }))
await page.route('https://api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const m = u.pathname.match(/rate\/([A-Z]{3})\/MGA$/)
  const rates = { EUR: 5120.5, USD: 4400.38, CNY: 612.1, ZAR: 248.9, MUR: 96.2 }
  const body = m ? { date: '2026-10-14', base: m[1], quote: 'MGA', rate: rates[m[1]] }
    : [1, 2, 3, 4].map((i) => ({ date: `2026-0${5 + i}-01`, base: u.searchParams.get('base'), quote: 'MGA', rate: 4300 + i * 20 }))
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
})

// ---- Base partagée Supabase simulée (REST + Auth) — uniquement pour ce test ----
const SB = 'https://aetwjbobrnrudmulvnjp.supabase.co'
const serverRows = rows.map((r) => {
  const ps = r.reference_period_start.slice(0, 10)
  return { id: ['wfp', r.market_code, r.commodity_code, r.unit, r.price_type, r.price_flag, ps].join('|'), source: 'wfp-hapi',
    market_code: r.market_code, market_name: r.market_name, admin1: r.admin1_name, admin2: r.admin2_name, lat: r.lat, lon: r.lon,
    commodity_code: r.commodity_code, commodity_name: r.commodity_name, category: r.commodity_category, unit: r.unit === 'KG' ? 'kg' : r.unit,
    price_type: r.price_type, price_flag: r.price_flag, currency: 'MGA', price: r.price, period_start: ps, period_end: r.reference_period_end.slice(0, 10),
    first_seen_at: '2026-10-17T03:10:00Z', last_verified_at: '2026-10-17T03:10:00Z', revisions: [], suspect: null }
}).sort((a, b) => a.id.localeCompare(b.id))
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'nantymada@gmail.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-17T00:00:00Z' }
const sbState = { submissions: [], quotes: [], business: null, prices: [], inserted: [] }
const pending = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', submitted_by: 'u2', commodity_code: '52', commodity_name: 'Rice (local)', category: '', market_code: '1001', market_name: 'Antananarivo', admin1: 'Analamanga', unit: 'kg', price_type: 'Retail', price: 2600, observed_on: '2026-10-16', note: 'Tsena Analakely', status: 'pending', moderated_at: null, moderation_note: null, created_at: '2026-10-17T05:00:00Z' }]
await page.route(SB + '/**', async (r) => {
  const req = r.request()
  const u = new URL(req.url())
  const path = u.pathname
  const method = req.method()
  const ok = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) })
  if (method === 'OPTIONS') return ok({})
  if (path.startsWith('/auth/v1/token')) return ok({ access_token: 'test.jwt.token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: USER })
  if (path.startsWith('/auth/v1/user')) return ok(USER)
  if (path.startsWith('/auth/v1/logout')) return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
  if (path.startsWith('/realtime')) return r.abort()
  const table = path.replace('/rest/v1/', '')
  const body = req.postData() ? JSON.parse(req.postData()) : null
  if (table === 'price_observations') return ok(u.searchParams.get('or') ? [] : serverRows)
  if (table === 'markets') return ok([...new Map(serverRows.map((x) => [x.market_code, { code: x.market_code, name: x.market_name, admin1: x.admin1, admin2: x.admin2, lat: x.lat, lon: x.lon }])).values()])
  if (table === 'data_sync_runs' && (u.searchParams.get('source') || '').startsWith('like.online')) return ok([{ id: 9, source: 'online:bonmarche', status: 'success', started_at: '2026-10-18T03:40:00Z', fetched: 174, inserted: 0, updated: 2, error: null }])
  if (table === 'data_sync_runs') return ok([{ id: 1, source: 'wfp-hapi', status: 'success', trigger: 'cron', started_at: '2026-10-17T03:10:00Z', finished_at: '2026-10-17T03:11:00Z', duration_ms: 60000, fetched: serverRows.length, inserted: serverRows.length, updated: 0, error: null }])
  if (table === 'profiles') return ok(u.searchParams.get('id') ? { id: USER.id, email: USER.email, display_name: 'Nanty', role: 'admin', reputation: 0, created_at: '2026-10-17' } : [{ id: USER.id, email: USER.email, display_name: 'Nanty', role: 'admin', reputation: 0, created_at: '2026-10-17' }, { id: 'u2', email: 'rija@example.mg', display_name: 'Rija', role: 'user', reputation: 3, created_at: '2026-10-17' }])
  if (table === 'user_submissions') {
    if (method === 'POST') { sbState.inserted.push(body); return ok([{ ...body, id: 'new' }], 201) }
    if (method === 'PATCH') { const id = (u.searchParams.get('id') || '').replace('eq.', ''); const i = pending.findIndex((x) => x.id === id); if (i >= 0) { pending[i].status = body.status; sbState.submissions.push({ id, ...body }); pending.splice(i, 1) } return ok([]) }
    const st = u.searchParams.get('status')
    if (st === 'eq.pending') return ok(pending)
    if (u.searchParams.get('submitted_by')) return ok(sbState.inserted.map((x, i) => ({ id: 'mine' + i, status: 'pending', created_at: '2026-10-17T06:00:00Z', moderation_note: null, ...x })))
    return ok([])
  }
  if (table === 'businesses') {
    if (method === 'POST') { sbState.business = { id: 'bbbbbbbb-0000-4000-8000-000000000001', verified: false, owner_id: USER.id, updated_at: '2026-10-17T06:00:00Z', address: null, phone: null, hours: null, delivery: null, delivery_area: null, ...body }; return ok([sbState.business], 201) }
    if (method === 'PATCH') { Object.assign(sbState.business, body); return ok([]) }
    if (u.searchParams.get('osm_id')) return ok(sbState.business && u.searchParams.get('osm_id') === 'eq.' + sbState.business.osm_id ? sbState.business : null)
    return ok(sbState.business ? [sbState.business] : [])
  }
  if (table === 'business_prices') {
    if (method === 'POST') { sbState.prices.push({ id: 'p' + sbState.prices.length, updated_at: '2026-10-17T06:00:00Z', ...body }); return ok([], 201) }
    return ok(sbState.prices)
  }
  if (table === 'quote_requests') {
    if (method === 'POST') { sbState.quotes.push({ id: 'q' + sbState.quotes.length, status: 'open', created_at: '2026-10-17T06:00:00Z', reply: null, replied_at: null, requester_id: USER.id, businesses: { name: 'Test Supermarket' }, ...body }); return ok([], 201) }
    return ok(sbState.quotes)
  }
  if (table === 'online_shops') return ok([{ id: 'bonmarche', name: 'BonMarche.mg', url: 'https://bonmarche.mg', kind: 'woocommerce', config: {}, area: 'Antananarivo', enabled: true, note: 'API publique', last_run_at: '2026-10-18T03:40:00Z' }, { id: 'kibo', name: 'KIBO', url: 'https://www.kibo.mg', kind: 'apify', config: {}, area: 'Antananarivo', enabled: false, note: 'Apify', last_run_at: null }])
  if (table === 'online_products') {
    const all = [
      { id: 'bonmarche|1', shop_id: 'bonmarche', name: 'Riz Makalioka 5kg', url: 'https://bonmarche.mg/produit/riz', image_url: null, category: 'Riz', product_group: 'riz', size_qty: 5, size_unit: 'kg', price: 17500, unit_price: 3500, in_stock: true, suspect: null, first_seen_at: '2026-10-18T03:40:00Z', last_seen_at: new Date().toISOString(), last_changed_at: '2026-10-18T03:40:00Z', search_text: 'riz makalioka 5kg riz' },
      { id: 'bonmarche|2', shop_id: 'bonmarche', name: 'YAOURT IZI COCO 90G', url: null, image_url: null, category: 'Produit laitiers', product_group: 'yaourt', size_qty: 0.09, size_unit: 'kg', price: 900, unit_price: 10000, in_stock: true, suspect: null, first_seen_at: '2026-10-18T03:40:00Z', last_seen_at: new Date().toISOString(), last_changed_at: '2026-10-18T03:40:00Z', search_text: 'yaourt izi coco 90g' },
      { id: 'kibo|3960', shop_id: 'kibo', name: 'Riz Makalioka 5 kg', url: null, image_url: null, category: 'Riz', product_group: 'riz', size_qty: 5, size_unit: 'kg', price: 16900, unit_price: 3380, in_stock: null, suspect: null, first_seen_at: '2026-10-18T14:00:00Z', last_seen_at: new Date().toISOString(), last_changed_at: '2026-10-18T14:00:00Z', search_text: 'riz makalioka 5 kg riz', match_key: 'n:makalioka riz|5kg' },
    ]
    all[0].match_key = 'n:makalioka riz|5kg'
    if (req.headers()['prefer']?.includes('count')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-1/2' }, body: '[]' })
    const mk = u.searchParams.get('match_key')
    if (mk) return ok(all.filter((x) => 'eq.' + x.match_key === mk).sort((a, b) => a.price - b.price))
    const g = u.searchParams.get('product_group')
    const q = u.searchParams.get('search_text')
    return ok(all.filter((x) => (!g || g === 'eq.' + x.product_group) && (!q || x.search_text.includes(q.replace(/^ilike\.%|%$/g, '')))))
  }
  if (table === 'online_matches') return ok([{ match_key: 'n:makalioka riz|5kg', name: 'Riz Makalioka 5kg', barcode: null, size_qty: 5, size_unit: 'kg', product_group: 'riz', shops: 2, offers: 2, min_price: 16900, max_price: 17500, last_seen_at: new Date().toISOString() }])
  if (table === 'online_price_points') return ok([{ seen_on: '2026-10-17', price: 17000 }, { seen_on: '2026-10-18', price: 17500 }])
  if (path.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
  return ok([])
})
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))

const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }) }
const B = 'http://localhost:4173'
await page.goto(B)
await shot('01-onboarding')
const htmlLang = await page.evaluate(() => document.documentElement.lang)
await page.getByRole('button', { name: 'Hanomboka' }).click()
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Manaraka' }).click()
await page.getByRole('combobox').first().selectOption('Antananarivo')
await shot('02-place')
await page.getByRole('button', { name: 'Hanomboka' }).click()
await page.waitForTimeout(800)
await shot('03-home-empty')
// Configurer la source
await page.goto(B + '/admin')
await page.getByPlaceholder('TWFkYVByaWNlOm1lQGV4YW1wbGUub3Jn').fill(Buffer.from('MadaPriceTest:test@example.org').toString('base64'))
await page.getByRole('button', { name: /Tehirizo/ }).click()
await page.waitForFunction(() => document.body.innerText.includes('success'), null, { timeout: 15000 })
await shot('04-admin-after-sync')
await page.goto(B + '/')
await page.waitForTimeout(800)
await shot('05-home')
const homeText = await page.innerText('main')
await page.goto(B + '/vidiny?c=52')
await shot('06-compare')
await page.goto(B + '/vokatra/52?market=1001&unit=kg&pt=Retail')
await shot('07-product')
await page.getByRole('button', { name: "Ampio amin'ny ankafiziko" }).click()
await page.goto(B + '/faritra')
await page.locator('input[placeholder="Ar"]').fill('100')
await shot('08-regions')
await page.goto(B + '/vanim-potoana')
await shot('09-seasons')
await page.goto(B + '/kajy?buy=58000')
const nums = page.locator('input[type=number]')
await nums.nth(0).fill('10'); await nums.nth(2).fill('70000'); await nums.nth(3).fill('50000'); await nums.nth(5).fill('20000')
const simText = await page.innerText('main')
await shot('10-simulator')
await page.goto(B + '/sarintany')
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Asehoy ny fivarotana/ }).click()
await page.waitForTimeout(800)
await shot('11-map')
await page.goto(B + '/fivarotana/node/1')
await shot('12-shop')
await page.goto(B + '/dia?to=-18.912,47.521&name=Test')
await page.waitForTimeout(800)
await shot('13-route')
await page.goto(B + '/hitady?q=vary')
await shot('14-search')
await page.goto(B + '/hanome-vidiny')
await shot('15-submit')
await page.goto(B + '/fanairana')
await shot('16-alerts')
// ---- Série 1 (maquette) ----
const checks = {}
const has = async (txt) => { try { await page.getByText(txt, { exact: false }).first().waitFor({ timeout: 5000 }); return true } catch { return false } }
await page.goto(B + '/')
await page.getByRole('link', { name: 'Vary sy voamaina' }).click()
await page.waitForTimeout(500)
checks.catFilter = (await page.innerText('main')).includes('Vary gasy') && !(await page.locator('select').nth(1).innerText()).includes('Menaka')
await shot('20-cat-cereals')
await page.getByRole('button', { name: 'Tombony indrindra' }).click()
checks.profitGap = /elanelana/.test(await page.innerText('main'))
await shot('21-compare-profit')
await page.goto(B + '/vokatra/52?market=1001&unit=kg&pt=Retail')
checks.qtyTable = await has('Vidiny araka ny habetsahana')
await shot('22-product-qty')
await page.goto(B + '/sarintany')
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Asehoy ny fivarotana/ }).click()
await page.waitForTimeout(800)
await page.locator('path.leaflet-interactive[fill="#2864b4"]').first().click({ force: true })
await page.waitForTimeout(400)
checks.mapSheet = (await page.innerText('main')).includes('Jereo ny fivarotana')
checks.mapLegend = (await page.innerText('main')).includes('Ambongadiny')
await shot('23-map-sheet')
await page.goto(B + '/mpivarotra?shop=node/1')
await page.getByRole('textbox', { name: /Vokatra/ }).fill('Ciment 50 kg').catch(() => {})
await page.locator('input[placeholder="Vary gasy 50 kg"]').fill('Ciment 50 kg')
await page.locator('input[placeholder^="kg"]').fill('gony')
await page.locator('input[type=number]').first().fill('38000')
await page.locator('select').nth(1).selectOption('declared')
await page.getByRole('button', { name: 'Tehirizo' }).click()
await page.waitForTimeout(300)
await page.getByRole('tab', { name: 'Mombamomba' }).click()
await page.getByLabel('Telefaona').fill('034 11 222 33')
await page.getByRole('button', { name: 'Tehirizo' }).click()
await page.waitForTimeout(300)
await shot('24-merchant-info')
await page.getByRole('tab', { name: "Antontan'isa" }).click()
await shot('25-merchant-stats')
await page.goto(B + '/fivarotana/node/1')
checks.shopEdited = await has('034 11 222 33')
await page.goto(B + '/hitady?q=ciment')
await page.waitForTimeout(500)
checks.searchDeclared = (await page.innerText('main')).includes('38')
await shot('26-search-declared')
await page.goto(B + '/faritra')
checks.regionChange = await has('Fiovana (salanisa)')
await shot('27-regions')
await page.goto(B + '/vanim-potoana?c=52')
await page.waitForTimeout(400)
checks.seasonRange = await has('Vidiny tombanana')
await page.getByRole('button', { name: /Ampandreneso aho/ }).click()
await shot('28-seasons')
await page.goto(B + '/fanairana')
await page.getByRole('button', { name: /Ny fanairako/ }).click()
await page.locator('select').last().selectOption('stock').catch(() => {})
await shot('29-alerts')
await page.getByRole('button', { name: /Fampandrenesana/ }).click()
checks.alertTabs = (await page.innerText('main')).includes('Fahazoana')
await page.goto(B + '/tantarako')
checks.history = await has('ciment')
await shot('30-history')
await page.goto(B + '/admin')
checks.adminChart = await has("Fivoaran'ny vidiny")
await shot('31-admin')
await page.goto(B + '/dia?to=-18.912,47.521&name=Test')
await page.waitForTimeout(500)
await page.locator('input[placeholder="Ar / km"]').fill('600')
await page.getByRole('button', { name: 'Taxi' }).click()
checks.ratePerMode = (await page.locator('input[placeholder="Ar / km"]').inputValue()) === ''
await page.getByRole('button', { name: 'Fiara' }).click()
checks.ratePerModeBack = (await page.locator('input[placeholder="Ar / km"]').inputValue()) === '600'
// ---- Sources complémentaires ----
await page.goto(B + '/mombamomba')
await page.getByLabel('Andraikitra').selectOption('admin')
await page.goto(B + '/fanampiny?tab=fx')
checks.fx = await has('4\u202f400,38 Ar')
await shot('32-enrich-fx')
await page.goto(B + '/fanampiny?tab=official')
checks.officialSeeds = await has('4\u202f660 Ar')
await page.locator('input[type=number]').first().fill('4800')
await page.locator('input[placeholder="OMH, Bulletin ODR n°…"]').fill('OMH')
await page.locator('select').first().selectOption('fuel_gasoil')
await page.getByRole('button', { name: 'Ampio' }).click()
checks.officialAdd = await has('4\u202f800 Ar')
await shot('33-enrich-official')
await page.goto(B + '/fanampiny?tab=wb')
await page.locator('input[type=file]').setInputFiles('e2e/fixtures/rtfp_TEST_ONLY.csv')
checks.wbImport = await has('tombana voatahiry')
checks.wbList = await has('Ihosy')
await shot('34-enrich-wb')
await page.goto(B + '/vidiny?c=52')
checks.compareEnrich = await has('Tombana Banky Iraisam-pirenena ho an')
await shot('35-compare-enrich')
await page.goto(B + '/')
checks.homeFx = await has('1 USD')
// ---- Série 2 : compte, partage, modération, devis ----
await page.goto(B + '/kaonty')
await page.getByLabel('Mailaka').fill('nantymada@gmail.com')
await page.getByLabel('Teny miafina').fill('motdepasse-test')
await page.locator('form button.btn.orange').click()
checks.login = await has('nantymada@gmail.com')
await shot('36-account')
await page.goto(B + '/admin')
checks.serverModeration = await has('Tsena Analakely')
await page.getByRole('button', { name: 'Ekena' }).first().click()
await page.waitForTimeout(400)
checks.approved = sbState.submissions.some((x) => x.status === 'approved')
checks.usersAdmin = await has('rija@example.mg')
await shot('37-admin-server')
await page.goto(B + '/hanome-vidiny')
await page.locator('select').nth(3).selectOption({ index: 1 })
await page.locator('input[type=number]').first().fill('2550')
await page.getByRole('button', { name: /Alefaso/ }).click()
await page.waitForTimeout(500)
checks.sharedSubmit = sbState.inserted.length === 1 && sbState.inserted[0].price === 2550
await shot('38-submit-shared')
await page.goto(B + '/mpivarotra?shop=node/1')
await page.getByRole('button', { name: /Ity no fivarotako/ }).click()
await page.waitForTimeout(500)
checks.claim = !!sbState.business && sbState.business.osm_id === 'node/1'
await page.locator('input[placeholder="Vary gasy 50 kg"]').last().fill('Ciment 50 kg')
await page.locator('form input[type=number]').last().fill('38000')
await page.locator('form button.btn.orange').last().click()
await page.waitForTimeout(400)
checks.serverPrice = sbState.prices.length === 1
await shot('39-merchant-server')
await page.goto(B + '/fivarotana/node/1')
await page.getByText('Hangataka tombam-bidy').click()
await page.locator('details input').first().fill('Ciment')
await page.getByRole('button', { name: /Alefaso ny fangatahana/ }).click()
await page.waitForTimeout(400)
checks.quote = sbState.quotes.length === 1
await shot('40-shop-quote')
await page.goto(B + '/devis')
checks.myQuotes = await has('Ciment')
await page.goto(B + '/lisitra')
checks.lists = await page.locator('input[placeholder="Lisitra vaovao"]').waitFor({ timeout: 5000 }).then(() => true, () => false)
await shot('41-lists')
await page.goto(B + '/an-tserasera')
checks.onlineList = await has('Riz Makalioka 5kg') && await has('3 500 Ar / kg')
checks.onlineBadge = await has('Hita an-tserasera')
await page.getByRole('tab', { name: 'Yaourt' }).click()
checks.onlineFilter = await page.waitForFunction(() => document.body.innerText.includes('YAOURT IZI COCO') && !document.body.innerText.includes('Riz Makalioka'), null, { timeout: 5000 }).then(() => true, () => false)
await page.getByText('YAOURT IZI COCO 90G').click()
await page.waitForTimeout(300)
await page.goto(B + '/an-tserasera')
await page.getByText('Riz Makalioka 5kg').first().click()
checks.sameElsewhere = await has('Vokatra mitovy any amin') && await has('Mora kokoa 600 Ar any an-kafa')
await page.getByRole('button', { name: /Ampandrenesy raha latsaka/ }).click()
checks.onlineAlert = await has('Voaforona ny fanairana')
await shot('42-online')
await page.getByRole('tab', { name: 'Mampitaha fivarotana' }).click()
checks.onlineMatches = await has('2 fivarotana') && await has('elanelana 4 %')
await shot('44-online-matches')
await page.goto(B + '/fanairana')
await page.getByRole('button', { name: /Ny fanairako/ }).click()
checks.onlineAlertListed = await has('Vidiny an-tserasera latsaka')
await page.goto(B + '/admin')
checks.onlineAdmin = await has('Fivarotana an-tserasera') && await has('BonMarche.mg')
await shot('43-online-admin')
console.log('CHECKS ' + JSON.stringify(checks))

await page.goto(B + '/mombamomba')
await page.getByLabel('Fiteny').selectOption('fr')
await page.getByLabel('Thème').selectOption('dark')
await shot('17-profile-fr-dark')
const frHome = (await (await page.goto(B + '/'), page.waitForTimeout(600), page.innerText('main')))
await shot('18-home-fr-dark')
await page.setViewportSize({ width: 1280, height: 900 })
await page.goto(B + '/vidiny?c=52')
await shot('19-desktop-compare')
// Hors ligne
await ctx.setOffline(true)
await page.goto(B + '/', { timeout: 5000 }).catch(() => {})
await browser.close()
try { process.kill(-server.pid) } catch { server.kill() }

const sc = (re) => (simText.match(re) || [''])[0]
console.log(JSON.stringify({
  htmlLang, hapiCalls, errors,
  homeHasPrice: /Vary gasy/.test(homeText) && /Ar/.test(homeText),
  frHomeIsFrench: /Prix récents/.test(frHome),
  simulatorShows: ['50 000 Ar', '650 000 Ar', '700 000 Ar'].map((x) => simText.includes(x)),
  sc: sc(/Tombony madio[\s\S]{0,40}/),
}, null, 1))
