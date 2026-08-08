import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import {
  ApiError,
  getFriendlyErrorMessage,
  developerPreviewApi,
} from '@fixnow/api/admin'
import { Button, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'

type PreviewSettings = {
  enablePreview: boolean
  suspendPreview: boolean
  allowDevelopers: boolean
  allowQa: boolean
  requireSandbox: boolean
  defaultDurationHours: number
  authorizedEmails: string[]
  authorizedUserIds: string[]
  enabledPlans: Record<string, boolean>
}

export function DeveloperPreviewPage() {
  const [draft, setDraft] = useState<PreviewSettings | null>(null)
  const [emailsText, setEmailsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const overview = useAsync(async () => {
    try {
      const res = await developerPreviewApi.adminOverview()
      setForbidden(false)
      return res.data
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setForbidden(true)
      throw err
    }
  }, [])

  useEffect(() => {
    const s = overview.data?.settings as PreviewSettings | undefined
    if (!s) return
    setDraft(s)
    setEmailsText((s.authorizedEmails || []).join('\n'))
  }, [overview.data])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await developerPreviewApi.adminUpdateSettings({
        ...draft,
        authorizedEmails: emailsText
          .split(/[\n,]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      })
      setMessage('Developer Preview settings saved.')
      overview.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      setMessage(ok)
      overview.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <PageHeader title="Developer Preview" subtitle="Super Admin only" />
        <Surface className="p-6">
          <p className="text-on-surface-variant">You do not have permission to manage Developer Preview.</p>
        </Surface>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Developer Preview"
        subtitle="Temporary entitlement sessions for authorised developers — never creates subscriptions or payments."
      />

      <AsyncStateView status={overview.status} error={overview.error} onRetry={overview.reload}>
        {overview.data && draft ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Master switch</p>
                <StatusBadge tone={draft.enablePreview && !draft.suspendPreview ? 'success' : 'warning'}>
                  {draft.enablePreview && !draft.suspendPreview ? 'Enabled' : 'Disabled / Suspended'}
                </StatusBadge>
                <p className="text-xs text-on-surface-variant">
                  Launch transition: disable Preview (and Sandbox / Seed Platform) for production-only mode —
                  no code deletion required.
                </p>
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Active sessions</p>
                <p className="text-2xl font-semibold text-on-surface">
                  {Number((overview.data.analytics as { activeSessions?: number })?.activeSessions || 0)}
                </p>
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold">Total sessions (history)</p>
                <p className="text-2xl font-semibold text-on-surface">
                  {Number((overview.data.analytics as { totalSessions?: number })?.totalSessions || 0)}
                </p>
              </Surface>
            </div>

            <Surface className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">Configuration</h2>
              <div className="space-y-1">
                {(
                  [
                    ['enablePreview', 'Enable Preview', 'Master switch for temporary entitlement sessions'],
                    ['suspendPreview', 'Suspend Preview', 'Block new activations and hide Upgrade section'],
                    ['allowDevelopers', 'Allow Developers', 'Accounts with metadata.developer = true'],
                    ['allowQa', 'Allow QA', 'Accounts with metadata.qa = true'],
                    ['requireSandbox', 'Require Sandbox', 'Sandbox platform enabled + sandbox account'],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-4 border-b border-border-subtle py-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-on-surface">{label}</p>
                      <p className="text-sm text-on-surface-variant">{hint}</p>
                    </div>
                    <Toggle
                      checked={Boolean(draft[key])}
                      onChange={(v) => setDraft({ ...draft, [key]: v })}
                      label={label}
                    />
                  </div>
                ))}
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-on-surface-variant">Default duration (hours)</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  className="w-full max-w-xs rounded-xl border border-outline-variant px-3 py-2"
                  value={draft.defaultDurationHours}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultDurationHours: Number(e.target.value) || 8 })
                  }
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-medium">Enabled preview plans</p>
                <div className="flex flex-wrap gap-3">
                  {(['STARTER', 'PROFESSIONAL', 'BUSINESS', 'BUSINESS_BOOST'] as const).map((code) => (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.enabledPlans?.[code] !== false}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            enabledPlans: { ...draft.enabledPlans, [code]: e.target.checked },
                          })
                        }
                      />
                      {code}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-on-surface-variant">Authorised emails (one per line)</span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-outline-variant px-3 py-2 font-mono text-xs"
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                />
              </label>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </Surface>

            <Surface className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-lg font-semibold">Active sessions</h2>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run('terminate-all', () => developerPreviewApi.adminTerminateAll(), 'All sessions terminated.')
                  }
                >
                  Terminate all
                </Button>
              </div>
              <ul className="divide-y divide-border-subtle">
                {safeArray(overview.data.activeSessions).map((row) => {
                  const s = row as {
                    id: string
                    email: string
                    planCode: string
                    expiresAt: string
                  }
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{s.email}</p>
                        <p className="text-on-surface-variant">
                          {s.planCode} · expires {new Date(s.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void run(
                            s.id,
                            () => developerPreviewApi.adminTerminate(s.id),
                            'Session terminated.',
                          )
                        }
                      >
                        Terminate
                      </Button>
                    </li>
                  )
                })}
                {!safeArray(overview.data.activeSessions).length ? (
                  <li className="py-6 text-center text-on-surface-variant">No active preview sessions.</li>
                ) : null}
              </ul>
            </Surface>
          </>
        ) : null}
      </AsyncStateView>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  )
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}
