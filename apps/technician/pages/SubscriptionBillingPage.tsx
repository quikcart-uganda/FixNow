import { Link } from 'react-router-dom'
import { Button, Card, Icon, SubscriptionBadge } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import { formatUgx, subscriptionsApi } from '@fixnow/api'
import { AsyncStateView } from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { lifecycleLabel } from '@technician/lib/subscriptionPresentation'
import { safeArray, safeNumber } from '@fixnow/utils'

/**
 * Settings → Subscription & Billing — always reachable for Free and paid technicians.
 */
export function SubscriptionBillingPage() {
  const { remainingFreeJobs, isLocked } = useApp()
  const mine = useAsync(async () => (await subscriptionsApi.getMine()).data, [])
  const discovery = useAsync(async () => (await subscriptionsApi.listPlans()).data.discovery, [])

  const upgradesEnabled = discovery.data?.upgradesEnabled !== false
  const hasActive = Boolean(mine.data?.entitlements?.hasActiveSubscription)
  const expiresAt = mine.data?.timeline?.expiresAt
    ? new Date(String(mine.data.timeline.expiresAt)).toLocaleDateString()
    : null

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
      <div>
        <Link to="/technician/settings" className="text-label text-primary">
          ← Settings
        </Link>
        <h1 className="mt-2 text-headline">Subscription & Billing</h1>
        <p className="mt-2 text-body text-on-surface-variant">
          Your plan, badge, free-job balance, payments, and upgrade options — available anytime.
        </p>
      </div>

      <AsyncStateView status={mine.status} error={mine.error} onRetry={() => void mine.reload()}>
        {mine.data ? (
          <>
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {mine.data.badge ? (
                  <SubscriptionBadge
                    text={String(mine.data.badge.text || mine.data.badge.name || '')}
                    icon={String(mine.data.badge.icon || 'verified')}
                    color={String(mine.data.badge.color || '#16A34A')}
                    borderColor={String(mine.data.badge.borderColor || '')}
                    glow={Boolean(mine.data.badge.glow)}
                  />
                ) : (
                  <SubscriptionBadge text="Free" color="#64748B" icon="person" />
                )}
                <span className="rounded-md bg-surface-container px-2 py-1 text-caps">
                  {lifecycleLabel(
                    String(
                      mine.data.entitlements?.lifecycleStatus ||
                        mine.data.profile.subscriptionStatus ||
                        'none',
                    ),
                  )}
                </span>
              </div>
              <div>
                <p className="text-caps text-on-surface-variant">Current plan</p>
                <p className="text-title">
                  {String(
                    mine.data.entitlements?.planName ||
                      mine.data.subscription?.planCode ||
                      'Free',
                  )}
                </p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 text-label">
                <div>
                  <dt className="text-on-surface-variant">Remaining free jobs</dt>
                  <dd className="font-semibold">
                    {hasActive ? 'N/A (paid access)' : remainingFreeJobs}
                    {!hasActive && isLocked ? ' · locked' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant">Subscription expiry</dt>
                  <dd className="font-semibold">{expiresAt || '—'}</dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant">Days remaining</dt>
                  <dd className="font-semibold">
                    {mine.data.entitlements?.daysRemaining != null
                      ? String(mine.data.entitlements.daysRemaining)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant">Pending payment</dt>
                  <dd className="font-semibold">
                    {mine.data.pendingPayment
                      ? String(mine.data.pendingPayment.message || 'Awaiting verification')
                      : 'None'}
                  </dd>
                </div>
                {mine.data.schedule?.type ? (
                  <div className="sm:col-span-2">
                    <dt className="text-on-surface-variant">Scheduled change</dt>
                    <dd className="font-semibold">
                      {mine.data.schedule.type === 'cancel'
                        ? `Cancellation — Free after ${expiresAt || 'period end'}`
                        : `Downgrade to ${String(mine.data.schedule.planCode)} after ${expiresAt || 'period end'}`}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>

            <Card className="space-y-3 p-5">
              <h2 className="text-title">Actions</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {upgradesEnabled ? (
                  <Link to="/technician/upgrade">
                    <Button className="min-h-11 w-full">Upgrade Plan</Button>
                  </Link>
                ) : (
                  <Button className="min-h-11 w-full" disabled>
                    Upgrades paused
                  </Button>
                )}
                <Link to="/technician/upgrade">
                  <Button variant="outline" className="min-h-11 w-full">
                    Compare Plans
                  </Button>
                </Link>
                <Link to="/technician/subscription">
                  <Button variant="outline" className="min-h-11 w-full">
                    Manage subscription
                  </Button>
                </Link>
                {hasActive ? (
                  <Link to="/technician/upgrade">
                    <Button variant="outline" className="min-h-11 w-full">
                      Renew Subscription
                    </Button>
                  </Link>
                ) : null}
                <Link to="/technician/help">
                  <Button variant="outline" className="min-h-11 w-full">
                    Support
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="space-y-3 p-5">
              <h2 className="text-title">Payment history</h2>
              {safeArray(mine.data.payments).length === 0 ? (
                <div className="space-y-2 text-label text-on-surface-variant">
                  <p className="font-semibold text-on-surface">No subscription purchases yet.</p>
                  <p>Your payment receipts and renewal history will appear here after purchasing a plan.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {safeArray(mine.data.payments)
                    .slice(0, 12)
                    .map((p) => (
                      <li
                        key={String(p.id || p._id || p.transactionId)}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 text-label"
                      >
                        <div>
                          <p className="font-semibold">
                            {String(p.planCode || 'Plan')} · {String(p.status || 'unknown')}
                          </p>
                          <p className="text-on-surface-variant">
                            {p.createdAt ? new Date(String(p.createdAt)).toLocaleString() : '—'}
                          </p>
                        </div>
                        <span className="font-semibold">{formatUgx(safeNumber(p.amount))}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </>
        ) : null}
      </AsyncStateView>
    </div>
  )
}

export default SubscriptionBillingPage
