import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { NumberStepper } from '@/components/ui/NumberStepper'
import { useToast } from '@/components/ui/useToast'
import { deleteEvent, updateEvent } from '@/lib/db/repo'
import { formatVolume, getUnit, stepMl } from '@/lib/units/volume'
import type { CareEvent } from '@/lib/db/types'

/** `2026-09-06T02:14` in LOCAL time, which is what datetime-local expects. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Corrects a past entry.
 *
 * The common case is not a typo: it is "I fed her at 2 but only logged it at
 * 4", so the start time is the first and largest control.
 */
export function EditEventSheet({
  event,
  onClose,
}: {
  event: CareEvent | null
  onClose: () => void
}) {
  const unit = getUnit()
  const showToast = useToast((s) => s.show)
  const [startedAt, setStartedAt] = useState('')
  const [amountMl, setAmountMl] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [key, setKey] = useState('')

  // Re-seed the form when a different entry is opened.
  if (event && key !== event.id) {
    setKey(event.id)
    setStartedAt(toLocalInput(event.startedAt))
    setAmountMl(event.amountMl ?? 0)
    setConfirmDelete(false)
  }

  if (!event) return null

  const isBottle = event.kind === 'bottle'

  const save = async () => {
    const parsed = new Date(startedAt).getTime()
    if (Number.isNaN(parsed)) {
      showToast('That time is not valid')
      return
    }
    await updateEvent(event.id, {
      startedAt: parsed,
      ...(isBottle ? { amountMl } : {}),
    })
    showToast('Entry updated')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Edit entry">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-text-muted">Started at</span>
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text"
          />
        </label>

        {isBottle && (
          <NumberStepper
            value={amountMl}
            onChange={setAmountMl}
            step={stepMl(unit)}
            max={1000}
            label="Amount"
            format={(v) => formatVolume(v, unit)}
          />
        )}

        <Button variant="primary" className="h-14" onClick={save}>
          Save changes
        </Button>

        {confirmDelete ? (
          <Button
            variant="danger"
            className="h-12"
            onClick={async () => {
              await deleteEvent(event.id)
              showToast('Entry deleted')
              onClose()
            }}
          >
            Tap again to confirm delete
          </Button>
        ) : (
          <Button
            variant="danger"
            className="h-12"
            onClick={() => setConfirmDelete(true)}
          >
            Delete entry
          </Button>
        )}

        <Button variant="secondary" className="h-12" onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  )
}
