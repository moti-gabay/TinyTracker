import { create } from 'zustand'
import { StorageKeys, readLocal, removeLocal, writeLocal } from '@/lib/storage'
import { newId } from '@/lib/db/repo'

/**
 * Identity for writes.
 *
 * Phase 1 is deliberately local-only: if no family exists yet we mint a local
 * family/baby id so the app is fully usable before the parent ever signs in.
 * Phase 2 replaces these ids with the server's when a family is created or
 * joined, and migrates any locally-logged events onto it.
 */
interface SessionState {
  familyId: string
  /** The child new logs are attributed to. One baby families never change it. */
  babyId: string
  userId: string | null
  setFamily: (familyId: string, babyId: string) => void
  selectBaby: (babyId: string) => void
  setUserId: (userId: string | null) => void
}

function bootstrapId(key: string): string {
  const existing = readLocal(key)
  if (existing) return existing
  const created = newId()
  writeLocal(key, created)
  return created
}

export const useSession = create<SessionState>((set) => ({
  familyId: bootstrapId(StorageKeys.familyId),
  babyId: bootstrapId(StorageKeys.babyId),
  userId: null,
  setFamily: (familyId, babyId) => {
    writeLocal(StorageKeys.familyId, familyId)
    writeLocal(StorageKeys.babyId, babyId)
    set({ familyId, babyId })
  },
  selectBaby: (babyId) => {
    writeLocal(StorageKeys.babyId, babyId)
    set({ babyId })
  },
  setUserId: (userId) => set({ userId }),
}))

export function clearSessionIds(): void {
  removeLocal(StorageKeys.familyId)
  removeLocal(StorageKeys.babyId)
}
