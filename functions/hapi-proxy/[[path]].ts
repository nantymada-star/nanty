// Cloudflare Pages Function : /hapi-proxy/* -> https://hapi.humdata.org/*
import { proxyHapi } from '../../cloudflare/hapi-proxy'

export const onRequest = ({ request }: { request: Request }) => proxyHapi(request)
