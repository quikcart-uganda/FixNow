import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { platformModeApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { AuthAlert, AuthTextField, PasswordField, useAuthSubmit } from '@fixnow/shared'
import { Button, Icon } from '../components/ui'

const TOTAL_STEPS = 7

function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 12) issues.push('At least 12 characters')
  if (!/[a-z]/.test(password)) issues.push('A lowercase letter')
  if (!/[A-Z]/.test(password)) issues.push('An uppercase letter')
  if (!/\d/.test(password)) issues.push('A number')
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('A symbol')
  return issues
}

/**
 * Production Owner Setup Wizard — creates the first Production Super Admin.
 * Required before Production Mode can be entered.
 */
export function ProductionOwnerPage() {
  const navigate = useNavigate()
  const { submitting, run } = useAuthSubmit()
  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPhone, setRecoveryPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [enableMfaIntent, setEnableMfaIntent] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    platformModeApi
      .publicStatus()
      .then((res) => {
        if (active && res.data.hasProductionSuperAdmin) {
          navigate('/admin/settings/governance', { replace: true })
        }
      })
      .catch(() => {
        /* allow wizard; API guards creation */
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
      setError('Enter the Production Owner full name.')
      return
    }
    if (step === 2 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid business email.')
      return
    }
    if (step === 3 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recoveryEmail.trim())) {
      setError('Enter a valid recovery email.')
      return
    }
    if (step === 5 && pwIssues.length > 0) {
      setError('Choose a stronger password.')
      return
    }
    if (step === 6 && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }

  function submit() {
    if (!acknowledged) {
      setError('Confirm you understand Production Super Admin authority.')
      return
    }
    setError(null)
    void run(async () => {
      try {
        await platformModeApi.createProductionOwner({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          recoveryEmail: recoveryEmail.trim(),
          recoveryPhone: recoveryPhone.trim() || undefined,
          enableMfaIntent,
        })
        setDone(true)
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      }
    })
  }

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg space-y-4 rounded-3xl border border-border-subtle bg-surface p-8">
          <Icon name="verified" className="text-4xl text-primary" />
          <h1 className="text-2xl font-semibold">Production Super Admin ready</h1>
          <p className="text-on-surface-variant">
            Sign in with {email}, then open Production Governance to enter Production Mode when ready.
          </p>
          <Link to="/admin/login">
            <Button className="w-full">Continue to login</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-5 rounded-3xl border border-border-subtle bg-surface p-8">
        <div>
          <p className="text-caps text-primary">Production Owner Setup</p>
          <h1 className="text-2xl font-semibold">Create Production Super Admin</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Required before Production Mode. Development Super Admin and Sandbox data are preserved.
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">
            Step {step} of {TOTAL_STEPS}
          </p>
        </div>

        {error ? <AuthAlert message={error} /> : null}

        {step === 1 ? (
          <AuthTextField label="Full name" value={fullName} onChange={setFullName} autoFocus />
        ) : null}
        {step === 2 ? (
          <AuthTextField label="Business email" type="email" value={email} onChange={setEmail} autoFocus />
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <AuthTextField
              label="Recovery email"
              type="email"
              value={recoveryEmail}
              onChange={setRecoveryEmail}
              autoFocus
            />
            <AuthTextField
              label="Recovery phone (optional)"
              value={recoveryPhone}
              onChange={setRecoveryPhone}
            />
          </div>
        ) : null}
        {step === 4 ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={enableMfaIntent}
              onChange={(e) => setEnableMfaIntent(e.target.checked)}
              className="mt-1"
            />
            <span>
              I will enrol multi-factor authentication after login when MFA is configured on this
              deployment.
            </span>
          </label>
        ) : null}
        {step === 5 ? (
          <PasswordField
            label="Strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : null}
        {step === 6 ? (
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        ) : null}
        {step === 7 ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this account can switch Platform Mode, suspend developer tooling visibility,
              and manage production governance — without deleting Sandbox or Seed data.
            </span>
          </label>
        ) : null}

        <div className="flex gap-2">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <Link to="/admin/login" className="flex-1">
              <Button variant="secondary" className="w-full">
                Cancel
              </Button>
            </Link>
          )}
          {step < TOTAL_STEPS ? (
            <Button className="flex-1" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button className="flex-1" disabled={submitting} onClick={submit}>
              {submitting ? 'Creating…' : 'Create Production Super Admin'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
