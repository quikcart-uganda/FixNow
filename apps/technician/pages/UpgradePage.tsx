import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Icon, SubscriptionBadge } from '@fixnow/ui'
import { useAsync, useSocketEvent, SOCKET_EVENTS } from '@fixnow/hooks'
import {
  formatUgx,
  getFriendlyErrorMessage,
  subscriptionsApi,
  developerPreviewApi,
  type BillingPeriod,
  type SubscriptionPlanDto,
  type DeveloperPreviewAvailability,
} from '@fixnow/api'
import { useApp } from '@technician/context/AppContext'
import { AsyncStateView, FormError, UX_DEVELOPMENT, UX_SUBSCRIPTION, uxText } from '@fixnow/shared'
import { safeArray, safeNumber } from '@fixnow/utils'
import {
  lifecycleLabel,
  presentCapabilities,
  presentComparisonRows,
  presentLimits,
  presentVisibilityBenefit,
} from '@technician/lib/subscriptionPresentation'

type Step = 'browse' | 'checkout' | 'pending'

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  BUSINESS: 3,
}

function planActionLabel(opts: {
  targetCode: string
  targetName: string
  currentCode: string
  isCurrent: boolean
  hasActiveSubscription: boolean
}): string | null {
  if (opts.isCurrent) return opts.targetCode === 'FREE' ? 'Your free plan' : 'Renew plan'
  const from = PLAN_RANK[opts.currentCode] ?? 0
  const to = PLAN_RANK[opts.targetCode] ?? 0
  if (to > from) return `Upgrade to ${opts.targetName}`
  if (to < from) {
    if (!opts.hasActiveSubscription) return null
    if (opts.targetCode === 'FREE') return 'Cancel subscription'
    return `Downgrade to ${opts.targetName}`
  }
  return `Switch to ${opts.targetName}`
}

function formatPlanDate(value: unknown): string {
  if (!value) return '—'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

function planBenefitPreview(plan: SubscriptionPlanDto): string[] {
  const visibility = presentVisibilityBenefit(plan.limits || {})
  const caps = presentCapabilities(plan.featureFlags || {})
    .filter((b) => b.included)
    .map((b) => b.label)
  const fromCopy = safeArray(plan.features).filter(
    (f) => f && !/^[a-z]+[A-Z]/.test(f) && !/weight|admin rules|algorithm/i.test(f),
  )
  const rows = [...(visibility ? [visibility] : []), ...fromCopy, ...caps]
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    const k = r.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
    if (out.length >= 4) break
  }
  return out
}

/**
 * Production subscription discovery — always available to Free and paid technicians.
 * Plan values come from Admin catalogue / entitlement engine (not hardcoded).
 */
