import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'
import { updateSettings } from './settings'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isStaff: boolean
  isAdmin: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  session: null, profile: null, loading: true, isStaff: false, isAdmin: false,
  refreshProfile: async () => {}, signOut: async () => {},
})

/** Session Supabase + profil (rôle fixé par le serveur, jamais par l'appareil). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
    if (data) {
      const r = (data as Profile).role
      updateSettings({ role: r === 'moderator' ? 'admin' : r, displayName: (data as Profile).display_name || '' })
    }
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const role = profile?.role
  return (
    <Ctx.Provider value={{
      session, profile, loading,
      isStaff: role === 'admin' || role === 'moderator',
      isAdmin: role === 'admin',
      refreshProfile: () => load(session),
      signOut: async () => { await supabase?.auth.signOut(); updateSettings({ role: 'user' }) },
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
