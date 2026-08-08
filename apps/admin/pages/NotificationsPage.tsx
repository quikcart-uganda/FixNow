import { useMemo, useState } from 'react'
import { notificationsApi, getFriendlyErrorMessage } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button } from '@fixnow/ui'
import { PageHeader, StatusBadge, Surface } from '../components/ui'

function humanStatus(key: string): string {
  const map: Record<string, string> = {
    sent: 'Delivered',
    delivered: 'Delivered',
    queued: 'Queued',
    pending: 'Queued',
    failed: 'Failed',
    error: 'Failed',
    processing: 'Processing',
    skipped: 'Skipped',
  }
  return map[key.toLowerCase()] || key.replace(/_/g, ' ')
}

function humanPlatform(key: string): string {
  const map: Record<string, string> = {
    ios: 'iOS',
    android: 'Android',
    web: 'Web',
    unknown: 'Other',
  }
  return map[key.toLowerCase()] || key
}

export function NotificationsPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stats = useAsync(async () => {
    const res = await notificationsApi.pushStats(7)
    return res.data
  }, [])

  const byStatus = useMemo(() => {
    const raw = (stats.data?.byStatus ?? {}) as Record<string, unknown>
    return Object.entries(raw).map(([key, value]) => ({
      key,
      label: humanStatus(key),
      count: Number(value) || 0,
    }))
  }, [stats.data])

  const byPlatform = useMemo(() => {
    const raw = (stats.data?.activeDevicesByPlatform ?? {}) as Record<string, unknown>
    return Object.entries(raw).map(([key, value]) => ({
      key,
      label: humanPlatform(key),
      count: Number(value) || 0,
    }))
  }, [stats.data])

  const delivered = byStatus
    .filter((s) => /deliver|sent/i.test(s.key))
    .reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notification Center"
        subtitle="Monitor push delivery, device reach and broadcast announcements to customers and technicians."
      />

      <AsyncStateView
        status={stats.status}
        error={stats.error}
        onRetry={() => void stats.reload()}
        emptyTitle="No delivery activity yet"
        emptyHint="Statistics appear after devices register and notifications are sent."
      >
        {stats.data ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Surface className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Delivered notifications
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{delivered}</p>
              <p className="mt-1 text-xs text-ink-muted">Last 7 days</p>
            </Surface>
            <Surface className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Failed</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-error">
                {String(stats.data.failedCount ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Needs attention or retry</p>
            </Surface>
            <Surface className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Active devices</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">
                {byPlatform.reduce((s, p) => s + p.count, 0)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Across all platforms</p>
            </Surface>

            <Surface className="p-5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-primary">Status breakdown</p>
              </div>
              {byStatus.length ? (
                <ul className="mt-3 space-y-2">
                  {byStatus.map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-secondary">{row.label}</span>
                      <span className="font-semibold tabular-nums text-ink-primary">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">No status samples in this window.</p>
              )}
            </Surface>

            <Surface className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-primary">Devices by platform</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null)
                    void notificationsApi
                      .processRetries()
                      .then(() => void stats.reload())
                      .catch((err) => setError(getFriendlyErrorMessage(err)))
                  }}
                >
                  Process retries
                </Button>
              </div>
              {byPlatform.length ? (
                <ul className="mt-3 space-y-2">
                  {byPlatform.map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
                      <StatusBadge label={row.label} tone="neutral" />
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">No registered devices yet.</p>
              )}
            </Surface>
          </div>
        ) : null}
      </AsyncStateView>

      <Surface className="p-5">
        <h2 className="text-lg font-semibold">Broadcast announcement</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Sends an in-app message and push notification to customers and technicians.
        </p>
        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg border border-border px-3 py-2"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Broadcast title"
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-border px-3 py-2"
            placeholder="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Broadcast body"
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          {message ? <p className="text-sm text-success-green">{message}</p> : null}
          <Button
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setError(null)
                setMessage(null)
                try {
                  const res = await notificationsApi.broadcast({
                    title: title.trim(),
                    body: body.trim(),
                    roles: ['customer', 'technician'],
                  })
                  setMessage(`Delivered to ${res.data.recipients} recipients`)
                  setTitle('')
                  setBody('')
                  await stats.reload()
                } catch (err) {
                  setError(getFriendlyErrorMessage(err))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            {busy ? 'Sending…' : 'Send broadcast'}
          </Button>
        </div>
      </Surface>
    </div>
  )
}
