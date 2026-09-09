import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { mirrorBabies } from './babies'
import { adoptOrphans, saveDiaper } from './repo'
import { useSession } from '@/lib/session'
import type { Baby } from './types'

const FAMILY = 'fam-1'
const OTHER = 'fam-2'
const T0 = 1_700_000_000_000

const baby = (id: string, familyId = FAMILY): Baby => ({
  id,
  familyId,
  name: id,
  bornAt: null,
})

beforeEach(async () => {
  await db.events.clear()
  await db.outbox.clear()
  await db.babies.clear()
})

describe('mirrorBabies', () => {
  it('replaces the family rows rather than merging them', async () => {
    await mirrorBabies(FAMILY, [baby('a'), baby('b')])
    await mirrorBabies(FAMILY, [baby('a'), baby('c')])

    const ids = (await db.babies.where('familyId').equals(FAMILY).toArray())
      .map((b) => b.id)
      .sort()
    // 'b' was removed server-side, so it must not linger locally.
    expect(ids).toEqual(['a', 'c'])
  })

  it('leaves another family untouched', async () => {
    await mirrorBabies(OTHER, [baby('z', OTHER)])
    await mirrorBabies(FAMILY, [baby('a')])

    expect(await db.babies.where('familyId').equals(OTHER).count()).toBe(1)
  })

  it('ignores an empty list, which means a failed fetch not a childless family', async () => {
    await mirrorBabies(FAMILY, [baby('a')])
    await mirrorBabies(FAMILY, [])

    expect(await db.babies.count()).toBe(1)
  })

  it('re-selects the first child when the selected one is gone', async () => {
    useSession.getState().selectBaby('b')
    await mirrorBabies(FAMILY, [baby('a'), baby('c')])

    expect(useSession.getState().babyId).toBe('a')
  })

  it('keeps the selection when the selected child is still there', async () => {
    useSession.getState().selectBaby('c')
    await mirrorBabies(FAMILY, [baby('a'), baby('c')])

    expect(useSession.getState().babyId).toBe('c')
  })
})

describe('per-child queries', () => {
  it('returns only the requested child, newest first', async () => {
    await saveDiaper({
      familyId: FAMILY,
      babyId: 'a',
      createdBy: null,
      startedAt: T0,
      diaperType: 'wet',
    })
    await saveDiaper({
      familyId: FAMILY,
      babyId: 'b',
      createdBy: null,
      startedAt: T0 + 1000,
      diaperType: 'wet',
    })
    await saveDiaper({
      familyId: FAMILY,
      babyId: 'a',
      createdBy: null,
      startedAt: T0 + 2000,
      diaperType: 'dirty',
    })

    const rows = await db.events
      .where('[babyId+startedAt]')
      .between(['a', -Infinity], ['a', Infinity])
      .reverse()
      .toArray()

    expect(rows.map((e) => e.startedAt)).toEqual([T0 + 2000, T0])
    // The family index still sees both children, which is History's "All".
    expect(
      await db.events
        .where('[familyId+startedAt]')
        .between([FAMILY, -Infinity], [FAMILY, Infinity])
        .count(),
    ).toBe(3)
  })
})

describe('adoptOrphans', () => {
  it('re-points only the local family and queues one push each', async () => {
    await saveDiaper({
      familyId: 'local-fam',
      babyId: 'local-baby',
      createdBy: null,
      startedAt: T0,
      diaperType: 'wet',
    })
    await saveDiaper({
      familyId: OTHER,
      babyId: 'z',
      createdBy: null,
      startedAt: T0,
      diaperType: 'wet',
    })
    await db.outbox.clear()

    const moved = await adoptOrphans('local-fam', FAMILY, 'a')

    expect(moved).toBe(1)
    expect(await db.outbox.count()).toBe(1)
    const adopted = await db.events.where('familyId').equals(FAMILY).toArray()
    expect(adopted).toHaveLength(1)
    expect(adopted[0].babyId).toBe('a')
    // The other family's row is untouched, including its outbox silence.
    expect(await db.events.where('familyId').equals(OTHER).count()).toBe(1)
  })

  it('is a no-op when the local family is already the real one', async () => {
    await saveDiaper({
      familyId: FAMILY,
      babyId: 'a',
      createdBy: null,
      startedAt: T0,
      diaperType: 'wet',
    })
    await db.outbox.clear()

    expect(await adoptOrphans(FAMILY, FAMILY, 'a')).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
