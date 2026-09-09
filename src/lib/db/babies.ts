import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useSession } from '@/lib/session'
import type { Baby } from './types'

/**
 * The local mirror of `public.babies`.
 *
 * Dexie is the single source the UI reads, exactly as it is for events -- so a
 * child switcher keeps working with the network off, and there is no second
 * copy of the list in zustand to drift.
 */
export function useBabies(familyId: string): Baby[] {
  return (
    useLiveQuery(() => db.babies.where('familyId').equals(familyId).toArray(), [
      familyId,
    ]) ?? []
  )
}

/**
 * Replace this family's babies with what the server just returned.
 *
 * Replace rather than merge: the server list is authoritative and tiny, so a
 * cursor and a conflict rule would be machinery with nothing to do. An empty
 * fetch is ignored -- that is a failed request, not a family with no children.
 */
export async function mirrorBabies(familyId: string, rows: Baby[]): Promise<void> {
  if (rows.length === 0) return
  await db.transaction('rw', db.babies, async () => {
    await db.babies.where('familyId').equals(familyId).delete()
    await db.babies.bulkPut(rows)
  })
  // A child that was renamed keeps its id; one that was removed server-side
  // would otherwise leave new logs pointing at a baby_id the FK rejects.
  const { babyId, selectBaby } = useSession.getState()
  if (!rows.some((b) => b.id === babyId)) selectBaby(rows[0].id)
}
