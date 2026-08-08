import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  getApiBaseUrl,
  getFrontendDiagnostics,
  getSocketDiagnostics,
  providersApi,
  type ProviderSnapshotType,
  type ProviderType,
} from '@fixnow/api'
import { useAsync, useSocket } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, PageHeader, StatusBadge, Surface } from '../components/ui'

type HealthTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

type BackendProbe = {
  state: 'Healthy' | 'Warning' | 'Error' | 'Checking…'
  tone: HealthTone
  latencyMs: number | null
  version: string | null
}

type FrontendDiagnostics = Awaited<ReturnType<typeof getFrontendDiagnostics>>

const DEV_DIAG_KEY = 'fixnow.admin.developerDiagnostics'

function providerLabel(_type: ProviderType, id: string): string {
  const labels: Record<string, string> = {
    none: 'None',
    console: 'Local / console',
    openai: 'OpenAI',
    gemini: 'Gemini',
    resend: 'Resend',
    smtp: 'SMTP',
    fcm: 'Firebase Cloud Messaging',
    cloudinary: 'Cloudinary',
    local: 'Local storage',
    google: 'Google Maps',
    sentry: 'Sentry',
    mtn: 'MTN MoMo',
    airtel: 'Airtel Money',
    flutterwave: 'Flutterwave',
    pesapal: 'Pesapal',
    stripe: 'Stripe',
  }
  return labels[id] || id
}

function findActive(types: ProviderSnapshotType[], type: ProviderType) {
  return types.find((t) => t.type === type)
}

function activeSummary(group: ProviderSnapshotType | undefined): {
  name: string
  configured: boolean
  tone: HealthTone
  statusLabel: string
} {
  if (!group) {
    return { name: 'Unknown', configured: false, tone: 'neutral', statusLabel: 'Unknown' }
  }
  const active = group.providers.find((p) => p.active) || group.providers.find((p) => p.id === group.activeId)
  const name = providerLabel(group.type, group.activeId)
  if (group.activeId === 'none') {
    return { name: 'None', configured: true, tone: 'neutral', statusLabel: 'Disabled' }
  }
  if (!active) {
    return { name, configured: false, tone: 'warning', statusLabel: 'Not configured' }
  }
  if (active.configured || active.credentialStatus === 'n/a' || active.credentialStatus === 'ok') {
    return { name, configured: true, tone: 'success', statusLabel: 'Configured' }
  }
  return { name, configured: false, tone: 'warning', statusLabel: 'Needs configuration' }
}

function healthBaseUrl() {
  try {
    return getApiBaseUrl().replace(/\/api\/v1\/?$/, '')
  } catch {
    return ''
  }
}

function StatusCard({
  title,
  badge,
  tone,
  rows,
  action,
}: {
  title: string
  badge: string
  tone: HealthTone
  rows: Array<{ label: string; value: string }>
  action?: ReactNode
}) {
  return (
    <Surface className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
        <StatusBadge label={badge} tone={tone} />
      </div>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
            <dt className="text-ink-secondary">{row.label}</dt>
            <dd className="max-w-[65%] text-right font-semibold text-ink-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
      {action}
    </Surface>
  )
}

/**
 * Production Platform Health — operator-friendly cards only.
 * Raw HTTP logs / request IDs / JSON dumps are gated behind Developer Diagnostics.
 */
