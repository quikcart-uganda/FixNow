import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import {
  ApiError,
  getFriendlyErrorMessage,
  sandboxApi,
  type SandboxOverview,
  type SandboxSettings,
} from '@fixnow/api/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'

type SectionKey = 'customers' | 'technicians' | 'jobs' | 'offers'

const ACTIONS: Array<{
  key: string
  label: string
  hint: string
  run: () => Promise<unknown>
  tone?: 'danger' | 'default'
}> = [
  { key: 'create', label: 'Create Demo Data', hint: 'Seed realistic Ugandan customers, technicians, and jobs.', run: () => sandboxApi.createDemo() },
  { key: 'regen', label: 'Regenerate Demo Data', hint: 'Soft-delete prior demo rows then recreate.', run: () => sandboxApi.regenerate() },
  { key: 'reset', label: 'Reset Demo Environment', hint: 'Delete then recreate a clean sandbox.', run: () => sandboxApi.reset() },
  { key: 'suspend', label: 'Suspend Demo Data', hint: 'Suspend sandbox user accounts.', run: () => sandboxApi.suspend() },
  { key: 'reactivate', label: 'Reactivate Demo Data', hint: 'Re-activate suspended sandbox users.', run: () => sandboxApi.reactivate() },
  { key: 'archive', label: 'Archive Demo Data', hint: 'Move sandbox records to archived environment.', run: () => sandboxApi.archive() },
  {
    key: 'delete',
    label: 'Delete Demo Data',
    hint: 'Soft-delete sandbox demo users and related content.',
    run: () => sandboxApi.deleteDemo(),
    tone: 'danger',
  },
]

