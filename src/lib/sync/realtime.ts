import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { applyRemote } from './applyRemote'
import { pullSince } from './pull'
import type { RemoteCareEvent } from './mapper'

/**
 * Live updates for one family.
 *
 * Realtime is treated as an OPTIMISATION, not a guarantee: any subscribe or
 * resubscribe triggers a `pullSince` to close whatever gap existed while the
 * socket was down. Missing that is the classic way realtime apps silently
 * lose rows.
 */
export function subscribeFamily(familyId: string): () => void {
  const client = supabase
  if (!client) return () => {}

  const channel: RealtimeChannel = client
    .channel(`family:${familyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'care_events',
        filter: `family_id=eq.${familyId}`,
      },
      (payload) => {
        const row = payload.new as RemoteCareEvent | undefined
        if (row?.id) void applyRemote([row])
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void pullSince(familyId)
      }
    })

  return () => {
    void client.removeChannel(channel)
  }
}
