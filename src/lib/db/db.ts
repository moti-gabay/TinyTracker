import Dexie, { type EntityTable } from 'dexie'
import type { Baby, CareEvent, MetaRow, OutboxItem } from './types'

/**
 * The local database is the app's source of truth. Every screen reads from
 * here and every write lands here first, so "offline" is not a special mode --
 * it is just the normal path with the sync engine idle.
 */
class TinyTrackerDB extends Dexie {
  events!: EntityTable<CareEvent, 'id'>
  outbox!: EntityTable<OutboxItem, 'seq'>
  meta!: EntityTable<MetaRow, 'key'>
  babies!: EntityTable<Baby, 'id'>

  constructor() {
    super('tinytracker')
    this.version(1).stores({
      events: '&id, familyId, kind, updatedAt, [familyId+startedAt]',
      outbox: '++seq, eventId, dead',
      meta: '&key',
    })
    // v2 adds twins. Every existing row already carries a babyId, so Dexie
    // just builds the new index -- no data upgrade is needed. [familyId+...]
    // stays because History still shows both children together.
    this.version(2).stores({
      events:
        '&id, familyId, kind, updatedAt, [familyId+startedAt], [babyId+startedAt]',
      outbox: '++seq, eventId, dead',
      meta: '&key',
      babies: '&id, familyId',
    })
    // v3 adds History's category tabs. [scope+kind+startedAt] keeps a
    // "Pumping" tab a bounded range scan instead of cursoring through every
    // feed to find the few pumps. Rows already carry `kind`: index only.
    this.version(3).stores({
      events:
        '&id, familyId, kind, updatedAt, [familyId+startedAt], [babyId+startedAt], [familyId+kind+startedAt], [babyId+kind+startedAt]',
      outbox: '++seq, eventId, dead',
      meta: '&key',
      babies: '&id, familyId',
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
  await db.transaction('rw', db.events, db.outbox, db.meta, db.babies, async () => {
    await db.events.clear()
    await db.outbox.clear()
    await db.meta.clear()
    await db.babies.clear()
  })
}
