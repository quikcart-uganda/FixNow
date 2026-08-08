import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { AuthAlert, AuthTextField, PasswordField, useAuthSubmit } from '@fixnow/shared'
import { Button, Icon } from '../components/ui'

const TOTAL_STEPS = 6

function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 12) issues.push('At least 12 characters')
  if (!/[a-z]/.test(password)) issues.push('A lowercase letter')
  if (!/[A-Z]/.test(password)) issues.push('An uppercase letter')
  if (!/\d/.test(password)) issues.push('A number')
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('A symbol')
  return issues
}

export function AdminSetupPage() {
  const navigate = useNavigate()
  const { submitting, run } = useAuthSubmit()

  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [enableMfa, setEnableMfa] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    let active = true
    adminApi
      .bootstrapStatus()
      .then((res) => {
        if (active && res.data.completed) {
          navigate('/admin/login', { replace: true })
        }
      })
      .catch(() => {
        /* allow the wizard; the API still guards creation server-side */
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [navigate])

  const pwIssues = useMemo(() => passwordIssues(password), [password])

  function next() {
    setError(null)
    if (step === 1 && fullName.trim().length < 2) {
      setError('Enter the administrator name.')
      return
    }
    if (step === 2 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid work email.')
      return
    }
    if (step === 4 && pwIssues.length > 0) {
      setError('Choose a stronger password.')
      return
    }
    if (step === 5 && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }

  function back() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  function submit() {
    setError(null)
    void run(async () => {
      try {
        const res = await adminApi.bootstrapFirstAdmin({
          email: email.trim(),
          fullName: fullName.trim(),
          password,
          phone: phone.trim() || undefined,
        })
        setRecoveryKey(res.data.bootstrapRecoveryKey)
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      }
    })
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-label="Loading">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
      </div>
    )
  }

  // ---- Recovery key reveal (shown once) ----
  if (recoveryKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <main className="w-full max-w-[480px]">
          <div className="rounded-xl border border-amber-300 bg-canvas p-8 shadow-sm">
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Icon name="vpn_key" className="!text-[32px]" />
              </div>
              <h1 className="text-[22px] font-semibold text-ink-primary">Administrator Recovery Key</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Store this offline now. It is shown once and is required if you ever need to recover Super Admin access.
              </p>
            </div>
            <pre className="mb-4 select-all overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-lg font-bold tracking-[0.15em] text-amber-900">
              {recoveryKey}
            </pre>
            <label className="mb-5 flex items-start gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              I have stored the recovery key in a secure location.
            </label>
            <Button
              className="w-full"
              disabled={!acknowledged}
              onClick={() => navigate('/admin/login', { replace: true })}
            >
              Finish setup &amp; go to login
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <main className="w-full max-w-[480px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-14 w-14">
            <img src="/brand/fixnow-mark.svg" alt="" width={56} height={56} className="h-14 w-14 rounded-xl shadow-lg" />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-ink-primary">
            Create Administrator
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Step {step} of {TOTAL_STEPS}</p>
        </div>

        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="rounded-xl border border-border bg-canvas p-8 shadow-sm">
          <AuthAlert message={error} />

          {step === 1 ? (
            <AuthTextField
              id="setup-name"
              label="Administrator name"
              value={fullName}
              onChange={setFullName}
              required
              autoComplete="name"
              className="border-border-strong bg-surface-alt text-sm"
            />
          ) : null}

          {step === 2 ? (
            <AuthTextField
              id="setup-email"
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="username"
              className="border-border-strong bg-surface-alt text-sm"
            />
          ) : null}

          {step === 3 ? (
            <AuthTextField
              id="setup-phone"
              label="Phone (optional)"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
              className="border-border-strong bg-surface-alt text-sm"
            />
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <PasswordField
                id="setup-password"
                label="Strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border-strong bg-surface-alt"
              />
              {password && pwIssues.length > 0 ? (
                <ul className="space-y-1 text-xs text-ink-muted">
                  {pwIssues.map((i) => (
                    <li key={i} className="flex items-center gap-1">
                      <Icon name="close" className="!text-[14px] text-error" /> {i}
                    </li>
                  ))}
                </ul>
              ) : password ? (
                <p className="flex items-center gap-1 text-xs text-trust-high">
                  <Icon name="check" className="!text-[14px]" /> Strong password
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 5 ? (
            <PasswordField
              id="setup-confirm"
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="border-border-strong bg-surface-alt"
            />
          ) : null}

          {step === 6 ? (
            <div className="space-y-4">
              <label className="flex items-start gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={enableMfa}
                  onChange={(e) => setEnableMfa(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Enable multi-factor authentication (optional). You can complete MFA enrolment from
                  <strong> Settings → Administration</strong> after signing in.
                </span>
              </label>
              <div className="rounded-lg border border-border bg-surface-alt p-4 text-sm text-ink-secondary">
                <p className="font-medium text-ink-primary">Review</p>
                <p className="mt-1">{fullName} · {email}</p>
                {phone ? <p>{phone}</p> : null}
                <p className="mt-2 text-xs">
                  A one-time recovery key will be shown next. Keep it offline — it will not be displayed again.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex gap-2">
            {step > 1 ? (
              <Button variant="outline" onClick={back} disabled={submitting}>
                Back
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate('/admin/login')} disabled={submitting}>
                Cancel
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button className="flex-1" onClick={next}>
                Continue
              </Button>
            ) : (
              <Button className="flex-1" onClick={submit} disabled={submitting} aria-busy={submitting}>
                {submitting ? 'Creating…' : 'Create administrator'}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
