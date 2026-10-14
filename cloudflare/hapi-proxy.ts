/**
 * Relais HDX HAPI pour Cloudflare (Pages Functions et Workers).
 * HDX HAPI n'autorise pas les appels directs depuis un navigateur (CORS) :
 * le navigateur appelle /hapi-proxy/api/..., Cloudflare transmet à hapi.humdata.org.
 * Limité aux lectures GET de l'API HAPI, pour ne pas servir de relais ouvert.
 */
export const HAPI_ORIGIN = 'https://hapi.humdata.org'
export const PREFIX = '/hapi-proxy'

export async function proxyHapi(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, OPTIONS' } })
  if (request.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405)
  const url = new URL(request.url)
  const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname
  if (!/^\/api\/[A-Za-z0-9_\-/]+$/.test(path)) return json({ error: 'Chemin non autorisé' }, 404)

  let upstream: Response
  try {
    upstream = await fetchImpl(`${HAPI_ORIGIN}${path}${url.search}`, {
      headers: { Accept: request.headers.get('Accept') ?? 'application/json' },
    })
  } catch (e) {
    return json({ error: `HDX HAPI injoignable : ${(e as Error).message}` }, 502)
  }
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
  // Les prix WFP changent au plus quelques fois par mois : cache court côté navigateur.
  if (upstream.ok) headers.set('Cache-Control', 'public, max-age=600')
  return new Response(upstream.body, { status: upstream.status, headers })
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
