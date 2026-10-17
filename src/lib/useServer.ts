import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/**
 * Lecture d'une requête Supabase, rechargée en direct quand une des tables listées change
 * (Realtime, filtré par les règles RLS côté serveur).
 */
export function useServer<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }> | null, deps: unknown[], tables: string[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    const p = fnRef.current()
    if (!p) { setLoading(false); return }
    setLoading(true)
    try {
      const { data: d, error: e } = await p
      setError(e ? e.message : null)
      setData(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!supabase || !tables.length) return
    const ch = supabase.channel('rt:' + tables.join(',') + ':' + Math.random().toString(36).slice(2))
    for (const t of tables) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => reload())
    ch.subscribe()
    return () => { supabase?.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')])

  return { data, error, loading, reload }
}
