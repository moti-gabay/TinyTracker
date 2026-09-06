import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/db'
import { saveDiaper, saveNursing, deleteEvent, updateEvent } from '@/lib/db/repo'
import { applyRemote } from './applyRemote'
import { fromRemote, toRemote, type RemoteCareEvent } from './mapper'
import type { CareEvent } from '@/lib/db/types'

const FAMILY = 'fam-1'
const BABY = 'baby-1'
const T0 = 1_700_000_000_000

function remote(over: Partial<RemoteCareEvent> = {}): RemoteCareEvent {
  return {
    id: 'evt-1',
    family_id: FAMILY,
    baby_id: BABY,
    kind: 'nursing',
    started_at: new Date(T0).toISOString(),
    ended_at: new Date(T0 + 600_000).toISOString(),
    last_side: 'left',
    left_seconds: 600,
    right_seconds: 0,
    amount_ml: null,
    bottle_content: null,
    left_ml: null,
    right_ml: null,
    diaper_type: null,
    note: null,
    created_by: 'user-a',
    updated_at: new Date(T0 + 600_000).toISOString(),
    deleted_at: null,
    ...over,
  }
}

beforeEach(async () => {
  await db.events.clear()
  await db.outbox.clear()
  await db.meta.clear()
})

describe('mapper round-trip', () => {
  it('preserves an event through remote and back', () => {
    const back = fromRemote(remote())
    expect(back.startedAt).toBe(T0)
    expect(back.leftSeconds).toBe(600)
    expect(back.familyId).toBe(FAMILY)
    expect(back.deletedAt).toBeNull()
    expect(toRemote(back).started_at).toBe(new Date(T0).toISOString())
  })

  it('coerces postgres numeric strings to numbers', () => {
    const back = fromRemote(remote({ kind: 'bottle', amount_ml: '120.5', last_side: null, left_seconds: null, right_seconds: null }))
    expect(back.amountMl).toBe(120.5)
    expect(typeof back.amountMl).toBe('number')
  })
})

describe('local writes always queue an outbox entry', () => {
  it('writes event and outbox atomically', async () => {
    await saveDiaper({ familyId: FAMILY, babyId: BABY, createdBy: null, diaperType: 'wet' })
    expect(await db.events.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })

  it('queues an entry for an edit and for a delete', async () => {
    const e = await saveNursing({
      familyId: FAMILY, babyId: BABY, createdBy: null,
      startedAt: T0, endedAt: T0 + 600_000,
      lastSide: 'left', leftSeconds: 600, rightSeconds: 0,
    })
    await updateEvent(e.id, { leftSeconds: 700 })
    await deleteEvent(e.id)

    expect(await db.outbox.count()).toBe(3)
    const stored = await db.events.get(e.id)
    expect(stored?.leftSeconds).toBe(700)
    // Soft delete: the row survives as a tombstone.
    expect(stored?.deletedAt).not.toBeNull()
  })
})

describe('applyRemote conflict resolution', () => {
  it('inserts a row we have never seen', async () => {
    expect(await applyRemote([remote()])).toBe(1)
    expect((await db.events.get('evt-1'))?.leftSeconds).toBe(600)
  })

  it('applies a strictly newer remote row', async () => {
    await applyRemote([remote()])
    const applied = await applyRemote([
      remote({ left_seconds: 999, updated_at: new Date(T0 + 900_000).toISOString() }),
    ])
    expect(applied).toBe(1)
    expect((await db.events.get('evt-1'))?.leftSeconds).toBe(999)
  })

  it('IGNORES a stale remote row, protecting a newer local edit', async () => {
    // Local edit made just now.
    await applyRemote([remote()])
    await updateEvent('evt-1', { leftSeconds: 777 })
    const localAfterEdit = await db.events.get('evt-1')

    // An old echo of the row arrives over realtime.
    const applied = await applyRemote([
      remote({ left_seconds: 111, updated_at: new Date(T0).toISOString() }),
    ])

    expect(applied).toBe(0)
    expect((await db.events.get('evt-1'))?.leftSeconds).toBe(777)
    expect((await db.events.get('evt-1'))?.updatedAt).toBe(localAfterEdit!.updatedAt)
  })

  it('ignores an equal-timestamp echo of our own write', async () => {
    await applyRemote([remote()])
    const before = await db.events.get('evt-1')
    const applied = await applyRemote([remote()])
    expect(applied).toBe(0)
    expect(await db.events.get('evt-1')).toEqual(before)
  })

  it('applies a tombstone so a peer delete propagates', async () => {
    await applyRemote([remote()])
    await applyRemote([
      remote({
        deleted_at: new Date(T0 + 900_000).toISOString(),
        updated_at: new Date(T0 + 900_000).toISOString(),
      }),
    ])
    const row = await db.events.get('evt-1')
    expect(row?.deletedAt).not.toBeNull()
    // The row is retained locally; screens filter tombstones out.
    expect(row).toBeDefined()
  })

  it('handles a mixed batch, applying only the newer rows', async () => {
    await applyRemote([remote({ id: 'a' }), remote({ id: 'b' })])
    await updateEvent('b', { leftSeconds: 888 })

    const applied = await applyRemote([
      remote({ id: 'a', left_seconds: 42, updated_at: new Date(T0 + 900_000).toISOString() }),
      remote({ id: 'b', left_seconds: 1, updated_at: new Date(T0).toISOString() }),
    ])

    expect(applied).toBe(1)
    expect((await db.events.get('a'))?.leftSeconds).toBe(42)
    expect((await db.events.get('b'))?.leftSeconds).toBe(888)
  })

  it('is a no-op on an empty batch', async () => {
    expect(await applyRemote([])).toBe(0)
  })
})

describe('offline durability', () => {
  it('retains every write made with no network, in order', async () => {
    for (let i = 0; i < 5; i++) {
      await saveDiaper({
        familyId: FAMILY, babyId: BABY, createdBy: null,
        startedAt: T0 + i * 1000, diaperType: 'wet',
      })
    }
    const outbox = await db.outbox.orderBy('seq').toArray()
    expect(outbox).toHaveLength(5)
    expect(await db.events.count()).toBe(5)

    const events = (await db.events.toArray()) as CareEvent[]
    expect(events.every((e) => e.deletedAt === null)).toBe(true)
  })
})
