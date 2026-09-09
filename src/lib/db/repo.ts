import { db } from './db'
import type {
  BottleContent,
  CareEvent,
  DiaperType,
  EventKind,
  Side,
} from './types'

/**
 * The ONLY module that writes care events.
 *
 * Every write is a single Dexie transaction over (events, outbox) so a log can
 * never exist locally without a queued push, and can never be queued without
 * existing locally. That invariant is what makes "zero data loss" true.
 */

export function newId(): string {
  // randomUUID needs a secure context; dev over plain http on a LAN IP is not.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Fields the caller supplies; the rest are defaulted to null. */
type EventInput = Partial<
  Pick<
    CareEvent,
    | 'id'
    | 'endedAt'
    | 'lastSide'
    | 'leftSeconds'
    | 'rightSeconds'
    | 'amountMl'
    | 'bottleContent'
    | 'leftMl'
    | 'rightMl'
    | 'diaperType'
    | 'note'
    | 'createdBy'
  >
> & {
  familyId: string
  babyId: string
  kind: EventKind
  /** Defaults to now. The repo owns the clock so screens stay pure. */
  startedAt?: number
}

function materialize(input: EventInput): CareEvent {
  return {
    id: input.id ?? newId(),
    familyId: input.familyId,
    babyId: input.babyId,
    kind: input.kind,
    startedAt: input.startedAt ?? Date.now(),
    endedAt: input.endedAt ?? null,
    lastSide: input.lastSide ?? null,
    leftSeconds: input.leftSeconds ?? null,
    rightSeconds: input.rightSeconds ?? null,
    amountMl: input.amountMl ?? null,
    bottleContent: input.bottleContent ?? null,
    leftMl: input.leftMl ?? null,
    rightMl: input.rightMl ?? null,
    diaperType: input.diaperType ?? null,
    note: input.note ?? null,
    createdBy: input.createdBy ?? null,
    updatedAt: Date.now(),
    deletedAt: null,
  }
}

/** Notified after every local mutation so the sync engine can push promptly. */
type ChangeListener = () => void
const changeListeners = new Set<ChangeListener>()

export function onLocalChange(fn: ChangeListener): () => void {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

function notify() {
  for (const fn of changeListeners) fn()
}

async function writeAndQueue(event: CareEvent): Promise<CareEvent> {
  await db.transaction('rw', db.events, db.outbox, async () => {
    await db.events.put(event)
    await db.outbox.add({
      eventId: event.id,
      op: 'upsert',
      createdAt: Date.now(),
      attempts: 0,
      lastError: null,
      dead: 0,
    })
  })
  notify()
  return event
}

export async function saveEvent(input: EventInput): Promise<CareEvent> {
  return writeAndQueue(materialize(input))
}

/** Partial edit from the history screen. Bumps updatedAt for LWW. */
export async function updateEvent(
  id: string,
  patch: Partial<Omit<CareEvent, 'id' | 'familyId' | 'updatedAt'>>,
): Promise<CareEvent | null> {
  const existing = await db.events.get(id)
  if (!existing) return null
  return writeAndQueue({ ...existing, ...patch, updatedAt: Date.now() })
}

/** Soft delete. The tombstone replicates so the row disappears everywhere. */
export async function deleteEvent(id: string): Promise<void> {
  const existing = await db.events.get(id)
  if (!existing) return
  const now = Date.now()
  await writeAndQueue({ ...existing, deletedAt: now, updatedAt: now })
}

/**
 * Re-point events logged before a family existed, then re-queue them.
 *
 * Lives here rather than in the family screen because it writes both events
 * and outbox, and that pairing is this module's invariant to keep.
 */
export async function adoptOrphans(
  localFamilyId: string,
  familyId: string,
  babyId: string,
): Promise<number> {
  if (familyId === localFamilyId) return 0
  const orphans = await db.events.where('familyId').equals(localFamilyId).toArray()
  if (orphans.length === 0) return 0
  const now = Date.now()
  await db.transaction('rw', db.events, db.outbox, async () => {
    for (const e of orphans) {
      await db.events.put({ ...e, familyId, babyId, updatedAt: now })
      await db.outbox.add({
        eventId: e.id,
        op: 'upsert',
        createdAt: now,
        attempts: 0,
        lastError: null,
        dead: 0,
      })
    }
  })
  notify()
  return orphans.length
}

// -- Convenience constructors used by the feature screens -------------------

export function saveNursing(args: {
  familyId: string
  babyId: string
  createdBy: string | null
  startedAt?: number
  endedAt: number
  lastSide: Side
  leftSeconds: number
  rightSeconds: number
  id?: string
}) {
  return saveEvent({ ...args, kind: 'nursing' })
}

export function saveBottle(args: {
  familyId: string
  babyId: string
  createdBy: string | null
  startedAt?: number
  amountMl: number
  bottleContent: BottleContent
}) {
  return saveEvent({ ...args, kind: 'bottle' })
}

export function savePump(args: {
  familyId: string
  babyId: string
  createdBy: string | null
  startedAt?: number
  endedAt: number | null
  leftMl: number
  rightMl: number
}) {
  return saveEvent({ ...args, kind: 'pump' })
}

export function saveDiaper(args: {
  familyId: string
  babyId: string
  createdBy: string | null
  startedAt?: number
  diaperType: DiaperType
}) {
  return saveEvent({ ...args, kind: 'diaper' })
}
