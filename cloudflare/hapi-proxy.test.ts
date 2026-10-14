import { describe, expect, it } from 'vitest'
import { proxyHapi } from './hapi-proxy'

const ok = (body: string) => async (input: RequestInfo | URL) => {
  calls.push(String(input))
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}
let calls: string[] = []

describe('proxyHapi', () => {
  it('transmet le chemin et la requête vers hapi.humdata.org', async () => {
    calls = []
    const r = await proxyHapi(
      new Request('https://madaprice.pages.dev/hapi-proxy/api/v2/food-security-nutrition-poverty/food-prices-market-monitor?location_code=MDG&app_identifier=abc'),
      ok('{"data":[]}') as typeof fetch,
    )
    expect(calls).toEqual(['https://hapi.humdata.org/api/v2/food-security-nutrition-poverty/food-prices-market-monitor?location_code=MDG&app_identifier=abc'])
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ data: [] })
  })
  it('refuse les chemins hors API et les méthodes d’écriture', async () => {
    calls = []
    expect((await proxyHapi(new Request('https://x/hapi-proxy/../etc'), ok('') as typeof fetch)).status).toBe(404)
    expect((await proxyHapi(new Request('https://x/hapi-proxy/docs'), ok('') as typeof fetch)).status).toBe(404)
    expect((await proxyHapi(new Request('https://x/hapi-proxy/api/v2/x', { method: 'POST' }), ok('') as typeof fetch)).status).toBe(405)
    expect(calls).toEqual([])
  })
  it('renvoie 502 en JSON si HDX est injoignable', async () => {
    const r = await proxyHapi(new Request('https://x/hapi-proxy/api/v2/x'), (async () => { throw new Error('down') }) as typeof fetch)
    expect(r.status).toBe(502)
    expect((await r.json()).error).toMatch(/injoignable/)
  })
})
