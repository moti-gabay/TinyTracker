import { useEffect } from 'react'
import { useToast } from './useToast'

export function ToastHost() {
  const message = useToast((s) => s.message)
  const clear = useToast((s) => s.clear)

  useEffect(() => {
    if (!message) return
    const id = setTimeout(clear, 2600)
    return () => clearTimeout(id)
  }, [message, clear])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-60 flex justify-center px-4"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="rounded-full border border-border bg-surface-2 px-4 py-2 text-sm text-text shadow-[var(--shadow)]">
        {message}
      </div>
    </div>
  )
}
