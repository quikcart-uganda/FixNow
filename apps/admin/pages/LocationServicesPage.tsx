import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import {
  getFriendlyErrorMessage,
  locationApi,
  type LocationDashboard,
  type LocationPlatformSettings,
} from '@fixnow/api/admin'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { Button, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'

/**
 * Admin Location Services Dashboard — Google Maps Platform health,
 * failover status, and configurable retry / fallback policy.
 */
export function LocationServicesPage() {
  const [draft, setDraft] = useState<LocationPlatformSettings | null>(null)
  const [dash, setDash] = useState<LocationDashboard | null>(null)
  const [log, setLog] = useState<Array<Record<string, unknown>>>([])
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loader = useAsync(async () => {
    const [dashboard, settings, failover] = await Promise.all([
      locationApi.dashboard(),
      locationApi.getSettings(),
      locationApi.failoverLog(),
    ])
    return {
      dashboard: dashboard.data,
      settings: settings.data?.settings,
      defaults: settings.data?.defaults,
      log: failover.data?.entries || [],
    }
  }, [])

  useEffect(() => {
    if (!loader.data) return
    setDash(loader.data.dashboard || null)
    if (loader.data.settings) setDraft({ ...loader.data.settings })
    setLog(loader.data.log || [])
  }, [loader.data])

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await locationApi.updateSettings(draft)
      setDraft(res.data?.settings ?? draft)
      setSaved(true)
      await loader.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function runHealth() {
    setChecking(true)
    setError(null)
    try {
      const res = await locationApi.healthCheck()
      setDash(res.data || null)
      await loader.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  if (loader.status === 'loading' && !draft) {
    return <AsyncStateView status="loading" loadingLabel="Loading location platform…" />
  }
  if (loader.status === 'error' && !draft) {
    return (
      <AsyncStateView status="error" error={loader.error} onRetry={() => void loader.reload()} />
    )
  }
  if (!draft) return null

  const caps = dash?.capabilities || {}

  return (
    <div className="space-y-6">
      <PageHeader
        title="Location Services"
        subtitle="Google Maps Platform is the official primary provider. Nominatim and Haversine activate only after confirmed Google failure."
      />

      {error ? <FormError>{error}</FormError> : null}
      {saved ? <p className="text-sm text-tertiary">Settings saved.</p> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Health score"
          value={`${dash?.healthScore ?? '—'}%`}
          hint={dash?.failoverActive ? 'Failover active' : 'Google primary'}
        />
        <StatCard
          label="Active provider"
          value={String(dash?.activeProvider || 'google')}
          hint={dash?.failoverActive ? 'Emergency fallback' : 'Normal operation'}
        />
        <StatCard
          label="Avg latency"
          value={dash?.averageLatencyMs != null ? `${dash.averageLatencyMs} ms` : '—'}
          hint={`${dash?.consecutiveGoogleFailures ?? 0} consecutive Google failures`}
        />
        <StatCard
          label="Google status"
          value={String((dash?.google as { status?: string } | undefined)?.status || 'unknown')}
          hint={String((dash?.google as { message?: string } | undefined)?.message || '')}
        />
      </div>

      <Surface className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Capability status</h2>
          <Button type="button" variant="secondary" onClick={() => void runHealth()} disabled={checking}>
            {checking ? 'Checking…' : 'Run health check'}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(caps).map(([name, info]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-edge px-3 py-2 text-sm"
            >
              <span className="font-medium capitalize">{name.replace(/_/g, ' ')}</span>
              <span className="text-ink-secondary">
                {info.provider} · {info.status}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={dash?.failoverActive ? 'warning' : 'success'}>
            {dash?.failoverActive ? 'Fallback mode' : 'Google primary'}
          </StatusBadge>
          {dash?.lastFailoverAt ? (
            <span className="text-xs text-ink-secondary">Last failover: {dash.lastFailoverAt}</span>
          ) : null}
          {dash?.lastRecoveryAt ? (
            <span className="text-xs text-ink-secondary">Last recovery: {dash.lastRecoveryAt}</span>
          ) : null}
        </div>
      </Surface>

      <Surface className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Provider policy</h2>
        <p className="text-sm text-ink-secondary">
          Primary is always Google. Fallback order and retries are emergency recovery only — the
          platform never randomly alternates providers.
        </p>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
              label="Platform enabled"
            />
            Platform enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.googleEnabled}
              onChange={(googleEnabled) => setDraft({ ...draft, googleEnabled })}
              label="Google enabled"
            />
            Google enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.nominatimEnabled}
              onChange={(nominatimEnabled) => setDraft({ ...draft, nominatimEnabled })}
              label="Nominatim fallback"
            />
            Nominatim fallback
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.haversineEnabled}
              onChange={(haversineEnabled) => setDraft({ ...draft, haversineEnabled })}
              label="Haversine last resort"
            />
            Haversine last resort
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.preferGoogleEta}
              onChange={(preferGoogleEta) => setDraft({ ...draft, preferGoogleEta })}
              label="Prefer Google ETA"
            />
            Prefer Google ETA / Distance Matrix
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="Retry attempts (Google)"
            value={draft.retryAttempts}
            onChange={(retryAttempts) => setDraft({ ...draft, retryAttempts })}
          />
          <NumberField
            label="Timeout (ms)"
            value={draft.timeoutMs}
            onChange={(timeoutMs) => setDraft({ ...draft, timeoutMs })}
          />
          <NumberField
            label="Failure threshold"
            value={draft.failureThreshold}
            onChange={(failureThreshold) => setDraft({ ...draft, failureThreshold })}
            hint="Consecutive Google failures before failover."
          />
          <NumberField
            label="Recovery probe (ms)"
            value={draft.recoveryProbeMs}
            onChange={(recoveryProbeMs) => setDraft({ ...draft, recoveryProbeMs })}
            hint="How often to probe Google while on fallback."
          />
          <NumberField
            label="Haversine road factor"
            value={draft.haversineRoadFactor}
            step={0.05}
            onChange={(haversineRoadFactor) => setDraft({ ...draft, haversineRoadFactor })}
          />
          <NumberField
            label="Haversine speed (km/h)"
            value={draft.haversineSpeedKmh}
            onChange={(haversineSpeedKmh) => setDraft({ ...draft, haversineSpeedKmh })}
          />
        </div>
        <div className="flex gap-3">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Surface>

      <Surface className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">Recent failovers</h2>
        {log.length === 0 ? (
          <p className="text-sm text-ink-secondary">No failovers recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {log.slice(0, 15).map((entry, i) => (
              <li key={i} className="rounded-lg border border-edge px-3 py-2">
                <span className="font-medium">
                  {String(entry.from)} → {String(entry.to)}
                </span>
                <span className="text-ink-secondary"> · {String(entry.reason)}</span>
                <div className="text-xs text-ink-secondary">{String(entry.at)}</div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Surface className="p-4">
      <p className="text-xs uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold capitalize">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-secondary">{hint}</p> : null}
    </Surface>
  )
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  hint?: string
  step?: number
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <span className="block text-xs text-ink-secondary">{hint}</span> : null}
    </label>
  )
}

export default LocationServicesPage
