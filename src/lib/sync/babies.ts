import { supabase } from '@/lib/supabase/client'
import { mirrorBabies } from '@/lib/db/babies'
import type { Baby } from '@/lib/db/types'

/**
 * Babies sync by full replace, not through the outbox.
 *
 * The list is a handful of rows that change about twice in a lifetime, and a
 * baby must exist on the server before any event can reference it -- the FK on
 * care_events.baby_id says so. Queueing one offline would mean holding back
 * every event that names it, which is exactly the coupling the outbox exists
 * to avoid. So: adding a child needs the network; logging never does.
 */

type Row = { id: string; family_id: string; name: string; born_at: string | null }

const COLUMNS = 'id, family_id, name, born_at'

const fromRow = (r: Row): Baby => ({
  id: r.id,
  familyId: r.family_id,
  name: r.name,
  bornAt: r.born_at,
})

export async function pullBabies(familyId: string): Promise<number> {
  if (!supabase || !navigator.onLine) return 0
  const { data, error } = await supabase
    .from('babies')
    .select(COLUMNS)
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (error || !data) return 0
  const rows = (data as Row[]).map(fromRow)
  await mirrorBabies(familyId, rows)
  return rows.length
}

export async function addBaby(
  familyId: string,
  name: string,
  bornAt: string | null,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('babies')
    .insert({ family_id: familyId, name, born_at: bornAt })
  if (error) return false
  await pullBabies(familyId)
  return true
}

export async function renameBaby(
  familyId: string,
  id: string,
  patch: { name?: string; bornAt?: string | null },
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('babies')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.bornAt !== undefined ? { born_at: patch.bornAt } : {}),
    })
    .eq('id', id)
  if (error) return false
  await pullBabies(familyId)
  return true
}
