import { Link } from 'react-router'
import { Icon } from '@/components/ui/Icon'
import { useSession } from '@/lib/session'
import { useNow } from '@/lib/time/useNow'
import { formatAgo, formatDuration } from '@/lib/time/format'
import { formatVolume } from '@/lib/units/volume'
import { useTheme } from '@/lib/theme/useTheme'
import { useT } from '@/lib/i18n'
import { useTimerStore } from '@/features/nursing/timerStore'
import { elapsedMs, isRunning } from '@/features/nursing/timerMachine'
import { useLastFeed } from './useLastFeed'
import { BabyChip } from './BabyChip'

/**
 * Answers the only question that matters at 3 AM:
 * which side last, how long ago it STARTED, and how long it lasted.
 *
 * "Ago" is measured from the START of the last feed, not its end, because
 * feeding cycles are start-to-start.
 */
export function StatusBanner() {
  const babyId = useSession((s) => s.babyId)
  const lastFeed = useLastFeed(babyId)
  const timer = useTimerStore((s) => s.state)
  const { theme, toggle } = useTheme()
  const t = useT()
  // 30s is enough for an "ago" readout and costs almost nothing.
  const now = useNow(isRunning(timer.status) ? 1000 : 30_000)

  const live = isRunning(timer.status)

  let primary: string
  let secondary: string

  if (live) {
    primary = t('status.live', {
      side: t(timer.currentSide === 'left' ? 'common.left' : 'common.right'),
    })
    const elapsed = formatDuration(elapsedMs(timer, now))
    secondary =
      timer.status === 'paused' ? t('status.paused', { elapsed }) : elapsed
  } else if (lastFeed === undefined) {
    primary = ' '
    secondary = ' '
  } else if (lastFeed === null) {
    primary = t('status.noFeeds')
    secondary = t('status.tapToStart')
  } else if (lastFeed.kind === 'nursing') {
    primary = t('status.lastNursing', {
      side: t(lastFeed.lastSide === 'left' ? 'common.left' : 'common.right'),
      ago: formatAgo(lastFeed.startedAt, now),
    })
    const duration = (lastFeed.leftSeconds ?? 0) + (lastFeed.rightSeconds ?? 0)
    secondary = t('status.fedFor', { d: formatDuration(duration * 1000) })
  } else {
    primary = t('status.lastBottle', { ago: formatAgo(lastFeed.startedAt, now) })
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

      <BabyChip />

      <button
        onClick={toggle}
        aria-label={t(theme === 'night' ? 'status.toDay' : 'status.toNight')}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-text active:opacity-70"
      >
        <Icon name={theme === 'night' ? 'moon' : 'sun'} size={22} />
      </button>

      <Link
        to="/settings"
        aria-label={t('status.settings')}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-text active:opacity-70"
      >
        <Icon name="gear" size={22} />
      </Link>
    </header>
  )
}
