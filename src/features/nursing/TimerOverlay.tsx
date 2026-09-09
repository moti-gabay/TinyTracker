import { useCallback } from 'react'
import { useTimerStore } from './timerStore'
import { elapsedMs, isRunning, sideSeconds } from './timerMachine'
import { useWakeLock } from '@/lib/wakeLock/useWakeLock'
import { useNow } from '@/lib/time/useNow'
import { formatTimer, formatDuration } from '@/lib/time/format'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/useToast'
import { tap } from '@/lib/haptics'
import { useSession } from '@/lib/session'
import { useBabies } from '@/lib/db/babies'
import { saveNursing } from '@/lib/db/repo'
import { cn } from '@/components/ui/cn'

/**
 * Full-screen takeover while a feed runs.
 *
 * Layout is thumb-first: the giant clock sits high (read-only), and every
 * control lives in the bottom third where a thumb actually reaches.
 */
export function TimerOverlay() {
  const state = useTimerStore((s) => s.state)
  const store = useTimerStore()
  const { familyId, babyId, userId } = useSession()
  const babies = useBabies(familyId)
  const showToast = useToast((s) => s.show)

  const live = isRunning(state.status)
  const visible = state.status !== 'idle'
  // Hold the lock through 'paused' too: the parent is burping and will look
  // back at the phone in a minute.
  useWakeLock(live)
  const now = useNow(visible ? 1000 : 60_000)

  const onSave = useCallback(async () => {
    const finishedAt =
      state.segments[state.segments.length - 1]?.endedAt ?? Date.now()
    const totals = sideSeconds(state, finishedAt)
    store.confirm()
    try {
      await saveNursing({
        id: state.sessionId ?? undefined,
        familyId,
        babyId: state.babyId ?? babyId,
        createdBy: userId,
        startedAt: state.startedAt ?? finishedAt,
        endedAt: finishedAt,
        lastSide: state.currentSide ?? 'left',
        leftSeconds: totals.left,
        rightSeconds: totals.right,
      })
      store.saved()
      tap([10, 40, 10])
      showToast(`Saved ${formatDuration(elapsedMs(state, finishedAt))}`)
    } catch {
      // The feed is NOT lost: the machine returns to the confirmation sheet.
      store.failed()
      showToast('Could not save. Tap Save to retry.')
    }
  }, [state, store, familyId, babyId, userId, showToast])

  if (!visible) return null

  const elapsed = elapsedMs(state, now)
  const totals = sideSeconds(state, now)
  const onLeft = state.currentSide === 'left'
  const paused = state.status === 'paused'
  const confirming = state.status === 'stopping' || state.status === 'saving'
  // Only worth the line when there is more than one child to confuse.
  const feedingFor =
    babies.length > 1 ? babies.find((b) => b.id === state.babyId)?.name : undefined

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <div
        className="flex flex-1 flex-col items-center justify-center px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className={cn(
            'mb-2 text-2xl font-bold tracking-wide',
            onLeft ? 'text-left' : 'text-right',
            'night:text-text',
          )}
        >
          {onLeft ? 'LEFT' : 'RIGHT'}
        </div>

        {feedingFor && (
          <div className="mb-2 text-sm text-text-muted">{feedingFor}</div>
        )}

        <div
          className="text-7xl font-bold tabular-nums text-text"
          role="timer"
          aria-live="off"
        >
          {formatTimer(elapsed)}
        </div>

        <div className="mt-3 text-sm text-text-muted">
          {paused ? 'Paused' : 'Feeding'} · L {formatDuration(totals.left * 1000)} · R{' '}
          {formatDuration(totals.right * 1000)}
        </div>
      </div>

      {/* Controls live in the bottom third: the one-handed thumb arc. */}
      <div
        className="flex flex-col gap-3 px-4 pb-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="secondary"
          className="h-14"
          onClick={() => {
            tap()
            store.switchSide(onLeft ? 'right' : 'left')
          }}
        >
          Switch to {onLeft ? 'Right' : 'Left'}
        </Button>

        <div className="flex gap-3">
          <Button
            variant="primary"
            className="h-20 flex-1 text-xl"
            onClick={() => {
              tap()
              if (paused) store.resume()
              else store.pause()
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            className="h-20 flex-1 text-xl"
            onClick={() => {
              tap()
              store.stop()
            }}
          >
            Stop
          </Button>
        </div>
      </div>

      <Sheet
        open={confirming}
        onClose={() => store.cancel()}
        title={`Save this ${formatDuration(elapsed)} feed?`}
      >
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            className="h-14"
            disabled={state.status === 'saving'}
            onClick={onSave}
          >
            {state.status === 'saving' ? 'Saving…' : 'Save feed'}
          </Button>
          <Button variant="secondary" className="h-12" onClick={() => store.cancel()}>
            Keep feeding
          </Button>
          <Button
            variant="danger"
            className="h-12"
            onClick={() => {
              store.discard()
              showToast('Feed discarded')
            }}
          >
            Discard
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
