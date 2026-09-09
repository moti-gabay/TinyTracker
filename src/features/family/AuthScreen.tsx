import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

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
  if (code === 'otp_expired' || /expired/i.test(message))
    return 'That code expired. Request a new one.'
  if (/rate limit/i.test(message))
    return 'Too many codes sent from this project. Wait an hour, or set up SMTP in Supabase.'
  if (code === 'otp_disabled' || /signups not allowed/i.test(message))
    return 'Sign-ups are turned off for this project.'
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
        <h1 className="text-2xl font-bold text-text">Sync with your partner</h1>
        <p className="mt-1 text-sm text-text-muted">
          We email you a code. No password to remember.
        </p>
      </div>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="you@example.com"
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
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-center text-2xl tracking-[0.3em] tabular-nums text-text placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted"
          />
          <p className="text-xs text-text-muted">
            Got a link instead of a code? Tap it — it signs you in too.
          </p>
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
          ? 'Working…'
          : sent
            ? 'Verify code'
            : cooldown > 0
              ? `Wait ${cooldown}s`
              : 'Email me a code'}
      </Button>

      {sent && (
        <>
          <Button
            variant="ghost"
            className="h-12"
            disabled={busy || cooldown > 0}
            onClick={sendCode}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the code'}
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
            Use a different email
          </Button>
        </>
      )}
    </div>
  )
}