export function UpgradePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { remainingFreeJobs, profile, refreshProfile, isLocked } = useApp()
  const initialCode = (params.get('plan') || '').toUpperCase()
  const [step, setStep] = useState<Step>(params.get('checkout') === '1' ? 'checkout' : 'browse')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [network, setNetwork] = useState<'mtn' | 'airtel'>('mtn')
  const [payerMsisdn, setPayerMsisdn] = useState(profile.phone || '')
  const [transactionId, setTransactionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState(initialCode || 'STARTER')
  const [showFullComparison, setShowFullComparison] = useState(false)

  const [previewBusy, setPreviewBusy] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [scheduleBusy, setScheduleBusy] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null)

  const catalogue = useAsync(async () => {
    const [plansRes, mineRes, previewRes] = await Promise.all([
      subscriptionsApi.listPlans(),
      subscriptionsApi.getMine(),
      developerPreviewApi.availability().catch(() => null),
    ])
    return {
      catalogue: plansRes.data,
      mine: mineRes.data,
      preview: (previewRes?.data || null) as DeveloperPreviewAvailability | null,
    }
  }, [])

  useSocketEvent(SOCKET_EVENTS.SUBSCRIPTION_CATALOGUE_UPDATED, () => {
    void catalogue.reload()
  })

  const discovery = catalogue.data?.catalogue.discovery
  const billingPeriods = catalogue.data?.catalogue.billingPeriods
  const plans = safeArray(catalogue.data?.catalogue.plans) as SubscriptionPlanDto[]
  const comparison = safeArray(catalogue.data?.catalogue.comparison)
  const payment = catalogue.data?.catalogue.payment
  const mine = catalogue.data?.mine
  const preview = catalogue.data?.preview
  const inPreview = Boolean(mine?.entitlements?.preview?.active || preview?.activeSession)
  const hasActive = Boolean(mine?.entitlements?.hasActiveSubscription)
  const currentCode = String(
    inPreview
      ? mine?.entitlements?.preview?.planCode || mine?.entitlements?.planCode || ''
      : mine?.entitlements?.planCode || mine?.subscription?.planCode || (hasActive ? '' : 'FREE'),
  ).toUpperCase()

  function periodLabel(plan: SubscriptionPlanDto, key: 'monthly' | 'quarterly' | 'yearly'): string {
    const days =
      plan.durationDays?.[key === 'yearly' ? 'yearly' : key] ??
      (key === 'monthly'
        ? billingPeriods?.monthlyDays
        : key === 'quarterly'
          ? billingPeriods?.quarterlyDays
          : billingPeriods?.yearlyDays)
    return days != null ? `${days} days` : key
  }

  async function activatePreview(planCode: string) {
    setPreviewBusy(planCode)
    setPreviewError(null)
    try {
      await developerPreviewApi.activate(planCode)
      await refreshProfile()
      catalogue.reload()
      navigate('/technician/dashboard')
    } catch (err) {
      setPreviewError(getFriendlyErrorMessage(err))
    } finally {
      setPreviewBusy(null)
    }
  }

  async function exitPreview() {
    setPreviewBusy('exit')
    setPreviewError(null)
    try {
      await developerPreviewApi.exit()
      await refreshProfile()
      catalogue.reload()
    } catch (err) {
      setPreviewError(getFriendlyErrorMessage(err))
    } finally {
      setPreviewBusy(null)
    }
  }

  const selectedPlan = plans.find((p) => p.code === selectedCode && p.code !== 'FREE') || null
  const selectedNetwork = useMemo(
    () => payment?.networks.find((n) => n.code === network) || payment?.networks[0],
    [payment, network],
  )
  const developmentTransaction = catalogue.data?.mine?.developmentTransaction
  const useDevTx = Boolean(developmentTransaction?.enabled)
  const availableDevTxIds = useMemo(() => {
    const items = developmentTransaction?.items || []
    if (!selectedPlan) return items
    return items.filter((i) => String(i.planCode).toUpperCase() === selectedPlan.code)
  }, [developmentTransaction?.items, selectedPlan])

  const expiresOnLabel = formatPlanDate(
    catalogue.data?.mine?.currentSubscription?.expiresOn ||
      catalogue.data?.mine?.timeline?.expiresAt ||
      catalogue.data?.mine?.subscription?.currentPeriodEnd,
  )
  const currentPlanName = String(
    catalogue.data?.mine?.currentSubscription?.planName ||
      catalogue.data?.mine?.entitlements?.planName ||
      currentCode ||
      'your plan',
  )
  const schedule = catalogue.data?.mine?.schedule

  async function handleScheduleDowngrade(plan: SubscriptionPlanDto) {
    const ok = window.confirm(
      `You'll continue enjoying ${currentPlanName} benefits until ${expiresOnLabel}.\n\nAfter that, your account will switch to ${plan.name}.`,
    )
    if (!ok) return
    setScheduleBusy(plan.code)
    setScheduleError(null)
    setScheduleNotice(null)
    try {
      await subscriptionsApi.scheduleDowngrade(plan.code)
      await catalogue.reload()
      await refreshProfile()
      setScheduleNotice(
        `${plan.name} is scheduled after ${expiresOnLabel}. Your current benefits stay active until then.`,
      )
    } catch (err) {
      setScheduleError(getFriendlyErrorMessage(err))
    } finally {
      setScheduleBusy(null)
    }
  }

  async function handleScheduleCancel() {
    const ok = window.confirm(
      `Your subscription will remain active until ${expiresOnLabel}.\n\nAfter that your account will return to the Free plan. It will not renew automatically.`,
    )
    if (!ok) return
    setScheduleBusy('cancel')
    setScheduleError(null)
    setScheduleNotice(null)
    try {
      await subscriptionsApi.scheduleCancel()
      await catalogue.reload()
      await refreshProfile()
      setScheduleNotice(
        `Cancellation scheduled. Access continues until ${expiresOnLabel}, then your account returns to Free.`,
      )
    } catch (err) {
      setScheduleError(getFriendlyErrorMessage(err))
    } finally {
      setScheduleBusy(null)
    }
  }

  async function handleClearSchedule() {
    setScheduleBusy('clear')
    setScheduleError(null)
    setScheduleNotice(null)
    try {
      await subscriptionsApi.clearScheduledChange()
      await catalogue.reload()
      await refreshProfile()
      setScheduleNotice('Scheduled change cancelled. Your current plan continues as usual.')
    } catch (err) {
      setScheduleError(getFriendlyErrorMessage(err))
    } finally {
      setScheduleBusy(null)
    }
  }

  async function handleSubmitPayment() {
    if (!selectedPlan) return
    setSubmitting(true)
    setError(null)
    try {
      const amount =
        period === 'yearly'
          ? selectedPlan.priceYearly
          : period === 'half_yearly'
            ? Number(selectedPlan.priceHalfYear || 0)
            : period === 'quarterly'
              ? selectedPlan.priceQuarterly
              : selectedPlan.priceMonthly
      const res = await subscriptionsApi.submitPayment({
        planCode: selectedPlan.code,
        billingPeriod: period,
        network: useDevTx ? 'mtn' : network,
        payerMsisdn: useDevTx ? payerMsisdn || profile.phone || '256700000000' : payerMsisdn,
        transactionId,
        amount,
      })
      if (res.data.autoVerified) {
        setPendingMessage(res.data.message || `${selectedPlan.name} activated`)
        await refreshProfile()
        await catalogue.reload()
        navigate('/technician/dashboard')
        return
      }
      setPendingMessage(res.data.message || 'Payment pending verification')
      setStep('pending')
      await refreshProfile()
      await catalogue.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (catalogue.status === 'loading' && !catalogue.data) {
    return <AsyncStateView status="loading" loadingLabel="Loading plans…" />
  }

  if (discovery && discovery.upgradesEnabled === false) {
    return (
      <Card className="mx-auto max-w-lg space-y-3 p-6 text-center">
        <Icon name="lock" className="mx-auto text-[36px] text-warning" />
        <h1 className="text-headline">{uxText(UX_SUBSCRIPTION.upgradesPausedTitle)}</h1>
        <p className="text-body text-on-surface-variant">
          {uxText(UX_SUBSCRIPTION.upgradesPausedBody)}
        </p>
        <Link to="/technician/subscription">
          <Button className="min-h-11">Open Subscription Centre</Button>
        </Link>
      </Card>
    )
  }

  if (step === 'pending') {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-6 text-center animate-fade-up">
        <Icon name="hourglass_top" className="mx-auto text-[40px] text-primary" />
        <h1 className="text-headline">{uxText(UX_SUBSCRIPTION.paymentPendingTitle)}</h1>
        <p className="text-body text-on-surface-variant">{pendingMessage}</p>
        <Button className="min-h-11" onClick={() => setStep('browse')}>
          Back to plans
        </Button>
      </Card>
    )
  }

  if (step === 'checkout' && selectedPlan) {
    return (
      <div className="mx-auto max-w-xl space-y-6 animate-fade-up">
        <button type="button" className="text-label text-primary" onClick={() => setStep('browse')}>
          ← All plans
        </button>
        <div>
          <p className="text-caps text-primary">Checkout</p>
          <h1 className="text-headline">Subscribe to {selectedPlan.name}</h1>
          <p className="mt-2 text-body text-on-surface-variant">{selectedPlan.description}</p>
        </div>
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {(['monthly', 'quarterly', 'half_yearly', 'yearly'] as BillingPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  period === p ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {p === 'half_yearly' ? 'Half-year' : p}
              </button>
            ))}
          </div>
          <p className="text-headline text-primary">
            {formatUgx(
              period === 'yearly'
                ? selectedPlan.priceYearly
                : period === 'half_yearly'
                  ? Number(selectedPlan.priceHalfYear || 0)
                  : period === 'quarterly'
                    ? selectedPlan.priceQuarterly
                    : selectedPlan.priceMonthly,
            )}
          </p>
          {useDevTx ? (
            <div className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-label">
              <p className="font-semibold text-amber-950">{uxText(UX_DEVELOPMENT.modeTitle)}</p>
              <p className="text-on-surface-variant">
                {uxText(UX_DEVELOPMENT.modeBody)}
              </p>
              <div className="flex flex-wrap gap-2">
                {availableDevTxIds.length ? (
                  availableDevTxIds.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTransactionId(item.code)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        transactionId === item.code
                          ? 'bg-primary text-white'
                          : 'bg-white text-on-surface border border-outline-variant'
                      }`}
                    >
                      {item.code}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    {uxText(UX_DEVELOPMENT.noIds)}
                  </p>
                )}
              </div>
            </div>
          ) : selectedNetwork ? (
            <div className="rounded-xl bg-surface-container-low p-4 text-label">
              <p className="font-semibold">{selectedNetwork.label}</p>
              <p>
                {selectedNetwork.accountName} · {selectedNetwork.phoneNumber}
              </p>
              <p className="mt-2 text-on-surface-variant">{selectedNetwork.instructions}</p>
              <p className="mt-2 text-on-surface-variant">{payment?.paymentInstructions}</p>
            </div>
          ) : null}
          {!useDevTx ? (
            <div className="flex flex-wrap gap-2">
              {safeArray(payment?.networks).map((n) => (
                <button
                  key={n.code}
                  type="button"
                  onClick={() => setNetwork(n.code)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    network === n.code ? 'bg-primary text-white' : 'bg-surface-container'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          ) : null}
          {!useDevTx ? (
            <label className="block space-y-1">
              <span className="text-label text-on-surface-variant">Payer phone</span>
              <input
                className="w-full rounded-xl border border-outline-variant px-3 py-3"
                value={payerMsisdn}
                onChange={(e) => setPayerMsisdn(e.target.value)}
              />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-label text-on-surface-variant">
              {useDevTx
                ? uxText(UX_DEVELOPMENT.txIdLabel)
                : uxText(UX_SUBSCRIPTION.transactionIdLabel)}
            </span>
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-3"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              readOnly={useDevTx}
            />
          </label>
          {error ? <FormError>{error}</FormError> : null}
          <Button
            className="min-h-11"
            disabled={
              submitting ||
              !transactionId.trim() ||
              (!useDevTx && !payerMsisdn.trim())
            }
            onClick={() => void handleSubmitPayment()}
          >
            {submitting
              ? 'Submitting…'
              : useDevTx
                ? uxText(UX_DEVELOPMENT.activateCta)
                : uxText(UX_SUBSCRIPTION.submitPaymentCta)}
          </Button>
          <p className="text-center text-caps text-on-surface-variant">
            {useDevTx
              ? uxText(UX_DEVELOPMENT.footer)
              : uxText(UX_SUBSCRIPTION.paymentReviewNotice)}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <AsyncStateView status={catalogue.status} error={catalogue.error} onRetry={() => void catalogue.reload()}>
      {catalogue.data ? (
        <div className="mx-auto max-w-6xl space-y-8 animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-caps text-primary">Subscription plans</p>
              <h1 className="text-headline">{discovery?.heroTitle || 'Upgrade Plan'}</h1>
              <p className="mt-2 max-w-2xl text-body text-on-surface-variant">
                {discovery?.heroSubtitle ||
                  'Compare Free, Starter, Professional, and Business anytime — upgrading is optional.'}
              </p>
            </div>
            <Link to="/technician/subscription">
              <Button variant="outline" className="min-h-11">
                Subscription Centre
              </Button>
            </Link>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-caps text-on-surface-variant">Your current status</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {inPreview ? (
                  <SubscriptionBadge text="Developer Preview" icon="science" color="#0F766E" />
                ) : null}
                {mine?.badge ? (
                  <SubscriptionBadge
                    text={String(mine.badge.text || mine.badge.name || currentCode)}
                    icon={String(mine.badge.icon || 'verified')}
                    color={String(mine.badge.color || '#16A34A')}
                    borderColor={String(mine.badge.borderColor || '')}
                    glow={Boolean(mine.badge.glow)}
                  />
                ) : (
                  <SubscriptionBadge text={hasActive ? currentCode : 'Free'} color="#64748B" icon="person" />
                )}
                <span className="text-label text-on-surface-variant">
                  {inPreview
                    ? 'Simulation only'
                    : lifecycleLabel(String(mine?.entitlements?.lifecycleStatus || profile.subscriptionStatus || 'none'))}
                </span>
              </div>
              <p className="mt-2 text-label text-on-surface-variant">
                {inPreview
                  ? `Preview ${currentCode.replace('_', ' + ')} · no billing · exit restores your live plan`
                  : hasActive
                    ? mine?.entitlements?.daysRemaining != null
                      ? `${mine.entitlements.daysRemaining} days remaining`
                      : 'Active paid plan'
                    : `${remainingFreeJobs} free completed jobs remaining${isLocked ? ' · applications locked' : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {inPreview ? (
                <Button
                  variant="outline"
                  className="min-h-10"
                  disabled={Boolean(previewBusy)}
                  onClick={() => void exitPreview()}
                >
                  {previewBusy === 'exit' ? 'Exiting…' : 'Exit Preview'}
                </Button>
              ) : null}
              <Link to="/technician/subscription">
                <Button variant="outline" className="min-h-10">
                  View benefits
                </Button>
              </Link>
            </div>
          </Card>

          <div>
            <h2 className="text-title">Production Plans</h2>
            <p className="mt-1 text-label text-on-surface-variant">
              Real subscriptions with Mobile Money checkout and billing history.
            </p>
          </div>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent =
                plan.code === currentCode || (!hasActive && plan.code === 'FREE' && currentCode === 'FREE')
              const isFeatured = discovery?.featuredPlanCode === plan.code
              const isRecommended = discovery?.recommendedPlanCode === plan.code
              const isPopular = discovery?.popularPlanCode === plan.code
              return (
                <Card
                  key={plan.id || plan.code}
                  className={`relative flex flex-col p-5 ${isFeatured ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex flex-wrap gap-1">
                    {plan.badge?.enabled !== false && (plan.badge?.text || plan.badge?.name) ? (
                      <SubscriptionBadge
                        text={String(plan.badge.text || plan.badge.name)}
                        icon={String(plan.badge.icon || 'verified')}
                        color={String(plan.badge.color || '#16A34A')}
                        borderColor={String(plan.badge.borderColor || '')}
                        glow={Boolean(plan.badge.glow)}
                      />
                    ) : null}
                    {isCurrent ? (
                      <span className="rounded-md bg-tertiary/15 px-2 py-0.5 text-caps text-tertiary">
                        Current
                      </span>
                    ) : null}
                    {isPopular ? (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-caps text-primary">Popular</span>
                    ) : null}
                    {isRecommended ? (
                      <span className="rounded-md bg-secondary-container px-2 py-0.5 text-caps">Recommended</span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-title">{plan.name}</h2>
                  <p className="mt-2 flex-1 text-label text-on-surface-variant line-clamp-4">{plan.description}</p>
                  <p className="mt-4 text-headline text-primary">
                    {plan.code === 'FREE'
                      ? `${plan.currency || billingPeriods?.currency || 'UGX'} 0`
                      : formatUgx(plan.priceMonthly)}
                    {plan.code !== 'FREE' ? (
                      <span className="text-label font-normal text-on-surface-variant">
                        {' '}
                        / mo ({periodLabel(plan, 'monthly')})
                      </span>
                    ) : null}
                  </p>
                  {plan.code !== 'FREE' ? (
                    <p className="mt-1 text-label text-on-surface-variant">
                      {formatUgx(plan.priceQuarterly)} / qtr ({periodLabel(plan, 'quarterly')}) ·{' '}
                      {formatUgx(plan.priceYearly)} / yr ({periodLabel(plan, 'yearly')})
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1 text-label text-on-surface-variant">
                    {planBenefitPreview(plan).map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-col gap-2">
                    <Link to={`/technician/plans/${plan.code.toLowerCase()}`}>
                      <Button variant="outline" className="min-h-10 w-full">
                        View details
                      </Button>
                    </Link>
                    {(() => {
                      const from = PLAN_RANK[currentCode] ?? 0
                      const to = PLAN_RANK[plan.code] ?? 0
                      const label = planActionLabel({
                        targetCode: plan.code,
                        targetName: plan.name,
                        currentCode,
                        isCurrent,
                        hasActiveSubscription: hasActive,
                      })
                      if (!label) {
                        return (
                          <Button className="min-h-10" disabled>
                            Not available
                          </Button>
                        )
                      }
                      if (hasActive && to < from) {
                        if (plan.code === 'FREE') {
                          return (
                            <Button
                              className="min-h-10"
                              variant="outline"
                              disabled={Boolean(scheduleBusy) || schedule?.type === 'cancel'}
                              onClick={() => void handleScheduleCancel()}
                            >
                              {scheduleBusy === 'cancel'
                                ? 'Scheduling…'
                                : schedule?.type === 'cancel'
                                  ? 'Cancellation scheduled'
                                  : label}
                            </Button>
                          )
                        }
                        return (
                          <Button
                            className="min-h-10"
                            variant="outline"
                            disabled={Boolean(scheduleBusy)}
                            onClick={() => void handleScheduleDowngrade(plan)}
                          >
                            {scheduleBusy === plan.code ? 'Scheduling…' : label}
                          </Button>
                        )
                      }
                      if (plan.code === 'FREE') {
                        return (
                          <Button
                            className="min-h-10"
                            disabled={isCurrent}
                            onClick={() => navigate('/technician/subscription')}
                          >
                            {label}
                          </Button>
                        )
                      }
                      return (
                        <Button
                          className="min-h-10"
                          onClick={() => {
                            setSelectedCode(plan.code)
                            setStep('checkout')
                          }}
                        >
                          {label}
                        </Button>
                      )
                    })()}
                  </div>
                </Card>
              )
            })}
          </section>

          {preview?.eligible ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-title">{uxText(UX_DEVELOPMENT.previewSectionTitle)}</h2>
                <p className="mt-1 text-label text-on-surface-variant">
                  {uxText(UX_DEVELOPMENT.previewSectionBody)}
                </p>
              </div>
              {previewError ? <FormError>{previewError}</FormError> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {safeArray(preview.plans).map((p) => {
                  const isActivePreview = preview.activeSession?.planCode === p.code
                  return (
                    <Card key={p.code} className="flex flex-col p-5 ring-1 ring-teal-700/30">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-md bg-teal-700/10 px-2 py-0.5 text-caps text-teal-800">
                          Simulation Only
                        </span>
                        {p.includesBoost ? (
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-caps text-amber-800">
                            + Boost
                          </span>
                        ) : null}
                        {isActivePreview ? (
                          <span className="rounded-md bg-tertiary/15 px-2 py-0.5 text-caps text-tertiary">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-title">{p.label}</h3>
                      <p className="mt-2 flex-1 text-label text-on-surface-variant">
                        {uxText(UX_DEVELOPMENT.previewPlanBody(p.cataloguePlanCode, Boolean(p.includesBoost)))}
                      </p>
                      <Button
                        className="mt-4 min-h-10"
                        disabled={Boolean(previewBusy) || isActivePreview}
                        onClick={() => void activatePreview(p.code)}
                      >
                        {previewBusy === p.code
                          ? 'Activating…'
                          : isActivePreview
                            ? 'Current preview'
                            : `Activate ${p.label}`}
                      </Button>
                    </Card>
                  )
                })}
              </div>
            </section>
          ) : null}

          {(() => {
            const currentPlan =
              plans.find((p) => p.code === currentCode) || plans.find((p) => p.code === 'FREE') || null
            const nextPlan =
              plans
                .filter((p) => (PLAN_RANK[p.code] ?? 0) > (PLAN_RANK[currentCode] ?? 0))
                .sort((a, b) => (PLAN_RANK[a.code] ?? 0) - (PLAN_RANK[b.code] ?? 0))[0] || null
            const currentBenefits = currentPlan ? planBenefitPreview(currentPlan) : []
            const nextBenefits = nextPlan ? planBenefitPreview(nextPlan) : []
            const currentSet = new Set(currentBenefits.map((b) => b.toLowerCase()))
            const whatsNew = nextBenefits.filter((b) => !currentSet.has(b.toLowerCase()))
            const nextLimits = nextPlan ? presentLimits(nextPlan.limits || {}).slice(0, 4) : []
            const comparisonRows = presentComparisonRows(comparison, plans.map((p) => p.code))

            return (
              <>
                <Card className="space-y-4 p-5">
                  <h2 className="text-title">Your plan vs next step</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-surface-container-low p-4">
                      <p className="text-caps text-on-surface-variant">Current plan</p>
                      <p className="mt-1 text-title">{currentPlan?.name || 'Free'}</p>
                      <p className="mt-2 text-caps text-on-surface-variant">What&apos;s included</p>
                      <ul className="mt-2 space-y-1 text-label text-on-surface-variant">
                        {currentBenefits.length > 0 ? (
                          currentBenefits.map((b) => <li key={b}>· {b}</li>)
                        ) : (
                          <li>· Free job quota &amp; basic profile tools</li>
                        )}
                      </ul>
                    </div>
                    <div className="rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/20">
                      <p className="text-caps text-primary">Next plan</p>
                      <p className="mt-1 text-title">{nextPlan?.name || 'You are on the top plan'}</p>
                      {nextPlan ? (
                        <>
                          <p className="mt-2 text-caps text-on-surface-variant">What&apos;s new if you upgrade</p>
                          <ul className="mt-2 space-y-1 text-label text-on-surface-variant">
                            {(whatsNew.length > 0 ? whatsNew : nextBenefits).map((b) => (
                              <li key={b}>· {b}</li>
                            ))}
                            {nextLimits.map((row) => (
                              <li key={row.key}>
                                · {row.label}: {row.display}
                              </li>
                            ))}
                          </ul>
                          <Button
                            className="mt-4 min-h-11 w-full"
                            onClick={() => {
                              setSelectedCode(nextPlan.code)
                              setStep('checkout')
                            }}
                          >
                            Upgrade to {nextPlan.name}
                          </Button>
                        </>
                      ) : (
                        <p className="mt-2 text-label text-on-surface-variant">
                          You already have the highest catalogue tier. Renew anytime to keep paid features active.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-label font-semibold text-primary"
                    onClick={() => setShowFullComparison((v) => !v)}
                  >
                    {showFullComparison ? 'Hide full comparison' : 'View full comparison'}
                  </button>
                  {showFullComparison ? (
                    <div className="overflow-x-auto rounded-xl border border-outline-variant/60">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-outline-variant text-on-surface-variant">
                            <th className="sticky left-0 bg-canvas-white px-3 py-2">Feature</th>
                            {plans.map((p) => (
                              <th key={p.code} className="px-3 py-2 whitespace-nowrap">
                                {p.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonRows.map((row) => (
                            <tr key={row.key} className="border-b border-outline-variant/50">
                              <td className="sticky left-0 bg-canvas-white px-3 py-2 font-medium">{row.label}</td>
                              {plans.map((p) => (
                                <td key={p.code} className="px-3 py-2 text-on-surface-variant whitespace-nowrap">
                                  {row.values[p.code] ?? '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Card>
              </>
            )
          })()}

          {!hasActive ? (
            <Card className="space-y-3 p-5">
              <h2 className="text-title">Why upgrade</h2>
              <p className="text-body text-on-surface-variant">
                You have {safeNumber(remainingFreeJobs)} free completed jobs left. Stay on Free as long as you like —
                upgrade when you want unlimited applications, offers, and stronger customer visibility.
              </p>
            </Card>
          ) : (
            <Card className="space-y-3 p-5">
              <h2 className="text-title">Change your plan</h2>
              <p className="text-body text-on-surface-variant">
                Upgrades apply after payment verification. Downgrades and cancellation take effect when your current
                paid period ends — you keep your benefits until then.
              </p>
              {scheduleError ? <FormError>{scheduleError}</FormError> : null}
              {scheduleNotice ? <p className="text-label text-tertiary">{scheduleNotice}</p> : null}
              {schedule?.type ? (
                <div className="space-y-2 rounded-xl bg-surface-container-low p-3 text-label">
                  <p className="font-semibold text-on-surface">
                    {schedule.type === 'cancel'
                      ? `Cancellation scheduled for ${formatPlanDate(schedule.effectiveAt)}`
                      : `Downgrade to ${String(schedule.planCode || '')} scheduled for ${formatPlanDate(schedule.effectiveAt)}`}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-10"
                    disabled={Boolean(scheduleBusy)}
                    onClick={() => void handleClearSchedule()}
                  >
                    {scheduleBusy === 'clear'
                      ? 'Updating…'
                      : schedule.type === 'cancel'
                        ? 'Keep subscription'
                        : 'Cancel scheduled downgrade'}
                  </Button>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default UpgradePage
