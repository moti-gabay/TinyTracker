import { useEffect, type ReactNode } from 'react'

/**
 * Bottom sheet. Content sits in the lower half of the screen, inside the
 * one-handed thumb arc, and is padded for the home indicator.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className="relative rounded-t-3xl border-t border-border bg-surface px-5 pt-3"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        {title && (
          <h2 className="mb-4 text-center text-lg font-semibold text-text">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
