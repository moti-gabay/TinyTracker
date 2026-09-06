import { useState } from 'react'
import { useNavigate } from 'react-router'
import { NumberStepper } from '@/components/ui/NumberStepper'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { formatVolume, getUnit, stepMl } from '@/lib/units/volume'
import { savePump } from '@/lib/db/repo'
import { useSession } from '@/lib/session'
import { tap } from '@/lib/haptics'

export function PumpScreen() {
  const unit = getUnit()
  const [leftMl, setLeftMl] = useState(0)
  const [rightMl, setRightMl] = useState(0)
  const [saving, setSaving] = useState(false)
  const { familyId, babyId, userId } = useSession()
  const showToast = useToast((s) => s.show)
  const navigate = useNavigate()

  const onSave = async () => {
    setSaving(true)
    try {
      await savePump({
        familyId,
        babyId,
        createdBy: userId,
        endedAt: null,
        leftMl,
        rightMl,
      })
      tap()
      showToast(`Pumped ${formatVolume(leftMl + rightMl, unit)}`)
      navigate('/')
    } catch {
      showToast('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex flex-col gap-8 pt-6">
        <NumberStepper
          value={leftMl}
          onChange={setLeftMl}
          step={stepMl(unit)}
          max={1000}
          label="Left"
          format={(v) => formatVolume(v, unit)}
        />
        <NumberStepper
          value={rightMl}
          onChange={setRightMl}
          step={stepMl(unit)}
          max={1000}
          label="Right"
          format={(v) => formatVolume(v, unit)}
        />
        <div className="text-center text-sm text-text-muted">
          Total {formatVolume(leftMl + rightMl, unit)}
        </div>
      </div>

      <Button
        variant="primary"
        className="h-16 text-lg"
        disabled={saving || leftMl + rightMl === 0}
        onClick={onSave}
      >
        {saving ? 'Saving…' : 'Log pumping'}
      </Button>
    </div>
  )
}