export function RealtimeDiagnosticsPage() {
  const { status, isConnected } = useSocket()
  const [backend, setBackend] = useState<BackendProbe>({
    state: 'Checking…',
    tone: 'neutral',
    latencyMs: null,
    version: null,
  })
  const [lastHeartbeatAgo, setLastHeartbeatAgo] = useState('—')
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null)
  const [developerAllowed, setDeveloperAllowed] = useState(Boolean(import.meta.env.DEV))
  const [developerMode, setDeveloperMode] = useState(() => {
    try {
      return localStorage.getItem(DEV_DIAG_KEY) === '1'
    } catch {
      return false
    }
  })
  const [devDump, setDevDump] = useState<FrontendDiagnostics | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('@fixnow/api')
      .then(async ({ devSettingsApi }) => {
        try {
          const res = await devSettingsApi.public()
          if (cancelled) return
          setDeveloperAllowed(Boolean(import.meta.env.DEV) || Boolean(res.data.enableDevelopmentMode))
        } catch {
          if (!cancelled) setDeveloperAllowed(Boolean(import.meta.env.DEV))
        }
      })
      .catch(() => {
        if (!cancelled) setDeveloperAllowed(Boolean(import.meta.env.DEV))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const providersQuery = useAsync(async () => (await providersApi.snapshot()).data, [], {
    cacheKey: 'admin.platform-health.providers.v1',
    cacheFreshMs: 20_000,
  })

  const probeBackend = useCallback(async () => {
    const base = healthBaseUrl()
    if (!base) {
      setBackend({ state: 'Error', tone: 'danger', latencyMs: null, version: null })
      return
    }
    const started = performance.now()
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 6_000)
      const res = await fetch(`${base}/health`, { credentials: 'include', signal: controller.signal })
      window.clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - started)
      let version: string | null = null
      try {
        const body = (await res.json()) as { version?: string; appVersion?: string }
        version = body.version || body.appVersion || null
      } catch {
        version = null
      }
      if (res.ok) {
        setBackend({
          state: latencyMs > 1200 ? 'Warning' : 'Healthy',
          tone: latencyMs > 1200 ? 'warning' : 'success',
          latencyMs,
          version,
        })
      } else {
        setBackend({ state: 'Error', tone: 'danger', latencyMs, version })
      }
    } catch {
      setBackend({
        state: 'Error',
        tone: 'danger',
        latencyMs: Math.round(performance.now() - started),
        version: null,
      })
    }
  }, [])

  useEffect(() => {
    void probeBackend()
    const id = window.setInterval(() => void probeBackend(), 15_000)
    return () => window.clearInterval(id)
  }, [probeBackend])

  useEffect(() => {
    if (isConnected) setLastConnectedAt(Date.now())
  }, [isConnected])

  useEffect(() => {
    const tick = () => {
      if (!isConnected || !lastConnectedAt) {
        setLastHeartbeatAgo(isConnected ? 'Just now' : 'Unavailable')
        return
      }
      const sec = Math.max(0, Math.round((Date.now() - lastConnectedAt) / 1000))
      if (sec < 5) setLastHeartbeatAgo('Just now')
      else if (sec < 60) setLastHeartbeatAgo(`${sec} seconds ago`)
      else setLastHeartbeatAgo(`${Math.round(sec / 60)} min ago`)
    }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [isConnected, lastConnectedAt])

  useEffect(() => {
    if (!developerMode || !developerAllowed) {
      setDevDump(null)
      return
    }
    let cancelled = false
    void getFrontendDiagnostics()
      .then((dump) => {
        if (!cancelled) setDevDump(dump)
      })
      .catch(() => {
        if (!cancelled) setDevDump(null)
      })
    const id = window.setInterval(() => {
      void getFrontendDiagnostics()
        .then((dump) => {
          if (!cancelled) setDevDump(dump)
        })
        .catch(() => undefined)
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [developerMode, developerAllowed])

  const types = providersQuery.data?.types ?? []
  const ai = activeSummary(findActive(types, 'ai'))
  const email = activeSummary(findActive(types, 'email'))
  const storage = activeSummary(findActive(types, 'storage'))
  const maps = activeSummary(findActive(types, 'maps'))
  const pushGroup = findActive(types, 'push')
  const push = activeSummary(pushGroup)
  const payments = activeSummary(findActive(types, 'payments'))
  const pushActive = pushGroup?.providers.find((p) => p.active)
  const lastDelivery = (() => {
    const testedAt = (pushActive as { lastTestAt?: string } | undefined)?.lastTestAt
    if (!testedAt) return 'Not recorded yet'
    const ms = Date.now() - new Date(testedAt).getTime()
    if (!Number.isFinite(ms) || ms < 0) return 'Not recorded yet'
    const sec = Math.round(ms / 1000)
    if (sec < 60) return 'Just now'
    if (sec < 3600) return `${Math.round(sec / 60)} min ago`
    if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`
    return `${Math.round(sec / 86400)} days ago`
  })()

  const realtimeTone: HealthTone = isConnected ? 'success' : status === 'connecting' ? 'warning' : 'danger'
  const realtimeLabel = isConnected ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Disconnected'

  const showDeveloperDump = developerMode && developerAllowed

  const setDeveloperModePersist = (next: boolean) => {
    if (next && !developerAllowed) return
    setDeveloperMode(next)
    try {
      localStorage.setItem(DEV_DIAG_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform health"
        subtitle="Live status for backend, realtime, and active providers. Internal request logs stay in Developer Diagnostics."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void probeBackend()
              void providersQuery.reload()
            }}
          >
            Refresh
          </Button>
        }
      />

      <AsyncStateView
        status={providersQuery.status === 'loading' && !providersQuery.data ? 'loading' : 'success'}
        error={providersQuery.error}
        onRetry={() => void providersQuery.reload()}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatusCard
            title="Backend"
            badge={backend.state}
            tone={backend.tone}
            rows={[
              {
                label: 'Latency',
                value: backend.latencyMs != null ? `${backend.latencyMs} ms` : '—',
              },
              { label: 'Version', value: backend.version || '—' },
            ]}
          />

          <StatusCard
            title="Realtime"
            badge={realtimeLabel}
            tone={realtimeTone}
            rows={[{ label: 'Last heartbeat', value: lastHeartbeatAgo }]}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void import('@fixnow/api').then((m) => m.forceReconnectSocket())
                  setLastConnectedAt(Date.now())
                }}
              >
                Reconnect
              </Button>
            }
          />

          <StatusCard
            title="Providers"
            badge={types.length ? 'Active' : 'Loading'}
            tone={types.length ? 'success' : 'neutral'}
            rows={[
              { label: 'AI', value: ai.name },
              { label: 'Email', value: email.name },
              { label: 'Payments', value: payments.name },
              { label: 'Push', value: push.name },
            ]}
          />

          <StatusCard
            title="Notifications"
            badge={push.statusLabel === 'Configured' || push.name !== 'None' ? 'Healthy' : 'Disabled'}
            tone={push.tone}
            rows={[
              { label: 'Channel', value: push.name },
              { label: 'Last successful delivery', value: lastDelivery },
            ]}
          />

          <StatusCard
            title="Storage"
            badge={storage.configured ? 'Connected' : 'Attention'}
            tone={storage.tone}
            rows={[
              { label: 'Provider', value: storage.name },
              { label: 'Status', value: storage.statusLabel },
            ]}
          />

          <StatusCard
            title="Maps"
            badge={maps.name === 'None' ? 'Disabled' : maps.configured ? 'Connected' : 'Attention'}
            tone={maps.tone}
            rows={[
              { label: 'Provider', value: maps.name },
              { label: 'Status', value: maps.statusLabel },
            ]}
          />

          <StatusCard
            title="AI"
            badge={
              ai.name === 'None' || ai.name.toLowerCase().includes('console')
                ? 'Unavailable'
                : ai.configured
                  ? 'Available'
                  : 'Unavailable'
            }
            tone={
              ai.name === 'None' || ai.name.toLowerCase().includes('console')
                ? 'neutral'
                : ai.configured
                  ? 'success'
                  : 'warning'
            }
            rows={[
              { label: 'Provider', value: ai.name },
              { label: 'Status', value: ai.statusLabel },
            ]}
          />
        </div>
      </AsyncStateView>

      <Surface className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Developer Diagnostics</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Off by default. Requires Development Mode (System Settings → Development Controls) or a local Vite
              development build. Raw HTTP paths and request IDs never appear on the health cards above.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!developerAllowed && !developerMode}
            onClick={() => setDeveloperModePersist(!developerMode)}
          >
            {showDeveloperDump ? 'Hide developer view' : 'Enable developer view'}
          </Button>
        </div>

        {!developerAllowed ? (
          <p className="text-sm text-ink-secondary">
            Developer Diagnostics is locked. A Super Admin must enable Development Mode first, or use a local
            development build.
          </p>
        ) : showDeveloperDump ? (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Developer only — do not share screenshots externally
            </p>
            <pre className="overflow-auto rounded-lg bg-surface-alt p-3 text-[11px] text-ink-secondary">
              {JSON.stringify(
                {
                  socket: getSocketDiagnostics(),
                  frontend: devDump,
                  providers: providersQuery.data,
                },
                null,
                2,
              )}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">
            Production admins see health cards above. Enable developer view only when troubleshooting with
            engineering.
          </p>
        )}
      </Surface>
    </div>
  )
}
