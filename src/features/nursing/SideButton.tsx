import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n'
import type { Side } from '@/lib/db/types'

/**
 * The primary control of the whole app. Half the screen wide, ~40% tall,
 * reachable by either thumb. Side is conveyed by hue AND a large label, never
 * by colour alone.
 */
export function SideButton({
  side,
  onPress,
  subtitle,
  className,
}: {
  side: Side
  onPress: () => void
  subtitle?: string
  className?: string
}) {
  const isLeft = side === 'left'
  const t = useT()
  return (
    <button
      onClick={onPress}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl',
        'border-2 text-center transition-transform active:scale-[0.98]',
        isLeft
          ? 'border-left bg-left text-left-fg'
          : 'border-right bg-right text-right-fg',
        // At night the fill is dropped to a dim tint: a large saturated block
        // at full brightness is exactly what wakes the baby.
        isLeft
          ? 'night:bg-left/25 night:text-text'
          : 'night:bg-right/25 night:text-text',
        className,
      )}
    >
      <span className="text-4xl font-extrabold tracking-tight">
        {t(isLeft ? 'side.left' : 'side.right')}
      </span>
      {subtitle && <span className="text-sm opacity-80">{subtitle}</span>}
    </button>
  )
}
