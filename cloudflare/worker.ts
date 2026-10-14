// Cloudflare Workers (avec fichiers statiques) : relais /hapi-proxy/*, le reste est servi depuis dist/.
import { PREFIX, proxyHapi } from './hapi-proxy'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === PREFIX || pathname.startsWith(PREFIX + '/')) return proxyHapi(request)
    return env.ASSETS.fetch(request)
  },
}
