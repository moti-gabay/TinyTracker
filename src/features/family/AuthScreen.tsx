import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { t, useT } from '@/lib/i18n'

/** Supabase's per-email resend cooldown, so the button says why it is disabled. */
const RESEND_SECONDS = 60

/**
 * Turns a GoTrue error into something a tired parent can act on.
 *
 * The raw message is still shown underneath: the two failures that actually
 * strand a second parent -- an expired token and the built-in SMTP hourly cap
 * -- are indistinguishable from "wrong code" unless we say so.
 */
function explain(code: string | undefined, message: string): string {
  if (code === 'otp_expired' || /expired/i.test(message)) return t('auth.expired')
  if (/rate limit/i.test(message)) return t('auth.rateLimit')
  if (code === 'otp_disabled' || /signups not allowed/i.test(message))
    return t('auth.signupsOff')
  return message
}

/**
 * Email OTP sign-in. No passwords: a six-digit code is far easier to deal
 * with one-handed than a password manager, and there is nothing to forget.
 */
export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const t = useT()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Addresses are case-insensitive, but phone keyboards capitalise the first
  // letter -- which silently creates a second, unrelated GoTrue user.
  const addr = email.trim().toLowerCase()

  const fail = (e: { code?: string; message: string }) => {
    setError(explain(e.code, e.message))
    setDetail(e.message)
  }

  const sendCode = async () => {
    if (!supabase || !addr || cooldown > 0) return
    setBusy(true)
    setError(null)
    setDetail(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) fail(error)
    else {
      setSent(true)
      setCooldown(RESEND_SECONDS)
    }
  }

  const verify = async () => {
    if (!supabase || code.trim().length < 6) return
    setBusy(true)
    setError(null)
    setDetail(null)
    const { error } = await supabase.auth.verifyOtp({
      email: addr,
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) fail(error)
  }

  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('auth.subtitle')}</p>
      </div>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={sent}
        className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text placeholder:text-text-muted"
      />

      {sent && (
        <>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={t('auth.codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-center text-2xl tracking-[0.3em] tabular-nums text-text placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted"
          />
          <p className="text-xs text-text-muted">{t('auth.linkHint')}</p>
        </>
      )}

      {error && (
        <div>
          <p className="text-sm text-danger">{error}</p>
          {detail && detail !== error && (
            <p className="mt-1 text-xs text-text-muted">{detail}</p>
          )}
        </div>
      )}

      <Button
        variant="primary"
        className="h-14"
        disabled={busy || (!sent && cooldown > 0)}
        onClick={sent ? verify : sendCode}
      >
        {busy
          ? t('auth.working')
          : sent
            ? t('auth.verify')
            : cooldown > 0
              ? t('auth.wait', { n: cooldown })
              : t('auth.emailMe')}
      </Button>

      {sent && (
        <>
          <Button
            variant="ghost"
            className="h-12"
            disabled={busy || cooldown > 0}
            onClick={sendCode}
          >
            {cooldown > 0 ? t('auth.resendIn', { n: cooldown }) : t('auth.resend')}
          </Button>
          <Button
            variant="ghost"
            className="h-12"
            onClick={() => {
              setSent(false)
              setCode('')
              setError(null)
              setDetail(null)
            }}
          >
            {t('auth.differentEmail')}
          </Button>
        </>
      )}
    </div>
  )
}
