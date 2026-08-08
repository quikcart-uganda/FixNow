import { useCallback, useState } from 'react'
import {
  getFriendlyErrorMessage,
  providersApi,
  type ProviderStatusRow,
  type ProviderTypeSummary,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, PageHeader, StatusBadge, Surface } from '../components/ui'

function credTone(status: ProviderStatusRow['credentialStatus']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ok' || status === 'n/a') return 'success'
  if (status === 'partial') return 'warning'
  return 'danger'
}

function connTone(status: ProviderStatusRow['connectionStatus']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'healthy') return 'success'
  if (status === 'degraded' || status === 'unknown') return 'warning'
  if (status === 'disabled') return 'neutral'
  return 'danger'
}

function actionMessage(
  dataMessage: string | undefined,
  envelopeMessage: string | undefined,
  fallback: string,
): string {
  return dataMessage || envelopeMessage || fallback
}

export function ProvidersPage() {
  const query = useAsync(async () => (await providersApi.list()).data, [], {
    cacheKey: 'admin.providers.v1',
    cacheFreshMs: 15_000,
  })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key)
      setError(null)
      setBanner(null)
      try {
        await action()
        await query.reload()
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setBusyKey(null)
      }
    },
    [query],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider Manager"
        subtitle="Credentials stay in environment variables. Activate only configured providers. Choose None to disable a category gracefully."
        actions={
          <Button variant="outline" onClick={() => void query.reload()} disabled={Boolean(busyKey)}>
            Refresh discovery
          </Button>
        }
      />

      {banner ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-ink-primary">{banner}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</div>
      ) : null}

      <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
        <div className="space-y-6">
          {(query.data?.types ?? []).map((group: ProviderTypeSummary) => (
            <Surface key={group.type} className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink-primary">{group.label}</h2>
                  <p className="mt-0.5 text-sm text-ink-secondary">{group.description}</p>
                  <p className="mt-2 text-xs text-ink-secondary">
                    Active: <span className="font-semibold text-ink-primary">{group.activeId}</span>
                    {group.failoverId ? (
                      <>
                        {' '}
                        · Failover: <span className="font-semibold">{group.failoverId}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={Boolean(busyKey)}
                  onClick={() =>
                    void run(`${group.type}:none`, async () => {
                      const res = await providersApi.deactivate({ type: group.type })
                      setBanner(actionMessage(res.data.message, res.message, 'Provider deactivated'))
                    })
                  }
                >
                  Set None
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {group.providers.map((p) => {
                  const key = `${p.type}:${p.id}`
                  const unavailable =
                    p.status === 'planned' || (!p.configured && !p.isNone && p.id !== 'console' && p.id !== 'local')
                  return (
                    <div
                      key={key}
                      className={`rounded-xl border p-3 ${p.active ? 'border-primary/40 bg-primary/5' : 'border-border-subtle'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-primary">{p.label}</h3>
                        {p.active ? (
                          <StatusBadge label="Active" tone="success" />
                        ) : (
                          <StatusBadge label="Inactive" tone="neutral" />
                        )}
                        {p.configured ? (
                          <StatusBadge label="Configured" tone="success" />
                        ) : (
                          <StatusBadge label="Not configured" tone="warning" />
                        )}
                        {p.status === 'planned' ? <StatusBadge label="Planned" tone="neutral" /> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <StatusBadge
                          label={`Credentials: ${p.credentialStatus}`}
                          tone={credTone(p.credentialStatus)}
                        />
                        <StatusBadge
                          label={`Connection: ${p.connectionStatus}`}
                          tone={connTone(p.connectionStatus)}
                        />
                      </div>
                      <p className="mt-2 text-xs text-ink-secondary">{p.guidance}</p>
                      {p.missingEnv.length ? (
                        <p className="mt-1 text-xs text-error">
                          {import.meta.env.DEV
                            ? `Missing: ${p.missingEnv.join(', ')}`
                            : `Configuration incomplete (${p.missingEnv.length} setting${p.missingEnv.length === 1 ? '' : 's'} required). See deployment docs.`}
                        </p>
                      ) : null}
                      {p.lastTestAt ? (
                        <p className="mt-1 text-[11px] text-ink-secondary">
                          Last connection test succeeded
                          {p.lastTestMessage && import.meta.env.DEV ? ` — ${p.lastTestMessage}` : ''}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={Boolean(busyKey) || unavailable || p.active}
                          onClick={() =>
                            void run(key, async () => {
                              const res = await providersApi.activate({ type: p.type, providerId: p.id })
                              setBanner(actionMessage(res.data.message, res.message, 'Activated'))
                            })
                          }
                        >
                          {busyKey === key ? 'Working…' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busyKey) || p.status === 'planned'}
                          onClick={() =>
                            void run(`${key}:test`, async () => {
                              const res = await providersApi.test({ type: p.type, providerId: p.id })
                              setBanner(actionMessage(res.data.message, res.message, 'Test complete'))
                            })
                          }
                        >
                          Test connection
                        </Button>
                      </div>
                      {unavailable && !p.isNone ? (
                        <p className="mt-2 text-[11px] text-ink-secondary">
                          Unavailable until required environment variables are set (see guidance). Secrets are never
                          shown here.
                        </p>
                      ) : null}
                      {p.requiresRestart ? (
                        <p className="mt-2 text-[11px] text-warning">
                          May require a process or frontend rebuild after activation.
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Surface>
          ))}
          <p className="text-xs text-ink-secondary">
            Provider discovery is live. Environment variables are never overwritten by this page, and secrets are
            never displayed.
          </p>
        </div>
      </AsyncStateView>
    </div>
  )
}
