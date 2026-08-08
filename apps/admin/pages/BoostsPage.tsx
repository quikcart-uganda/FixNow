import { useEffect, useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import { adminBoostsApi, formatUgx, getFriendlyErrorMessage, type BoostProductDto } from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { Button, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'
import { safeArray } from '@fixnow/utils'

type View =
  | { mode: 'home' }
  | { mode: 'product'; id: string }
  | { mode: 'purchases' }
  | { mode: 'settings' }

/**
 * Admin Boost Management — card grid → per-product configuration.
 * Boosts are marketing products, not subscription plans.
 */
export function BoostsPage() {
  const [view, setView] = useState<View>({ mode: 'home' })
  const [draft, setDraft] = useState<BoostProductDto | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<{
    enabled: boolean
    maxCombinedWeight: number
    currency: string
  } | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const catalogue = useAsync(async () => {
    const [cat, purchases] = await Promise.all([
      adminBoostsApi.catalogue(),
      adminBoostsApi.listPurchases({ status: 'pending_payment', limit: 50 }),
    ])
    return { catalogue: cat.data, purchases: safeArray(purchases.data?.items) }
  }, [])

  useEffect(() => {
    if (!catalogue.data) return
    setSettingsDraft({ ...catalogue.data.catalogue.settings })
  }, [catalogue.data])

  useEffect(() => {
    if (view.mode !== 'product' || !catalogue.data) return
    const product = catalogue.data.catalogue.products.find((p) => p.id === view.id) || null
    setDraft(product ? { ...product } : null)
  }, [view, catalogue.data])

  async function saveProduct() {
    if (!draft) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await adminBoostsApi.updateProduct(draft.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        currency: draft.currency,
        durationHours: draft.durationHours,
        weight: draft.weight,
        priority: draft.priority,
        sortOrder: draft.sortOrder,
        isActive: draft.isActive,
        isVisible: draft.isVisible,
        eligiblePlans: draft.eligiblePlans,
        maxConcurrentPurchases: draft.maxConcurrentPurchases,
        estimatedVisibilityLiftPercent: draft.estimatedVisibilityLiftPercent,
        allowTechnicianDistrictPick: draft.allowTechnicianDistrictPick,
        benefits: draft.benefits,
        districts: draft.districts,
        placements: draft.placements,
      })
      setSaved(true)
      await catalogue.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (catalogue.status === 'loading' && !catalogue.data) {
    return <AsyncStateView status="loading" loadingLabel="Loading boosts…" />
  }
  if (catalogue.status === 'error' && !catalogue.data) {
    return (
      <AsyncStateView status="error" error={catalogue.error} onRetry={() => void catalogue.reload()} />
    )
  }

  if (view.mode === 'product' && draft) {
    return (
      <div className="space-y-6">
        <button type="button" className="text-sm text-primary" onClick={() => setView({ mode: 'home' })}>
          ← Boost Management
        </button>
        <h1 className="text-2xl font-semibold">{draft.name}</h1>
        <p className="text-sm text-ink-secondary">
          Configure price, duration, weight, eligibility, and visibility. Soft ranking only — trust stays first.
        </p>
        {error ? <FormError>{error}</FormError> : null}
        {saved ? <p className="text-sm text-tertiary">Saved.</p> : null}

        <Surface className="grid gap-4 p-6 md:grid-cols-2">
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field
            label="Price (UGX)"
            type="number"
            value={String(draft.price)}
            onChange={(v) => setDraft({ ...draft, price: Number(v) })}
          />
          <Field
            label="Duration (hours)"
            type="number"
            value={String(draft.durationHours)}
            onChange={(v) => setDraft({ ...draft, durationHours: Number(v) })}
          />
          <Field
            label="Weight (soft)"
            type="number"
            value={String(draft.weight)}
            onChange={(v) => setDraft({ ...draft, weight: Number(v) })}
          />
          <Field
            label="Priority"
            type="number"
            value={String(draft.priority)}
            onChange={(v) => setDraft({ ...draft, priority: Number(v) })}
          />
          <Field
            label="Display order"
            type="number"
            value={String(draft.sortOrder)}
            onChange={(v) => setDraft({ ...draft, sortOrder: Number(v) })}
          />
          <Field
            label="Est. visibility lift %"
            type="number"
            value={String(draft.estimatedVisibilityLiftPercent)}
            onChange={(v) => setDraft({ ...draft, estimatedVisibilityLiftPercent: Number(v) })}
          />
          <Field
            label="Max concurrent purchases"
            type="number"
            value={String(draft.maxConcurrentPurchases)}
            onChange={(v) => setDraft({ ...draft, maxConcurrentPurchases: Number(v) })}
          />
          <label className="md:col-span-2 block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-secondary">Description</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="md:col-span-2 block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-secondary">
              Eligible plans (comma: FREE,STARTER,PROFESSIONAL,BUSINESS)
            </span>
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
              value={draft.eligiblePlans.join(',')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  eligiblePlans: e.target.value
                    .split(',')
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <ToggleRow
            label="Active"
            checked={draft.isActive}
            onChange={(v) => setDraft({ ...draft, isActive: v })}
          />
          <ToggleRow
            label="Visible in marketplace"
            checked={draft.isVisible}
            onChange={(v) => setDraft({ ...draft, isVisible: v })}
          />
          <ToggleRow
            label="Allow technician district pick"
            checked={draft.allowTechnicianDistrictPick}
            onChange={(v) => setDraft({ ...draft, allowTechnicianDistrictPick: v })}
          />
          <div className="md:col-span-2">
            <Button disabled={saving} onClick={() => void saveProduct()}>
              {saving ? 'Saving…' : 'Save boost settings'}
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  if (view.mode === 'settings' && settingsDraft) {
    return (
      <div className="space-y-6">
        <button type="button" className="text-sm text-primary" onClick={() => setView({ mode: 'home' })}>
          ← Boost Management
        </button>
        <h1 className="text-2xl font-semibold">Boost system settings</h1>
        {error ? <FormError>{error}</FormError> : null}
        <Surface className="space-y-4 p-6">
          <ToggleRow
            label="Boosts enabled"
            checked={settingsDraft.enabled}
            onChange={(v) => setSettingsDraft({ ...settingsDraft, enabled: v })}
          />
          <Field
            label="Max combined soft weight (trust remains dominant)"
            type="number"
            value={String(settingsDraft.maxCombinedWeight)}
            onChange={(v) => setSettingsDraft({ ...settingsDraft, maxCombinedWeight: Number(v) })}
          />
          <Field
            label="Currency"
            value={settingsDraft.currency}
            onChange={(v) => setSettingsDraft({ ...settingsDraft, currency: v })}
          />
          <Button
            disabled={saving}
            onClick={() =>
              void (async () => {
                setSaving(true)
                setError(null)
                try {
                  await adminBoostsApi.updateSettings(settingsDraft)
                  await catalogue.reload()
                  setView({ mode: 'home' })
                } catch (err) {
                  setError(getFriendlyErrorMessage(err))
                } finally {
                  setSaving(false)
                }
              })()
            }
          >
            Save settings
          </Button>
        </Surface>
      </div>
    )
  }

  if (view.mode === 'purchases') {
    const items = catalogue.data?.purchases || []
    return (
      <div className="space-y-6">
        <button type="button" className="text-sm text-primary" onClick={() => setView({ mode: 'home' })}>
          ← Boost Management
        </button>
        <h1 className="text-2xl font-semibold">Pending boost payments</h1>
        {error ? <FormError>{error}</FormError> : null}
        <input
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Review note"
        />
        <Surface className="space-y-3 p-6">
          {items.length === 0 ? (
            <p className="text-sm text-ink-secondary">No pending boost payments.</p>
          ) : (
            items.map((p) => (
              <div
                key={String(p.id)}
                className="flex flex-col gap-3 rounded-xl border border-outline-variant p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {String((p.technician as { name?: string } | null)?.name || 'Technician')} ·{' '}
                    {String(p.productName)}
                  </p>
                  <p className="text-sm text-ink-secondary">
                    {formatUgx(Number(p.amount || 0))} · {String(p.transactionId || '')} ·{' '}
                    {String(p.network || '')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={saving}
                    onClick={() =>
                      void (async () => {
                        setSaving(true)
                        try {
                          await adminBoostsApi.approve(String(p.id), note || undefined)
                          setNote('')
                          await catalogue.reload()
                        } catch (err) {
                          setError(getFriendlyErrorMessage(err))
                        } finally {
                          setSaving(false)
                        }
                      })()
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      void (async () => {
                        setSaving(true)
                        try {
                          await adminBoostsApi.reject(String(p.id), note || 'Rejected')
                          await catalogue.reload()
                        } catch (err) {
                          setError(getFriendlyErrorMessage(err))
                        } finally {
                          setSaving(false)
                        }
                      })()
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </Surface>
      </div>
    )
  }

  const products = catalogue.data?.catalogue.products || []
  const settings = catalogue.data?.catalogue.settings

  return (
    <div className="space-y-8">
      <PageHeader
        title="Boost Management"
        subtitle="Optional marketing products that temporarily lift visibility. They never override trust or customer quality."
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          label={settings?.enabled ? 'System on' : 'System off'}
          tone={settings?.enabled ? 'success' : 'warning'}
        />
        <span className="text-sm text-ink-secondary">
          Max combined soft weight: {settings?.maxCombinedWeight ?? 25}
        </span>
        <Button variant="outline" onClick={() => setView({ mode: 'settings' })}>
          Settings
        </Button>
        <Button variant="outline" onClick={() => setView({ mode: 'purchases' })}>
          Pending payments ({catalogue.data?.purchases.length || 0})
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-2xl border border-outline-variant bg-surface p-5 text-left transition hover:border-primary/50"
            onClick={() => setView({ mode: 'product', id: p.id })}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {p.type.replace(/_/g, ' ')}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{p.name}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-ink-secondary">{p.description}</p>
            <p className="mt-4 font-semibold text-primary">
              {formatUgx(p.price)}
              <span className="text-sm font-normal text-ink-secondary"> · {p.durationLabel}</span>
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              Weight {p.weight} · {p.isActive ? 'Active' : 'Inactive'} ·{' '}
              {(p.eligiblePlans || []).join(', ')}
            </p>
            <p className="mt-3 text-sm font-medium text-primary">Configure →</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <input
        type={type}
        className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant px-3 py-2">
      <span className="truncate text-sm">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default BoostsPage
