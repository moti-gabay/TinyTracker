import { Link } from 'react-router'
import { Icon } from '@/components/ui/Icon'
import { useSession } from '@/lib/session'
import { useNow } from '@/lib/time/useNow'
import { formatAgo, formatDuration } from '@/lib/time/format'
import { formatVolume } from '@/lib/units/volume'
import { useTheme } from '@/lib/theme/useTheme'
import { useTimerStore } from '@/features/nursing/timerStore'
import { elapsedMs, isRunning } from '@/features/nursing/timerMachine'
import { useLastFeed } from './useLastFeed'

/**
 * Answers the only question that matters at 3 AM:
 * which side last, how long ago it STARTED, and how long it lasted.
 *
 * "Ago" is measured from the START of the last feed, not its end, because
 * feeding cycles are start-to-start.
 */
export function StatusBanner() {
  const familyId = useSession((s) => s.familyId)
  const lastFeed = useLastFeed(familyId)
  const timer = useTimerStore((s) => s.state)
  const { theme, toggle } = useTheme()
  // 30s is enough for an "ago" readout and costs almost nothing.
  const now = useNow(isRunning(timer.status) ? 1000 : 30_000)

  const live = isRunning(timer.status)

  let primary: string
  let secondary: string

  if (live) {
    primary = timer.currentSide === 'left' ? 'Left · feeding' : 'Right · feeding'
    secondary = `${formatDuration(elapsedMs(timer, now))}${
      timer.status === 'paused' ? ' · paused' : ''
    }`
  } else if (lastFeed === undefined) {
    primary = ' '
    secondary = ' '
  } else if (lastFeed === null) {
    primary = 'No feeds yet'
    secondary = 'Tap a side to start'
  } else if (lastFeed.kind === 'nursing') {
    primary = `${lastFeed.lastSide === 'left' ? 'Left' : 'Right'} · ${formatAgo(lastFeed.startedAt, now)}`
    const duration = (lastFeed.leftSeconds ?? 0) + (lastFeed.rightSeconds ?? 0)
    secondary = `Fed for ${formatDuration(duration * 1000)}`
  } else {
    primary = `Bottle · ${formatAgo(lastFeed.startedAt, now)}`
    secondary = formatVolume(lastFeed.amountMl ?? 0)
  }

  return (
    <header
      className="flex items-center gap-3 border-b border-border bg-surface px-4 pb-3"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-semibold text-text">{primary}</div>
        <div className="truncate text-sm text-text-muted">{secondary}</div>
      </div>

      <button
        onClick={toggle}
        aria-label={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-text active:opacity-70"
      >
        <Icon name={theme === 'night' ? 'moon' : 'sun'} size={22} />
      </button>

      <Link
        to="/settings"
        aria-label="Settings"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-text active:opacity-70"
      >
        <Icon name="gear" size={22} />
      </Link>
    </header>
  )
}
