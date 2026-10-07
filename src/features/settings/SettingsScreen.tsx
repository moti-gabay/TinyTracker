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
import { setLang, useLang, useT, type Lang } from '@/lib/i18n'

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
  const t = useT()

  const add = async () => {
    if (!navigator.onLine) return showToast(t('settings.connectToAdd'))
    setBusy(true)
    const ok = await addBaby(
      familyId,
      t('settings.defaultBaby', { n: babies.length + 1 }),
      null,
    )
    setBusy(false)
    showToast(t(ok ? 'settings.childAdded' : 'settings.addFailed'))
  }

  const rename = async (id: string, name: string, previous: string) => {
    const next = name.trim()
    if (!next || next === previous) return
    if (!navigator.onLine) return showToast(t('settings.connectToRename'))
    if (!(await renameBaby(familyId, id, { name: next })))
      showToast(t('settings.renameFailed'))
  }

  return (
    <div className="flex flex-col gap-3">
      {babies.map((b) => (
        <div key={b.id} className="flex gap-2">
          <input
            type="text"
            defaultValue={b.name}
            aria-label={t('settings.childName')}
            onBlur={(e) => void rename(b.id, e.target.value, b.name)}
            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text"
          />
          <input
            type="date"
            defaultValue={b.bornAt ?? ''}
            aria-label={t('settings.bornOn')}
            onBlur={(e) =>
              void renameBaby(familyId, b.id, { bornAt: e.target.value || null })
            }
            className="min-h-12 shrink-0 rounded-2xl border border-border bg-surface-2 px-3 text-sm text-text"
          />
        </div>
      ))}
      <Button variant="secondary" className="h-12 w-full" disabled={busy} onClick={add}>
        {t('settings.addChild')}
      </Button>
      <p className="text-xs text-text-muted">{t('settings.twinsHint')}</p>
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
  const lang = useLang()
  const t = useT()

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
      showToast(t('settings.unsynced', { n: pending }))
      return
    }
    await supabase.auth.signOut()
    await clearLocalData()
    clearSessionIds()
    showToast(t('settings.signedOut'))
    window.location.href = '/'
  }

  return (
    <div>
      {needsRefresh && applyUpdate && (
        <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <span className="flex-1 text-sm text-text">{t('settings.updateReady')}</span>
          <Button variant="primary" onClick={() => void applyUpdate()}>
            {t('settings.reload')}
          </Button>
        </div>
      )}

      {/* First, and each option in its own language, so the row is findable
          from either UI. */}
      <Row label={t('settings.language')}>
        <Segmented<Lang>
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: 'English' },
            { value: 'he', label: 'עברית' },
          ]}
        />
      </Row>

      <Row label={t('settings.theme')}>
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: t('settings.system') },
            { value: 'day', label: t('settings.day') },
            { value: 'night', label: t('settings.night') },
          ]}
        />
        <p className="mt-2 text-xs text-text-muted">{t('settings.themeHint')}</p>
      </Row>

      <Row label={t('settings.units')}>
        <Segmented<VolumeUnit>
          value={unit}
          onChange={(u) => {
            setUnit(u)
            setUnitState(u)
          }}
          options={[
            { value: 'ml', label: t('settings.ml') },
            { value: 'oz', label: t('settings.oz') },
          ]}
        />
        <p className="mt-2 text-xs text-text-muted">{t('settings.unitsHint')}</p>
      </Row>

      <Row label={t('settings.sync')}>
        {!isSyncConfigured ? (
          <p className="text-xs text-text-muted">{t('settings.syncOff')}</p>
        ) : loading ? (
          <p className="text-xs text-text-muted">{t('settings.checking')}</p>
        ) : !session ? (
          <AuthScreen />
        ) : (
          <>
            <p className="mb-3 text-xs text-text-muted">
              {session.user.email} · {t(online ? 'settings.online' : 'settings.offline')} ·{' '}
              {pending === 0
                ? t('settings.allSynced')
                : t('settings.waiting', { n: pending ?? 0 })}
            </p>
            {failed !== undefined && failed > 0 && (
              <p className="mb-3 text-xs text-danger">
                {t('settings.rejected', { n: failed })}
              </p>
            )}
            <FamilyScreen />
            <Button variant="danger" className="mt-4 h-12 w-full" onClick={signOut}>
              {t('settings.signOut')}
            </Button>
          </>
        )}
      </Row>

      {isSyncConfigured && session && (
        <Row label={t('settings.children')}>
          <Children familyId={familyId} />
        </Row>
      )}

      <Row label={t('settings.install')}>
        {installed ? (
          <p className="text-xs text-text-muted">{t('settings.installed')}</p>
        ) : canInstall ? (
          <Button variant="primary" className="h-12 w-full" onClick={promptInstall}>
            {t('settings.addToHome')}
          </Button>
        ) : needsIosInstructions ? (
          <p className="text-xs text-text-muted">{t('settings.iosHint')}</p>
        ) : (
          <p className="text-xs text-text-muted">{t('settings.browserHint')}</p>
        )}
      </Row>
    </div>
  )
}
