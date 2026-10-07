import { useSyncExternalStore } from 'react'
import { StorageKeys, readLocal, writeLocal } from '@/lib/storage'
import { en, type Key } from './en'
import { he } from './he'

export type Lang = 'en' | 'he'

const DICT: Record<Lang, Record<Key, string>> = { en, he }

function readLang(): Lang {
  return readLocal(StorageKeys.lang) === 'he' ? 'he' : 'en'
}

// Cached: t() runs on every render and localStorage is a sync disk read.
let current: Lang = readLang()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getLang(): Lang {
  return current
}

/** Writes lang/dir to <html>. index.html does the same before first paint. */
function apply(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
}

export function setLang(lang: Lang) {
  writeLocal(StorageKeys.lang, lang)
  current = lang
  apply(lang)
  emit()
}

/** BCP 47 tag for Date formatting. English keeps the device's own format. */
export function localeOf(lang: Lang = current): string | undefined {
  return lang === 'he' ? 'he-IL' : undefined
}

/** `t('time.ago', { d: '14m' })` → `14m ago` / `לפני 14m`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = DICT[current][key]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  )
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab changed the language.
  const onStorage = (e: StorageEvent) => {
    if (e.key === StorageKeys.lang) {
      current = readLang()
      apply(current)
      emit()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'en' as Lang)
}

/** Subscribes the component to language changes and hands back `t`. */
export function useT(): typeof t {
  useLang()
  return t
}
