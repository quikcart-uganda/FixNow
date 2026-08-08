import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { adminApi, formatUgx, getFriendlyErrorMessage } from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { Button, PageHeader, StatusBadge, Surface, Toggle } from '../components/ui'
import { safeArray } from '@fixnow/utils'

type View =
  | { mode: 'home' }
  | { mode: 'plan'; code: string; section: ConfigSection }
  | { mode: 'ops'; tab: OpsTab }

type ConfigSection =
  | 'general'
  | 'pricing'
  | 'permissions'
  | 'marketing'
  | 'media'
  | 'search'
  | 'support'
  | 'badges'
  | 'advanced'

type OpsTab = 'payments' | 'subscriptions' | 'creatives' | 'momo' | 'reminders' | 'periods' | 'matrix' | 'discovery'

const SECTIONS: Array<{ id: ConfigSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'media', label: 'Media' },
  { id: 'search', label: 'Search visibility' },
  { id: 'support', label: 'Support & renewal' },
  { id: 'badges', label: 'Badges' },
  { id: 'advanced', label: 'Advanced' },
]

/**
 * Redesigned Subscription Management — plan cards open a full config window.
 * Extremely simple landing; deep controls live inside each plan.
 */
export function SubscriptionsPage() {
  const [view, setView] = useState<View>({ mode: 'home' })
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [momoDraft, setMomoDraft] = useState<Record<string, unknown> | null>(null)
  const [reminderDraft, setReminderDraft] = useState<Record<string, unknown> | null>(null)
  const [discoveryDraft, setDiscoveryDraft] = useState<Record<string, unknown> | null>(null)
  const [periodsDraft, setPeriodsDraft] = useState<Record<string, unknown> | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [creativeNote, setCreativeNote] = useState('')

  const catalogue = useAsync(async () => {
    const [cat, payments, subs, creatives, analytics] = await Promise.all([
      adminApi.getSubscriptionCatalogue(),
      adminApi.listSubscriptionPayments({ status: 'pending', limit: 50 }),
      adminApi.listSubscriptions({ limit: 50 }),
      adminApi.listMarketingCreatives({ status: 'pending', limit: 50 }),
      adminApi.getSubscriptionAnalytics().catch(() => ({ data: null })),
    ])
    return {
      catalogue: cat.data,
      payments: safeArray(payments.data?.items),
      subscriptions: safeArray(subs.data?.items),
      creatives: safeArray(creatives.data?.items),
      analytics: analytics.data,
    }
  }, [])

  const plans = useMemo(
    () => safeArray(catalogue.data?.catalogue.plans) as Array<Record<string, unknown>>,
    [catalogue.data],
  )

  useEffect(() => {
    if (!catalogue.data) return
    setMomoDraft({ ...(catalogue.data.catalogue.momo as Record<string, unknown>) })
    setReminderDraft({ ...(catalogue.data.catalogue.reminders as Record<string, unknown>) })
    setPeriodsDraft({
      ...((catalogue.data.catalogue.billingPeriods as Record<string, unknown> | undefined) || {}),
    })
    setDiscoveryDraft({
      ...((catalogue.data.catalogue.discovery as Record<string, unknown> | undefined) || {
        upgradesEnabled: true,
        showFreePlan: true,
        featuredPlanCode: 'PROFESSIONAL',
        recommendedPlanCode: 'PROFESSIONAL',
        popularPlanCode: 'STARTER',
        allowDowngrade: false,
        heroTitle: 'Upgrade Plan',
        heroSubtitle:
          'Compare Free, Starter, Professional, and Business anytime — upgrading is optional.',
      }),
    })
  }, [catalogue.data])

  useEffect(() => {
    if (view.mode !== 'plan') return
    const plan = plans.find((p) => String(p.code) === view.code)
    setDraft(plan ? { ...plan } : null)
  }, [view, plans])

  async function savePlan() {
    if (!draft?.id) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await adminApi.updateSubscriptionPlan(String(draft.id), {
        name: draft.name,
        description: draft.description,
        currency: draft.currency,
        priceMonthly: Number(draft.priceMonthly),
        priceQuarterly: Number(draft.priceQuarterly),
        priceHalfYear: Number(draft.priceHalfYear || 0),
        priceYearly: Number(draft.priceYearly),
        gracePeriodDays: Number(draft.gracePeriodDays),
        autoRenew: Boolean(draft.autoRenew),
        features: draft.features,
        featureFlags: draft.featureFlags,
        limits: draft.limits,
        isActive: Boolean(draft.isActive),
        isVisible: draft.isVisible !== false,
        sortOrder: Number(draft.sortOrder || 0),
        badge: draft.badge,
      })
      setSaved(true)
      await catalogue.reload()
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (catalogue.status === 'loading' && !catalogue.data) {
    return <AsyncStateView status="loading" loadingLabel="Loading subscriptions…" />
  }
  if (catalogue.status === 'error' && !catalogue.data) {
    return (
      <AsyncStateView status="error" error={catalogue.error} onRetry={() => void catalogue.reload()} />
    )
  }

  if (view.mode === 'plan' && draft) {
    const section = view.section
    const flags = (draft.featureFlags as Record<string, boolean>) || {}
    const limits = (draft.limits as Record<string, number>) || {}
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => setView({ mode: 'home' })}
            >
              ← All plans
            </button>
            <h1 className="mt-1 text-2xl font-semibold">{String(draft.name)} configuration</h1>
            <p className="text-sm text-ink-secondary">
              Every permission, limit, and price is editable. Changes affect new entitlements immediately.
            </p>
          </div>
          <StatusBadge
            label={draft.isActive ? 'Active' : 'Inactive'}
            tone={draft.isActive ? 'success' : 'warning'}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setView({ mode: 'plan', code: view.code, section: s.id })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                section === s.id ? 'bg-primary text-white' : 'bg-surface-container text-ink-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {saveError ? <FormError>{saveError}</FormError> : null}
        {saved ? <p className="text-sm text-tertiary">Saved.</p> : null}

        <Surface className="space-y-4 p-6">
          {section === 'general' ? (
            <>
              <Field label="Plan name" value={String(draft.name || '')} onChange={(v) => setDraft({ ...draft, name: v })} />
              <Field
                label="Display order"
                type="number"
                value={String(draft.sortOrder ?? 0)}
                onChange={(v) => setDraft({ ...draft, sortOrder: Number(v) })}
              />
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase text-ink-secondary">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
                  value={String(draft.description || '')}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <ToggleRow
                label="Active"
                checked={Boolean(draft.isActive)}
                onChange={(v) => setDraft({ ...draft, isActive: v })}
              />
              <ToggleRow
                label="Visible to technicians"
                checked={draft.isVisible !== false}
                onChange={(v) => setDraft({ ...draft, isVisible: v })}
              />
            </>
          ) : null}

          {section === 'pricing' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Currency" value={String(draft.currency || 'UGX')} onChange={(v) => setDraft({ ...draft, currency: v })} />
              <Field
                label="Grace period (days)"
                type="number"
                value={String(draft.gracePeriodDays ?? 0)}
                onChange={(v) => setDraft({ ...draft, gracePeriodDays: Number(v) })}
              />
              <Field
                label="Monthly price"
                type="number"
                value={String(draft.priceMonthly ?? 0)}
                onChange={(v) => setDraft({ ...draft, priceMonthly: Number(v) })}
              />
              <Field
                label="Quarterly price"
                type="number"
                value={String(draft.priceQuarterly ?? 0)}
                onChange={(v) => setDraft({ ...draft, priceQuarterly: Number(v) })}
              />
              <Field
                label="Half-year price"
                type="number"
                value={String(draft.priceHalfYear ?? 0)}
                onChange={(v) => setDraft({ ...draft, priceHalfYear: Number(v) })}
              />
              <Field
                label="Yearly price"
                type="number"
                value={String(draft.priceYearly ?? 0)}
                onChange={(v) => setDraft({ ...draft, priceYearly: Number(v) })}
              />
              <ToggleRow
                label="Auto renew flag"
                checked={Boolean(draft.autoRenew)}
                onChange={(v) => setDraft({ ...draft, autoRenew: v })}
              />
            </div>
          ) : null}

          {section === 'permissions' ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(flags).map(([key, value]) => (
                <ToggleRow
                  key={key}
                  label={key}
                  checked={Boolean(value)}
                  onChange={(v) =>
                    setDraft({ ...draft, featureFlags: { ...flags, [key]: v } })
                  }
                />
              ))}
            </div>
          ) : null}

          {section === 'marketing' ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[
                'maxAdvertisingSlides',
                'maxHomepageSlides',
                'maxPromotionalBanners',
                'maxActiveOffers',
                'maxAnnouncements',
                'maxCampaigns',
              ].map((key) => (
                <Field
                  key={key}
                  label={key}
                  type="number"
                  value={String(limits[key] ?? 0)}
                  onChange={(v) =>
                    setDraft({ ...draft, limits: { ...limits, [key]: Number(v) } })
                  }
                />
              ))}
              <ToggleRow
                label="marketingCentre"
                checked={Boolean(flags.marketingCentre)}
                onChange={(v) => setDraft({ ...draft, featureFlags: { ...flags, marketingCentre: v } })}
              />
              <ToggleRow
                label="homepagePromotions"
                checked={Boolean(flags.homepagePromotions)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, homepagePromotions: v } })
                }
              />
            </div>
          ) : null}

          {section === 'media' ? (
            <div className="grid gap-3 md:grid-cols-3">
              {['maxPhotos', 'maxVideos', 'maxGalleryItems', 'maxCertificates', 'maxProfileBanners'].map(
                (key) => (
                  <Field
                    key={key}
                    label={key}
                    type="number"
                    value={String(limits[key] ?? 0)}
                    onChange={(v) =>
                      setDraft({ ...draft, limits: { ...limits, [key]: Number(v) } })
                    }
                  />
                ),
              )}
            </div>
          ) : null}

          {section === 'search' ? (
            <div className="grid gap-3 md:grid-cols-3">
              {['searchPriorityWeight', 'featuredWeighting', 'recommendationWeighting'].map((key) => (
                <Field
                  key={key}
                  label={key}
                  type="number"
                  value={String(limits[key] ?? 0)}
                  onChange={(v) =>
                    setDraft({ ...draft, limits: { ...limits, [key]: Number(v) } })
                  }
                />
              ))}
              <ToggleRow
                label="featuredPlacement"
                checked={Boolean(flags.featuredPlacement)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, featuredPlacement: v } })
                }
              />
              <ToggleRow
                label="verifiedBusinessBadge"
                checked={Boolean(flags.verifiedBusinessBadge)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, verifiedBusinessBadge: v } })
                }
              />
              <ToggleRow
                label="premiumBadge"
                checked={Boolean(flags.premiumBadge)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, premiumBadge: v } })
                }
              />
            </div>
          ) : null}

          {section === 'support' ? (
            <>
              <ToggleRow
                label="prioritySupport"
                checked={Boolean(flags.prioritySupport)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, prioritySupport: v } })
                }
              />
              <ToggleRow
                label="standardSupport"
                checked={Boolean(flags.standardSupport)}
                onChange={(v) =>
                  setDraft({ ...draft, featureFlags: { ...flags, standardSupport: v } })
                }
              />
              <ToggleRow
                label="autoRenew"
                checked={Boolean(draft.autoRenew)}
                onChange={(v) => setDraft({ ...draft, autoRenew: v })}
              />
            </>
          ) : null}

          {section === 'badges' ? (
            <div className="grid gap-3 md:grid-cols-2">
              {(() => {
                const badge = (draft.badge as Record<string, unknown>) || {}
                const setBadge = (patch: Record<string, unknown>) =>
                  setDraft({ ...draft, badge: { ...badge, ...patch } })
                return (
                  <>
                    <ToggleRow
                      label="Enabled"
                      checked={badge.enabled !== false}
                      onChange={(v) => setBadge({ enabled: v })}
                    />
                    <ToggleRow
                      label="Glow"
                      checked={Boolean(badge.glow)}
                      onChange={(v) => setBadge({ glow: v })}
                    />
                    <Field
                      label="Badge text"
                      value={String(badge.text || badge.name || '')}
                      onChange={(v) => setBadge({ text: v, name: v })}
                    />
                    <Field
                      label="Icon"
                      value={String(badge.icon || 'verified')}
                      onChange={(v) => setBadge({ icon: v })}
                    />
                    <Field
                      label="Colour"
                      value={String(badge.color || '#16A34A')}
                      onChange={(v) => setBadge({ color: v })}
                    />
                    <Field
                      label="Border colour"
                      value={String(badge.borderColor || '')}
                      onChange={(v) => setBadge({ borderColor: v })}
                    />
                    <Field
                      label="Size (sm|md|lg)"
                      value={String(badge.size || 'sm')}
                      onChange={(v) => setBadge({ size: v })}
                    />
                    <ToggleRow
                      label="Visible on search"
                      checked={badge.visibleOnSearch !== false}
                      onChange={(v) => setBadge({ visibleOnSearch: v })}
                    />
                    <ToggleRow
                      label="Visible on profile"
                      checked={badge.visibleOnProfile !== false}
                      onChange={(v) => setBadge({ visibleOnProfile: v })}
                    />
                    <ToggleRow
                      label="Visible on chat"
                      checked={badge.visibleOnChat !== false}
                      onChange={(v) => setBadge({ visibleOnChat: v })}
                    />
                  </>
                )
              })()}
            </div>
          ) : null}

          {section === 'advanced' ? (
            <div className="grid gap-2 md:grid-cols-2">
              {['dispatcher', 'teamManagement', 'branchesReady', 'leadAnalytics', 'advertisingAnalytics'].map(
                (key) => (
                  <ToggleRow
                    key={key}
                    label={key}
                    checked={Boolean(flags[key])}
                    onChange={(v) =>
                      setDraft({ ...draft, featureFlags: { ...flags, [key]: v } })
                    }
                  />
                ),
              )}
            </div>
          ) : null}

          <Button disabled={saving} onClick={() => void savePlan()}>
            {saving ? 'Saving…' : `Save ${String(draft.name)} settings`}
          </Button>
        </Surface>
      </div>
    )
  }

  if (view.mode === 'ops') {
    return (
      <div className="space-y-6">
        <button type="button" className="text-sm text-primary" onClick={() => setView({ mode: 'home' })}>
          ← Subscription plans
        </button>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['payments', 'Pending payments'],
              ['subscriptions', 'Active subscriptions'],
              ['creatives', 'Marketing approval'],
              ['momo', 'Mobile Money'],
              ['periods', 'Billing periods'],
              ['reminders', 'Reminders'],
              ['discovery', 'Upgrade discovery'],
              ['matrix', 'Feature matrix'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView({ mode: 'ops', tab: id })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                view.tab === id ? 'bg-primary text-white' : 'bg-surface-container text-ink-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {saveError ? <FormError>{saveError}</FormError> : null}
        {saved ? <p className="text-sm text-emerald-700">Saved.</p> : null}

        {view.tab === 'periods' && periodsDraft ? (
          <Surface className="space-y-4 p-6">
            <h3 className="text-base font-semibold">Billing period lengths</h3>
            <p className="text-sm text-ink-secondary">
              Controls how many days each billing cycle grants. Used for activation, remaining days, and
              expiry. Seeded once on first install — edits apply live to new activations.
            </p>
            {(
              [
                ['monthlyDays', 'Monthly days'],
                ['quarterlyDays', 'Quarterly days'],
                ['halfYearlyDays', 'Half-yearly days'],
                ['yearlyDays', 'Yearly days'],
                ['defaultGracePeriodDays', 'Default grace days (new plans)'],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="number"
                value={String(periodsDraft[key] ?? '')}
                onChange={(v) => setPeriodsDraft({ ...periodsDraft, [key]: Number(v) })}
              />
            ))}
            <Field
              label="Default currency"
              value={String(periodsDraft.currency || 'UGX')}
              onChange={(v) => setPeriodsDraft({ ...periodsDraft, currency: v.toUpperCase() })}
            />
            <Button
              disabled={saving}
              onClick={() =>
                void (async () => {
                  setSaving(true)
                  setSaveError(null)
                  try {
                    await adminApi.updateSubscriptionBillingPeriods(periodsDraft)
                    await catalogue.reload()
                    setSaved(true)
                  } catch (err) {
                    setSaveError(getFriendlyErrorMessage(err))
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              Save billing periods
            </Button>
          </Surface>
        ) : null}

        {view.tab === 'payments' ? (
          <OpsPayments
            items={catalogue.data?.payments || []}
            note={reviewNote}
            setNote={setReviewNote}
            saving={saving}
            onApprove={async (id) => {
              setSaving(true)
              try {
                await adminApi.approveSubscriptionPayment(id, reviewNote || undefined)
                setReviewNote('')
                await catalogue.reload()
              } catch (err) {
                setSaveError(getFriendlyErrorMessage(err))
              } finally {
                setSaving(false)
              }
            }}
            onReject={async (id) => {
              setSaving(true)
              try {
                await adminApi.rejectSubscriptionPayment(id, reviewNote || 'Rejected')
                await catalogue.reload()
              } catch (err) {
                setSaveError(getFriendlyErrorMessage(err))
              } finally {
                setSaving(false)
              }
            }}
          />
        ) : null}

        {view.tab === 'subscriptions' ? (
          <OpsSubscriptions
            items={catalogue.data?.subscriptions || []}
            saving={saving}
            onManage={async (userId, action) => {
              setSaving(true)
              try {
                await adminApi.manageTechnicianSubscription(userId, { action, months: 1 })
                await catalogue.reload()
              } catch (err) {
                setSaveError(getFriendlyErrorMessage(err))
              } finally {
                setSaving(false)
              }
            }}
          />
        ) : null}

        {view.tab === 'creatives' ? (
          <OpsCreatives
            items={catalogue.data?.creatives || []}
            note={creativeNote}
            setNote={setCreativeNote}
            saving={saving}
            onModerate={async (id, action) => {
              setSaving(true)
              try {
                await adminApi.moderateMarketingCreative(id, action, creativeNote || undefined)
                setCreativeNote('')
                await catalogue.reload()
              } catch (err) {
                setSaveError(getFriendlyErrorMessage(err))
              } finally {
                setSaving(false)
              }
            }}
          />
        ) : null}

        {view.tab === 'momo' && momoDraft ? (
          <Surface className="space-y-4 p-6">
            <Field
              label="Reference format"
              value={String(momoDraft.referenceFormat || '')}
              onChange={(v) => setMomoDraft({ ...momoDraft, referenceFormat: v })}
            />
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-secondary">Instructions</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
                value={String(momoDraft.paymentInstructions || '')}
                onChange={(e) => setMomoDraft({ ...momoDraft, paymentInstructions: e.target.value })}
              />
            </label>
            <Button
              disabled={saving}
              onClick={() =>
                void (async () => {
                  setSaving(true)
                  try {
                    await adminApi.updateSubscriptionMomo(momoDraft)
                    await catalogue.reload()
                  } catch (err) {
                    setSaveError(getFriendlyErrorMessage(err))
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              Save Mobile Money
            </Button>
          </Surface>
        ) : null}

        {view.tab === 'reminders' && reminderDraft ? (
          <Surface className="space-y-4 p-6">
            <h3 className="text-base font-semibold">Expiry & quota reminders</h3>
            <Field
              label="Frequency (days between repeats)"
              type="number"
              value={String(reminderDraft.frequencyDays ?? 3)}
              onChange={(v) => setReminderDraft({ ...reminderDraft, frequencyDays: Number(v) })}
            />
            <Field
              label="Days before expiry (comma-separated, e.g. 14,7,3,1,0)"
              value={
                Array.isArray(reminderDraft.daysBeforeExpiry)
                  ? (reminderDraft.daysBeforeExpiry as number[]).join(',')
                  : '14,7,3,1,0'
              }
              onChange={(v) =>
                setReminderDraft({
                  ...reminderDraft,
                  daysBeforeExpiry: v
                    .split(',')
                    .map((s) => Number(s.trim()))
                    .filter((n) => Number.isFinite(n) && n >= 0),
                })
              }
            />
            <ToggleRow
              label="Enabled"
              checked={Boolean(reminderDraft.enabled)}
              onChange={(v) => setReminderDraft({ ...reminderDraft, enabled: v })}
            />
            <ToggleRow
              label="In-app popup"
              checked={reminderDraft.popupEnabled !== false}
              onChange={(v) => setReminderDraft({ ...reminderDraft, popupEnabled: v })}
            />
            <ToggleRow
              label="Notification centre"
              checked={reminderDraft.notificationEnabled !== false}
              onChange={(v) => setReminderDraft({ ...reminderDraft, notificationEnabled: v })}
            />
            <ToggleRow
              label="Push"
              checked={reminderDraft.pushEnabled !== false}
              onChange={(v) => setReminderDraft({ ...reminderDraft, pushEnabled: v })}
            />
            <ToggleRow
              label="Email"
              checked={Boolean(reminderDraft.emailEnabled)}
              onChange={(v) => setReminderDraft({ ...reminderDraft, emailEnabled: v })}
            />
            <Button
              disabled={saving}
              onClick={() =>
                void (async () => {
                  setSaving(true)
                  try {
                    await adminApi.updateSubscriptionReminders(reminderDraft)
                    await catalogue.reload()
                  } catch (err) {
                    setSaveError(getFriendlyErrorMessage(err))
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              Save reminders
            </Button>
          </Surface>
        ) : null}

        {view.tab === 'discovery' && discoveryDraft ? (
          <Surface className="space-y-4 p-6">
            <h3 className="text-base font-semibold">Technician upgrade discovery</h3>
            <p className="text-sm text-ink-secondary">
              Controls the public Upgrade Plan page. Changes apply immediately for technicians.
            </p>
            <ToggleRow
              label="Upgrades enabled (global)"
              checked={discoveryDraft.upgradesEnabled !== false}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, upgradesEnabled: v })}
            />
            <ToggleRow
              label="Show Free plan card"
              checked={discoveryDraft.showFreePlan !== false}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, showFreePlan: v })}
            />
            <ToggleRow
              label="Allow downgrade messaging"
              checked={Boolean(discoveryDraft.allowDowngrade)}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, allowDowngrade: v })}
            />
            <Field
              label="Featured plan code"
              value={String(discoveryDraft.featuredPlanCode || '')}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, featuredPlanCode: v || null })}
            />
            <Field
              label="Recommended plan code"
              value={String(discoveryDraft.recommendedPlanCode || '')}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, recommendedPlanCode: v || null })}
            />
            <Field
              label="Popular badge plan code"
              value={String(discoveryDraft.popularPlanCode || '')}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, popularPlanCode: v || null })}
            />
            <Field
              label="Hero title"
              value={String(discoveryDraft.heroTitle || '')}
              onChange={(v) => setDiscoveryDraft({ ...discoveryDraft, heroTitle: v })}
            />
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-secondary">Hero subtitle</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
                value={String(discoveryDraft.heroSubtitle || '')}
                onChange={(e) => setDiscoveryDraft({ ...discoveryDraft, heroSubtitle: e.target.value })}
              />
            </label>
            <p className="text-xs text-ink-secondary">
              Per-plan visibility and ordering are edited inside each plan&apos;s General / Advanced settings
              (`isVisible`, `sortOrder`).
            </p>
            <Button
              disabled={saving}
              onClick={() =>
                void (async () => {
                  setSaving(true)
                  setSaveError(null)
                  try {
                    await adminApi.updateSubscriptionDiscovery(discoveryDraft)
                    await catalogue.reload()
                    setSaved(true)
                  } catch (err) {
                    setSaveError(getFriendlyErrorMessage(err))
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              {saving ? 'Saving…' : 'Save discovery settings'}
            </Button>
            {saved ? <p className="text-sm text-primary">Discovery settings saved.</p> : null}
          </Surface>
        ) : null}

        {view.tab === 'matrix' ? (
          <Surface className="space-y-4 overflow-x-auto p-6">
            <h3 className="text-base font-semibold">Feature matrix (live plan documents)</h3>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-ink-secondary">
                  <th className="py-2 pr-4">Feature</th>
                  <th className="py-2 pr-4">Starter</th>
                  <th className="py-2 pr-4">Professional</th>
                  <th className="py-2 pr-4">Business</th>
                </tr>
              </thead>
              <tbody>
                {safeArray(
                  (
                    catalogue.data?.catalogue as {
                      featureMatrix?: { flags?: Array<Record<string, unknown>> }
                    }
                  )?.featureMatrix?.flags,
                ).map((row) => (
                  <tr key={String(row.feature)} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-4 font-medium">{String(row.feature)}</td>
                    <td className="py-2 pr-4">{row.starter ? '✓' : '—'}</td>
                    <td className="py-2 pr-4">{row.professional ? '✓' : '—'}</td>
                    <td className="py-2 pr-4">{row.business ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="pt-4 text-base font-semibold">Limits</h3>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-ink-secondary">
                  <th className="py-2 pr-4">Limit</th>
                  <th className="py-2 pr-4">Starter</th>
                  <th className="py-2 pr-4">Professional</th>
                  <th className="py-2 pr-4">Business</th>
                </tr>
              </thead>
              <tbody>
                {safeArray(
                  (
                    catalogue.data?.catalogue as {
                      featureMatrix?: { limits?: Array<Record<string, unknown>> }
                    }
                  )?.featureMatrix?.limits,
                ).map((row) => (
                  <tr key={String(row.feature)} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-4 font-medium">{String(row.feature)}</td>
                    <td className="py-2 pr-4">{String(row.starter)}</td>
                    <td className="py-2 pr-4">{String(row.professional)}</td>
                    <td className="py-2 pr-4">{String(row.business)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Subscription Plans"
        subtitle="Master subscription centre — pricing, entitlements, badges, and enforcement. Click a plan to configure."
      />

      {catalogue.data?.analytics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Surface className="p-4">
            <p className="text-xs uppercase text-ink-secondary">Revenue (30d)</p>
            <p className="mt-1 text-xl font-semibold">
              {formatUgx(Number(catalogue.data.analytics.revenue30d || 0))}
            </p>
          </Surface>
          <Surface className="p-4">
            <p className="text-xs uppercase text-ink-secondary">Active subscriptions</p>
            <p className="mt-1 text-xl font-semibold">
              {Number(catalogue.data.analytics.activeSubscriptions || 0)}
            </p>
          </Surface>
          <Surface className="p-4">
            <p className="text-xs uppercase text-ink-secondary">Pending payments</p>
            <p className="mt-1 text-xl font-semibold">
              {Number(catalogue.data.analytics.pendingPayments || 0)}
            </p>
          </Surface>
          <Surface className="p-4">
            <p className="text-xs uppercase text-ink-secondary">Boost revenue</p>
            <p className="mt-1 text-xl font-semibold">
              {formatUgx(Number(catalogue.data.analytics.boosts?.revenue || 0))}
            </p>
          </Surface>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {['STARTER', 'PROFESSIONAL', 'BUSINESS'].map((code) => {
          const plan = plans.find((p) => String(p.code) === code)
          return (
            <button
              key={code}
              type="button"
              className="rounded-2xl border border-outline-variant bg-surface p-5 text-left transition hover:border-primary/50 hover:shadow-sm"
              onClick={() =>
                plan
                  ? setView({ mode: 'plan', code, section: code === 'BUSINESS' ? 'marketing' : 'general' })
                  : undefined
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{code}</p>
              <h2 className="mt-2 text-xl font-semibold">{String(plan?.name || code)}</h2>
              <p className="mt-2 text-sm text-ink-secondary line-clamp-3">
                {String(plan?.description || 'Configure this plan')}
              </p>
              <p className="mt-4 text-lg font-semibold text-primary">
                {formatUgx(Number(plan?.priceMonthly || 0))}
                <span className="text-sm font-normal text-ink-secondary"> / mo</span>
              </p>
              <p className="mt-3 text-sm font-medium text-primary">Open configuration →</p>
            </button>
          )
        })}
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Boosters</p>
          <h2 className="mt-2 text-xl font-semibold">Profile Boost products</h2>
          <p className="mt-2 text-sm text-ink-secondary">
            Optional marketing visibility products — Category, District, Homepage, Search, Emergency, and more.
          </p>
          <Link to="/admin/boosts" className="mt-4 inline-block text-sm font-medium text-primary">
            Open Boost Management →
          </Link>
        </div>
      </div>

      <Surface className="p-5">
        <h3 className="text-base font-semibold">Tools</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['payments', 'Pending payments'],
              ['subscriptions', 'Subscriptions'],
              ['creatives', 'Marketing approval'],
              ['momo', 'Mobile Money'],
              ['periods', 'Billing periods'],
              ['reminders', 'Reminders'],
              ['discovery', 'Upgrade discovery'],
              ['matrix', 'Feature matrix'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} variant="outline" onClick={() => setView({ mode: 'ops', tab: id })}>
              {label}
            </Button>
          ))}
        </div>
      </Surface>
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

function OpsPayments({
  items,
  note,
  setNote,
  saving,
  onApprove,
  onReject,
}: {
  items: Array<Record<string, unknown>>
  note: string
  setNote: (v: string) => void
  saving: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  return (
    <Surface className="space-y-4 p-6">
      <input
        className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Review note"
      />
      {items.length === 0 ? (
        <p className="text-sm text-ink-secondary">No pending payments.</p>
      ) : (
        items.map((p) => (
          <div
            key={String(p.id)}
            className="flex flex-col gap-3 rounded-xl border border-outline-variant p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-semibold">
                {String((p.technician as { name?: string } | null)?.name || 'Technician')} ·{' '}
                {String(p.planCode)}
              </p>
              <p className="text-sm text-ink-secondary">
                {String(p.currency)} {Number(p.amount).toLocaleString()} · {String(p.transactionId)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button disabled={saving} onClick={() => onApprove(String(p.id))}>
                Approve
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => onReject(String(p.id))}>
                Reject
              </Button>
            </div>
          </div>
        ))
      )}
    </Surface>
  )
}

function OpsSubscriptions({
  items,
  saving,
  onManage,
}: {
  items: Array<Record<string, unknown>>
  saving: boolean
  onManage: (userId: string, action: string) => void
}) {
  return (
    <Surface className="space-y-3 p-6">
      {items.map((s) => (
        <div
          key={String(s.id)}
          className="flex flex-col gap-3 rounded-xl border border-outline-variant p-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p className="font-semibold">
              {String((s.technician as { name?: string } | null)?.name || 'Technician')} ·{' '}
              {String(s.planCode)} · {String(s.status)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['extend', 'grant_complimentary', 'suspend', 'deactivate', 'reset'].map((action) => (
              <Button
                key={action}
                variant="outline"
                disabled={saving}
                onClick={() => onManage(String(s.userId), action)}
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </Surface>
  )
}

function OpsCreatives({
  items,
  note,
  setNote,
  saving,
  onModerate,
}: {
  items: Array<Record<string, unknown>>
  note: string
  setNote: (v: string) => void
  saving: boolean
  onModerate: (id: string, action: 'approve' | 'reject' | 'request_changes') => void
}) {
  return (
    <Surface className="space-y-4 p-6">
      <input
        className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Review note"
      />
      {items.length === 0 ? (
        <p className="text-sm text-ink-secondary">No pending creatives.</p>
      ) : (
        items.map((c) => (
          <div
            key={String(c.id)}
            className="flex flex-col gap-3 rounded-xl border border-outline-variant p-4 md:flex-row md:justify-between"
          >
            <div>
              <p className="font-semibold">
                {String(c.kind)} · {String(c.title)}
              </p>
              <p className="text-sm text-ink-secondary">{String(c.headline || '')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => onModerate(String(c.id), 'approve')}>
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onModerate(String(c.id), 'request_changes')}
              >
                Request changes
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onModerate(String(c.id), 'reject')}
              >
                Reject
              </Button>
            </div>
          </div>
        ))
      )}
    </Surface>
  )
}
