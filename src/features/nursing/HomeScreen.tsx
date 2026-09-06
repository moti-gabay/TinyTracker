import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useTimerStore } from './timerStore'
import { isRunning } from './timerMachine'
import { SideButton } from './SideButton'
import { TimerOverlay } from './TimerOverlay'
import { tap } from '@/lib/haptics'
import { useLastFeed } from '@/features/status/useLastFeed'
import { useSession } from '@/lib/session'
import type { Side } from '@/lib/db/types'

export function HomeScreen() {
  const state = useTimerStore((s) => s.state)
  const start = useTimerStore((s) => s.start)
  const familyId = useSession((s) => s.familyId)
  const lastFeed = useLastFeed(familyId)
  const [params, setParams] = useSearchParams()

  // PWA shortcut: /?start=left begins a feed straight from the home screen.
  const shortcut = params.get('start')
  useEffect(() => {
    if (shortcut !== 'left' && shortcut !== 'right') return
    if (!isRunning(state.status)) {
      tap()
      start(shortcut)
    }
    setParams({}, { replace: true })
  }, [shortcut, state.status, start, setParams])

  const onStart = (side: Side) => {
    tap()
    start(side)
  }

  // Nudge toward the side that was NOT fed last; that is the usual next side.
  const suggested: Side | null =
    lastFeed && lastFeed.kind === 'nursing' && lastFeed.lastSide
      ? lastFeed.lastSide === 'left'
        ? 'right'
        : 'left'
      : null

  return (
    <>
      <div className="flex h-full gap-3 p-3">
        <SideButton
          side="left"
          onPress={() => onStart('left')}
          subtitle={suggested === 'left' ? 'suggested' : undefined}
        />
        <SideButton
          side="right"
          onPress={() => onStart('right')}
          subtitle={suggested === 'right' ? 'suggested' : undefined}
        />
      </div>
      <TimerOverlay />
    </>
  )
}
