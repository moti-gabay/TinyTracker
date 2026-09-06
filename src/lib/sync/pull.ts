import { getCursor, setCursor } from '@/lib/db/db'
import { supabase } from '@/lib/supabase/client'
import { applyRemote } from './applyRemote'
import type { RemoteCareEvent } from './mapper'

/**
 * Catch-up fetch of everything changed since our cursor.
 *
 * The cursor is the SERVER clock (`server_updated_at`), never the client's:
 * a device with a skewed clock would otherwise skip rows permanently.
 * Runs on boot, on reconnect, and whenever the realtime channel resubscribes
 * (which is exactly when we may have missed messages).
 */

const PAGE = 500

export async function pullSince(familyId: string): Promise<number> {
  if (!supabase || !navigator.onLine) return 0

  let cursor = (await getCursor(familyId)) ?? '1970-01-01T00:00:00Z'
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('care_events')
      .select('*')
      .eq('family_id', familyId)
      .gt('server_updated_at', cursor)
      .order('server_updated_at', { ascending: true })
      .limit(PAGE)

    if (error || !data || data.length === 0) return total

    const rows = data as RemoteCareEvent[]
    await applyRemote(rows)
    total += rows.length

    const newest = rows[rows.length - 1]?.server_updated_at
    if (!newest || newest === cursor) return total

    // Advance only after the rows are durably in IndexedDB, so a crash
    // mid-page re-fetches rather than skipping.
    cursor = newest
    await setCursor(familyId, cursor)

    if (rows.length < PAGE) return total
  }
}
