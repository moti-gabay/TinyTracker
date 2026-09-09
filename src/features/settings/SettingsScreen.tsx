import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTheme, type ThemePreference } from '@/lib/theme/useTheme'
import { getUnit, setUnit, type VolumeUnit } from '@/lib/units/volume'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/useToast'
import { db, clearLocalData } from '@/lib/db/db'
import { supabase, isSyncConfigured } from '@/lib/supabase/client'
import { useAuthSession } from '@/features/family/useAuth'
import { AuthScreen } from '@/features/family/AuthScreen'
import { FamilyScreen } from '@/features/family/FamilyScreen'
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt'
import { useAppUpdate } from '@/lib/pwa/appUpdate'
import { clearSessionIds, useSession } from '@/lib/session'
import { useBabies } from '@/lib/db/babies'
import { addBaby, renameBaby } from '@/lib/sync/babies'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-text">{label}</h2>
      {children}
    </section>
  )
}

/**
 * Add and rename children.
 *
 * Both need the network: a baby must exist server-side before any event can
 * reference it. Logging for a child that already exists stays fully offline.
 */
function Children({ familyId }: { familyId: string }) {
  const babies = useBabies(familyId)
  const showToast = useToast((s) => s.show)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!navigator.onLine) return showToast('Connect to add a child.')
    setBusy(true)
    const ok = await addBaby(familyId, `Baby ${babies.length + 1}`, null)
    setBusy(false)
    showToast(ok ? 'Child added' : 'Could not add a child')
  }

  const rename = async (id: string, name: string, previous: string) => {
    const next = name.trim()
    if (!next || next === previous) return
    if (!navigator.onLine) return showToast('Connect to rename.')
    if (!(await renameBaby(familyId, id, { name: next })))
      showToast('Could not save that name')
  }

  return (
    <div className="flex flex-col gap-3">
      {babies.map((b) => (
        <div key={b.id} className="flex gap-2">
          <input
            type="text"
            defaultValue={b.name}
            aria-label="Child name"
            onBlur={(e) => void rename(b.id, e.target.value, b.name)}
            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text"
          />
          <input
            type="date"
            defaultValue={b.bornAt ?? ''}
            aria-label="Born on"
            onBlur={(e) =>
              void renameBaby(familyId, b.id, { bornAt: e.target.value || null })
            }
            className="min-h-12 shrink-0 rounded-2xl border border-border bg-surface-2 px-3 text-sm text-text"
          />
        </div>
      ))}
      <Button variant="secondary" className="h-12 w-full" disabled={busy} onClick={add}>
        Add a child
      </Button>
      <p className="text-xs text-text-muted">
        Twins get their own logs, and a name chip appears in the header to switch
        between them.
      </p>
    </div>
  )
}

export function SettingsScreen() {
  const { preference, setPreference } = useTheme()
  const familyId = useSession((s) => s.familyId)
  const [unit, setUnitState] = useState<VolumeUnit>(getUnit())
  const { session, loading } = useAuthSession()
  const { canInstall, installed, promptInstall, needsIosInstructions } =
    useInstallPrompt()
  const needsRefresh = useAppUpdate((s) => s.needsRefresh)
  const applyUpdate = useAppUpdate((s) => s.applyUpdate)
  const showToast = useToast((s) => s.show)
  const [online, setOnline] = useState(navigator.onLine)

  const pending = useLiveQuery(() => db.outbox.where('dead').equals(0).count(), [])
  const failed = useLiveQuery(() => db.outbox.where('dead').equals(1).count(), [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const signOut = async () => {
    if (!supabase) return
    if (pending && pending > 0) {
      showToast(`${pending} log(s) not yet synced. Reconnect first.`)
      return
    }
    await supabase.auth.signOut()
    await clearLocalData()
    clearSessionIds()
    showToast('Signed out')
    window.location.href = '/'
  }

  return (
    <div>
      {needsRefresh && applyUpdate && (
        <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <span className="flex-1 text-sm text-text">An update is ready.</span>
          <Button variant="primary" onClick={() => void applyUpdate()}>
            Reload
          </Button>
        </div>
      )}

      <Row label="Theme">
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'day', label: 'Day' },
            { value: 'night', label: 'Night' },
          ]}
        />
        <p className="mt-2 text-xs text-text-muted">
          Night mode uses warm, dimmed colours tuned for feeding in a dark room.
        </p>
      </Row>

      <Row label="Volume units">
        <Segmented<VolumeUnit>
          value={unit}
          onChange={(u) => {
            setUnit(u)
            setUnitState(u)
          }}
          options={[
            { value: 'ml', label: 'Millilitres' },
            { value: 'oz', label: 'Ounces' },
          ]}
        />
        <p className="mt-2 text-xs text-text-muted">
          Display only. Amounts are always stored in millilitres.
        </p>
      </Row>

      <Row label="Sync">
        {!isSyncConfigured ? (
          <p className="text-xs text-text-muted">
            Sharing is not configured for this install. Every log is still saved
            on this device.
          </p>
        ) : loading ? (
          <p className="text-xs text-text-muted">Checking…</p>
        ) : !session ? (
          <AuthScreen />
        ) : (
          <>
            <p className="mb-3 text-xs text-text-muted">
              {session.user.email} · {online ? 'Online' : 'Offline'} ·{' '}
              {pending === 0 ? 'All logs synced' : `${pending ?? 0} waiting to sync`}
            </p>
            {failed !== undefined && failed > 0 && (
              <p className="mb-3 text-xs text-danger">
                {failed} log(s) were rejected by the server and are kept on this
                device.
              </p>
            )}
            <FamilyScreen />
            <Button variant="danger" className="mt-4 h-12 w-full" onClick={signOut}>
              Sign out
            </Button>
          </>
        )}
      </Row>

      {isSyncConfigured && session && (
        <Row label="Children">
          <Children familyId={familyId} />
        </Row>
      )}

      <Row label="Install">
        {installed ? (
          <p className="text-xs text-text-muted">
            Installed. TinyTracker opens and logs feeds with no network.
          </p>
        ) : canInstall ? (
          <Button variant="primary" className="h-12 w-full" onClick={promptInstall}>
            Add to home screen
          </Button>
        ) : needsIosInstructions ? (
          <p className="text-xs text-text-muted">
            Tap Share, then “Add to Home Screen”. Installing also lets the screen
            stay awake during a feed.
          </p>
        ) : (
          <p className="text-xs text-text-muted">
            Use your browser menu to add TinyTracker to your home screen.
          </p>
        )}
      </Row>
    </div>
  )
}
