import { useEffect } from 'react'
import { supabase, isSyncConfigured } from '@/lib/supabase/client'
import { useSession } from '@/lib/session'
import { onLocalChange } from '@/lib/db/repo'
import { pushOutbox } from './push'
import { pullSince } from './pull'
import { pullBabies } from './babies'
import { subscribeFamily } from './realtime'

/**
 * Owns the sync lifecycle. Renders nothing.
 *
 * Every trigger that could mean "we might be behind or ahead" is wired here:
 * a local write, regaining the network, returning to the foreground, and the
 * realtime channel subscribing.
 */
export function SyncProvider() {
  const familyId = useSession((s) => s.familyId)
  const userId = useSession((s) => s.userId)
  const setUserId = useSession((s) => s.setUserId)

  // Track the signed-in user so `created_by` is stamped on new events.
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [setUserId])

  useEffect(() => {
    if (!isSyncConfigured || !userId) return

    const sync = () => {
      void pushOutbox()
      void pullSince(familyId)
      void pullBabies(familyId)
    }

    sync()
    const unsubscribeLocal = onLocalChange(() => void pushOutbox())
    const unsubscribeRealtime = subscribeFamily(familyId)

    const onOnline = () => sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unsubscribeLocal()
      unsubscribeRealtime()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [familyId, userId])

  return null
}
