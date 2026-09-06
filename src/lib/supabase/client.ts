import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client is OPTIONAL.
 *
 * TinyTracker is a local-first app: with no credentials configured it runs
 * fully, storing everything in IndexedDB. Sync is an enhancement layered on
 * top, never a prerequisite for logging a feed.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSyncConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null
