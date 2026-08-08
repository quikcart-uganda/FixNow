import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { AuthAlert, AuthSubmitButton, AuthTextField, PasswordField, useAuthSubmit } from '@fixnow/shared'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { submitting, run } = useAuthSubmit()
  const [token, setToken] = useState(() => params.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface p-4">
      <main className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 h-16 w-16">
            <img src="/brand/fixnow-mark.svg" alt="" width={64} height={64} className="h-16 w-16 rounded-xl shadow-lg" />
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink-primary">Activate admin access</h1>
          <p className="mt-2 text-sm text-ink-muted">Set a strong password to complete your invitation.</p>
        </div>

        <div className="rounded-xl border border-border bg-canvas p-8 shadow-sm">
          {done ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-ink-primary">Your administrator account is active.</p>
              <Link to="/admin/login" className="inline-flex text-sm font-semibold text-primary">
                Continue to Command Center login
              </Link>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                setError(null)
                if (password !== confirm) {
                  setError('Passwords do not match.')
                  return
                }
                void run(async () => {
                  try {
                    await adminApi.acceptAdminInvite({ token: token.trim(), password })
                    setDone(true)
                    window.setTimeout(() => navigate('/admin/login', { replace: true }), 1200)
                  } catch (err) {
                    setError(getFriendlyErrorMessage(err))
                  }
                })
              }}
            >
              <AuthAlert message={error} />
              <AuthTextField
                id="invite-token"
                label="Invitation token"
                value={token}
                onChange={setToken}
                required
                className="border-border-strong bg-surface-alt text-sm"
              />
              <PasswordField
                id="invite-password"
                label="New password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                className="border-border-strong bg-surface-alt"
              />
              <PasswordField
                id="invite-confirm"
                label="Confirm password"
                value={confirm}
                onChange={(ev) => setConfirm(ev.target.value)}
                required
                className="border-border-strong bg-surface-alt"
              />
              <p className="text-xs text-ink-muted">
                Use 12+ characters with upper, lower, number, and symbol. Existing sessions are not created until
                you sign in.
              </p>
              <AuthSubmitButton busy={submitting} busyLabel="Activating…" showArrow={false} className="py-3">
                Activate account
              </AuthSubmitButton>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
