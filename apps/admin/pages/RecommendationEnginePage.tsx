import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import {
  getFriendlyErrorMessage,
  recommendationApi,
  type RecommendationSettings,
  type RecommendationWeights,
} from '@fixnow/api/admin'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { Button, PageHeader, Surface, Toggle } from '../components/ui'

const WEIGHT_LABELS: Array<{ key: keyof RecommendationWeights; label: string; hint: string }> = [
  { key: 'distance', label: 'Distance', hint: 'Closer technicians score higher — never the sole factor.' },
  { key: 'rating', label: 'Rating', hint: 'Customer star rating average.' },
  { key: 'completedJobs', label: 'Completed jobs', hint: 'Experience volume soft-caps after many jobs.' },
  { key: 'trustScore', label: 'Trust score', hint: 'Platform trust / reliability composite.' },
  { key: 'responseTime', label: 'Response time', hint: 'Faster responders rank higher.' },
  { key: 'availability', label: 'Availability', hint: 'Online / available-now bonus.' },
  { key: 'verification', label: 'Verification', hint: 'Identity and skill verification.' },
  { key: 'subscription', label: 'Subscription', hint: 'Soft plan influence — capped separately.' },
  { key: 'categoryMatch', label: 'Category match', hint: 'Exact trade match when filtered.' },
  { key: 'acceptanceRate', label: 'Acceptance / punctuality', hint: 'Reliability proxy.' },
  { key: 'completionRate', label: 'Completion rate', hint: 'Completed vs cancelled.' },
  { key: 'recentActivity', label: 'Recent activity', hint: 'Recently active profiles.' },
  { key: 'urgency', label: 'Job urgency', hint: 'Used for technician job matching.' },
  { key: 'workload', label: 'Workload', hint: 'Busy technicians soft-deprioritised for new jobs.' },
]

/**
 * Admin Recommendation Engine Settings — tunable weights for the unified
 * intelligent matching engine (customer discovery + technician job feed + AI).
 */
export function RecommendationEnginePage() {
  const [draft, setDraft] = useState<RecommendationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loader = useAsync(async () => {
    const res = await recommendationApi.getSettings()
    return res.data
  }, [])

  useEffect(() => {
    if (loader.data?.settings) {
      setDraft({
        ...loader.data.settings,
        weights: { ...loader.data.settings.weights },
      })
    }
  }, [loader.data])

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await recommendationApi.updateSettings(draft)
      setDraft(res.data?.settings ?? draft)
      setSaved(true)
      await loader.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function resetDefaults() {
    if (!loader.data?.defaults) return
    setDraft({
      ...loader.data.defaults,
      weights: { ...loader.data.defaults.weights },
    })
    setSaved(false)
  }

  if (loader.status === 'loading' && !draft) {
    return <AsyncStateView status="loading" loadingLabel="Loading recommendation engine…" />
  }
  if (loader.status === 'error' && !draft) {
    return (
      <AsyncStateView status="error" error={loader.error} onRetry={() => void loader.reload()} />
    )
  }
  if (!draft) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommendation Engine"
        subtitle="Configure weighted ranking for technician discovery, invite lists, nearby jobs, and AI recommendations. Distance alone never dominates."
      />

      {error ? <FormError>{error}</FormError> : null}
      {saved ? <p className="text-sm text-tertiary">Settings saved — rankings update immediately.</p> : null}

      <Surface className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Engine</h2>
            <p className="text-sm text-ink-secondary">
              When disabled, the platform falls back to the legacy trust-first formula.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Toggle
              checked={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
              label="Engine enabled"
            />
            {draft.enabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="Maximum search radius (km)"
            value={draft.maxSearchRadiusKm}
            onChange={(maxSearchRadiusKm) => setDraft({ ...draft, maxSearchRadiusKm })}
          />
          <NumberField
            label="Average travel speed (km/h)"
            value={draft.averageTravelSpeedKmh}
            onChange={(averageTravelSpeedKmh) => setDraft({ ...draft, averageTravelSpeedKmh })}
            hint="Used for estimated arrival when live traffic is unavailable."
          />
          <NumberField
            label="Road distance factor"
            value={draft.roadDistanceFactor}
            step={0.05}
            onChange={(roadDistanceFactor) => setDraft({ ...draft, roadDistanceFactor })}
            hint="Multiplies straight-line distance (typical urban roads ≈ 1.35)."
          />
          <NumberField
            label="Max subscription influence"
            value={draft.maxSubscriptionInfluence}
            step={0.01}
            onChange={(maxSubscriptionInfluence) => setDraft({ ...draft, maxSubscriptionInfluence })}
            hint="0–0.4 share of quality score. Payment never overrides quality."
          />
          <NumberField
            label="Max boost influence"
            value={draft.maxBoostInfluence}
            step={0.01}
            onChange={(maxBoostInfluence) => setDraft({ ...draft, maxBoostInfluence })}
          />
          <NumberField
            label="Fairness strength"
            value={draft.fairnessStrength}
            step={0.01}
            onChange={(fairnessStrength) => setDraft({ ...draft, fairnessStrength })}
            hint="Mild rotation so equally strong nearby technicians share exposure."
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.fairnessEnabled}
              onChange={(fairnessEnabled) => setDraft({ ...draft, fairnessEnabled })}
              label="Balanced exposure"
            />
            Balanced exposure (fairness)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.showDecisionIndicators}
              onChange={(showDecisionIndicators) => setDraft({ ...draft, showDecisionIndicators })}
              label="Decision indicators"
            />
            Decision indicators
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle
              checked={draft.showEstimatedArrival}
              onChange={(showEstimatedArrival) => setDraft({ ...draft, showEstimatedArrival })}
              label="Estimated arrival"
            />
            Estimated arrival time
          </label>
        </div>
      </Surface>

      <Surface className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Factor weights</h2>
        <p className="text-sm text-ink-secondary">
          Weights are relative. Raising Distance does not ignore rating or trust — the engine normalises
          across all factors.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {WEIGHT_LABELS.map(({ key, label, hint }) => (
            <NumberField
              key={key}
              label={label}
              value={draft.weights[key]}
              hint={hint}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  weights: { ...draft.weights, [key]: v },
                })
              }
            />
          ))}
        </div>
      </Surface>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <Button type="button" variant="secondary" onClick={resetDefaults}>
          Reset to defaults
        </Button>
      </div>
    </div>
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
      <span className="text-sm font-medium text-ink">{label}</span>
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

export default RecommendationEnginePage
