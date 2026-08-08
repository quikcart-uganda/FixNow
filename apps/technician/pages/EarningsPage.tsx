import { useState } from 'react'
import { formatUgx, getFriendlyErrorMessage, paymentsApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Card, Icon, StatCard } from '@fixnow/ui'
import { cn, safeArray } from '@fixnow/utils'
import { ForecastWidget } from '@technician/components/dashboard/PremiumDashboardWidgets'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { planEmptyCopy } from '@technician/lib/planWorkspace'

export function EarningsPage() {
  const tier = usePlanWorkspaceTier()
  const emptyCopy = planEmptyCopy(tier, 'earnings')
  const [requesting, setRequesting] = useState(false)
  const earnings = useAsync(async () => (await paymentsApi.earnings()).data, [], {
    cacheKey: 'technician.earnings.v1',
  })

  useRealtimeReload(
    () => void earnings.reload(),
    [
      SOCKET_EVENTS.ESCROW_FUNDED,
      SOCKET_EVENTS.ESCROW_RELEASED,
      SOCKET_EVENTS.PAYOUT_COMPLETED,
      SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
    ],
  )

  const summary = earnings.data?.summary
  const wallet = earnings.data?.wallet
  const available = Number(summary?.availableBalance ?? wallet?.availableBalance ?? 0)
  const lifetime = Number(summary?.lifetimeReleased ?? 0)
  const pendingCount = Number(summary?.pendingEscrowCount ?? 0)

  const requestPayout = async () => {
    if (available <= 0) {
      window.alert('No available balance to withdraw.')
      return
    }
    const amountRaw = window.prompt('Payout amount (UGX)', String(available))
    if (!amountRaw) return
    const amount = Number(amountRaw)
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert('Invalid amount')
      return
    }
    setRequesting(true)
    try {
      await paymentsApi.requestPayout({ amount })
      await earnings.reload()
      window.alert('Payout requested. We will notify you when it is processed.')
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setRequesting(false)
    }
  }

  return (
    <PlanWorkspaceShell page="earnings">
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="min-h-11 fn-pressable"
          disabled={requesting}
          onClick={() => void requestPayout()}
        >
          <Icon name="account_balance_wallet" />
          Request payout
        </Button>
      </div>

      <AsyncStateView
        status={earnings.status}
        error={earnings.error}
        onRetry={() => void earnings.reload()}
        emptyTitle={emptyCopy.title}
        emptyHint={emptyCopy.hint}
      >
        <Card
          className={cn(
            'trust-gradient p-6 text-white md:p-8',
            tier === 'professional' && 'fn-hero-shine relative overflow-hidden',
            tier === 'business' && 'fn-hero-shine relative overflow-hidden ring-1 ring-white/20',
          )}
        >
          <p className="text-caps text-primary-fixed/80">
            {tier === 'business' ? 'Company available balance' : 'Available balance'}
          </p>
          <p className="mt-2 text-display-mobile md:text-display-lg tabular-nums">
            {formatUgx(available)}
          </p>
          <p className="mt-2 text-body text-on-primary-container">
            Funds held {formatUgx(Number(summary?.heldInEscrow ?? 0))} · Lifetime paid{' '}
            {formatUgx(lifetime)}
          </p>
          {tier === 'professional' || tier === 'business' ? (
            <p className="mt-3 text-label text-primary-fixed/90">
              {tier === 'business'
                ? 'Tip: clear pending escrow before requesting large payouts.'
                : 'Tip: request payouts after releases land so your balance stays predictable.'}
            </p>
          ) : null}
        </Card>

        <div
          className={cn(
            'grid grid-cols-2 gap-4 md:grid-cols-4',
            tier === 'professional' && '[&_.text-headline]:text-primary',
            tier === 'business' && '[&_.text-headline]:text-teal-900',
          )}
        >
          <StatCard label="Pending release" value={String(pendingCount)} />
          <StatCard
            label="Lifetime payouts"
            value={formatUgx(Number(summary?.lifetimePayouts ?? 0))}
          />
          <StatCard
            label="Pending payouts"
            value={String(earnings.data?.pendingPayouts?.length ?? 0)}
          />
          <StatCard
            label="Completed payouts"
            value={String(earnings.data?.completedPayouts?.length ?? 0)}
          />
        </div>

        {tier === 'business' ? (
          <ForecastWidget
            weeklyRevenue={Math.max(available, Math.round(lifetime / 12))}
            bookings={pendingCount + (earnings.data?.pendingPayouts?.length ?? 0)}
            completionRate={
              lifetime > 0 ? Math.min(96, 70 + Math.round((available / Math.max(lifetime, 1)) * 20)) : 72
            }
          />
        ) : null}

        {tier === 'professional' ? (
          <Card className="fn-premium-surface border-primary/15 p-5">
            <p className="text-caps text-primary">Income insight</p>
            <p className="mt-1 text-title">Weekly cashflow pulse</p>
            <p className="mt-2 text-body text-on-surface-variant">
              Available {formatUgx(available)} with {pendingCount} escrow releases pending — keep
              applications active to lift this week’s pace.
            </p>
          </Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
            <h2 className="text-title">Pending payouts</h2>
            <div className="mt-3 space-y-2">
              {safeArray(earnings.data?.pendingPayouts).length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No pending payouts</p>
              ) : (
                safeArray(earnings.data?.pendingPayouts).map((tx) => (
                  <div
                    key={String(tx._id)}
                    className="flex items-center justify-between rounded-xl border border-border-subtle px-3 py-2 fn-pressable"
                  >
                    <div>
                      <p className="text-label font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                      <p className="text-caps text-outline">{String(tx.status)}</p>
                    </div>
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-bold uppercase text-warning">
                      Pending
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
            <h2 className="text-title">Completed payouts</h2>
            <div className="mt-3 space-y-2">
              {safeArray(earnings.data?.completedPayouts).length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No completed payouts yet</p>
              ) : (
                safeArray(earnings.data?.completedPayouts).map((tx) => (
                  <div
                    key={String(tx._id)}
                    className="flex items-center justify-between rounded-xl border border-border-subtle px-3 py-2 fn-pressable"
                  >
                    <div>
                      <p className="text-label font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                      <p className="text-caps text-outline">{String(tx.reference)}</p>
                    </div>
                    <span className="rounded-full bg-tertiary-container/10 px-2 py-0.5 text-[11px] font-bold uppercase text-tertiary">
                      Paid
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className={cn('p-5', tier === 'professional' && 'fn-premium-surface')}>
          <h2 className="text-title">
            {tier === 'business' ? 'Ledger · executive history' : 'Transaction history'}
          </h2>
          <div className="mt-3 space-y-2">
            {safeArray(earnings.data?.ledger).map((tx) => (
              <div
                key={String(tx._id)}
                className="flex items-start justify-between rounded-xl border border-border-subtle p-3 hover:bg-surface-container-low fn-pressable"
              >
                <div>
                  <p className="font-semibold capitalize">
                    {String(tx.type)} · {String(tx.status)}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {String(tx.description || tx.reference)}
                  </p>
                </div>
                <p className="font-semibold text-tertiary">{formatUgx(Number(tx.amount ?? 0))}</p>
              </div>
            ))}
          </div>
        </Card>
      </AsyncStateView>
    </PlanWorkspaceShell>
  )
}
