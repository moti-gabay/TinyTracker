import { cn } from './cn'

/** One-of-N picker. Full-height targets, because it is tapped one-handed. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-12 flex-1 rounded-2xl border px-3 text-sm font-semibold',
            value === o.value
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border bg-surface-2 text-text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
