import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { useSession } from '@/lib/session'
import { db } from '@/lib/db/db'

/**
 * Create a family or join a partner's with their code.
 *
 * Events logged before signing in are re-pointed at the real family id and
 * re-queued, so nothing recorded during the local-only period is stranded.
 */
export function FamilyScreen({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ code: string } | null>(null)
  const setFamily = useSession((s) => s.setFamily)
  const localFamilyId = useSession((s) => s.familyId)
  const showToast = useToast((s) => s.show)

  // If this account is already in a family, show its code rather than
  // offering to create a second one.
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const { data } = await supabase
        .from('families')
        .select('id, invite_code, babies(id)')
        .limit(1)
        .maybeSingle()
      if (data) {
        setExisting({ code: data.invite_code as string })
        const babyId = (data.babies as { id: string }[] | null)?.[0]?.id
        if (babyId) await adopt(data.id as string, babyId)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Move any locally-logged events onto the real family, then re-queue them. */
  async function adopt(familyId: string, babyId: string) {
    if (familyId === localFamilyId) {
      setFamily(familyId, babyId)
      return
    }
    const orphans = await db.events.where('familyId').equals(localFamilyId).toArray()
    if (orphans.length > 0) {
      await db.transaction('rw', db.events, db.outbox, async () => {
        for (const e of orphans) {
          await db.events.put({ ...e, familyId, babyId, updatedAt: Date.now() })
          await db.outbox.add({
            eventId: e.id,
            op: 'upsert',
            createdAt: Date.now(),
            attempts: 0,
            lastError: null,
            dead: 0,
          })
        }
      })
    }
    setFamily(familyId, babyId)
  }

  const create = async () => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_family', { baby_name: 'Baby' })
    setBusy(false)
    if (error) return setError(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return setError('Could not create a family.')
    await adopt(row.family_id, row.baby_id)
    setExisting({ code: row.invite_code })
    showToast('Family created')
    onDone?.()
  }

  const join = async () => {
    if (!supabase || code.trim().length < 4) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('join_family', { code: code.trim() })
    setBusy(false)
    if (error) return setError('That code did not match a family.')
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.family_id) return setError('That code did not match a family.')
    await adopt(row.family_id, row.baby_id)
    showToast('Joined family')
    onDone?.()
  }

  if (existing) {
    return (
      <div className="p-6">
        <h2 className="text-sm font-semibold text-text">Your family code</h2>
        <p className="mt-1 text-sm text-text-muted">
          Your partner enters this on their phone to share your logs.
        </p>
        <div className="mt-4 rounded-2xl border border-border bg-surface-2 py-5 text-center text-3xl font-bold tracking-[0.2em] text-text">
          {existing.code}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Set up sharing</h1>
        <p className="mt-1 text-sm text-text-muted">
          Start a family, or join your partner with their code.
        </p>
      </div>

      <Button variant="primary" className="h-14" disabled={busy} onClick={create}>
        Start a new family
      </Button>

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <input
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        placeholder="PARTNER CODE"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-center text-2xl tracking-[0.2em] text-text placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted"
      />
      <Button variant="secondary" className="h-14" disabled={busy} onClick={join}>
        Join with code
      </Button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
