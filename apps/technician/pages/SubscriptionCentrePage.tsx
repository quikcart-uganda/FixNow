import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Button, Card, Icon, SubscriptionBadge } from '@fixnow/ui'
import { useAsync, useSocketEvent, SOCKET_EVENTS } from '@fixnow/hooks'
import {
  developerPreviewApi,
  formatUgx,
  getFriendlyErrorMessage,
  subscriptionsApi,
} from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'
import {
  lifecycleLabel,
  presentCapabilities,
  presentLimits,
  presentVisibilityBenefit,
  TECHNICIAN_SUBSCRIPTION_FAQ,
} from '@technician/lib/subscriptionPresentation'
import { DeveloperPreviewBanner } from '@technician/components/DeveloperPreviewBanner'
import { DevelopmentSubscriptionSimulatorPanel } from '@technician/components/DevelopmentSubscriptionSimulatorPanel'

function formatPlanDate(value: unknown): string {
  if (!value) return '—'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

function statusLabel(status: string): string {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return 'Active'
    case 'scheduled_change':
      return 'Scheduled change'
    case 'expiring':
      return 'Expiring'
    case 'preview':
      return 'Preview'
    case 'past_due':
    case 'grace_period':
      return 'Grace period'
    case 'expired':
      return 'Expired'
    case 'cancelled':
      return 'Cancelled'
    case 'pending_payment':
    case 'pending_verification':
      return 'Pending verification'
    default:
      return lifecycleLabel(status) || 'Free'
  }
}

function sourceLabel(source: string | null | undefined): string | null {
  if (source === 'development_transaction') return 'Development Transaction ID'
  if (source === 'mobile_money') return 'Mobile Money'
  if (source === 'complimentary') return 'Complimentary'
  return null
}

/**
 * Technician Subscription Centre — current plan, scheduled changes, benefits, renewal.
 * Entitlements still come from the engine; lifecycle actions schedule only.
 */
