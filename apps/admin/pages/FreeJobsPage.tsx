import { useEffect, useState, type ReactNode } from 'react'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, DataTable, FormError, Th } from '@fixnow/shared'
import {
  adminApi,
  freeLimitLabel,
  getFriendlyErrorMessage,
  mapAdminTechnician,
} from '@fixnow/api/admin'
import type { FreeJobSettings, FreeLimitMode } from '@fixnow/types/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'
import { ProfileAvatar } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

const UNLIMITED_LIMIT = 9999

function parseFreeJobSettings(raw: unknown): FreeJobSettings {
  const value = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: value.enabled !== false,
    defaultLimit: typeof value.defaultLimit === 'number' ? value.defaultLimit : 20,
    lockAfterLimit: value.lockAfterLimit !== false,
    adminOverride: true,
    requireCustomerConfirmation: value.requireCustomerConfirmation !== false,
    autoCompleteTimeoutHours:
      typeof value.autoCompleteTimeoutHours === 'number' ? value.autoCompleteTimeoutHours : 72,
    subscriptionEnabled: value.subscriptionEnabled === true,
    gracePeriodDays: typeof value.gracePeriodDays === 'number' ? value.gracePeriodDays : 0,
    freePlanEnabled: value.freePlanEnabled !== false,
    monetizationSuspended: value.monetizationSuspended === true,
  }
}

