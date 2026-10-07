import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/useToast'
import { supabase } from '@/lib/supabase/client'
import { getLang, useT } from '@/lib/i18n'

/**
 * Suggestions straight from the parent to the developer.
 *
 * Online-only, and never queued: this is not a care log, so it has no place
 * in the outbox. On failure the sheet stays open with the text intact.
 */
export function FeedbackSheet({
  open,
  onClose,
  defaultEmail,
}: {
  open: boolean
  onClose: () => void
  defaultEmail: string
}) {
  const t = useT()
  const showToast = useToast((s) => s.show)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!supabase || !message.trim()) return
    if (!navigator.onLine) return showToast(t('feedback.offline'))
    setSending(true)
    const { error } = await supabase.rpc('submit_feedback', {
      message: message.trim(),
      email: email.trim() || null,
      lang: getLang(),
    })
    setSending(false)
    if (error) return showToast(error.message)
    showToast(t('feedback.thanks'))
    setMessage('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('feedback.title')}>
      <div className="flex flex-col gap-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('feedback.placeholder')}
          maxLength={2000}
          rows={4}
          className="min-h-32 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base text-text placeholder:text-text-muted"
        />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('feedback.email')}
          className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text placeholder:text-text-muted"
        />
        <Button
          variant="primary"
          className="h-14"
          disabled={sending || !message.trim()}
          onClick={send}
        >
          {t(sending ? 'common.saving' : 'feedback.send')}
        </Button>
        <Button variant="secondary" className="h-12" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Sheet>
  )
}
