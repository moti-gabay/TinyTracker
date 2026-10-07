import { useNavigate } from 'react-router'
import { useToast } from '@/components/ui/useToast'
import { saveDiaper } from '@/lib/db/repo'
import { useSession } from '@/lib/session'
import { tap } from '@/lib/haptics'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useT } from '@/lib/i18n'
import type { Key } from '@/lib/i18n/en'
import type { DiaperType } from '@/lib/db/types'

const OPTIONS: { value: DiaperType; label: Key; icons: IconName[] }[] = [
  { value: 'wet', label: 'diaper.wet', icons: ['drop'] },
  { value: 'dirty', label: 'diaper.dirty', icons: ['poop'] },
  { value: 'both', label: 'diaper.both', icons: ['drop', 'poop'] },
]

/** Three targets, one tap each, no confirmation. The fastest log in the app. */
export function DiaperScreen() {
  const { familyId, babyId, userId } = useSession()
  const showToast = useToast((s) => s.show)
  const navigate = useNavigate()
  const t = useT()

  const log = async (type: DiaperType) => {
    tap()
    try {
      await saveDiaper({
        familyId,
        babyId,
        createdBy: userId,
        diaperType: type,
      })
      showToast(
        t('diaper.logged', {
          type: t(type === 'both' ? 'diaper.wetDirty' : type === 'wet' ? 'diaper.wet' : 'diaper.dirty'),
        }),
      )
      navigate('/')
    } catch {
      showToast(t('common.couldNotSave'))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => log(o.value)}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-border bg-surface-2 text-text active:scale-[0.98]"
        >
          <span className="flex gap-2 text-text-muted">
            {o.icons.map((n) => (
              <Icon key={n} name={n} size={32} />
            ))}
          </span>
          <span className="text-2xl font-bold">{t(o.label)}</span>
        </button>
      ))}
    </div>
  )
}
