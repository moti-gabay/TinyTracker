import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '@/lib/db/db'
import { useSession } from '@/lib/session'
import { formatClock, formatDuration } from '@/lib/time/format'
import { formatVolume } from '@/lib/units/volume'
import { EditEventSheet } from './EditEventSheet'
import type { CareEvent } from '@/lib/db/types'

function describe(e: CareEvent): { title: string; detail: string } {
  switch (e.kind) {
    case 'nursing': {
      const total = (e.leftSeconds ?? 0) + (e.rightSeconds ?? 0)
      return {
        title: `Nursing · ${e.lastSide === 'left' ? 'Left' : 'Right'}`,
        detail: `${formatDuration(total * 1000)} (L ${formatDuration((e.leftSeconds ?? 0) * 1000)} · R ${formatDuration((e.rightSeconds ?? 0) * 1000)})`,
      }
    }
    case 'bottle':
      return {
        title: 'Bottle',
        detail: `${formatVolume(e.amountMl ?? 0)}${e.bottleContent === 'formula' ? ' · formula' : e.bottleContent === 'mixed' ? ' · mixed' : ''}`,
      }
    case 'pump':
      return {
        title: 'Pumping',
        detail: `${formatVolume((e.leftMl ?? 0) + (e.rightMl ?? 0))} (L ${formatVolume(e.leftMl ?? 0)} · R ${formatVolume(e.rightMl ?? 0)})`,
      }
    case 'diaper':
      return {
        title: 'Diaper',
        detail: e.diaperType === 'both' ? 'Wet + dirty' : e.diaperType === 'wet' ? 'Wet' : 'Dirty',
      }
  }
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const yday = new Date(today)
  yday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function HistoryScreen() {
  const familyId = useSession((s) => s.familyId)
  const [selected, setSelected] = useState<CareEvent | null>(null)

  const events = useLiveQuery(
    () =>
      db.events
        .where('[familyId+startedAt]')
        .between([familyId, Dexie.minKey], [familyId, Dexie.maxKey])
        .reverse()
        .filter((e) => e.deletedAt === null)
        .limit(200)
        .toArray(),
    [familyId],
  )

  if (events === undefined) {
    return <div className="p-6 text-center text-text-muted">Loading…</div>
  }
  if (events.length === 0) {
    return <div className="p-6 text-center text-text-muted">No logs yet.</div>
  }

  // Group into days up front so rendering stays a pure map over the result.
  const groups: { day: string; items: CareEvent[] }[] = []
  for (const e of events) {
    const day = dayLabel(e.startedAt)
    const current = groups[groups.length - 1]
    if (current && current.day === day) current.items.push(e)
    else groups.push({ day, items: [e] })
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.day}>
          <h2 className="bg-surface-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {group.day}
          </h2>
          <ul className="divide-y divide-border">
            {group.items.map((e) => {
              const { title, detail } = describe(e)
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                  >
                    <span className="w-12 shrink-0 text-sm tabular-nums text-text-muted">
                      {formatClock(e.startedAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">
                        {title}
                      </span>
                      <span className="block truncate text-sm text-text-muted">
                        {detail}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <EditEventSheet event={selected} onClose={() => setSelected(null)} />
    </>
  )
}
