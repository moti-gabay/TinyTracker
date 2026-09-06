import { useEffect, useState } from 'react'

/**
 * Returns Date.now(), re-rendering every `intervalMs` while the tab is visible.
 *
 * Deliberately pauses when hidden and resyncs immediately on becoming visible:
 * a backgrounded tab's throttled interval would otherwise show a stale time
 * for a moment when the parent looks back at the phone.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined

    const startTicking = () => {
      stopTicking()
      setNow(Date.now())
      id = setInterval(() => setNow(Date.now()), intervalMs)
    }
    const stopTicking = () => {
      if (id !== undefined) clearInterval(id)
      id = undefined
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') startTicking()
      else stopTicking()
    }

    if (document.visibilityState === 'visible') startTicking()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopTicking()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return now
}