export function SandboxManagementPage() {
  const [draft, setDraft] = useState<SandboxSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [section, setSection] = useState<SectionKey>('jobs')
  const [analyticsView, setAnalyticsView] = useState<'production' | 'sandbox' | 'combined'>('sandbox')

  const overview = useAsync(async () => {
    try {
      const res = await sandboxApi.overview()
      return res.data as SandboxOverview
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
        return null
      }
      throw err
    }
  }, [])

  const sectionQuery = useAsync(async () => {
    if (!overview.data?.settings.enableSandbox) return { items: [] as unknown[] }
    const res = await sandboxApi.listSection(section)
    return res.data
  }, [section, overview.data?.settings.enableSandbox])

  const analytics = useAsync(async () => {
    const res = await sandboxApi.analytics(analyticsView)
    return res.data as { view: string; counts: Record<string, number> }
  }, [analyticsView])

  useEffect(() => {
    if (overview.data?.settings) setDraft(overview.data.settings)
  }, [overview.data])

  const saveSettings = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await sandboxApi.updateSettings(draft)
      setMessage('Sandbox settings saved.')
      overview.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const runAction = async (key: string, run: () => Promise<unknown>) => {
    setActionBusy(key)
    setError(null)
    setMessage(null)
    try {
      await run()
      setMessage(`Action “${key}” completed.`)
      overview.reload()
      sectionQuery.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  const exportDemo = async () => {
    setActionBusy('export')
    try {
      const res = await sandboxApi.exportData()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fixnow-sandbox-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Sandbox export downloaded.')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  const promoteOffer = async (id: string) => {
    setActionBusy(`promote-${id}`)
    try {
      await sandboxApi.promote('TechnicianOffer', id)
      setMessage('Offer cloned into production (pending review). Original unchanged.')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <PageHeader title="Sandbox Management" subtitle="Super Admin only" />
        <Surface className="p-6">
          <p className="text-on-surface-variant">You do not have permission to manage the sandbox data platform.</p>
        </Surface>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Sandbox Management"
        subtitle="Isolated demo content for development, testing, and launch promotion — never mixed with production users."
      />

      <AsyncStateView status={overview.status} error={overview.error} onRetry={overview.reload}>
        {overview.data && draft ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ['Sandbox', overview.data.counts.sandbox],
                  ['Production', overview.data.counts.production],
                  ['Demo tag', overview.data.counts.demo],
                ] as const
              ).map(([label, counts]) => (
                <Surface key={label} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-on-surface">{label}</p>
                    <StatusBadge tone={label === 'Production' ? 'success' : 'info'}>{label}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm text-on-surface-variant">
                    <div>Users: {counts.users}</div>
                    <div>Customers: {counts.customers}</div>
                    <div>Technicians: {counts.technicians}</div>
                    <div>Jobs: {counts.jobs}</div>
                    <div>Offers: {counts.offers}</div>
                    <div>Applications: {counts.applications}</div>
                  </dl>
                </Surface>
              ))}
            </div>

            {overview.data.demoLoginHint ? (
              <Surface className="p-4">
                <p className="text-sm text-on-surface-variant">
                  Demo accounts use <code>{overview.data.demoLoginHint.emailDomain}</code> with password{' '}
                  <code>{overview.data.demoLoginHint.password}</code> (tag {overview.data.demoLoginHint.tag}).
                </p>
              </Surface>
            ) : null}

            <Surface className="space-y-4 p-5">
              <h2 className="text-lg font-semibold text-on-surface">Sandbox settings</h2>
              {(
                [
                  ['enableSandbox', 'Enable sandbox', 'Allows demo generation and sandbox tooling.'],
                  ['hideSandboxFromReports', 'Hide sandbox from reports', 'Keep default analytics production-only.'],
                  ['allowAvatars', 'Allow avatars', 'Users may pick library avatars instead of photos.'],
                  ['requireRealPhotos', 'Require real photos', 'Disables avatar selection when enabled.'],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-4 border-b border-border-subtle py-3 last:border-0">
                  <div>
                    <p className="font-medium text-on-surface">{label}</p>
                    <p className="text-sm text-on-surface-variant">{hint}</p>
                  </div>
                  <Toggle
                    checked={Boolean(draft[key])}
                    onChange={(v) => setDraft((d) => (d ? { ...d, [key]: v } : d))}
                    label={label}
                  />
                </div>
              ))}
              <Button onClick={() => void saveSettings()} disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </Surface>

            <Surface className="space-y-3 p-5">
              <h2 className="text-lg font-semibold text-on-surface">Sandbox actions</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {ACTIONS.map((action) => (
                  <div key={action.key} className="rounded-2xl border border-border-subtle p-4">
                    <p className="font-medium text-on-surface">{action.label}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{action.hint}</p>
                    <Button
                      className="mt-3"
                      variant={action.tone === 'danger' ? 'danger' : 'secondary'}
                      disabled={Boolean(actionBusy)}
                      onClick={() => void runAction(action.key, action.run)}
                    >
                      {actionBusy === action.key ? 'Working…' : action.label}
                    </Button>
                  </div>
                ))}
                <div className="rounded-2xl border border-border-subtle p-4">
                  <p className="font-medium text-on-surface">Export Demo Data</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Download a JSON snapshot of the sandbox environment.</p>
                  <Button className="mt-3" variant="secondary" disabled={Boolean(actionBusy)} onClick={() => void exportDemo()}>
                    {actionBusy === 'export' ? 'Exporting…' : 'Export'}
                  </Button>
                </div>
              </div>
            </Surface>

            <Surface className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-lg font-semibold text-on-surface">Sandbox preview</h2>
                {(['customers', 'technicians', 'jobs', 'offers'] as SectionKey[]).map((key) => (
                  <Button key={key} size="sm" variant={section === key ? 'primary' : 'secondary'} onClick={() => setSection(key)}>
                    {key}
                  </Button>
                ))}
              </div>
              <AsyncStateView status={sectionQuery.status} error={sectionQuery.error} onRetry={sectionQuery.reload}>
                <ul className="divide-y divide-border-subtle">
                  {(sectionQuery.data?.items || []).slice(0, 20).map((row) => {
                    const item = row as { _id?: string; title?: string; fullName?: string; headline?: string; status?: string }
                    const id = String(item._id || '')
                    return (
                      <li key={id} className="flex items-center gap-3 py-3 text-sm">
                        <Icon name="database" className="text-on-surface-variant" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-on-surface">
                            {item.title || item.fullName || item.headline || id}
                          </p>
                          {item.status ? <p className="text-on-surface-variant">{item.status}</p> : null}
                        </div>
                        {section === 'offers' && id ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={Boolean(actionBusy)}
                            onClick={() => void promoteOffer(id)}
                          >
                            Promote
                          </Button>
                        ) : section !== 'offers' ? (
                          <span className="text-xs text-on-surface-variant" title="Promote not implemented yet">
                            Promote N/A
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                  {!sectionQuery.data?.items?.length ? (
                    <li className="py-6 text-center text-on-surface-variant">No sandbox records in this section yet.</li>
                  ) : null}
                </ul>
              </AsyncStateView>
            </Surface>

            <Surface className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-lg font-semibold text-on-surface">Analytics view</h2>
                {(['production', 'sandbox', 'combined'] as const).map((view) => (
                  <Button
                    key={view}
                    size="sm"
                    variant={analyticsView === view ? 'primary' : 'secondary'}
                    onClick={() => setAnalyticsView(view)}
                  >
                    {view}
                  </Button>
                ))}
              </div>
              <AsyncStateView status={analytics.status} error={analytics.error} onRetry={analytics.reload}>
                {analytics.data ? (
                  <pre className="overflow-auto rounded-xl bg-surface-container p-4 text-xs text-on-surface">
                    {JSON.stringify(analytics.data, null, 2)}
                  </pre>
                ) : null}
              </AsyncStateView>
              <p className="text-xs text-on-surface-variant">
                Never promote: {(overview.data.neverPromote || []).join(', ')}. Promotable catalogue:{' '}
                {(overview.data.promotable || []).join(', ')}. Currently implemented promote:{' '}
                {(overview.data.promoteImplemented || ['TechnicianOffer']).join(', ')}.
                {(overview.data.promoteUnimplemented || []).length
                  ? ` Not yet implemented: ${(overview.data.promoteUnimplemented || []).join(', ')}.`
                  : ''}
              </p>
            </Surface>
          </>
        ) : null}
      </AsyncStateView>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  )
}
