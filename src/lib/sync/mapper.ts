import type { CareEvent } from '@/lib/db/types'

/**
 * The single boundary between local (epoch ms, camelCase) and remote
 * (timestamptz, snake_case) shapes. Nothing else converts timestamps.
 */

export interface RemoteCareEvent {
  id: string
  family_id: string
  baby_id: string
  kind: CareEvent['kind']
  started_at: string
  ended_at: string | null
  last_side: CareEvent['lastSide']
  left_seconds: number | null
  right_seconds: number | null
  amount_ml: number | string | null
  bottle_content: CareEvent['bottleContent']
  left_ml: number | string | null
  right_ml: number | string | null
  diaper_type: CareEvent['diaperType']
  note: string | null
  created_by: string | null
  updated_at: string
  server_updated_at?: string
  deleted_at: string | null
}

const toIso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString()

const toMs = (iso: string | null): number | null =>
  iso === null ? null : new Date(iso).getTime()

/** Postgres numeric arrives as a string to preserve precision. */
const toNum = (v: number | string | null): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v)

export function toRemote(e: CareEvent): RemoteCareEvent {
  return {
    id: e.id,
    family_id: e.familyId,
    baby_id: e.babyId,
    kind: e.kind,
    started_at: new Date(e.startedAt).toISOString(),
    ended_at: toIso(e.endedAt),
    last_side: e.lastSide,
    left_seconds: e.leftSeconds,
    right_seconds: e.rightSeconds,
    amount_ml: e.amountMl,
    bottle_content: e.bottleContent,
    left_ml: e.leftMl,
    right_ml: e.rightMl,
    diaper_type: e.diaperType,
    note: e.note,
    created_by: e.createdBy,
    updated_at: new Date(e.updatedAt).toISOString(),
    deleted_at: toIso(e.deletedAt),
  }
}

export function fromRemote(r: RemoteCareEvent): CareEvent {
  return {
    id: r.id,
    familyId: r.family_id,
    babyId: r.baby_id,
    kind: r.kind,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: toMs(r.ended_at),
    lastSide: r.last_side,
    leftSeconds: r.left_seconds,
    rightSeconds: r.right_seconds,
    amountMl: toNum(r.amount_ml),
    bottleContent: r.bottle_content,
    leftMl: toNum(r.left_ml),
    rightMl: toNum(r.right_ml),
    diaperType: r.diaper_type,
    note: r.note,
    createdBy: r.created_by,
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: toMs(r.deleted_at),
  }
}
