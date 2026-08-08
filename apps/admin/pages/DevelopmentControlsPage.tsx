import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError, resetDevSettingsCache } from '@fixnow/shared'
import {
  ApiError,
  devSettingsApi,
  getFriendlyErrorMessage,
  type DevControls,
} from '@fixnow/api/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'

type FlagKey = keyof DevControls

const FLAGS: Array<{ key: FlagKey; label: string; hint: string }> = [
  {
    key: 'enableDevOtp',
    label: 'Enable Dev OTP display',
    hint: 'Returns the verification code in the API response and shows it on the verification screen.',
  },
  {
    key: 'enableDevLogin',
    label: 'Enable development login',
    hint: 'Allows development-only login shortcuts that bypass the standard password flow.',
  },
  {
    key: 'enableTestAccounts',
    label: 'Enable test accounts',
    hint: 'Allows seeded demo accounts to sign in and be created.',
  },
  {
    key: 'enableMockProviders',
    label: 'Enable mock providers',
    hint: 'Uses simulated email, SMS, payment and push providers instead of live integrations.',
  },
  {
    key: 'enableDebugLogs',
    label: 'Enable debug logs',
    hint: 'Writes verbose diagnostics, including full notification bodies, to the server logs.',
  },
  {
    key: 'enableDevelopmentMode',
    label: 'Development mode',
    hint: 'Master switch surfaced to clients for development-only affordances.',
  },
]

const ENVIRONMENT_TONE = {
  production: 'danger',
  staging: 'warning',
  development: 'info',
  test: 'neutral',
} as const

export function DevelopmentControlsPage() {
  const [draft, setDraft] = useState<DevControls | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const { data, status, error, reload } = useAsync(async () => {
    try {
      const res = await devSettingsApi.get()
      return res.data
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
        return null
      }
      throw err
    }
  }, [])

  useEffect(() => {
    if (data) setDraft(data.effective)
  }, [data])

  const locked = data?.productionLocked === true
  const environment = data?.environment ?? 'production'
  const dirty = Boolean(
    data && draft && FLAGS.some((f) => draft[f.key] !== data.effective[f.key]),
  )

  async function save() {
    if (!draft) return
    setSaveError(null)
    setSaving(true)
    try {
      await devSettingsApi.update(draft)
      resetDevSettingsCache()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      await reload()
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Development Controls"
          subtitle="System Settings → Development Controls"
        />
        <Surface className="p-6">
          <p className="text-sm text-ink-secondary">
            Only Super Admins can view or change development controls. Ask a Super Admin if you need these
            settings adjusted.
          </p>
        </Surface>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Development Controls"
        subtitle="System Settings → Development Controls · Super Admin only · every change is audit-logged"
        actions={
          <Button onClick={() => void save()} disabled={saving || locked || !dirty}>
            <Icon name="save" className="!text-[18px]" /> Save changes
          </Button>
        }
      />

      {saved ? (
        <div className="rounded-lg border border-secondary/30 bg-secondary-container/30 px-4 py-3 text-sm text-on-secondary-container">
          Development controls updated
        </div>
      ) : null}

      {saveError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {saveError}
        </FormError>
      ) : null}

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Surface className="min-w-0 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-primary">Feature toggles</h2>
              <StatusBadge label={`${environment} environment`} tone={ENVIRONMENT_TONE[environment]} />
            </div>

            {locked ? (
              <p className="mt-3 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
                Production lockdown is active. Every development feature is forced off and these toggles are
                read-only — the backend rejects changes and ignores stored overrides.
              </p>
            ) : null}

            <div className="mt-5 divide-y divide-border">
              {FLAGS.map((flag) => (
                <div key={flag.key} className="flex items-start justify-between gap-6 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-primary">{flag.label}</p>
                    <p className="mt-1 text-pretty text-sm text-ink-secondary">{flag.hint}</p>
                  </div>
                  <Toggle
                    label={flag.label}
                    checked={draft?.[flag.key] === true}
                    disabled={locked || saving || !draft}
                    onChange={(value) =>
                      setDraft((prev) => (prev ? { ...prev, [flag.key]: value } : prev))
                    }
                  />
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="min-w-0 p-6">
            <h2 className="text-lg font-semibold text-ink-primary">Environment</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-secondary">Deployment</dt>
                <dd className="font-semibold text-ink-primary">{environment}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-secondary">NODE_ENV</dt>
                <dd className="font-semibold text-ink-primary">{data?.nodeEnv ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-secondary">Production lockdown</dt>
                <dd className="font-semibold text-ink-primary">{locked ? 'Enforced' : 'Not applicable'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-secondary">Last updated</dt>
                <dd className="font-semibold text-ink-primary">
                  {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'Never'}
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-pretty text-sm text-ink-secondary">
              Toggles override the environment defaults from the server configuration. Production always wins:
              Dev OTP, dev login, test accounts, mock providers and debug logs stay off there no matter what is
              stored here.
            </p>
          </Surface>
        </div>
      </AsyncStateView>
    </div>
  )
}
