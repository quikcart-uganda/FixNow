import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { ApiError, adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { Button, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'
import { safeArray } from '@fixnow/utils'

/**
 * Security → Development Access — Super Admin only.
 * Controls whether the Development Administrator login button exists.
 * The Dev Admin account is never deleted — only enabled / disabled.
 */
export function DevelopmentAccessPage() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [reason, setReason] = useState('')

  const state = useAsync(async () => {
    try {
      const [access, history] = await Promise.all([
        adminApi.getDevelopmentAccess(),
        adminApi.getDevelopmentLoginHistory().catch(() => ({ data: { items: [] } })),
      ])
      return { access: access.data, history: safeArray(history.data?.items) }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
        return null
      }
      throw err
    }
  }, [])

  async function setAllow(allow: boolean) {
    setSaving(true)
    setError(null)
    try {
      await adminApi.updateDevelopmentAccess({
        allowDevLogin: allow,
        reason: reason.trim() || undefined,
      })
      await state.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) {
    return (
      <Surface className="mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Super Admin only</h1>
        <p className="text-sm text-ink-secondary">
          Development Access is restricted to Super Administrators.
        </p>
        <Link to="/admin/dashboard" className="text-sm font-medium text-primary">
          Back to dashboard
        </Link>
      </Surface>
    )
  }

  return (
    <AsyncStateView status={state.status} error={state.error} onRetry={() => void state.reload()}>
      {state.data ? (
        <div className="space-y-6">
          <PageHeader
            title="Development Access"
            subtitle="Administration → Security → Development Access · Super Admin only"
          />

          <Surface className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={state.data.access.loginEnabled ? 'success' : 'neutral'}
                label={state.data.access.statusLabel}
              />
              {state.data.access.transitionCompleted ? (
                <StatusBadge tone="warning" label="Transition completed" />
              ) : (
                <StatusBadge tone="info" label="Pre-transition" />
              )}
            </div>
            <p className="text-sm text-ink-secondary">
              The Development Administrator is a non-production entry used while building FixNow. While Platform Mode
              is Development, Development Access stays available (environment permitting). Entering Production Mode
              suspends it — the account is never deleted, and returning to Development Mode restores full capabilities.
            </p>
            {state.data.access.productionLocked ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                Production environment — Development Access cannot be enabled.
              </p>
            ) : null}
            {!state.data.access.envAllowsDevAdminLogin ? (
              <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                Environment flag <code>ALLOW_DEV_ADMIN_LOGIN</code> is off. Enable it in non-production before
                unlocking the login button.
              </p>
            ) : null}

            <Toggle
              label="Allow Development Login"
              checked={Boolean(state.data.access.allowDevLogin) && !state.data.access.productionLocked}
              disabled={
                saving ||
                state.data.access.productionLocked ||
                !state.data.access.envAllowsDevAdminLogin
              }
              onChange={(v) => void setAllow(v)}
            />
            <p className="text-xs text-ink-secondary">
              When off, the Development Access button is not rendered on the Admin Login page (not merely hidden
              with CSS).
            </p>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-secondary">Reason (audit)</span>
              <input
                className="min-h-11 w-full rounded-xl border border-outline-variant px-3 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional note for the audit log"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={saving || state.data.access.productionLocked}
                onClick={() => void setAllow(true)}
              >
                Enable Development Admin
              </Button>
              <Button
                variant="outline"
                disabled={saving || state.data.access.productionLocked}
                onClick={() => void setAllow(false)}
              >
                Disable Development Admin
              </Button>
            </div>
            {error ? <FormError>{error}</FormError> : null}
          </Surface>

          <Surface className="space-y-3 p-6">
            <h2 className="text-base font-semibold">Access history</h2>
            {safeArray(state.data.access.history).length === 0 ? (
              <p className="text-sm text-ink-secondary">No transition events yet.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/50 text-sm">
                {safeArray(state.data.access.history)
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={`${h.at}-${i}`} className="py-2">
                      <p className="font-medium">
                        {h.action} · {h.at ? new Date(h.at).toLocaleString() : '—'}
                      </p>
                      <p className="text-ink-secondary">{h.reason || '—'}</p>
                    </li>
                  ))}
              </ul>
            )}
          </Surface>

          <Surface className="space-y-3 p-6">
            <h2 className="text-base font-semibold">Development login events</h2>
            {state.data.history.length === 0 ? (
              <p className="text-sm text-ink-secondary">No Development Admin login events recorded.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/50 text-sm">
                {state.data.history.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">
                        {e.success ? 'Success' : 'Failed'} · {e.reason || 'login'}
                      </p>
                      <p className="text-ink-secondary">
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'} · {e.ip || '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <p className="text-sm text-ink-secondary">
            Related: <Link to="/admin/settings/development" className="text-primary">Development Controls</Link>{' '}
            (OTP, mock providers, debug flags).
          </p>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default DevelopmentAccessPage
