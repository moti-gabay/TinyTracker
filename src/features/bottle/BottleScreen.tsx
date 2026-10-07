import { useState } from 'react'
import { useNavigate } from 'react-router'
import { NumberStepper } from '@/components/ui/NumberStepper'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { formatVolume, getUnit, stepMl } from '@/lib/units/volume'
import { saveBottle } from '@/lib/db/repo'
import { useSession } from '@/lib/session'
import { tap } from '@/lib/haptics'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n'
import type { Key } from '@/lib/i18n/en'
import type { BottleContent } from '@/lib/db/types'

const CONTENTS: { value: BottleContent; label: Key }[] = [
  { value: 'breast_milk', label: 'bottle.breastMilk' },
  { value: 'formula', label: 'bottle.formula' },
  { value: 'mixed', label: 'bottle.mixed' },
]

export function BottleScreen() {
  const unit = getUnit()
  const [amountMl, setAmountMl] = useState(60)
  const [content, setContent] = useState<BottleContent>('breast_milk')
  const [saving, setSaving] = useState(false)
  const { familyId, babyId, userId } = useSession()
  const showToast = useToast((s) => s.show)
  const navigate = useNavigate()
  const t = useT()

  const onSave = async () => {
    setSaving(true)
    try {
      await saveBottle({
        familyId,
        babyId,
        createdBy: userId,
        amountMl,
        bottleContent: content,
      })
      tap()
      showToast(t('bottle.saved', { v: formatVolume(amountMl, unit) }))
      navigate('/')
    } catch {
      showToast(t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="pt-6">
        <NumberStepper
          value={amountMl}
          onChange={setAmountMl}
          step={stepMl(unit)}
          max={1000}
          label={t('bottle.amount')}
          format={(v) => formatVolume(v, unit)}
        />

        <div className="mt-8 flex gap-2">
          {CONTENTS.map((c) => (
            <button
              key={c.value}
              onClick={() => setContent(c.value)}
              className={cn(
                'min-h-12 flex-1 rounded-2xl border px-2 text-sm font-semibold',
                content === c.value
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border bg-surface-2 text-text-muted',
              )}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      </div>

      <Button variant="primary" className="h-16 text-lg" disabled={saving} onClick={onSave}>
        {t(saving ? 'common.saving' : 'bottle.log')}
      </Button>
    </div>
  )
}
