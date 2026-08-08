import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { getFriendlyErrorMessage } from '@fixnow/api'
import { cn } from '@fixnow/utils'
import {
  AuthShell,
  AuthAlert,
  AuthSubmitButton,
  AuthTextField,
  PasswordField,
  RememberMeCheckbox,
  ContinueWithGoogleButton,
  useAuthSubmit,
  getRememberedEmail,
  persistRememberedEmail,
  useCmsCopy,
  marketplaceRolesOf,
  resolvePostAuthDestination,
  ROLE_SELECT_PATH,
  authActionPrimaryClass,
  authExpandPanelClass,
  authExpandPanelState,
} from '@fixnow/shared'

/**
 * Technician auth entry — Email first, then Google, then create account.
 * No Guest Mode (technician features require an authenticated identity).
 */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, logout } = useAuth()
  const { submitting, run } = useAuthSubmit()
  const welcome = useCmsCopy('login-welcome', 'technician')
  const [email, setEmail] = useState(() => getRememberedEmail())
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [showEmail, setShowEmail] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

  const finishAuth = (user: { email?: string }) => {
    persistRememberedEmail(user.email || email, rememberMe)
    const dest = resolvePostAuthDestination(user as never)
    if (dest === ROLE_SELECT_PATH) {
      navigate(ROLE_SELECT_PATH, { replace: true, state: { from } })
      return
    }
    navigate(from && from.startsWith('/technician') ? from : dest, { replace: true })
  }

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const nextErrors: { email?: string; password?: string } = {}
    if (!email.trim()) nextErrors.email = 'Enter your email.'
    if (!password) nextErrors.password = 'Enter your password.'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      document.getElementById(nextErrors.email ? 'tech-login-email' : 'tech-login-password')?.focus()
      return
    }

    void run(async () => {
      try {
        const user = await login({
          email: email.trim(),
          password,
          rememberMe,
          preferredRole: 'technician',
        })
        if (!marketplaceRolesOf(user).includes('technician')) {
          setError('This account does not have a technician profile yet.')
          await logout()
          return
        }
        finishAuth(user)
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      }
    })
  }

  return (
    <AuthShell
      brand="FixNow Pro"
      tagline={welcome.text || 'Welcome back — win jobs, build reputation, get paid.'}
      icon="handyman"
    >
      <div className="space-y-5">
        <div>
          <h2 className="text-title-md text-on-surface">Sign in</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">Use your FixNow technician account.</p>
        </div>

        <AuthAlert message={error} />

        {/* 1. Primary: Sign In with Email — form expands below */}
        <div className="space-y-3">
          <button
            type="button"
            aria-expanded={showEmail}
            aria-controls="technician-email-sign-in"
            className={authActionPrimaryClass}
            onClick={() => setShowEmail((open) => !open)}
          >
            Sign In with Email
          </button>

          <div
            id="technician-email-sign-in"
            className={cn(authExpandPanelClass, authExpandPanelState(showEmail))}
          >
            <div className="overflow-hidden">
              <form className="space-y-5 pt-1" noValidate onSubmit={onEmailSubmit}>
                <AuthTextField
                  id="tech-login-email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v)
                    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }))
                  }}
                  placeholder="alex@example.com"
                  error={fieldErrors.email}
                  required
                />

                <PasswordField
                  id="tech-login-password"
                  label="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }))
                  }}
                  placeholder="••••••••"
                  error={fieldErrors.password}
                  required
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <RememberMeCheckbox checked={rememberMe} onChange={setRememberMe} />
                  <Link to="/technician/forgot-password" className="text-mono-label text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <AuthSubmitButton busy={submitting} busyLabel="Signing in…">
                  Sign In
                </AuthSubmitButton>
              </form>
            </div>
          </div>
        </div>

        {/* 2. Google */}
        <ContinueWithGoogleButton
          role="technician"
          rememberMe={rememberMe}
          disabled={submitting}
          onError={setError}
          onSuccess={async ({ user }) => {
            if (!marketplaceRolesOf(user).includes('technician')) {
              setError('This account does not have a technician profile yet.')
              await logout()
              return
            }
            finishAuth(user)
          }}
        />

        {/* 3. Create Account (single) */}
        <p className="text-center text-sm text-on-surface-variant">
          New technician?{' '}
          <Link to="/technician/register" className="font-bold text-primary hover:underline">
            Create Account
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
