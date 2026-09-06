export type Side = 'left' | 'right'
export type EventKind = 'nursing' | 'bottle' | 'pump' | 'diaper'
export type BottleContent = 'formula' | 'breast_milk' | 'mixed'
export type DiaperType = 'wet' | 'dirty' | 'both'

/**
 * One row per logged care event, mirroring `public.care_events`.
 *
 * A single table (rather than one per kind) keeps the sync engine to exactly
 * one code path: one outbox, one cursor, one realtime channel, one LWW rule.
 *
 * Timestamps are epoch milliseconds locally and timestamptz on the server;
 * the mapper in lib/sync/mapper.ts is the only place that converts.
 */
export interface CareEvent {
  id: string
  familyId: string
  babyId: string
  kind: EventKind

  startedAt: number
  endedAt: number | null

  // nursing
  lastSide: Side | null
  leftSeconds: number | null
  rightSeconds: number | null

  // bottle
  amountMl: number | null
  bottleContent: BottleContent | null

  // pump
  leftMl: number | null
  rightMl: number | null

  // diaper
  diaperType: DiaperType | null

  note: string | null
  createdBy: string | null

  /** Client clock. The sole input to last-writer-wins conflict resolution. */
  updatedAt: number
  /** Soft delete. Tombstones replicate so a delete reaches every device. */
  deletedAt: number | null
}

export type OutboxOp = 'upsert'

export interface OutboxItem {
  seq?: number
  eventId: string
  op: OutboxOp
  createdAt: number
  attempts: number
  lastError: string | null
  /** Set once the server rejects us non-retryably. Surfaced in Settings. */
  dead: 0 | 1
}

export interface MetaRow {
  key: string
  value: string
}
