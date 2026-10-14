import { useSyncExternalStore } from 'react'
import type { Lang } from './commodities'
import { DEFAULT_STALE_DAYS } from './stats'

export interface Place {
  name: string
  lat: number
  lon: number
  admin1?: string
}

export interface Settings {
  lang: Lang
  theme: 'auto' | 'light' | 'dark'
  onboarded: boolean
  appId: string
  hapiMode: 'auto' | 'direct' | 'proxy'
  /** Intervalle de vérification automatique pendant que l'app est ouverte (min). */
  autoSyncMinutes: number
  /** Profondeur d'historique lors de la première synchronisation (années). */
  historyYears: number
  staleDays: Record<string, number>
  place: Place | null
  geoConsent: boolean
  displayName: string
  role: 'user' | 'merchant' | 'admin'
  notifConsent: boolean
}

const KEY = 'madaprice.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  lang: 'mg',
  theme: 'auto',
  onboarded: false,
  appId: (import.meta.env?.VITE_HAPI_APP_IDENTIFIER as string | undefined) ?? '',
  hapiMode: 'auto',
  autoSyncMinutes: 30,
  historyYears: 4,
  staleDays: DEFAULT_STALE_DAYS,
  place: null,
  geoConsent: false,
  displayName: '',
  role: 'user',
  notifConsent: false,
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings
      if (!s.appId && DEFAULT_SETTINGS.appId) s.appId = DEFAULT_SETTINGS.appId
      return s
    }
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT_SETTINGS
}

let state: Settings = typeof window === 'undefined' ? DEFAULT_SETTINGS : load()
const listeners = new Set<() => void>()

export function getSettings() {
  return state
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
