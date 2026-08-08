import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getFriendlyErrorMessage, getLastSelectedRole, isCapacitorNative } from '@fixnow/api'
import { useAuth } from '@fixnow/hooks'
import { Icon } from '@fixnow/ui'
import { FIXNOW_MARK_SRC } from '../splash/FixNowSplash'
import {
  homePathForRole,
  marketplaceRolesOf,
  roleMeta,
  type MarketplaceRole,
} from './roleNavigation'

/**
 * QuikCart-inspired role picker for identities with both Customer and Technician profiles.
 * Does not change authentication — only activates an existing marketplace role.
 */
export function RoleSelectPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, user, isAuthenticated, switchRole, logout } = useAuth()
  const [busy, setBusy] = useState<MarketplaceRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roles = useMemo(() => marketplaceRolesOf(user), [user])
  const roleKey = roles.join(',')
  const last = getLastSelectedRole()
  const firstName = String(user?.fullName || 'there')
    .trim()
    .split(/\s+/)[0] || 'there'
  const from = (location.state as { from?: string } | null)?.from

  useEffect(() => {
    if (status === 'loading') return
    if (!isAuthenticated || !user) return
    if (roles.length === 1) {
      navigate(homePathForRole(roles[0]), { replace: true })
    }
  }, [status, isAuthenticated, user, roleKey, navigate, roles])

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />
  }

  if (roles.length === 0) {
    const adminHome = user.role === 'admin' && !isCapacitorNative() ? '/admin/dashboard' : '/'
    return <Navigate to={adminHome} replace />
  }

  if (roles.length === 1) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Continuing">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
      </div>
    )
  }

  const destinationFor = (role: MarketplaceRole) => {
    if (from && role === 'customer' && from.startsWith('/customer')) return from
    if (from && role === 'technician' && from.startsWith('/technician')) return from
    return homePathForRole(role)
  }

  const choose = (role: MarketplaceRole) => {
    setError(null)
    setBusy(role)
    void (async () => {
      try {
        if (user.role !== role) {
          await switchRole(role)
        }
        navigate(destinationFor(role), { replace: true })
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
        setBusy(null)
      }
    })()
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-canvas-white px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute left-[-12%] top-[-14%] h-[42%] w-[42%] rounded-full bg-primary opacity-[0.05] blur-[110px]" />
        <div className="absolute bottom-[-12%] right-[-10%] h-[40%] w-[40%] rounded-full bg-trust-blue opacity-[0.07] blur-[110px]" />
      </div>

      <div className="w-full max-w-[440px]">
        <header className="mb-8 text-center animate-fade-up">
          <img
            src={FIXNOW_MARK_SRC}
            alt=""
            width={56}
            height={56}
            className="mb-5 inline-block h-14 w-14 rounded-2xl shadow-lg shadow-primary/25"
            decoding="async"
          />
          <h1 className="text-title-md text-on-surface">Welcome back, {firstName}</h1>
          <p className="mt-2 text-body-lg text-on-surface-variant">
            Choose how you&apos;d like to continue.
          </p>
        </header>

        {error ? (
          <p className="mb-4 rounded-xl border border-error/30 bg-error-container/40 px-4 py-3 text-center text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-3 animate-scale-in">
          {roles.map((role) => {
            const meta = roleMeta(role)
            const preferred = last === role
            const isBusy = busy === role
            return (
              <button
                key={role}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => choose(role)}
                className={`flex w-full items-start gap-4 rounded-2xl border bg-canvas-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 ${
                  preferred ? 'border-primary ring-1 ring-primary/30' : 'border-border-subtle'
                }`}
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={meta.icon} className="text-2xl" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-title-sm font-semibold text-on-surface">{meta.title}</span>
                    {preferred ? (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Last used
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-body-sm text-on-surface-variant">{meta.description}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    {isBusy ? 'Continuing…' : 'Continue'}
                    <Icon name="arrow_forward" className="text-base" />
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-8 text-center text-xs text-on-surface-variant">
          Signed in as {user.email}
        </p>
        <button
          type="button"
          className="mt-3 w-full text-center text-sm font-semibold text-on-surface-variant underline-offset-2 hover:underline"
          onClick={() => {
            void logout()
              .catch(() => undefined)
              .finally(() => navigate('/', { replace: true }))
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  )
}
