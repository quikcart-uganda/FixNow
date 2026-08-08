import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Icon } from '../components/ui'
import { useAuth } from '@fixnow/hooks'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import {
  AuthAlert,
  AuthSubmitButton,
  AuthTextField,
  PasswordField,
  RememberMeCheckbox,
  useAuthSubmit,
  getRememberedEmail,
  persistRememberedEmail,
} from '@fixnow/shared'

type BootstrapStatus = Awaited<ReturnType<typeof adminApi.bootstrapStatus>>['data']

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] auth-screen-enter">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,74,198,0.08),_transparent_55%)]" />
        <div className="absolute top-[-12%] right-[-8%] h-[520px] w-[520px] rounded-full bg-primary/25 blur-[130px]" />
        <div className="absolute bottom-[-14%] left-[-10%] h-[420px] w-[420px] rounded-full bg-secondary-fixed-dim/40 blur-[110px]" />
      </div>
      <main className="relative z-10 w-full max-w-[560px]">{children}</main>
    </div>
  )
}

function BrandMark({
  onPointerDown,
  onPointerUp,
}: {
  onPointerDown: () => void
  onPointerUp: () => void
}) {
  return (
    <button
      type="button"
      className="mb-7 h-16 w-16 rounded-[14px] shadow-[0_8px_24px_rgba(0,74,198,0.28)] transition duration-200 hover:shadow-[0_10px_28px_rgba(0,74,198,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.97]"
      aria-label="FixNow"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src="/brand/fixnow-mark.svg"
        alt=""
        width={64}
        height={64}
        className="h-16 w-16 rounded-[14px]"
        draggable={false}
      />
    </button>
  )
}

/**
 * Silent developer shortcut: long-press logo or Ctrl/Cmd+Shift+D.
 * Only navigates when the server reports the hidden capability is enabled.
 * Never renders labels, banners, or hints in the UI.
 */
function useSilentDevShortcut(enabled: boolean) {
  const navigate = useNavigate()
  const pressTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        navigate('/admin/dev')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, navigate])

  function onLogoPointerDown() {
    if (!enabled) return
    pressTimer.current = window.setTimeout(() => {
      navigate('/admin/dev')
    }, 1200)
  }

  function onLogoPointerUp() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  return { onLogoPointerDown, onLogoPointerUp }
}

