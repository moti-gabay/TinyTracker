import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

/**
 * All buttons are at least 48px tall. Tired parents miss small targets, and
 * a missed tap at 3 AM costs a whole feed record.
 */
export function Button({
  variant = 'secondary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent text-accent-contrast border-transparent',
    secondary: 'bg-surface-2 text-text border-border',
    danger: 'bg-transparent text-danger border-danger',
    ghost: 'bg-transparent text-text-muted border-transparent',
  }
  return (
    <button
      {...rest}
      className={cn(
        'min-h-12 rounded-2xl border px-5 text-base font-semibold',
        'transition-opacity active:opacity-70 disabled:opacity-40',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
