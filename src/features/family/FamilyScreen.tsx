import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { useSession, clearSessionIds } from '@/lib/session'
import { clearLocalData } from '@/lib/db/db'
import { adoptOrphans } from '@/lib/db/repo'
import { pullBabies } from '@/lib/sync/babies'

type Existing = { id: string; code: string; members: number }

/**
 * Create a family, or join your partner with their code.
 *
 * Joining is the primary action and comes first: only one parent should ever
 * create, and the one who did it by mistake used to be locked out for good.
 *
 * Events logged before signing in are re-pointed at the real family id and
 * re-queued, so nothing recorded during the local-only period is stranded.
 */
export function FamilyScreen({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Existing | null>(null)
  const [checked, setChecked] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const setFamily = useSession((s) => s.setFamily)
  const localFamilyId = useSession((s) => s.familyId)
  const showToast = useToast((s) => s.show)

  // If this account is already in a family, show its code rather than
  // offering to create a second one.
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, invite_code, babies(id), family_members(count)')
        .limit(1)
        .maybeSingle()
      // A 42501 here means the `authenticated` grants were never applied.
      // Swallowing it looks exactly like "no family yet", and then every tap
      // of "Start a new family" mints another one -- create_family is
      // SECURITY DEFINER, so it succeeds even when this select cannot.
      if (error) return setError(`Could not check your family: ${error.message}`)
      setChecked(true)
      if (data) {
        setExisting({
          id: data.id as string,
          code: data.invite_code as string,
          members: (data.family_members as { count: number }[] | null)?.[0]?.count ?? 1,
        })
        const babyId = (data.babies as { id: string }[] | null)?.[0]?.id
        if (babyId) await adopt(data.id as string, babyId)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Adopt anything logged before this family existed, then mirror its children.
   *
   * Pre-family logs all land on the first child: only one baby can have
   * existed locally before there was a family to hold more.
   */
  async function adopt(familyId: string, babyId: string) {
    await adoptOrphans(localFamilyId, familyId, babyId)
    setFamily(familyId, babyId)
    await pullBabies(familyId)
  }

  const explain = (e: { code?: string; message: string }) =>
    e.code === 'P0002'
      ? 'That code did not match a family.'
      : e.code === 'P0003'
        ? 'This account is already in a family. Leave it first.'
        : e.message

  const create = async () => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_family', { baby_name: 'Baby' })
    setBusy(false)
    if (error) return setError(explain(error))
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return setError('Could not create a family.')
    await adopt(row.family_id, row.baby_id)
    setExisting({ id: row.family_id, code: row.invite_code, members: 1 })
    showToast('Family created')
    onDone?.()
  }

  const join = async () => {
    if (!supabase || code.trim().length !== 8) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('join_family', { code: code.trim() })
    setBusy(false)
    // P0002 is the `no_data_found` join_family raises for an unknown code.
    // Anything else is a real fault and must not masquerade as a typo.
    if (error) return setError(explain(error))
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.family_id || !row?.baby_id)
      return setError('That code did not match a family.')
    await adopt(row.family_id, row.baby_id)
    showToast('Joined family')
    onDone?.()
  }

  /**
   * Leaving an EMPTY family deletes it server-side, which frees the client
   * generated event ids so the next join can carry those logs across. Leaving
   * a family that still has members leaves its rows there, so this device
   * drops its local copy instead of trying to re-push them.
   */
  const leave = async () => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('leave_family')
    setBusy(false)
    if (error) return setError(error.message)
    if (data === true) {
      setExisting(null)
      setConfirmLeave(false)
      showToast('Left the family')
      return
    }
    await clearLocalData()
    clearSessionIds()
    window.location.href = '/'
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
        <p className="mt-2 text-xs text-text-muted">
          {existing.members === 1
            ? 'Just you so far.'
            : `${existing.members} people are sharing these logs.`}
        </p>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <Button
          variant="danger"
          className="mt-6 h-12 w-full"
          disabled={busy}
          onClick={confirmLeave ? leave : () => setConfirmLeave(true)}
        >
          {confirmLeave ? 'Tap again to leave this family' : 'Leave family'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Set up sharing</h1>
        <p className="mt-1 text-sm text-text-muted">
          Enter the code from your partner to share their logs.
        </p>
      </div>

      <input
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        maxLength={8}
        placeholder="PARTNER CODE"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-center text-2xl tracking-[0.2em] text-text placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted"
      />
      <Button variant="primary" className="h-14" disabled={busy} onClick={join}>
        Join with code
      </Button>

      {checked && (
        <>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" className="h-14" disabled={busy} onClick={create}>
            Start a new family
          </Button>
          <p className="-mt-2 text-xs text-text-muted">
            Only one of you does this. The other joins with the code it gives you.
          </p>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
