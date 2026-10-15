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
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
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
