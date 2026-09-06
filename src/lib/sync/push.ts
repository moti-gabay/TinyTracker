import { db } from '@/lib/db/db'
import { supabase } from '@/lib/supabase/client'
import { toRemote } from './mapper'

/**
 * Drains the outbox to the server, in order.
 *
 * Ordering matters: an event's create and a later edit of it must not race.
 * FIFO by autoincrement `seq` guarantees the server sees them in the order
 * the parent performed them.
 */

const MAX_ATTEMPTS = 5
const BATCH = 50

let inFlight: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1000

/** Non-retryable: the payload is wrong, so retrying forever cannot help. */
function isPermanent(code: string | undefined): boolean {
  if (!code) return false
  // 23xxx integrity violation, 42501 RLS/permission denied, 22xxx data error.
  return code.startsWith('23') || code.startsWith('22') || code === '42501'
}

export async function pushOutbox(): Promise<void> {
  if (!supabase) return
  // Coalesce concurrent callers onto one drain.
  if (inFlight) return inFlight
  inFlight = drain().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function drain(): Promise<void> {
  if (!supabase || !navigator.onLine) return

  for (;;) {
    const batch = await db.outbox.where('dead').equals(0).limit(BATCH).toArray()
    if (batch.length === 0) {
      backoffMs = 1000
      return
    }

    const ids = batch.map((b) => b.eventId)
    const events = await db.events.bulkGet(ids)
    const payload = events.filter((e) => e !== undefined).map(toRemote)

    if (payload.length === 0) {
      // The events were wiped (sign-out) while queued; drop the stale entries.
      await db.outbox.bulkDelete(batch.map((b) => b.seq!))
      continue
    }

    const { error } = await supabase.from('care_events').upsert(payload, {
      onConflict: 'id',
    })

    if (!error) {
      await db.outbox.bulkDelete(batch.map((b) => b.seq!))
      backoffMs = 1000
      continue
    }

    const permanent = isPermanent(error.code)
    await db.transaction('rw', db.outbox, async () => {
      for (const item of batch) {
        const attempts = item.attempts + 1
        const dead = permanent || attempts >= MAX_ATTEMPTS ? 1 : 0
        await db.outbox.update(item.seq!, {
          attempts,
          lastError: error.message,
          dead,
        })
      }
    })

    if (permanent) continue // move on; the dead rows are surfaced in Settings
    scheduleRetry()
    return
  }
}

function scheduleRetry() {
  if (retryTimer) return
  const delay = backoffMs
  backoffMs = Math.min(backoffMs * 2, 60_000)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void pushOutbox()
  }, delay)
}

/** Count of writes the server refused. Surfaced so nothing fails silently. */
export function deadLetterCount(): Promise<number> {
  return db.outbox.where('dead').equals(1).count()
}
