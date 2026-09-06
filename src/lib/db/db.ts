import Dexie, { type EntityTable } from 'dexie'
import type { CareEvent, MetaRow, OutboxItem } from './types'

/**
 * The local database is the app's source of truth. Every screen reads from
 * here and every write lands here first, so "offline" is not a special mode --
 * it is just the normal path with the sync engine idle.
 */
class TinyTrackerDB extends Dexie {
  events!: EntityTable<CareEvent, 'id'>
  outbox!: EntityTable<OutboxItem, 'seq'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('tinytracker')
    this.version(1).stores({
      events: '&id, familyId, kind, updatedAt, [familyId+startedAt]',
      outbox: '++seq, eventId, dead',
      meta: '&key',
    })
  }
}

export const db = new TinyTrackerDB()

const CURSOR_PREFIX = 'cursor:'

/** Pull cursor: the newest `server_updated_at` we have durably applied. */
export async function getCursor(familyId: string): Promise<string | null> {
  const row = await db.meta.get(CURSOR_PREFIX + familyId)
  return row?.value ?? null
}

export async function setCursor(familyId: string, value: string): Promise<void> {
  await db.meta.put({ key: CURSOR_PREFIX + familyId, value })
}

/** Sign-out / family switch. Wipes every trace of the previous family. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.events, db.outbox, db.meta, async () => {
    await db.events.clear()
    await db.outbox.clear()
    await db.meta.clear()
  })
}
