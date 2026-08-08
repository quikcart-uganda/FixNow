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
  enterGuestSession,
  clearGuestSession,
  getGuestPendingAction,
  clearGuestPendingAction,
  trackGuestEvent,
  setCustomerOnboarded,
  authActionPrimaryClass,
  authActionOutlineClass,
  authExpandPanelClass,
  authExpandPanelState,
} from '@fixnow/shared'

function resumeDestination(
  from: string | undefined,
  fallback: string,
): { path: string; state?: Record<string, unknown> } {
  const pending = getGuestPendingAction()
  if (pending?.path?.startsWith('/customer')) {
    clearGuestPendingAction()
    trackGuestEvent('guest_converted', { intent: pending.intent || pending.type, path: pending.path })
    return {
      path: pending.path,
      state: { resumeAction: pending.intent || pending.type, resumePayload: pending.payload },
    }
  }
  if (from?.startsWith('/customer')) {
    clearGuestPendingAction()
    return { path: from }
  }
  clearGuestPendingAction()
  return { path: fallback }
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, logout } = useAuth()
  const { submitting, run } = useAuthSubmit()
  const welcome = useCmsCopy('login-welcome', 'customer')
  const [email, setEmail] = useState(() => getRememberedEmail())
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [showEmail, setShowEmail] = useState(false)

  const state = location.state as {
    from?: string
    resumeAction?: string
  } | null
  const from = state?.from

  const finishAuth = (user: { email?: string }, destFallback: string) => {
    clearGuestSession()
    persistRememberedEmail(user.email || email, rememberMe)
    const dest = resolvePostAuthDestination(user as never)
    if (dest === ROLE_SELECT_PATH) {
      navigate(ROLE_SELECT_PATH, { replace: true, state: { from } })
      return
    }
    const resume = resumeDestination(from, destFallback.startsWith('/customer') ? destFallback : dest)
    navigate(resume.path, { replace: true, state: resume.state })
  }

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const nextErrors: { email?: string; password?: string } = {}
    if (!email.trim()) nextErrors.email = 'Enter your email.'
    if (!password) nextErrors.password = 'Enter your password.'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      document
        .getElementById(nextErrors.email ? 'customer-login-email' : 'customer-login-password')
        ?.focus()
      return
    }

    void run(async () => {
      try {
        const user = await login({
          email: email.trim(),
          password,
          rememberMe,
          preferredRole: 'customer',
        })
        if (!marketplaceRolesOf(user).includes('customer')) {
          setError('This account does not have a customer profile yet.')
          await logout()
          return
        }
        finishAuth(user, resolvePostAuthDestination(user))
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      }
    })
  }

  return (
    <AuthShell
      brand="FixNow"
      tagline={welcome.text || 'Welcome back — professional fixes, one tap away.'}
      icon="build"
    >
      <div className="space-y-5">
        <div>
          <h2 className="text-title-md text-on-surface">Welcome</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Sign in to book and manage jobs, or browse as a guest.
          </p>
        </div>

        <AuthAlert message={error} />

        {/* 1. Primary: Sign In with Email — form expands below */}
        <div className="space-y-3">
          <button
            type="button"
            aria-expanded={showEmail}
            aria-controls="customer-email-sign-in"
            className={authActionPrimaryClass}
            onClick={() => setShowEmail((open) => !open)}
          >
            Sign In with Email
          </button>

          <div
            id="customer-email-sign-in"
            className={cn(authExpandPanelClass, authExpandPanelState(showEmail))}
          >
            <div className="overflow-hidden">
              <form className="space-y-5 pt-1" noValidate onSubmit={onEmailSubmit}>
                <AuthTextField
                  id="customer-login-email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v)
                    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }))
                  }}
                  placeholder="john@example.com"
                  error={fieldErrors.email}
                  required
                />

                <PasswordField
                  id="customer-login-password"
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
                  <Link to="/customer/forgot-password" className="text-mono-label text-primary hover:underline">
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
          role="customer"
          rememberMe={rememberMe}
          disabled={submitting}
          onError={setError}
          onSuccess={async ({ user }) => {
            if (!marketplaceRolesOf(user).includes('customer')) {
              setError('This account does not have a customer profile yet.')
              await logout()
              return
            }
            finishAuth(user, resolvePostAuthDestination(user))
          }}
        />

        {/* 3. Create Account (single) */}
        <p className="text-center text-sm text-on-surface-variant">
          New here?{' '}
          <Link to="/customer/register" state={{ from }} className="font-bold text-primary hover:underline">
            Create Account
          </Link>
        </p>

        {/* 4. Guest fallback */}
        <button
          type="button"
          className={authActionOutlineClass}
          onClick={() => {
            enterGuestSession()
            setCustomerOnboarded(true)
            trackGuestEvent('guest_continue_from_login')
            navigate('/customer/home', { replace: true })
          }}
        >
          <span className="material-symbols-outlined text-[1.25rem]" aria-hidden>
            person_outline
          </span>
          Continue as Guest
        </button>
      </div>
    </AuthShell>
  )
}
