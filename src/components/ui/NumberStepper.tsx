import { Button } from './Button'
import { useT } from '@/lib/i18n'

/**
 * Big +/- stepper. Typing a number one-handed in the dark is miserable, so
 * the keypad is a fallback and the two large buttons are the main path.
 */
export function NumberStepper({
  value,
  onChange,
  step,
  min = 0,
  max = 100000,
  format,
  label,
}: {
  value: number
  onChange: (next: number) => void
  step: number
  min?: number
  max?: number
  format: (v: number) => string
  label: string
}) {
  const t = useT()
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  return (
    <div>
      <div className="mb-2 text-center text-sm text-text-muted">{label}</div>
      {/* Pinned LTR: "−" stays left and "+" right in every language. */}
      <div className="flex items-center gap-3" dir="ltr">
        <Button
          aria-label={t('stepper.decrease', { label })}
          onClick={() => onChange(clamp(value - step))}
          className="h-16 w-16 shrink-0 text-2xl"
        >
          −
        </Button>
        <output className="flex-1 text-center text-3xl font-bold tabular-nums text-text">
          {format(value)}
        </output>
        <Button
          aria-label={t('stepper.increase', { label })}
          onClick={() => onChange(clamp(value + step))}
          className="h-16 w-16 shrink-0 text-2xl"
        >
          +
        </Button>
      </div>
    </div>
  )
}
