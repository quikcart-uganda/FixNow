import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { AuthAlert } from '@fixnow/shared'
import { Icon } from '../components/ui'

/**
 * Hidden developer entry — NOT linked from the standard Admin UI.
 *
 * Availability is decided solely by the server (`devLoginEnabled` from
 * ALLOW_DEV_ADMIN_LOGIN + non-production). When disabled, this page redirects
 * to /admin/login with no explanation of why.
 *
 * Access paths for engineers:
 * - Navigate to /admin/dev directly
 * - Long-press the logo on /admin/login (when enabled)
 * - Ctrl/Cmd+Shift+D on /admin/login (when enabled)
 */
export function AdminDevEntryPage() {
  const navigate = useNavigate()
  const { devAdminLogin, isAuthenticated, user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminApi
      .bootstrapStatus()
      .then((res) => {
        if (!active) return
        if (!res.data.devLoginEnabled) {
          navigate('/admin/login', { replace: true })
          return
        }
        setAllowed(true)
      })
      .catch(() => {
        if (active) navigate('/admin/login', { replace: true })
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [navigate])

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      navigate('/admin/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  async function enter() {
    setError(null)
    setBusy(true)
    try {
      await devAdminLogin()
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-label="Loading">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <main className="w-full max-w-[400px] rounded-xl border border-border bg-canvas p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
            <Icon name="admin_panel_settings" className="!text-[28px]" />
          </div>
          <h1 className="text-lg font-semibold text-ink-primary">Admin Console Entry</h1>
          <p className="mt-1 text-sm text-ink-muted">Continue to the Command Centre.</p>
        </div>
        <AuthAlert message={error} />
        <button
          type="button"
          onClick={() => void enter()}
          disabled={busy}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Continue'}
        </button>
        <p className="mt-4 text-center text-xs text-ink-muted">
          <Link to="/admin/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  )
}
