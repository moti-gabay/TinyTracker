import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/db'
import { deleteEvent, saveEvent } from '@/lib/db/repo'
import type { EventKind } from '@/lib/db/types'
import { recentEvents } from './historyQuery'

const FAMILY = 'fam-1'
const T0 = 1_700_000_000_000

function log(kind: EventKind, offsetSec: number, babyId = 'a') {
  return saveEvent({ familyId: FAMILY, babyId, kind, startedAt: T0 + offsetSec * 1000 })
}

beforeEach(async () => {
  await db.events.clear()
  await db.outbox.clear()
})

describe('recentEvents', () => {
  it('"all" returns every kind newest-first', async () => {
    await log('nursing', 0)
    await log('pump', 1)
    await log('diaper', 2)

    const rows = await recentEvents({ familyId: FAMILY }, 'all')
    expect(rows.map((e) => e.kind)).toEqual(['diaper', 'pump', 'nursing'])
  })

  it('"feeding" merges nursing and bottle in time order and excludes the rest', async () => {
    await log('nursing', 0)
    await log('pump', 1)
    await log('bottle', 2)
    await log('diaper', 3)
    await log('nursing', 4)

    const rows = await recentEvents({ familyId: FAMILY }, 'feeding')
    expect(rows.map((e) => [e.kind, e.startedAt - T0])).toEqual([
      ['nursing', 4000],
      ['bottle', 2000],
      ['nursing', 0],
    ])
  })

  it('single-kind tabs return only that kind', async () => {
    await log('pump', 0)
    await log('diaper', 1)
    await log('pump', 2)

    expect((await recentEvents({ familyId: FAMILY }, 'pump')).map((e) => e.kind)).toEqual([
      'pump',
      'pump',
    ])
    expect((await recentEvents({ familyId: FAMILY }, 'diaper'))).toHaveLength(1)
  })

  it('respects the limit across the feeding merge', async () => {
    for (let i = 0; i < 5; i++) await log('nursing', i)
    for (let i = 0; i < 5; i++) await log('bottle', 10 + i)

    const rows = await recentEvents({ familyId: FAMILY }, 'feeding', 4)
    // The four newest overall are all bottles; the merge must not interleave
    // by kind.
    expect(rows.map((e) => e.kind)).toEqual(['bottle', 'bottle', 'bottle', 'bottle'])
    expect(rows[0].startedAt - T0).toBe(14_000)
  })

  it('hides tombstones', async () => {
    const e = await log('diaper', 0)
    await log('diaper', 1)
    await deleteEvent(e.id)

    expect(await recentEvents({ familyId: FAMILY }, 'diaper')).toHaveLength(1)
  })

  it('scopes to one child when given a babyId', async () => {
    await log('bottle', 0, 'a')
    await log('bottle', 1, 'b')
    await log('diaper', 2, 'a')

    const rows = await recentEvents({ babyId: 'a' }, 'feeding')
    expect(rows).toHaveLength(1)
    expect(rows[0].babyId).toBe('a')
    expect(await recentEvents({ babyId: 'b' }, 'all')).toHaveLength(1)
  })
})
