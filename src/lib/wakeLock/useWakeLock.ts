import { useEffect, useRef } from 'react'

/**
 * Holds a screen wake lock while `active` is true.
 *
 * Two browser behaviours drive this design:
 *  1. The lock is released automatically whenever the tab is hidden, so we
 *     must re-acquire on visibilitychange rather than assume we still hold it.
 *  2. request() rejects if called while hidden, so we only try when visible.
 *
 * Unsupported browsers (iOS Safari before 16.4, or outside standalone mode)
 * simply get nothing. The timer is timestamp-based, so nothing breaks.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    let cancelled = false

    const release = () => {
      const lock = lockRef.current
      lockRef.current = null
      // Already-released sentinels reject; nothing to recover from.
      lock?.release().catch(() => {})
    }

    const acquire = async () => {
      if (cancelled || !active) return
      if (document.visibilityState !== 'visible') return
      if (lockRef.current && !lockRef.current.released) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled || !active) {
          lock.release().catch(() => {})
          return
        }
        lockRef.current = lock
        // The browser drops the lock on hide; clear our stale reference.
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) lockRef.current = null
        })
      } catch {
        /* denied, low battery, or not visible: acceptable to go without */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    if (active) {
      void acquire()
      document.addEventListener('visibilitychange', onVisibility)
    } else {
      release()
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active])
}
