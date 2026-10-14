import { db, type Shop } from './db'
import type { Place } from './settings'

/** Chefs-lieux et grandes villes (coordonnées publiques approximatives du centre-ville). */
export const CITIES: Place[] = [
  { name: 'Antananarivo', lat: -18.8792, lon: 47.5079, admin1: 'Analamanga' },
  { name: 'Toamasina', lat: -18.1492, lon: 49.4023, admin1: 'Atsinanana' },
  { name: 'Antsirabe', lat: -19.8659, lon: 47.0333, admin1: 'Vakinankaratra' },
  { name: 'Fianarantsoa', lat: -21.4536, lon: 47.0858, admin1: 'Haute Matsiatra' },
  { name: 'Mahajanga', lat: -15.7167, lon: 46.3167, admin1: 'Boeny' },
  { name: 'Toliara', lat: -23.35, lon: 43.6667, admin1: 'Atsimo Andrefana' },
  { name: 'Antsiranana', lat: -12.2787, lon: 49.2917, admin1: 'Diana' },
  { name: 'Morondava', lat: -20.2833, lon: 44.2833, admin1: 'Menabe' },
  { name: 'Taolagnaro', lat: -25.0319, lon: 46.9831, admin1: 'Anosy' },
  { name: 'Ambovombe', lat: -25.1667, lon: 46.0833, admin1: 'Androy' },
  { name: 'Ambositra', lat: -20.5167, lon: 47.25, admin1: "Amoron'i Mania" },
  { name: 'Sambava', lat: -14.2667, lon: 50.1667, admin1: 'Sava' },
  { name: 'Antalaha', lat: -14.9, lon: 50.2833, admin1: 'Sava' },
  { name: 'Manakara', lat: -22.15, lon: 48.0, admin1: 'Fitovinany' },
  { name: 'Mananjary', lat: -21.2167, lon: 48.3333, admin1: 'Vatovavy' },
  { name: 'Farafangana', lat: -22.8167, lon: 47.8333, admin1: 'Atsimo Atsinanana' },
  { name: 'Ihosy', lat: -22.4, lon: 46.1167, admin1: 'Ihorombe' },
  { name: 'Moramanga', lat: -18.95, lon: 48.2333, admin1: 'Alaotra Mangoro' },
  { name: 'Ambatondrazaka', lat: -17.8333, lon: 48.4167, admin1: 'Alaotra Mangoro' },
  { name: 'Fenoarivo Atsinanana', lat: -17.3833, lon: 49.4167, admin1: 'Analanjirofo' },
  { name: 'Maroantsetra', lat: -15.4333, lon: 49.7333, admin1: 'Analanjirofo' },
  { name: 'Tsiroanomandidy', lat: -18.7667, lon: 46.0333, admin1: 'Bongolava' },
  { name: 'Miarinarivo', lat: -18.95, lon: 46.9, admin1: 'Itasy' },
  { name: 'Antsohihy', lat: -14.8796, lon: 47.9875, admin1: 'Sofia' },
  { name: 'Maintirano', lat: -18.0667, lon: 44.0167, admin1: 'Melaky' },
  { name: 'Maevatanana', lat: -16.95, lon: 46.8333, admin1: 'Betsiboka' },
  { name: 'Ambanja', lat: -13.6833, lon: 48.45, admin1: 'Diana' },
  { name: 'Nosy Be (Hell-Ville)', lat: -13.4, lon: 48.2667, admin1: 'Diana' },
  { name: 'Betroka', lat: -23.2667, lon: 46.1, admin1: 'Anosy' },
  { name: 'Bekily', lat: -24.2167, lon: 45.3167, admin1: 'Androy' },
]

/** Recherche d'une localité (OpenStreetMap Nominatim, Madagascar uniquement, à la demande). */
export async function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mg&limit=8&accept-language=fr&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const j = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  return j.map((r) => ({ name: r.display_name.split(',').slice(0, 2).join(','), lat: Number(r.lat), lon: Number(r.lon) }))
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

/** Commerces et marchés réels (OpenStreetMap, ODbL) autour d'un point. */
export async function fetchShops(center: { lat: number; lon: number }, radiusM: number, kinds: string[], signal?: AbortSignal): Promise<Shop[]> {
  const parts = kinds.map((k) => {
    const [key, val] = k.split('=')
    return `nwr(around:${radiusM},${center.lat},${center.lon})["${key}"="${val}"];`
  })
  const q = `[out:json][timeout:25];(${parts.join('')});out center tags 400;`
  let lastErr: unknown
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
      const j = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }
      const now = new Date().toISOString()
      const shops: Shop[] = j.elements
        .map((e) => {
          const lat = e.lat ?? e.center?.lat
          const lon = e.lon ?? e.center?.lon
          const tags = e.tags ?? {}
          const kind = tags.shop ? `shop=${tags.shop}` : tags.amenity ? `amenity=${tags.amenity}` : ''
          return { id: `${e.type}/${e.id}`, name: tags.name ?? '', kind, lat: lat!, lon: lon!, tags, fetchedAt: now }
        })
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      await db.shops.bulkPut(shops)
      return shops
    } catch (e) {
      if (signal?.aborted) throw e
      lastErr = e
    }
  }
  throw lastErr
}

export interface Route {
  distanceKm: number
  durationMin: number
  geometry: [number, number][]
  provider: string
}

/** Itinéraire routier (serveur de démonstration OSRM, profil voiture). */
export async function fetchRoute(points: { lat: number; lon: number }[], signal?: AbortSignal): Promise<Route> {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';')
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
  const j = (await res.json()) as { code: string; routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
  if (j.code !== 'Ok' || !j.routes.length) throw new Error(`OSRM ${j.code}`)
  const r = j.routes[0]
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    provider: 'OSRM / OpenStreetMap',
  }
}

export function externalDirectionsUrl(to: { lat: number; lon: number }, from?: { lat: number; lon: number } | null) {
  const o = from ? `&origin=${from.lat},${from.lon}` : ''
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lon}${o}`
}

export function osmUrl(id: string) {
  return `https://www.openstreetmap.org/${id}`
}

/** Analyse simplifiée d'horaires OSM ("Mo-Fr 08:00-18:00; Sa 08:00-12:00"). null = inconnu/non interprétable. */
export function isOpenNow(oh: string | undefined, now = new Date()): boolean | null {
  if (!oh) return null
  if (oh.trim() === '24/7') return true
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  // heure locale de Madagascar (UTC+3, pas d'heure d'été)
  const local = new Date(now.getTime() + 3 * 3600000)
  const d = local.getUTCDay()
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes()
  let matchedDay = false
  for (const rule of oh.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^([A-Za-z,\- ]+)\s+(.+)$/)
    if (!m) return null
    const dayPart = m[1].replace(/\s/g, '')
    const inDay = dayPart.split(',').some((seg) => {
      const [a, b] = seg.split('-')
      const ia = days.indexOf(a)
      const ib = b ? days.indexOf(b) : ia
      if (ia < 0 || ib < 0) return false
      return ia <= ib ? d >= ia && d <= ib : d >= ia || d <= ib
    })
    if (!inDay) continue
    matchedDay = true
    if (/off|closed/i.test(m[2])) return false
    for (const span of m[2].split(',')) {
      const t = span.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
      if (!t) return null
      const s = +t[1] * 60 + +t[2]
      const e = +t[3] * 60 + +t[4]
      if (mins >= s && mins < e) return true
    }
  }
  return matchedDay ? false : false
}