export function FreeJobsPage() {
  const [settings, setSettings] = useState<FreeJobSettings | null>(null)
  const [limits, setLimits] = useState<Record<string, FreeLimitMode>>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [profileCompletion, setProfileCompletion] = useState({
    reminderThreshold: 80,
    requireMinCompletionToApply: false,
    minApplyPercent: 60,
    reminderFrequencyDays: 3,
  })
  const [profileSaved, setProfileSaved] = useState(false)

  const { data, status, error, reload } = useAsync(async () => {
    const [dashRes, techRes, completionRes] = await Promise.all([
      adminApi.getDashboard(),
      adminApi.listTechnicians({ limit: 100 }),
      adminApi.getProfileCompletionConfig(),
    ])
    const freeJobs = (dashRes.data as Record<string, unknown>).freeJobs
    const parsed = parseFreeJobSettings(freeJobs)
    const technicians = safeArray(techRes.data?.items).map(mapAdminTechnician)
    return {
      settings: parsed,
      technicians,
      profileCompletion: completionRes.data,
    }
  }, [])

  useRealtimeReload(() => void reload(), [
    SOCKET_EVENTS.TECHNICIAN_LOCKED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
    SOCKET_EVENTS.TRUST_SCORE_UPDATED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
  ])

  const technicians = safeArray(data?.technicians)

  useEffect(() => {
    if (!data) return
    setSettings(data.settings)
    setLimits(Object.fromEntries(data.technicians.map((t) => [t.id, t.freeLimit])))
    if (data.profileCompletion) {
      setProfileCompletion({
        reminderThreshold: data.profileCompletion.reminderThreshold ?? 80,
        requireMinCompletionToApply: data.profileCompletion.requireMinCompletionToApply === true,
        minApplyPercent: data.profileCompletion.minApplyPercent ?? 60,
        reminderFrequencyDays: data.profileCompletion.reminderFrequencyDays ?? 3,
      })
    }
  }, [data])

  async function saveGlobalSettings() {
    if (!settings) return
    setSaveError(null)
    setSaving(true)
    try {
      await adminApi.updateFreeJobConfig({
        enabled: settings.enabled,
        defaultLimit: settings.defaultLimit,
        lockAfterLimit: settings.lockAfterLimit,
        requireCustomerConfirmation: settings.requireCustomerConfirmation !== false,
        autoCompleteTimeoutHours: settings.autoCompleteTimeoutHours ?? 72,
        subscriptionEnabled: settings.subscriptionEnabled === true,
        gracePeriodDays: settings.gracePeriodDays ?? 0,
        freePlanEnabled: settings.freePlanEnabled !== false,
        monetizationSuspended: settings.monetizationSuspended === true,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await reload()
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveProfileCompletionSettings() {
    setSaveError(null)
    setSaving(true)
    try {
      await adminApi.updateProfileCompletionConfig(profileCompletion)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
      await reload()
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function applyLimit(id: string, value: FreeLimitMode) {
    setLimits((prev) => ({ ...prev, [id]: value }))
    setSaveError(null)
    setSaving(true)
    try {
      const freeJobLimit = value === 'unlimited' ? UNLIMITED_LIMIT : value
      await adminApi.overrideFreeJobs(id, { freeJobLimit, unlock: true })
      await reload()
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Marketplace Monetization"
        subtitle="Free completed-job quota, customer confirmation rules, and subscription-ready enforcement. Only customer-confirmed completions count."
        actions={
          <Button onClick={() => void saveGlobalSettings()} disabled={saving || !settings}>
            <Icon name="save" className="!text-[18px]" /> Save controls
          </Button>
        }
      />

      {saved ? (
        <div className="rounded-lg border border-secondary/30 bg-secondary-container/30 px-4 py-3 text-sm text-on-secondary-container">
          Settings saved · All changes are audit-logged
        </div>
      ) : null}

      {profileSaved ? (
        <div className="rounded-lg border border-secondary/30 bg-secondary-container/30 px-4 py-3 text-sm text-on-secondary-container">
          Profile completion settings saved
        </div>
      ) : null}

      {saveError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{saveError}</FormError>
      ) : null}

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Surface className="p-6 space-y-6">
              <h2 className="text-xl font-semibold text-ink-primary">Master Controls</h2>

              {settings ? (
                <>
                  <ControlRow
                    title="Free Jobs Enabled"
                    description="When OFF, technicians cannot accept jobs without a paid plan (future)."
                    right={
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          {settings.enabled ? 'YES' : 'NO'}
                        </span>
                        <Toggle
                          checked={settings.enabled}
                          onChange={(enabled) => setSettings((s) => (s ? { ...s, enabled } : s))}
                          label="Free jobs enabled"
                        />
                      </div>
                    }
                  />

                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">Default Free Job Limit</p>
                        <p className="text-xs text-ink-muted mt-1">Applied to new technician accounts</p>
                      </div>
                      <StatusBadge label={`${settings.defaultLimit}`} tone="info" />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.defaultLimit}
                      onChange={(e) =>
                        setSettings((s) => (s ? { ...s, defaultLimit: Number(e.target.value) } : s))
                      }
                      className="w-full"
                    />
                  </div>

                  <ControlRow
                    title="Lock After Limit"
                    description="Technicians are locked from applying when free completed jobs are exhausted."
                    right={
                      <Toggle
                        checked={settings.lockAfterLimit}
                        onChange={(lockAfterLimit) =>
                          setSettings((s) => (s ? { ...s, lockAfterLimit } : s))
                        }
                        label="Lock after limit"
                      />
                    }
                  />

                  <ControlRow
                    title="Require customer confirmation"
                    description="Only customer-confirmed completions count toward free completed job quota."
                    right={
                      <Toggle
                        checked={settings.requireCustomerConfirmation !== false}
                        onChange={(requireCustomerConfirmation) =>
                          setSettings((s) => (s ? { ...s, requireCustomerConfirmation } : s))
                        }
                        label="Require customer confirmation"
                      />
                    }
                  />

                  <ControlRow
                    title="Free plan enabled"
                    description="New technicians receive the default free completed-job quota."
                    right={
                      <Toggle
                        checked={settings.freePlanEnabled !== false}
                        onChange={(freePlanEnabled) =>
                          setSettings((s) => (s ? { ...s, freePlanEnabled } : s))
                        }
                        label="Free plan enabled"
                      />
                    }
                  />

                  <ControlRow
                    title="Subscription enforcement ready"
                    description="When ON, exhausted quota sets subscriptionStatus=required (billing not live yet)."
                    right={
                      <Toggle
                        checked={settings.subscriptionEnabled === true}
                        onChange={(subscriptionEnabled) =>
                          setSettings((s) => (s ? { ...s, subscriptionEnabled } : s))
                        }
                        label="Subscription enabled"
                      />
                    }
                  />

                  <ControlRow
                    title="Suspend monetization"
                    description="Emergency bypass — technicians can apply even with zero remaining free jobs."
                    right={
                      <Toggle
                        checked={settings.monetizationSuspended === true}
                        onChange={(monetizationSuspended) =>
                          setSettings((s) => (s ? { ...s, monetizationSuspended } : s))
                        }
                        label="Suspend monetization"
                      />
                    }
                  />

                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">Auto-complete timeout (hours)</p>
                        <p className="text-xs text-ink-muted mt-1">
                          Admin guidance window after technician requests completion (0 = disabled)
                        </p>
                      </div>
                      <StatusBadge label={`${settings.autoCompleteTimeoutHours ?? 72}h`} tone="info" />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={168}
                      value={settings.autoCompleteTimeoutHours ?? 72}
                      onChange={(e) =>
                        setSettings((s) =>
                          s ? { ...s, autoCompleteTimeoutHours: Number(e.target.value) } : s,
                        )
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">Grace period (days)</p>
                        <p className="text-xs text-ink-muted mt-1">
                          Days after quota exhaustion before hard lock (0 = immediate)
                        </p>
                      </div>
                      <StatusBadge label={`${settings.gracePeriodDays ?? 0}d`} tone="neutral" />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={settings.gracePeriodDays ?? 0}
                      onChange={(e) =>
                        setSettings((s) => (s ? { ...s, gracePeriodDays: Number(e.target.value) } : s))
                      }
                      className="w-full"
                    />
                  </div>
                </>
              ) : null}
            </Surface>

            <Surface className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink-primary">Profile completion</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    MVP signup stays lean. Remind technicians to finish progressive profile setup.
                  </p>
                </div>
                <Button size="sm" onClick={() => void saveProfileCompletionSettings()} disabled={saving}>
                  Save
                </Button>
              </div>

              <ControlRow
                title="Reminder threshold"
                description="Show dashboard banners / reminders when completion is below this percent."
                right={
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm tabular-nums"
                      value={profileCompletion.reminderThreshold}
                      onChange={(e) =>
                        setProfileCompletion((s) => ({
                          ...s,
                          reminderThreshold: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="text-xs text-ink-muted">%</span>
                  </div>
                }
              />

              <ControlRow
                title="Reminder frequency"
                description="Days before a dismissed reminder can appear again."
                right={
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="w-20 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm tabular-nums"
                      value={profileCompletion.reminderFrequencyDays}
                      onChange={(e) =>
                        setProfileCompletion((s) => ({
                          ...s,
                          reminderFrequencyDays: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="text-xs text-ink-muted">days</span>
                  </div>
                }
              />

              <ControlRow
                title="Require min % to apply"
                description="Optional gate: block job applications until profile reaches the minimum."
                right={
                  <Toggle
                    checked={profileCompletion.requireMinCompletionToApply}
                    onChange={(requireMinCompletionToApply) =>
                      setProfileCompletion((s) => ({ ...s, requireMinCompletionToApply }))
                    }
                    label="Require min completion to apply"
                  />
                }
              />

              <ControlRow
                title="Minimum apply percent"
                description="Used only when the apply gate above is enabled."
                right={
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm tabular-nums"
                      value={profileCompletion.minApplyPercent}
                      onChange={(e) =>
                        setProfileCompletion((s) => ({
                          ...s,
                          minApplyPercent: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="text-xs text-ink-muted">%</span>
                  </div>
                }
              />

              <p className="text-xs text-ink-muted leading-relaxed">
                Scoring weights (identity, profession, district, photo, bio, experience, languages,
                categories, coverage, portfolio) live in the profile-completion service. Mandatory
                signup fields remain name, phone, email, password, primary category, district, and
                terms — everything else is post-registration.
              </p>
            </Surface>
          </div>

          <Surface className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-ink-primary">Why this model wins</h2>
            <ul className="space-y-3 text-sm text-ink-secondary leading-relaxed">
              <li><strong className="text-ink-primary">Retention:</strong> Free jobs onboard fundis; locks create conversion pressure to paid plans.</li>
              <li><strong className="text-ink-primary">Trust:</strong> Limits reduce spam applications and protect job quality.</li>
              <li><strong className="text-ink-primary">Revenue:</strong> UX is subscription-ready without rebuilding controls later.</li>
              <li><strong className="text-ink-primary">Local edge:</strong> Competitors (Jiji, HANDYUG) lack granular free-limit + lock automation.</li>
            </ul>
            <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 text-sm">
              <p className="font-semibold text-primary mb-1">Subscription readiness</p>
              <p className="text-ink-secondary">When plans launch, locked technicians will land on Upgrade with Mobile Money checkout — architecture already mapped.</p>
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-ink-primary">Individual Technician Controls</h2>
              <p className="text-sm text-ink-secondary mt-1">Override free limits per fundi — e.g. 20, 50, or Unlimited.</p>
            </div>
            <DataTable caption="Technician free job limit controls">
              <thead>
                <tr className="bg-surface-alt border-b border-border">
                  <Th>Technician</Th>
                  <Th>Used</Th>
                  <Th>Current limit</Th>
                  <Th>Quick set</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {technicians.map((t) => (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar
                          alt={t.name}
                          src={t.profileImageUrl || t.avatar}
                          role="technician"
                          className="h-9 w-9 rounded-full"
                        />
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-ink-secondary">{t.trade}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm tabular-nums">{t.freeJobsUsed}</td>
                    <td className="px-6 py-4">
                      <StatusBadge label={freeLimitLabel(limits[t.id] ?? t.freeLimit)} tone="info" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {[20, 50].map((n) => (
                          <Button
                            key={n}
                            size="sm"
                            variant={(limits[t.id] ?? t.freeLimit) === n ? 'primary' : 'outline'}
                            disabled={saving}
                            onClick={() => void applyLimit(t.id, n)}
                          >
                            {n}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant={(limits[t.id] ?? t.freeLimit) === 'unlimited' ? 'primary' : 'outline'}
                          disabled={saving}
                          onClick={() => void applyLimit(t.id, 'unlimited')}
                        >
                          Unlimited
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Surface>
        </>
      </AsyncStateView>
    </div>
  )
}

function ControlRow({
  title,
  description,
  right,
}: {
  title: string
  description: string
  right: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-border rounded-xl p-4">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-ink-muted mt-1 max-w-sm">{description}</p>
      </div>
      {right}
    </div>
  )
}
