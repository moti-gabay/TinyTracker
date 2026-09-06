import { db } from '@/lib/db/db'
import type { CareEvent } from '@/lib/db/types'
import { fromRemote, type RemoteCareEvent } from './mapper'

/**
 * Applies rows received from the server (pull or realtime) to the local store.
 *
 * Conflict rule: last-writer-wins on the CLIENT `updatedAt`, identical to the
 * server trigger. A row we already hold with an equal or newer stamp is kept,
 * so an in-flight local edit is never overwritten by an echo of its own
 * older version arriving over the realtime channel.
 */
export async function applyRemote(rows: RemoteCareEvent[]): Promise<number> {
  if (rows.length === 0) return 0

  const incoming = rows.map(fromRemote)
  let applied = 0

  await db.transaction('rw', db.events, async () => {
    const existing = await db.events.bulkGet(incoming.map((e) => e.id))
    const toWrite: CareEvent[] = []

    incoming.forEach((next, i) => {
      const current = existing[i]
      if (!current || next.updatedAt > current.updatedAt) {
        toWrite.push(next)
      }
    })

    if (toWrite.length > 0) {
      await db.events.bulkPut(toWrite)
      applied = toWrite.length
    }
  })

  return applied
}
