import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/db'
import type { CareEvent } from '@/lib/db/types'

/**
 * The most recent feed (nursing or bottle), for the status banner.
 *
 * Diapers and pumping are excluded on purpose: the banner answers exactly one
 * question, "when did the baby last eat", which drives the 2-3 hour cycle.
 *
 * Scoped to one child: with twins, a shared "last fed" would average two
 * schedules into a number that describes neither.
 */
export function useLastFeed(babyId: string): CareEvent | null | undefined {
  return useLiveQuery(async () => {
    const rows = await db.events
      .where('[babyId+startedAt]')
      .between([babyId, Dexie.minKey], [babyId, Dexie.maxKey])
      .reverse()
      .filter(
        (e) =>
          e.deletedAt === null && (e.kind === 'nursing' || e.kind === 'bottle'),
      )
      .limit(1)
      .toArray()
    return rows[0] ?? null
  }, [babyId])
}
