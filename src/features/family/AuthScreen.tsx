import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

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

  const sendCode = async () => {
    if (!supabase || !email.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const verify = async () => {
    if (!supabase || code.trim().length < 6) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(error.message)
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
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={sent}
        className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text placeholder:text-text-muted"
      />

      {sent && (
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-h-14 rounded-2xl border border-border bg-surface-2 px-4 text-center text-2xl tracking-[0.3em] tabular-nums text-text placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted"
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        variant="primary"
        className="h-14"
        disabled={busy}
        onClick={sent ? verify : sendCode}
      >
        {busy ? 'Working…' : sent ? 'Verify code' : 'Email me a code'}
      </Button>

      {sent && (
        <Button variant="ghost" className="h-12" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      )}
    </div>
  )
}
