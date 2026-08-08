import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { useAuth } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import {
  ApiError,
  getFriendlyErrorMessage,
  launchCentreApi,
  type LaunchCentreOverview,
  type PromotionQueueItem,
} from '@fixnow/api/admin'
import { Button, PageHeader, StatusBadge, Surface } from '../components/ui'

type Section =
  | 'overview'
  | 'readiness'
  | 'promotion'
  | 'launch'
  | 'history'

/**
 * Launch Centre — PSA-only guided readiness → launch → rollback.
 * Builds on Platform Mode; does not delete development assets.
 */
export function LaunchCentrePage() {
  const { user, refreshMe } = useAuth()
  const [section, setSection] = useState<Section>('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [confirmAgain, setConfirmAgain] = useState(false)
  const [ackWarnings, setAckWarnings] = useState(false)

  const overview = useAsync(async () => {
    try {
      const res = await launchCentreApi.overview()
      setForbidden(false)
      return res.data as LaunchCentreOverview
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setForbidden(true)
      throw err
    }
  }, [])

  const promo = useAsync(async () => {
    if (!user?.isProductionSuperAdmin) return { items: [] as PromotionQueueItem[], supportedTypes: [] }
    const res = await launchCentreApi.promotionQueue(50)
    return res.data
  }, [user?.isProductionSuperAdmin, overview.data?.mode.mode])

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
      promo.reload()
      await refreshMe()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const tabs = useMemo(
    () =>
      [
        { id: 'overview' as const, label: 'Overview' },
        { id: 'readiness' as const, label: 'Readiness' },
        { id: 'promotion' as const, label: 'Promotion Centre' },
        { id: 'launch' as const, label: 'Launch / Rollback' },
        { id: 'history' as const, label: 'History' },
      ] as const,
    [],
  )

  if (forbidden || (user && !user.isProductionSuperAdmin)) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader title="Launch Centre" subtitle="Production Super Admin only" />
        <Surface className="space-y-3 p-6">
          <p className="text-on-surface-variant">
            Launch Centre is available only to a verified Production Super Admin.
          </p>
          <Link to="/admin/production-owner" className="text-primary underline">
            Production Owner Setup
          </Link>
          <Link to="/admin/settings/governance" className="ml-4 text-primary underline">
            Production Governance
          </Link>
        </Surface>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Launch Centre"
        subtitle="Validate readiness, promote sandbox assets (clone only), then activate Production Mode — without deleting development data."
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={section === t.id ? 'primary' : 'secondary'}
            onClick={() => setSection(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <AsyncStateView status={overview.status} error={overview.error} onRetry={overview.reload}>
        {overview.data ? (
          <>
            {section === 'overview' ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Surface className="space-y-2 p-4">
                  <p className="text-sm font-semibold">Platform Mode</p>
                  <StatusBadge
                    tone={overview.data.mode.mode === 'production' ? 'success' : 'warning'}
                    label={overview.data.mode.mode}
                  />
                </Surface>
                <Surface className="space-y-2 p-4">
                  <p className="text-sm font-semibold">Readiness score</p>
                  <p className="text-3xl font-semibold text-on-surface">
                    {overview.data.readiness.overallPercent}%
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {overview.data.readiness.blockers.length} blockers ·{' '}
                    {overview.data.readiness.warnings.length} warnings
                  </p>
                </Surface>
                <Surface className="space-y-2 p-4">
                  <p className="text-sm font-semibold">Launch status</p>
                  <StatusBadge
                    tone={overview.data.launchAllowed ? 'success' : 'warning'}
                    label={
                      overview.data.launchAllowed
                        ? 'Ready to launch'
                        : overview.data.mode.mode === 'production'
                          ? 'Already in Production'
                          : 'Blocked'
                    }
                  />
                </Surface>
                <Surface className="md:col-span-3 space-y-3 p-5">
                  <h2 className="text-lg font-semibold">Category scores</h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {overview.data.readiness.categoryScores.map((c) => (
                      <div
                        key={c.key}
                        className="flex items-center justify-between rounded-xl border border-border-subtle px-3 py-2 text-sm"
                      >
                        <span>{c.label}</span>
                        <span className="font-semibold">{c.percent}%</span>
                      </div>
                    ))}
                  </div>
                </Surface>
              </div>
            ) : null}

            {section === 'readiness' ? (
              <div className="space-y-4">
                <Surface className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="mr-auto text-lg font-semibold">Blockers</h2>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(
                          'snap',
                          () => launchCentreApi.snapshotReadiness('Manual snapshot from Launch Centre'),
                          'Readiness snapshot saved.',
                        )
                      }
                    >
                      Save snapshot
                    </Button>
                  </div>
                  {!overview.data.readiness.blockers.length ? (
                    <p className="text-sm text-on-surface-variant">No critical blockers.</p>
                  ) : (
                    <ul className="space-y-2">
                      {overview.data.readiness.blockers.map((b) => (
                        <li key={b.id} className="rounded-xl border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
                          <p className="font-semibold">{b.label}</p>
                          <p className="text-on-surface-variant">{b.message}</p>
                          {b.guidance ? <p className="mt-1 text-xs text-primary">{b.guidance}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Surface>
                <Surface className="space-y-3 p-5">
                  <h2 className="text-lg font-semibold">Warnings</h2>
                  <ul className="space-y-2">
                    {overview.data.readiness.warnings.map((w) => (
                      <li key={w.id} className="rounded-xl border border-border-subtle p-3 text-sm">
                        <p className="font-medium">{w.label}</p>
                        <p className="text-on-surface-variant">{w.message}</p>
                      </li>
                    ))}
                    {!overview.data.readiness.warnings.length ? (
                      <li className="text-sm text-on-surface-variant">No warnings.</li>
                    ) : null}
                  </ul>
                </Surface>
                <Surface className="space-y-2 p-5">
                  <h2 className="text-lg font-semibold">All checks</h2>
                  <ul className="divide-y divide-border-subtle">
                    {overview.data.readiness.checks.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <StatusBadge
                          tone={
                            c.severity === 'pass' ? 'success' : c.severity === 'blocker' ? 'danger' : 'warning'
                          }
                          label={c.severity}
                        />
                        <span className="font-medium">{c.label}</span>
                        <span className="text-on-surface-variant">{c.message}</span>
                      </li>
                    ))}
                  </ul>
                </Surface>
              </div>
            ) : null}

            {section === 'promotion' ? (
              <Surface className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">Promotion Centre</h2>
                <p className="text-sm text-on-surface-variant">
                  Preview sandbox assets and clone into production. Originals are never moved or deleted.
                </p>
                <AsyncStateView status={promo.status} error={promo.error} onRetry={promo.reload}>
                  <ul className="divide-y divide-border-subtle">
                    {(promo.data?.items || []).map((item) => (
                      <li key={`${item.resourceType}:${item.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.title}</p>
                          <p className="text-on-surface-variant">
                            {item.resourceType} · {item.status} · {item.dataEnvironment}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(
                              item.id,
                              () =>
                                launchCentreApi.promote({
                                  resourceType: item.resourceType,
                                  resourceId: item.id,
                                }),
                              'Cloned into production.',
                            )
                          }
                        >
                          Promote
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(
                              `skip-${item.id}`,
                              () =>
                                launchCentreApi.rejectPromote({
                                  resourceType: item.resourceType,
                                  resourceId: item.id,
                                  reason: 'Skipped in Promotion Centre',
                                }),
                              'Marked skipped.',
                            )
                          }
                        >
                          Skip
                        </Button>
                      </li>
                    ))}
                    {!(promo.data?.items || []).length ? (
                      <li className="py-8 text-center text-on-surface-variant">
                        No sandbox promotable assets found (enable Sandbox / Seed in Development Mode).
                      </li>
                    ) : null}
                  </ul>
                </AsyncStateView>
              </Surface>
            ) : null}

            {section === 'launch' ? (
              <Surface className="space-y-4 p-5">
                <h2 className="text-lg font-semibold">
                  {overview.data.mode.mode === 'production' ? 'Rollback' : 'Confirm launch'}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Workflow: review readiness → resolve blockers → acknowledge warnings → confirm → activate
                  Platform Mode. Public CMS, categories, and legal pages stay available.
                </p>
                <label className="block space-y-1 text-sm">
                  <span className="text-on-surface-variant">Reason</span>
                  <input
                    className="w-full rounded-xl border border-outline-variant px-3 py-2"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you launching or rolling back?"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-on-surface-variant">
                    Type{' '}
                    <strong>
                      {overview.data.mode.mode === 'production' ? 'DEVELOPMENT' : 'PRODUCTION'}
                    </strong>
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
                  I confirm development assets remain stored and are only hidden from UX.
                </label>
                {overview.data.mode.mode === 'development' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ackWarnings}
                      onChange={(e) => setAckWarnings(e.target.checked)}
                    />
                    I have reviewed readiness warnings ({overview.data.readiness.warnings.length}).
                  </label>
                ) : null}
                {overview.data.mode.mode === 'development' ? (
                  <Button
                    disabled={Boolean(busy) || !overview.data.launchAllowed}
                    onClick={() =>
                      void run(
                        'launch',
                        () =>
                          launchCentreApi.launch({
                            reason,
                            confirmPhrase,
                            confirmAgain,
                            acknowledgeWarnings: ackWarnings || overview.data.readiness.warnings.length === 0,
                            device: navigator.userAgent.slice(0, 180),
                          }),
                        'Production Mode activated via Launch Centre.',
                      )
                    }
                  >
                    {busy === 'launch' ? 'Launching…' : 'Launch Production Mode'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={Boolean(busy) || !overview.data.rollbackAllowed}
                    onClick={() =>
                      void run(
                        'rollback',
                        () =>
                          launchCentreApi.rollback({
                            reason,
                            confirmPhrase,
                            confirmAgain,
                            device: navigator.userAgent.slice(0, 180),
                          }),
                        'Returned to Development Mode. Tooling restored from snapshot.',
                      )
                    }
                  >
                    {busy === 'rollback' ? 'Rolling back…' : 'Return to Development Mode'}
                  </Button>
                )}
                {!overview.data.launchAllowed && overview.data.mode.mode === 'development' ? (
                  <p className="text-sm text-amber-800">
                    Launch stays disabled until all blockers are resolved. Open the Readiness tab.
                  </p>
                ) : null}
              </Surface>
            ) : null}

            {section === 'history' ? (
              <Surface className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">Launch & mode history</h2>
                <ul className="divide-y divide-border-subtle">
                  {(overview.data.history || [])
                    .slice()
                    .reverse()
                    .map((row) => {
                      const r = row as {
                        id: string
                        type: string
                        at: string
                        reason?: string
                        readinessOverallPercent?: number
                      }
                      return (
                        <li key={r.id} className="py-3 text-sm">
                          <p className="font-medium">
                            {r.type} {r.readinessOverallPercent != null ? `· ${r.readinessOverallPercent}%` : ''}
                          </p>
                          <p className="text-on-surface-variant">
                            {new Date(r.at).toLocaleString()}
                            {r.reason ? ` · ${r.reason}` : ''}
                          </p>
                        </li>
                      )
                    })}
                  {(overview.data.modeTransitions || []).slice(0, 20).map((row) => {
                    const t = row as {
                      id: string
                      previousMode: string
                      newMode: string
                      createdAt: string
                      administratorEmail: string
                    }
                    return (
                      <li key={`mode-${t.id}`} className="py-3 text-sm">
                        <p className="font-medium">
                          Mode {t.previousMode} → {t.newMode}
                        </p>
                        <p className="text-on-surface-variant">
                          {t.administratorEmail} · {new Date(t.createdAt).toLocaleString()}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </Surface>
            ) : null}
          </>
        ) : null}
      </AsyncStateView>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  )
}
