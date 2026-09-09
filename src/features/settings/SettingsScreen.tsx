import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTheme, type ThemePreference } from '@/lib/theme/useTheme'
import { getUnit, setUnit, type VolumeUnit } from '@/lib/units/volume'
import { cn } from '@/components/ui/cn'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { db, clearLocalData } from '@/lib/db/db'
import { supabase, isSyncConfigured } from '@/lib/supabase/client'
import { useAuthSession } from '@/features/family/useAuth'
import { AuthScreen } from '@/features/family/AuthScreen'
import { FamilyScreen } from '@/features/family/FamilyScreen'
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt'
import { useAppUpdate } from '@/lib/pwa/appUpdate'
import { clearSessionIds } from '@/lib/session'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-text">{label}</h2>
      {children}
    </section>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-12 flex-1 rounded-2xl border px-3 text-sm font-semibold',
            value === o.value
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border bg-surface-2 text-text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsScreen() {
  const { preference, setPreference } = useTheme()
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
