import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { useBabies } from '@/lib/db/babies'
import { useSession } from '@/lib/session'
import { tap } from '@/lib/haptics'
import { useTimerStore } from '@/features/nursing/timerStore'

/**
 * Which child new logs are attributed to.
 *
 * Renders nothing for a family with one baby, so the single-child header is
 * byte-for-byte what it always was. With twins it is a pill in the persistent
 * header: no vertical space taken from the two big side buttons, and reachable
 * from every screen. Two children toggle on tap; three or more open a sheet.
 *
 * It is locked while a feed is running. The timer already captured its child
 * at START, so a switch could not corrupt the save -- but showing a name that
 * disagrees with the feed on screen is its own kind of wrong at 3 AM.
 */
export function BabyChip() {
  const familyId = useSession((s) => s.familyId)
  const babyId = useSession((s) => s.babyId)
  const selectBaby = useSession((s) => s.selectBaby)
  const babies = useBabies(familyId)
  const showToast = useToast((s) => s.show)
  const status = useTimerStore((s) => s.state.status)
  const [picking, setPicking] = useState(false)

  if (babies.length < 2) return null

  const current = babies.find((b) => b.id === babyId) ?? babies[0]
  const locked = status !== 'idle'

  const pick = (id: string) => {
    const next = babies.find((b) => b.id === id)
    if (!next) return
    tap()
    selectBaby(id)
    setPicking(false)
    showToast(`Now logging for ${next.name}`)
  }

  const onPress = () => {
    if (babies.length === 2) {
      pick(babies.find((b) => b.id !== current.id)!.id)
      return
    }
    setPicking(true)
  }

  return (
    <>
      <button
        onClick={onPress}
        disabled={locked}
        aria-label={`Logging for ${current.name}. Switch child.`}
        className="flex h-12 max-w-28 shrink-0 items-center rounded-full border border-border px-4 text-sm font-semibold text-text active:opacity-70 disabled:opacity-40"
      >
        <span className="truncate">{current.name}</span>
      </button>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Log for">
        <div className="flex flex-col gap-3">
          {babies.map((b) => (
            <Button
              key={b.id}
              variant={b.id === current.id ? 'primary' : 'secondary'}
              className="h-14"
              onClick={() => pick(b.id)}
            >
              {b.name}
            </Button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