export function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, logout, devAdminLogin } = useAuth()
  const { submitting, run } = useAuthSubmit()
  const [email, setEmail] = useState(() => getRememberedEmail())
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const [status, setStatus] = useState<BootstrapStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [devBusy, setDevBusy] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)
  /** First-run landing can switch to credential sign-in without leaving /admin/login. */
  const [forceCredentialLogin, setForceCredentialLogin] = useState(() => {
    const params = new URLSearchParams(location.search)
    return params.get('restore') === '1' || params.get('signin') === '1'
  })

  const from = (location.state as { from?: string } | null)?.from
  const devLoginAvailable = Boolean(status?.devLoginEnabled)
  const { onLogoPointerDown, onLogoPointerUp } = useSilentDevShortcut(devLoginAvailable)

  useEffect(() => {
    let active = true
    adminApi
      .bootstrapStatus()
      .then((res) => {
        if (active) setStatus(res.data)
      })
      .catch(() => {
        if (active) setStatus(null)
      })
      .finally(() => {
        if (active) setStatusLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('restore') === '1' || params.get('signin') === '1') {
      setForceCredentialLogin(true)
    }
  }, [location.search])

  function goToConsole() {
    navigate(from && from.startsWith('/admin') ? from : '/admin/dashboard', { replace: true })
  }

  /**
   * One-tap Development Administrator entry. Only reachable when the server
   * reports devLoginEnabled (ALLOW_DEV_ADMIN_LOGIN + non-production) — the
   * endpoint independently refuses otherwise.
   */
  async function enterAsDevAdmin() {
    setDevError(null)
    setDevBusy(true)
    try {
      await devAdminLogin()
      goToConsole()
    } catch (err) {
      setDevError(getFriendlyErrorMessage(err))
    } finally {
      setDevBusy(false)
    }
  }

  if (statusLoading) {
    return (
      <AuthShell>
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
        </div>
      </AuthShell>
    )
  }

  const noAdmins = status ? !status.completed : false

  // ---- First-run Command Center landing ----
  if (noAdmins && !forceCredentialLogin) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center animate-fade-up">
          <BrandMark onPointerDown={onLogoPointerDown} onPointerUp={onLogoPointerUp} />

          <p className="text-[15px] font-medium tracking-[-0.01em] text-ink-muted">Welcome to FixNow</p>
          <h1 className="mt-1.5 text-[34px] font-semibold leading-[1.1] tracking-[-0.04em] text-ink-primary sm:text-[40px]">
            Command Center
          </h1>
          <p className="mt-3 max-w-[26rem] text-[15px] leading-relaxed text-ink-muted">
            Configure your administration workspace and manage your marketplace.
          </p>
        </div>

        <div className="mt-10 space-y-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <AuthAlert message={devError} />

          <Link
            to="/admin/setup"
            className="group flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(0,74,198,0.28)] transition duration-200 hover:brightness-[1.05] hover:shadow-[0_10px_28px_rgba(0,74,198,0.34)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            Create First Administrator
            <Icon
              name="arrow_forward"
              className="!text-[20px] transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>

          {devLoginAvailable && (
            <button
              type="button"
              onClick={() => void enterAsDevAdmin()}
              disabled={devBusy}
              className="group flex w-full items-center gap-4 rounded-[20px] border border-border bg-canvas p-4 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {devBusy ? (
                  <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <Icon name="bolt" className="!text-[22px]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-primary">
                    Development Access
                  </span>
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-800">
                    Internal only
                  </span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                  {devBusy ? 'Signing in…' : 'Not a production login — seeded Development Administrator.'}
                </span>
              </span>
              <Icon
                name="arrow_forward"
                className="!text-[18px] shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setForceCredentialLogin(true)
              navigate('/admin/login?restore=1', { replace: true })
            }}
            className="group flex w-full items-center gap-4 rounded-[20px] border border-border bg-canvas p-4 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-ink-secondary">
              <Icon name="shield" className="!text-[22px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink-primary">
                Restore Existing Administration
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                Sign in to an existing Command Center.
              </span>
            </span>
            <Icon
              name="chevron_right"
              className="!text-[22px] shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </AuthShell>
    )
  }

  // ---- Standard Command Center login ----
  return (
    <AuthShell>
      <div className="mb-9 flex flex-col items-center text-center animate-fade-up">
        <BrandMark onPointerDown={onLogoPointerDown} onPointerUp={onLogoPointerUp} />
        <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-ink-primary">FixNow</h1>
        <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink-secondary">Command Center Login</p>
        <p className="mt-2 text-sm text-ink-muted">Enter your administrative credentials</p>
      </div>

      <div className="rounded-[20px] border border-border bg-canvas p-7 shadow-[0_8px_30px_rgba(15,23,42,0.06)] animate-scale-in sm:p-8">
        <form
          className="space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            const nextErrors: { email?: string; password?: string } = {}
            if (!email.trim()) nextErrors.email = 'Enter your work email.'
            if (!password) nextErrors.password = 'Enter your password.'
            setFieldErrors(nextErrors)
            if (Object.keys(nextErrors).length) {
              document.getElementById(nextErrors.email ? 'admin-email' : 'admin-password')?.focus()
              return
            }
            void run(async () => {
              try {
                const user = await login({ email: email.trim(), password, rememberMe })
                if (user.role !== 'admin') {
                  await logout()
                  const techEmail = 'quikcart2026@gmail.com'
                  if (email.trim().toLowerCase() === techEmail) {
                    setError(
                      'That email is the Seed Platform developer technician (FixNow Pro), not the Development Administrator. Use /technician/login, or open Admin → Internal Development Access for Dev Admin.',
                    )
                  } else {
                    setError('This account is not an admin account. Use the Customer or Technician portal for marketplace logins.')
                  }
                  return
                }
                persistRememberedEmail(email, rememberMe)
                goToConsole()
              } catch (err) {
                setError(getFriendlyErrorMessage(err))
              }
            })
          }}
        >
          <AuthAlert message={error} />

          <AuthTextField
            id="admin-email"
            label="Work email"
            labelClassName="text-[13px] font-medium text-ink-primary"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v)
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }))
            }}
            error={fieldErrors.email}
            required
            autoComplete="username"
            className="border-border-strong bg-surface-alt text-sm"
          />

          <PasswordField
            id="admin-password"
            label="Password"
            labelClassName="text-[13px] font-medium text-ink-primary"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }))
            }}
            error={fieldErrors.password}
            autoComplete="current-password"
            required
            className="border-border-strong bg-surface-alt"
          />

          <div className="flex items-center justify-between gap-3 text-sm">
            <RememberMeCheckbox
              checked={rememberMe}
              onChange={setRememberMe}
              label="Remember device"
              className="text-ink-secondary"
            />
            <Link to="/admin/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          <AuthSubmitButton busy={submitting} busyLabel="Signing in…" showArrow={false} className="min-h-[52px] rounded-2xl py-3">
            Sign in to Command Center
          </AuthSubmitButton>
        </form>
        {noAdmins ? (
          <button
            type="button"
            onClick={() => {
              setForceCredentialLogin(false)
              navigate('/admin/login', { replace: true })
            }}
            className="mt-4 w-full text-center text-xs font-medium text-primary hover:underline"
          >
            Back to setup options
          </button>
        ) : null}
        <p className="mt-6 text-center text-xs text-ink-muted">Protected admin access · Audit logged</p>
      </div>

      {devLoginAvailable && (
        <div className="mt-5 animate-fade-up">
          <AuthAlert message={devError} />
          <button
            type="button"
            onClick={() => void enterAsDevAdmin()}
            disabled={devBusy}
            className="group mx-auto flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-2xl border border-dashed border-amber-300/80 bg-amber-50/50 px-4 py-2.5 text-[13px] font-medium text-amber-900 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md active:scale-[0.99] disabled:opacity-60"
          >
            <Icon name="bolt" className="!text-[16px] text-amber-700" />
            {devBusy ? 'Signing in…' : 'Internal Development Access'}
          </button>
        </div>
      )}
    </AuthShell>
  )
}
