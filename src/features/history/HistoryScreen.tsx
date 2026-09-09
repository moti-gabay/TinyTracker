import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '@/lib/db/db'
import { useBabies } from '@/lib/db/babies'
import { Segmented } from '@/components/ui/Segmented'
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
  const babies = useBabies(familyId)
  const [selected, setSelected] = useState<CareEvent | null>(null)
  const [filter, setFilter] = useState('all')

  const twins = babies.length > 1
  // 'all' keeps the family index; a child uses the per-baby one. Both are
  // covering, so neither filters in memory.
  const events = useLiveQuery(
    () =>
      (filter === 'all'
        ? db.events
            .where('[familyId+startedAt]')
            .between([familyId, Dexie.minKey], [familyId, Dexie.maxKey])
        : db.events
            .where('[babyId+startedAt]')
            .between([filter, Dexie.minKey], [filter, Dexie.maxKey])
      )
        .reverse()
        .filter((e) => e.deletedAt === null)
        .limit(200)
        .toArray(),
    [familyId, filter],
  )

  const picker = twins ? (
    <div className="border-b border-border p-3">
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          ...babies.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />
    </div>
  ) : null

  // Only worth naming the child when both are on screen at once.
  const nameFor = (id: string) =>
    twins && filter === 'all' ? babies.find((b) => b.id === id)?.name : undefined

  if (events === undefined) {
    return (
      <>
        {picker}
        <div className="p-6 text-center text-text-muted">Loading…</div>
      </>
    )
  }
  if (events.length === 0) {
    return (
      <>
        {picker}
        <div className="p-6 text-center text-text-muted">No logs yet.</div>
      </>
    )
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
      {picker}
      {groups.map((group) => (
        <section key={group.day}>
          <h2 className="bg-surface-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {group.day}
          </h2>
          <ul className="divide-y divide-border">
            {group.items.map((e) => {
              const { title, detail } = describe(e)
              const who = nameFor(e.babyId)
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
                        {who ? `${who} · ${title}` : title}
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
