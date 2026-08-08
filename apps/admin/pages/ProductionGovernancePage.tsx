import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import {
  ApiError,
  getFriendlyErrorMessage,
  platformModeApi,
  type PlatformModeView,
} from '@fixnow/api/admin'
import { useAuth } from '@fixnow/hooks'
import { Button, PageHeader, StatusBadge, Surface } from '../components/ui'

/**
 * Production Governance — Platform Mode switch, Production Owner, transition history.
 * Platform Mode ≠ dataEnvironment.
 */
export function ProductionGovernancePage() {
  const { user, refreshMe } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [confirmAgain, setConfirmAgain] = useState(false)
  const [reason, setReason] = useState('')
  const [forbidden, setForbidden] = useState(false)

  const overview = useAsync(async () => {
    try {
      const res = await platformModeApi.overview()
      setForbidden(false)
      return res.data as PlatformModeView
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setForbidden(true)
      throw err
    }
  }, [])

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(ok)
      setConfirmPhrase('')
      setConfirmAgain(false)
      overview.reload()
      await refreshMe()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <PageHeader title="Production Governance" subtitle="Super Admin only" />
        <Surface className="p-6">
          <p className="text-on-surface-variant">You do not have permission to view Platform Mode.</p>
        </Surface>
      </div>
    )
  }

  const isPsa = Boolean(user?.isProductionSuperAdmin)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Production Governance"
        subtitle="Platform Mode is an operating state — not Content Environment. Switching never deletes Sandbox, Seed, or Preview data."
      />

      <AsyncStateView status={overview.status} error={overview.error} onRetry={overview.reload}>
        {overview.data ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Platform Mode</p>
                <StatusBadge tone={overview.data.mode === 'production' ? 'success' : 'warning'}>
                  {overview.data.mode === 'production' ? 'Production' : 'Development'}
                </StatusBadge>
                <p className="text-xs text-on-surface-variant">
                  Developer UX {overview.data.developerUxVisible ? 'visible' : 'hidden'}
                </p>
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Production Super Admin</p>
                <StatusBadge tone={overview.data.hasProductionSuperAdmin ? 'success' : 'warning'}>
                  {overview.data.hasProductionSuperAdmin ? 'Configured' : 'Required'}
                </StatusBadge>
                {!overview.data.hasProductionSuperAdmin ? (
                  <Link to="/admin/production-owner" className="text-sm text-primary underline">
                    Open Production Owner Setup
                  </Link>
                ) : null}
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Mode lock</p>
                <p className="text-sm text-on-surface-variant">
                  {overview.data.locked
                    ? `Locked until ${new Date(String(overview.data.lockUntil)).toLocaleString()}`
                    : 'Ready for transition'}
                </p>
              </Surface>
            </div>

            {!overview.data.hasProductionSuperAdmin ? (
              <Surface className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">First Production Owner required</h2>
                <p className="text-sm text-on-surface-variant">
                  Production Mode cannot start until a verified Production Super Admin exists.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/admin/production-owner">
                    <Button>Production Owner Setup Wizard</Button>
                  </Link>
                  {user?.adminRoleKey === 'super_admin' ? (
                    <Button
                      variant="secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(
                          'designate',
                          () => platformModeApi.designateProductionOwner(),
                          'You are now the Production Super Admin.',
                        )
                      }
                    >
                      Designate me (current Super Admin)
                    </Button>
                  ) : null}
                </div>
              </Surface>
            ) : null}

                <Surface className="space-y-3 p-5">
                  <h2 className="text-lg font-semibold">Launch via Launch Centre</h2>
                  <p className="text-sm text-on-surface-variant">
                    Guided readiness scoring, Promotion Centre, and controlled activation live in Launch
                    Centre. Direct Mode switches still require readiness blockers to be clear.
                  </p>
                  <Link to="/admin/settings/launch-centre">
                    <Button>Open Launch Centre</Button>
                  </Link>
                </Surface>

                <Surface className="space-y-4 p-5">
                  <h2 className="text-lg font-semibold">Switch Platform Mode</h2>
              <p className="text-sm text-on-surface-variant">
                Requires Production Super Admin, typed confirmation, and second confirmation. Public
                categories, legal pages, and published CMS stay available.
              </p>
              {!isPsa ? (
                <p className="text-sm text-amber-800">
                  Sign in as a Production Super Admin to switch modes. Development Super Admin cannot
                  perform this action.
                </p>
              ) : (
                <>
                  <label className="block space-y-1 text-sm">
                    <span className="text-on-surface-variant">Reason</span>
                    <input
                      className="w-full rounded-xl border border-outline-variant px-3 py-2"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are you switching?"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-on-surface-variant">
                      Type{' '}
                      <strong>
                        {overview.data.mode === 'development' ? 'PRODUCTION' : 'DEVELOPMENT'}
                      </strong>{' '}
                      to confirm
                    </span>
                    <input
                      className="w-full rounded-xl border border-outline-variant px-3 py-2 font-mono"
                      value={confirmPhrase}
                      onChange={(e) => setConfirmPhrase(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmAgain}
                      onChange={(e) => setConfirmAgain(e.target.checked)}
                    />
                    I understand development assets remain stored and are only hidden from UX.
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {overview.data.mode === 'development' ? (
                      <Button
                        disabled={Boolean(busy) || overview.data.locked || !overview.data.canEnterProduction}
                        onClick={() =>
                          void run(
                            'enter',
                            () =>
                              platformModeApi.enterProduction({
                                reason,
                                confirmPhrase,
                                confirmAgain,
                                device: navigator.userAgent.slice(0, 180),
                              }),
                            'Platform Mode is now Production.',
                          )
                        }
                      >
                        {busy === 'enter' ? 'Switching…' : 'Enter Production Mode'}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={
                          Boolean(busy) || overview.data.locked || !overview.data.canReturnToDevelopment
                        }
                        onClick={() =>
                          void run(
                            'return',
                            () =>
                              platformModeApi.returnDevelopment({
                                reason,
                                confirmPhrase,
                                confirmAgain,
                                device: navigator.userAgent.slice(0, 180),
                              }),
                            'Platform Mode restored to Development.',
                          )
                        }
                      >
                        {busy === 'return' ? 'Switching…' : 'Return to Development Mode'}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Surface>

            <Surface className="space-y-3 p-5">
              <h2 className="text-lg font-semibold">Mode transition history</h2>
              <ul className="divide-y divide-border-subtle">
                {(overview.data.history || []).map((row) => (
                  <li key={row.id} className="py-3 text-sm">
                    <p className="font-medium">
                      {row.previousMode} → {row.newMode}
                    </p>
                    <p className="text-on-surface-variant">
                      {row.administratorName} ({row.administratorEmail}) ·{' '}
                      {new Date(row.createdAt).toLocaleString()}
                      {row.reason ? ` · ${row.reason}` : ''}
                    </p>
                  </li>
                ))}
                {!(overview.data.history || []).length ? (
                  <li className="py-6 text-center text-on-surface-variant">No transitions yet.</li>
                ) : null}
              </ul>
            </Surface>
          </>
        ) : null}
      </AsyncStateView>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  )
}
