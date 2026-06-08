import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { isValidEmail } from '@/lib/auth'
import { isEnabledFlag } from '@/lib/devAuth'
import { safeNextPath } from '@/lib/routing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Read the intended post-login destination from the current URL. Kept local so
// `AuthGate` stays prop-free (mirrors `PermsProbe`'s `URLSearchParams` idiom).
function readNext(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('next')
}

// ---------------------------------------------------------------------------
// The single reusable sign-in island (SPEC §38, §42): email step → code step →
// signed-in view with sign-out. Consumes the shared `useAuth` hook, uses the
// `ui/button` + `ui/input` primitives and Tailwind, and drives every
// `data-testid` the auth e2e suite asserts on. Errors are surfaced inline via a
// `role="alert"` element and logged — never swallowed (mirrors EventSpineHarness).
// ---------------------------------------------------------------------------

type Step = 'email' | 'code'

export default function AuthGate() {
  const { user, isLoading, username, sendCode, verifyCode, signOut } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devSecret, setDevSecret] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // One-shot latch so the post-sign-in redirect fires once, not on every
  // re-render or StrictMode double-invoke.
  const redirected = useRef(false)

  // Intended-destination round-trip (SPEC §39): once authenticated — whether the
  // user just verified a code or loaded `/login` already signed in — navigate to
  // a validated `next`, else the `/dashboard` default. `safeNextPath` neutralizes
  // any hostile/off-origin `next` so a crafted param can't drive an open redirect.
  useEffect(() => {
    if (!user || redirected.current || typeof window === 'undefined') return
    redirected.current = true
    window.location.replace(safeNextPath(readNext()))
  }, [user])

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setFormError(message)
    console.error('[AuthGate]', err)
  }

  async function requestDevCode(addr: string): Promise<string> {
    const response = await fetch('/api/auth/dev-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: addr, secret: devSecret }),
    })
    const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string }
    if (!response.ok || !body.code) {
      throw new Error(body.error ? `Developer login failed: ${body.error}` : 'Developer login failed')
    }
    return body.code
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    // Failure path (SPEC §43): invalid/empty email surfaces a validation message
    // and does NOT call sendMagicCode — no state change, no advance.
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email address')
      return
    }
    setPending(true)
    try {
      await sendCode(email)
      setStep('code')
    } catch (err) {
      // InstantDB unavailable / sendMagicCode rejects: stay on the email step.
      surface(err)
    } finally {
      setPending(false)
    }
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setPending(true)
    try {
      await verifyCode(email, code)
      // On success the auth state flips and the signed-in view renders.
    } catch (err) {
      // Failure path (SPEC §43): wrong/expired code surfaces an inline error and
      // leaves the user on the code step, free to retry or request a new code.
      surface(err)
    } finally {
      setPending(false)
    }
  }

  async function onResend() {
    setFormError(null)
    setPending(true)
    try {
      await sendCode(email)
    } catch (err) {
      surface(err)
    } finally {
      setPending(false)
    }
  }

  async function onDevSignIn() {
    setFormError(null)
    const normalizedEmail = email.trim()
    if (!isValidEmail(normalizedEmail)) {
      setFormError('Enter a valid email address')
      return
    }
    if (!devSecret.trim()) {
      setFormError('Enter the developer login secret')
      return
    }

    setPending(true)
    try {
      const mintedCode = await requestDevCode(normalizedEmail)
      setCode(mintedCode)
      await verifyCode(normalizedEmail, mintedCode)
    } catch (err) {
      surface(err)
    } finally {
      setPending(false)
    }
  }

  async function onSignOut() {
    setFormError(null)
    try {
      await signOut()
      setStep('email')
      setEmail('')
      setCode('')
    } catch (err) {
      surface(err)
    }
  }

  const errorEl = formError ? (
    <p data-testid="auth-error" role="alert" className="mt-3 text-sm text-destructive">
      {formError}
    </p>
  ) : null

  if (isLoading) {
    return (
      <p data-testid="auth-loading" className="text-sm text-muted-foreground">
        Loading…
      </p>
    )
  }

  if (user) {
    return (
      <section data-testid="auth-signed-in" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        {/* Username only — never the raw email in primary view copy (SPEC §40). */}
        <p data-testid="auth-username" className="text-lg font-medium">
          {username}
        </p>
        <Button data-testid="auth-signout" variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
        {errorEl}
      </section>
    )
  }

  if (step === 'code') {
    return (
      <form data-testid="auth-code-form" onSubmit={onVerifyCode} className="flex flex-col gap-3">
        <label htmlFor="auth-code" className="text-sm font-medium">
          Enter the code we emailed you
        </label>
        <Input
          id="auth-code"
          data-testid="auth-code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button data-testid="auth-verify" type="submit" disabled={pending}>
          {pending ? 'Verifying…' : 'Verify code'}
        </Button>
        <Button
          data-testid="auth-resend"
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onResend}
        >
          Resend code
        </Button>
        {errorEl}
      </form>
    )
  }

  return (
    <form data-testid="auth-email-form" onSubmit={onSendCode} className="flex flex-col gap-3">
      <label htmlFor="auth-email" className="text-sm font-medium">
        Sign in with your email
      </label>
      {/* type="text" (not "email") so our own SPEC §43 validation message wins —
          a native `type="email"` bubble would pre-empt the inline auth-error. */}
      <Input
        id="auth-email"
        data-testid="auth-email-input"
        type="text"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button data-testid="auth-send" type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send code'}
      </Button>
      {isEnabledFlag(import.meta.env.PUBLIC_DEV_LOGIN_ENABLED) ? (
        <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
          <label htmlFor="auth-dev-secret" className="text-sm font-medium">
            Developer login secret
          </label>
          <Input
            id="auth-dev-secret"
            data-testid="auth-dev-secret-input"
            type="password"
            autoComplete="off"
            value={devSecret}
            onChange={(e) => setDevSecret(e.target.value)}
          />
          <Button
            data-testid="auth-dev-signin"
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onDevSignIn}
          >
            {pending ? 'Signing in…' : 'Developer sign in'}
          </Button>
        </div>
      ) : null}
      {errorEl}
    </form>
  )
}
