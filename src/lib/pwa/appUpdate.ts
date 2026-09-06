import { create } from 'zustand'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker at APP STARTUP, not from a screen.
 *
 * This is deliberate and load-bearing: registering lazily (e.g. inside the
 * Settings screen) means a parent who never opens Settings never gets an
 * offline-capable app -- the one thing they need most at 3 AM with bad signal.
 *
 * The waiting worker is never activated automatically. A reload mid-feed is
 * not acceptable, so the parent applies the update from Settings.
 */
interface UpdateState {
  needsRefresh: boolean
  applyUpdate: (() => Promise<void>) | null
}

export const useAppUpdate = create<UpdateState>(() => ({
  needsRefresh: false,
  applyUpdate: null,
}))

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useAppUpdate.setState({
        needsRefresh: true,
        applyUpdate: () => updateSW(true),
      })
    },
  })
}
