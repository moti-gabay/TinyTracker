/**
 * Tiny synchronous key-value wrapper over localStorage.
 *
 * Everything here must be readable *synchronously at boot* (theme, units,
 * active timer, family ids). Bulk data lives in IndexedDB via Dexie.
 * Every access is guarded: Safari private mode throws on access.
 */
export const StorageKeys = {
  theme: 'tt.theme',
  units: 'tt.units',
  timer: 'tt.timer',
  familyId: 'tt.familyId',
  babyId: 'tt.babyId',
  lang: 'tt.lang',
} as const

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota or private mode: degrade to in-memory only */
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readLocal(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    removeLocal(key)
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  writeLocal(key, JSON.stringify(value))
}
