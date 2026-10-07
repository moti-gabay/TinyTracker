import Dexie from 'dexie'
import { db } from '@/lib/db/db'
import type { CareEvent, EventKind } from '@/lib/db/types'

export type HistoryCategory = 'all' | 'feeding' | 'pump' | 'diaper'

export const CATEGORY_KINDS: Record<Exclude<HistoryCategory, 'all'>, EventKind[]> = {
  feeding: ['nursing', 'bottle'],
  pump: ['pump'],
  diaper: ['diaper'],
}

/** Either the whole family (History "All") or one child (the twins picker). */
export type HistoryScope = { familyId: string } | { babyId: string }

function byKind(scope: HistoryScope, kind: EventKind, limit: number) {
  const [index, id] =
    'babyId' in scope
      ? (['[babyId+kind+startedAt]', scope.babyId] as const)
      : (['[familyId+kind+startedAt]', scope.familyId] as const)
  return db.events
    .where(index)
    .between([id, kind, Dexie.minKey], [id, kind, Dexie.maxKey])
    .reverse()
    .filter((e) => e.deletedAt === null)
    .limit(limit)
    .toArray()
}

/**
 * Newest-first rows for one History tab. Every branch is a covering range
 * scan; only tombstones are filtered in memory.
 *
 * "Feeding" spans two kinds, so it runs one scan per kind and merges. The
 * awaits are sequential on purpose: that is the pattern useLiveQuery already
 * tracks in useLastFeed, and two bounded scans cost nothing.
 */
export async function recentEvents(
  scope: HistoryScope,
  category: HistoryCategory,
  limit = 200,
): Promise<CareEvent[]> {
  if (category === 'all') {
    const [index, id] =
      'babyId' in scope
        ? (['[babyId+startedAt]', scope.babyId] as const)
        : (['[familyId+startedAt]', scope.familyId] as const)
    return db.events
      .where(index)
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .reverse()
      .filter((e) => e.deletedAt === null)
      .limit(limit)
      .toArray()
  }

  const kinds = CATEGORY_KINDS[category]
  if (kinds.length === 1) return byKind(scope, kinds[0], limit)

  const merged: CareEvent[] = []
  for (const kind of kinds) merged.push(...(await byKind(scope, kind, limit)))
  merged.sort((a, b) => b.startedAt - a.startedAt)
  return merged.slice(0, limit)
}
