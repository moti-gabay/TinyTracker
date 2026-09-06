import { useSyncExternalStore } from 'react'
import { StorageKeys, readLocal, removeLocal, writeLocal } from '@/lib/storage'

export type Theme = 'day' | 'night'
/** 'system' means: follow the OS, re-evaluated live. */
export type ThemePreference = Theme | 'system'

const THEME_COLOR: Record<Theme, string> = {
  day: '#faf7f4',
  night: '#000000',
}

const listeners = new Set<() => void>()
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function emit() {
  for (const l of listeners) l()
}

export function getPreference(): ThemePreference {
  const stored = readLocal(StorageKeys.theme)
  return stored === 'day' || stored === 'night' ? stored : 'system'
}

export function resolveTheme(pref: ThemePreference = getPreference()): Theme {
  if (pref !== 'system') return pref
  return darkQuery().matches ? 'night' : 'day'
}

/** Writes the resolved theme to <html> and syncs the OS status bar colour. */
function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme])
}

export function setPreference(pref: ThemePreference) {
  if (pref === 'system') removeLocal(StorageKeys.theme)
  else writeLocal(StorageKeys.theme, pref)
  apply(resolveTheme(pref))
  emit()
}

/** One-tap toggle: always lands on an explicit override, never back to system. */
export function toggleTheme() {
  setPreference(resolveTheme() === 'night' ? 'day' : 'night')
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const mq = darkQuery()
  const onSystemChange = () => {
    // Only react while following the system.
    if (getPreference() === 'system') {
      apply(resolveTheme())
      emit()
    }
  }
  mq.addEventListener('change', onSystemChange)
  // Another tab / the partner's own device changed the preference.
  const onStorage = (e: StorageEvent) => {
    if (e.key === StorageKeys.theme) {
      apply(resolveTheme())
      emit()
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(onChange)
    mq.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useTheme(): {
  theme: Theme
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  toggle: () => void
} {
  const theme = useSyncExternalStore(
    subscribe,
    () => resolveTheme(),
    () => 'day' as Theme,
  )
  const preference = useSyncExternalStore(
    subscribe,
    getPreference,
    () => 'system' as ThemePreference,
  )
  return { theme, preference, setPreference, toggle: toggleTheme }
}
