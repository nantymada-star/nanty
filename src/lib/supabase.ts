import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Base partagée MadaPrice (Supabase). La clé « publishable » est publique par conception :
 * l'accès aux données est contrôlé côté serveur par les règles RLS.
 * Peut être remplacée par VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
 */
const URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) || 'https://aetwjbobrnrudmulvnjp.supabase.co'
const KEY = (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_V1d2-JQa5PJFx5EQ-Mh34A_GgeysrXr'

export const supabase: SupabaseClient | null = !URL || !KEY ? null : createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  })

export const SUPABASE_URL = URL

export type AppRole = 'user' | 'merchant' | 'moderator' | 'admin'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  role: AppRole
  reputation: number
  created_at: string
}

export interface ServerSubmission {
  id: string
  submitted_by: string
  commodity_code: string
  commodity_name: string
  category: string
  market_code: string
  market_name: string
  admin1: string
  unit: string
  price_type: string
  price: number
  observed_on: string
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  moderated_at: string | null
  moderation_note: string | null
  created_at: string
}

export interface Business {
  id: string
  osm_id: string | null
  name: string
  kind: string
  lat: number | null
  lon: number | null
  address: string | null
  phone: string | null
  hours: string | null
  delivery: boolean | null
  delivery_area: string | null
  owner_id: string | null
  verified: boolean
  verified_at: string | null
  updated_at: string
}

export interface BusinessPrice {
  id: string
  business_id: string
  product: string
  unit: string
  price: number
  price_type: 'Retail' | 'Wholesale'
  stock: 'declared' | 'unknown' | 'out'
  delivery: boolean
  updated_at: string
}

export interface QuoteRequest {
  id: string
  business_id: string
  requester_id: string
  product: string
  quantity: string | null
  message: string | null
  contact: string | null
  status: 'open' | 'answered' | 'closed'
  reply: string | null
  created_at: string
  replied_at: string | null
  businesses?: { name: string } | null
}

/** Message d'erreur lisible (RLS, limite de débit, validation). */
export function errText(e: unknown) {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/row-level security/i.test(m)) return 'Accès refusé (droits insuffisants)'
  if (/Trop de/i.test(m)) return m
  return m
}
