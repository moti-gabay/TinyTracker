import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useBabies } from '@/lib/db/babies'
import { Segmented } from '@/components/ui/Segmented'
import { useSession } from '@/lib/session'
import { formatClock, formatDuration } from '@/lib/time/format'
import { formatVolume } from '@/lib/units/volume'
import { localeOf, t, useT } from '@/lib/i18n'
import type { Key } from '@/lib/i18n/en'
import { EditEventSheet } from './EditEventSheet'
import { recentEvents, type HistoryCategory } from './historyQuery'
import type { CareEvent } from '@/lib/db/types'

const CATEGORIES: { value: HistoryCategory; label: Key }[] = [
  { value: 'all', label: 'history.tab.all' },
  { value: 'feeding', label: 'history.tab.feeding' },
  { value: 'pump', label: 'history.tab.pump' },
  { value: 'diaper', label: 'history.tab.diaper' },
]

const EMPTY: Record<HistoryCategory, Key> = {
  all: 'history.empty.all',
  feeding: 'history.empty.feeding',
  pump: 'history.empty.pump',
  diaper: 'history.empty.diaper',
}

function describe(e: CareEvent): { title: string; detail: string } {
  switch (e.kind) {
    case 'nursing': {
      const total = (e.leftSeconds ?? 0) + (e.rightSeconds ?? 0)
      return {
        title: t('history.nursing', {
          side: t(e.lastSide === 'left' ? 'common.left' : 'common.right'),
        }),
        detail: t('history.lrDetail', {
          total: formatDuration(total * 1000),
          l: formatDuration((e.leftSeconds ?? 0) * 1000),
          r: formatDuration((e.rightSeconds ?? 0) * 1000),
        }),
      }
    }
    case 'bottle':
      return {
        title: t('history.bottle'),
        detail: `${formatVolume(e.amountMl ?? 0)}${e.bottleContent === 'formula' ? t('history.bottleFormula') : e.bottleContent === 'mixed' ? t('history.bottleMixed') : ''}`,
      }
    case 'pump':
      return {
        title: t('history.pumping'),
        detail: t('history.lrDetail', {
          total: formatVolume((e.leftMl ?? 0) + (e.rightMl ?? 0)),
          l: formatVolume(e.leftMl ?? 0),
          r: formatVolume(e.rightMl ?? 0),
        }),
      }
    case 'diaper':
      return {
        title: t('history.diaper'),
        detail: t(
          e.diaperType === 'both' ? 'diaper.wetDirty' : e.diaperType === 'wet' ? 'diaper.wet' : 'diaper.dirty',
        ),
      }
  }
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const yday = new Date(today)
  yday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return t('history.today')
  if (same(d, yday)) return t('history.yesterday')
  return d.toLocaleDateString(localeOf(), { weekday: 'short', month: 'short', day: 'numeric' })
}

export function HistoryScreen() {
  const familyId = useSession((s) => s.familyId)
  const babies = useBabies(familyId)
  const [selected, setSelected] = useState<CareEvent | null>(null)
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState<HistoryCategory>('all')
  const tt = useT()

  const twins = babies.length > 1
  // 'all' keeps the family index; a child uses the per-baby one. Every
  // category is a covering range scan, so nothing filters kinds in memory.
  const events = useLiveQuery(
    () => recentEvents(filter === 'all' ? { familyId } : { babyId: filter }, category),
    [familyId, filter, category],
  )

  const picker = (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <Segmented
        value={category}
        onChange={setCategory}
        options={CATEGORIES.map((c) => ({ value: c.value, label: tt(c.label) }))}
      />
      {twins && (
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: tt('history.tab.all') },
            ...babies.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      )}
    </div>
  )

  // Only worth naming the child when both are on screen at once.
  const nameFor = (id: string) =>
    twins && filter === 'all' ? babies.find((b) => b.id === id)?.name : undefined

  if (events === undefined) {
    return (
      <>
        {picker}
        <div className="p-6 text-center text-text-muted">{tt('common.loading')}</div>
      </>
    )
  }
  if (events.length === 0) {
    return (
      <>
        {picker}
        <div className="p-6 text-center text-text-muted">{tt(EMPTY[category])}</div>
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
                    className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2"
                  >
                    <span className="w-12 shrink-0 text-sm tabular-nums text-text-muted">
                      {formatClock(e.startedAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">
                        {who ? tt('history.who', { name: who, title }) : title}
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