export function SubscriptionCentrePage() {
  const [exitError, setExitError] = useState<string | null>(null)
  const [exiting, setExiting] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const query = useAsync(async () => (await subscriptionsApi.getMine()).data, [])

  useSocketEvent(SOCKET_EVENTS.SUBSCRIPTION_CATALOGUE_UPDATED, () => {
    void query.reload()
  })

  const inPreview = Boolean(
    query.data?.entitlements?.preview?.active ||
      query.data?.timeline?.subscriptionSource === 'developer_preview',
  )
  const current = query.data?.currentSubscription
  const schedule = query.data?.schedule
  const hasActive = Boolean(query.data?.entitlements?.hasActiveSubscription)
  const plans = safeArray(query.data?.plans)
  const currentCode = String(current?.planCode || query.data?.entitlements?.planCode || 'FREE').toUpperCase()
  const expiresLabel = formatPlanDate(current?.expiresOn || query.data?.timeline?.expiresAt)
  const planName = String(current?.planName || query.data?.entitlements?.planName || currentCode)

  const lowerPlans = plans.filter((p) => {
    const rank: Record<string, number> = { FREE: 0, STARTER: 1, PROFESSIONAL: 2, BUSINESS: 3 }
    return (rank[String(p.code).toUpperCase()] ?? 0) < (rank[currentCode] ?? 0) && p.code !== 'FREE'
  })
  const higherPlans = plans.filter((p) => {
    const rank: Record<string, number> = { FREE: 0, STARTER: 1, PROFESSIONAL: 2, BUSINESS: 3 }
    return (rank[String(p.code).toUpperCase()] ?? 0) > (rank[currentCode] ?? 0)
  })

  async function exitPreview() {
    setExiting(true)
    setExitError(null)
    try {
      await developerPreviewApi.exit()
      await query.reload()
    } catch (err) {
      setExitError(getFriendlyErrorMessage(err))
    } finally {
      setExiting(false)
    }
  }

  async function scheduleDowngrade(planCode: string, planLabel: string) {
    const ok = window.confirm(
      `You'll continue enjoying ${planName} benefits until ${expiresLabel}.\n\nAfter that, your account will switch to ${planLabel}.`,
    )
    if (!ok) return
    setActionBusy(`down-${planCode}`)
    setActionError(null)
    setActionNotice(null)
    try {
      await subscriptionsApi.scheduleDowngrade(planCode)
      await query.reload()
      setActionNotice(`Downgrade to ${planLabel} scheduled for after ${expiresLabel}.`)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  async function scheduleCancel() {
    const ok = window.confirm(
      `Your subscription will remain active until ${expiresLabel}.\n\nAfter that your account will return to the Free plan. It will not renew automatically.`,
    )
    if (!ok) return
    setActionBusy('cancel')
    setActionError(null)
    setActionNotice(null)
    try {
      await subscriptionsApi.scheduleCancel()
      await query.reload()
      setActionNotice(`Cancellation scheduled. Access continues until ${expiresLabel}.`)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  async function clearSchedule() {
    setActionBusy('clear')
    setActionError(null)
    setActionNotice(null)
    try {
      await subscriptionsApi.clearScheduledChange()
      await query.reload()
      setActionNotice('Scheduled change cancelled. Your current plan continues.')
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
          <div>
            <p className="text-caps text-primary">Subscription Centre</p>
            <h1 className="text-headline">Your plan</h1>
            <p className="mt-2 text-body text-on-surface-variant">
              {inPreview
                ? 'Developer Preview is active — simulation only. Production billing is unchanged.'
                : 'Review your subscription, schedule changes for when this period ends, or upgrade anytime.'}
            </p>
          </div>

          <DeveloperPreviewBanner />
          <DevelopmentSubscriptionSimulatorPanel />

          {!inPreview ? (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title">Current subscription</h2>
                {query.data.badge ? (
                  <SubscriptionBadge
                    text={String(query.data.badge.text || query.data.badge.name || '')}
                    icon={String(query.data.badge.icon || 'verified')}
                    color={String(query.data.badge.color || '#16A34A')}
                    borderColor={String(query.data.badge.borderColor || '')}
                    glow={Boolean(query.data.badge.glow)}
                    size={(query.data.badge.size as 'sm' | 'md' | 'lg') || 'md'}
                  />
                ) : null}
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-caps text-on-surface-variant">Current plan</dt>
                  <dd className="mt-1 text-label font-semibold">{planName}</dd>
                </div>
                <div>
                  <dt className="text-caps text-on-surface-variant">Status</dt>
                  <dd className="mt-1 text-label font-semibold">
                    {statusLabel(String(current?.status || query.data.profile.subscriptionStatus || 'none'))}
                  </dd>
                </div>
                <div>
                  <dt className="text-caps text-on-surface-variant">Activated on</dt>
                  <dd className="mt-1 text-label">
                    {formatPlanDate(current?.activatedOn || query.data.timeline?.activatedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caps text-on-surface-variant">
                    {current?.willNotRenew ? 'Expires on' : 'Renews / expires'}
                  </dt>
                  <dd className="mt-1 text-label">{expiresLabel}</dd>
                </div>
                <div>
                  <dt className="text-caps text-on-surface-variant">Auto-renew</dt>
                  <dd className="mt-1 text-label">Off — renew manually before expiry</dd>
                </div>
                {sourceLabel(current?.source) ? (
                  <div>
                    <dt className="text-caps text-on-surface-variant">Subscription source</dt>
                    <dd className="mt-1 text-label">{sourceLabel(current?.source)}</dd>
                  </div>
                ) : null}
                {schedule?.type === 'downgrade' ? (
                  <div className="sm:col-span-2">
                    <dt className="text-caps text-on-surface-variant">Next scheduled plan</dt>
                    <dd className="mt-1 text-label font-semibold">
                      {String(schedule.planCode)} from {formatPlanDate(schedule.effectiveAt)}
                    </dd>
                  </div>
                ) : null}
                {schedule?.type === 'cancel' ? (
                  <div className="sm:col-span-2">
                    <dt className="text-caps text-on-surface-variant">Next scheduled action</dt>
                    <dd className="mt-1 text-label font-semibold">
                      Cancel at period end · Free plan after {formatPlanDate(schedule.effectiveAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {actionError ? <FormError>{actionError}</FormError> : null}
              {actionNotice ? <p className="text-label text-tertiary">{actionNotice}</p> : null}

              <div className="flex flex-wrap gap-2">
                {hasActive ? (
                  <>
                    {higherPlans[0] ? (
                      <Link to={`/technician/upgrade?plan=${encodeURIComponent(higherPlans[0].code)}`}>
                        <Button className="min-h-11">Upgrade to {higherPlans[0].name}</Button>
                      </Link>
                    ) : (
                      <Link to="/technician/upgrade">
                        <Button className="min-h-11">Renew plan</Button>
                      </Link>
                    )}
                    {schedule?.type ? (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={Boolean(actionBusy)}
                        onClick={() => void clearSchedule()}
                      >
                        {actionBusy === 'clear'
                          ? 'Updating…'
                          : schedule.type === 'cancel'
                            ? 'Keep subscription'
                            : 'Cancel scheduled downgrade'}
                      </Button>
                    ) : (
                      <>
                        {lowerPlans[0] ? (
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={Boolean(actionBusy)}
                            onClick={() => void scheduleDowngrade(lowerPlans[0].code, lowerPlans[0].name)}
                          >
                            {actionBusy === `down-${lowerPlans[0].code}`
                              ? 'Scheduling…'
                              : `Downgrade to ${lowerPlans[0].name}`}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={Boolean(actionBusy)}
                          onClick={() => void scheduleCancel()}
                        >
                          {actionBusy === 'cancel' ? 'Scheduling…' : 'Cancel subscription'}
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <Link to="/technician/upgrade">
                    <Button className="min-h-11">Upgrade plan</Button>
                  </Link>
                )}
                <Link to="/technician/boosts">
                  <Button variant="outline" className="min-h-11">
                    Profile boosts
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <SubscriptionBadge text="Developer Preview" icon="science" color="#0F766E" />
                <span className="rounded-md bg-surface-container px-2 py-1 text-caps">Simulation Only</span>
              </div>
              <h2 className="text-title">
                Preview {String(query.data.entitlements.planName || query.data.entitlements.planCode || 'Plan')}
              </h2>
              {exitError ? <FormError>{exitError}</FormError> : null}
              <div className="flex flex-wrap gap-2">
                <Link to="/technician/upgrade">
                  <Button className="min-h-11">Switch preview plan</Button>
                </Link>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={exiting}
                  onClick={() => void exitPreview()}
                >
                  {exiting ? 'Exiting…' : 'Exit Preview'}
                </Button>
              </div>
            </Card>
          )}

          {(() => {
            const benefits = presentCapabilities(
              query.data.entitlements.capabilities as Record<string, boolean> | undefined,
            )
            const included = benefits.filter((b) => b.included)
            const missing = benefits.filter((b) => !b.included)
            const limits = presentLimits(query.data.entitlements.limits as Record<string, number> | undefined)
            const visibility = presentVisibilityBenefit(
              query.data.entitlements.limits as Record<string, number> | undefined,
            )
            return (
              <>
                <Card className="space-y-3 p-5">
                  <h3 className="text-title">What you get</h3>
                  {included.length === 0 && !visibility ? (
                    <p className="text-label text-on-surface-variant">
                      You are on the free experience. Upgrade to unlock unlimited applications, offers, and marketing
                      tools.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {visibility ? (
                        <li className="flex items-center gap-2 text-label">
                          <Icon name="check_circle" className="text-tertiary" filled />
                          <span>{visibility}</span>
                        </li>
                      ) : null}
                      {included.map((b) => (
                        <li key={b.key} className="flex items-center gap-2 text-label">
                          <Icon name="check_circle" className="text-tertiary" filled />
                          <span>{b.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {limits.length > 0 ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {limits.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2 text-label"
                        >
                          <span className="text-on-surface-variant">{row.label}</span>
                          <span className="font-semibold text-on-surface">{row.display}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>

                {missing.length > 0 ? (
                  <Card className="space-y-3 p-5">
                    <h3 className="text-title">What you are missing</h3>
                    <ul className="space-y-2">
                      {missing.slice(0, 8).map((b) => (
                        <li key={b.key} className="flex items-center gap-2 text-label text-on-surface-variant">
                          <Icon name="lock" className="text-on-surface-variant" />
                          <span>{b.label}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/technician/upgrade">
                      <Button className="min-h-11 w-full sm:w-auto">See upgrade options</Button>
                    </Link>
                  </Card>
                ) : null}
              </>
            )
          })()}

          {!inPreview ? (
            <Card className="space-y-3 p-5">
              <h3 className="text-title">Payment history</h3>
              {safeArray(query.data.payments).length === 0 ? (
                <div className="space-y-2 text-label text-on-surface-variant">
                  <p className="font-semibold text-on-surface">No subscription purchases yet.</p>
                  <p>Your payment receipts and renewal history will appear here after purchasing a plan.</p>
                </div>
              ) : (
                safeArray(query.data.payments).map((p) => (
                  <div
                    key={String(p.id)}
                    className="flex justify-between gap-2 border-b border-outline-variant/50 py-2 text-label last:border-0"
                  >
                    <span>
                      {String(p.planCode)} · {String(p.status)}
                      {p.createdAt ? ` · ${new Date(String(p.createdAt)).toLocaleDateString()}` : ''}
                    </span>
                    <span>{formatUgx(Number(p.amount || 0))}</span>
                  </div>
                ))
              )}
            </Card>
          ) : null}

          <Card className="space-y-3 p-5">
            <h3 className="text-title">Frequently asked questions</h3>
            {TECHNICIAN_SUBSCRIPTION_FAQ.map((item) => (
              <details key={item.q} className="rounded-xl bg-surface-container-low p-3">
                <summary className="cursor-pointer text-label font-semibold">{item.q}</summary>
                <p className="mt-2 text-label text-on-surface-variant">{item.a}</p>
              </details>
            ))}
          </Card>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default SubscriptionCentrePage
