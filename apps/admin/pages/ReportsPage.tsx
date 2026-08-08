import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { adminApi, formatUgx, marketingApi, paymentsApi, reviewsApi } from '@fixnow/api'
import { safeArray } from '@fixnow/utils'
import { Button, Icon, KpiCard, PageHeader, Surface } from '../components/ui'

const RANGE_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'This year' },
] as const

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown, fallback = '—'): string {
  return typeof v === 'string' && v.trim() ? v : fallback
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return
  const header = Object.keys(rows[0])
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      header.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Section({
  id,
  title,
  subtitle,
  children,
  action,
}: {
  id: string
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-primary">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function BarList({
  items,
  emptyLabel = 'No data available',
}: {
  items: Array<{ label: string; value: number }>
  emptyLabel?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">{emptyLabel}</p>
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate capitalize text-ink-secondary">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink-primary">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full bg-primary/80 transition-all"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ReportsPage() {
  const [days, setDays] = useState(30)

  const query = useAsync(async () => {
    const [dashRes, metricsRes, marketingRes, paymentsRes, escrowRes, reviewsRes] = await Promise.all([
      adminApi.getDashboard(),
      adminApi.marketplaceMetrics({ days }),
      marketingApi.analytics().catch(() => null),
      paymentsApi.adminPaymentDashboard().catch(() => null),
      paymentsApi.adminEscrowDashboard().catch(() => null),
      reviewsApi.analytics().catch(() => null),
    ])
    return {
      dashboard: dashRes.data,
      metrics: metricsRes.data,
      marketing: marketingRes?.data ?? null,
      payments: paymentsRes?.data?.dashboard ?? null,
      escrow: escrowRes?.data?.dashboard ?? null,
      reviews: reviewsRes?.data ?? null,
    }
  }, [days])

  const dash = (query.data?.dashboard ?? {}) as Record<string, unknown>
  const metrics = (query.data?.metrics ?? {}) as Record<string, unknown>
  const jobs = (dash.jobs ?? {}) as Record<string, unknown>
  const trust = (dash.trust ?? {}) as Record<string, unknown>
  const marketing = query.data?.marketing
  const payments = (query.data?.payments ?? {}) as Record<string, unknown>
  const escrow = (query.data?.escrow ?? {}) as Record<string, unknown>
  const reviews = (query.data?.reviews ?? {}) as Record<string, unknown>

  const jobsByStatus = useMemo(() => {
    const raw = (metrics.jobsByStatus ?? {}) as Record<string, number>
    return Object.entries(raw)
      .map(([label, value]) => ({ label: label.replace(/_/g, ' '), value: num(value) }))
      .sort((a, b) => b.value - a.value)
  }, [metrics])

  const jobsByDistrict = useMemo(() => {
    return safeArray(metrics.jobsByDistrict as unknown[]).map((row) => {
      const r = row as Record<string, unknown>
      return { label: str(r.district, 'Unknown'), value: num(r.jobs) }
    })
  }, [metrics])

  const topTechnicians = useMemo(() => {
    return safeArray(metrics.topTechnicians as unknown[]).map((row) => row as Record<string, unknown>)
  }, [metrics])

  const rangeLabel = RANGE_OPTIONS.find((r) => r.days === days)?.label ?? `${days} days`

  function exportSummary() {
    downloadCsv(`fixnow-reports-${days}d-${Date.now()}.csv`, [
      {
        window: rangeLabel,
        customers: num(dash.customers),
        technicians: num(dash.technicians),
        jobs_posted: num(jobs.posted),
        jobs_assigned: num(jobs.assigned),
        jobs_completed: num(jobs.completed),
        jobs_created_window: num(metrics.jobsCreated),
        jobs_completed_window: num(metrics.jobsCompleted),
        new_customers_window: num(metrics.newCustomers),
        new_technicians_window: num(metrics.newTechnicians),
        applications_window: num(metrics.applicationsCreated),
        cancelled_window: num(metrics.cancelledInWindow),
        trust_average: Math.round(num(trust.average)),
        marketing_views: num(marketing?.totals.views),
        marketing_clicks: num(marketing?.totals.clicks),
        marketing_redemptions: num(marketing?.totals.redemptions),
        marketing_revenue: num(marketing?.totals.revenueGenerated),
      },
    ])
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/admin/dashboard" className="hover:text-primary hover:underline">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-ink-primary">Reports</li>
        </ol>
      </nav>

      <PageHeader
        title="Reports & Analytics"
        subtitle="Live marketplace, trust, marketing, and revenue signals — tap any metric to open its workspace."
        actions={
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reporting window">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  aria-pressed={days === opt.days}
                  onClick={() => setDays(opt.days)}
                  className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    days === opt.days
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-ink-secondary hover:border-primary/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={exportSummary} disabled={!query.data}>
              <Icon name="download" className="!text-[18px]" />
              Export CSV
            </Button>
          </>
        }
      />

      <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
        {query.data ? (
          <div className="space-y-10">
            <Section
              id="marketplace"
              title="Marketplace overview"
              subtitle={`Window: ${rangeLabel}. Cards open live management workspaces.`}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard label="Active customers" value={num(dash.customers)} icon="person" to="/admin/customers" />
                <KpiCard
                  label="Active technicians"
                  value={num(dash.technicians)}
                  icon="construction"
                  accent="secondary"
                  to="/admin/technicians"
                />
                <KpiCard
                  label="Jobs in window"
                  value={num(metrics.jobsCreated)}
                  icon="work"
                  accent="tertiary"
                  to="/admin/jobs"
                />
                <KpiCard
                  label="Completed in window"
                  value={num(metrics.jobsCompleted)}
                  icon="task_alt"
                  accent="secondary"
                  to="/admin/jobs?status=completed"
                />
                <KpiCard
                  label="Platform health"
                  value={`${Math.round(num(trust.average))}`}
                  icon="monitor_heart"
                  trendLabel="Trust pulse"
                  to="/admin/trust"
                />
                <KpiCard
                  label="Growth (new techs)"
                  value={num(metrics.newTechnicians)}
                  icon="trending_up"
                  to="/admin/technicians"
                />
              </div>
            </Section>

            <Section id="jobs" title="Job analytics" subtitle="Lifecycle distribution across the marketplace.">
              <div className="grid gap-4 lg:grid-cols-2">
                <Surface className="p-5">
                  <h3 className="mb-4 text-sm font-semibold text-ink-primary">Jobs by status</h3>
                  <BarList items={jobsByStatus} />
                </Surface>
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard label="Posted" value={num(jobs.posted)} icon="rocket_launch" to="/admin/jobs?status=posted" />
                  <KpiCard
                    label="Assigned"
                    value={num(jobs.assigned)}
                    icon="assignment_ind"
                    to="/admin/jobs?status=assigned"
                  />
                  <KpiCard
                    label="Completed"
                    value={num(jobs.completed)}
                    icon="task_alt"
                    accent="secondary"
                    to="/admin/jobs?status=completed"
                  />
                  <KpiCard
                    label="Cancelled (window)"
                    value={num(metrics.cancelledInWindow)}
                    icon="cancel"
                    accent="danger"
                    to="/admin/jobs?status=cancelled"
                  />
                  <KpiCard
                    label="Applications"
                    value={num(metrics.applicationsCreated)}
                    icon="inbox"
                    accent="tertiary"
                    to="/admin/jobs?focus=applications"
                  />
                  <KpiCard label="Total jobs" value={num(jobs.total)} icon="folder_open" to="/admin/jobs" />
                </div>
              </div>
            </Section>

            <Section
              id="technicians"
              title="Technician analytics"
              subtitle="Highest trust and completion leaders."
              action={
                <Link to="/admin/technicians" className="text-sm font-medium text-primary hover:underline">
                  Open technician manager
                </Link>
              }
            >
              <Surface className="overflow-hidden p-0">
                {topTechnicians.length ? (
                  <ul className="divide-y divide-border">
                    {topTechnicians.map((t) => (
                      <li key={str(t.userId, str(t.id))} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-primary">{str(t.name)}</p>
                          <p className="text-xs text-ink-muted">
                            Trust {Math.round(num(t.trustScore))} · {num(t.jobsCompleted)} jobs ·{' '}
                            {str(t.verificationStatus, 'unverified')}
                            {t.locked ? ' · locked' : ''}
                          </p>
                        </div>
                        <Link
                          to={`/admin/technicians`}
                          className="shrink-0 text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-10 text-center text-sm text-ink-muted">No data available</p>
                )}
              </Surface>
            </Section>

            <Section id="customers" title="Customer analytics" subtitle="Acquisition and booking demand.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Total customers" value={num(dash.customers)} icon="group" to="/admin/customers" />
                <KpiCard
                  label="New in window"
                  value={num(metrics.newCustomers)}
                  icon="person_add"
                  accent="secondary"
                  to="/admin/customers"
                />
                <KpiCard
                  label="Jobs created"
                  value={num(metrics.jobsCreated)}
                  icon="post_add"
                  accent="tertiary"
                  to="/admin/jobs"
                />
                <KpiCard
                  label="Applications"
                  value={num(metrics.applicationsCreated)}
                  icon="how_to_reg"
                  to="/admin/jobs?focus=applications"
                />
              </div>
            </Section>

            <Section
              id="revenue"
              title="Revenue & escrow"
              subtitle="Live payment and escrow dashboards. Detailed ledgers stay in Payments."
              action={
                <Link to="/admin/payments" className="text-sm font-medium text-primary hover:underline">
                  Open payments workspace
                </Link>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Payments volume"
                  value={formatUgx(num(payments.totalVolume ?? payments.volume ?? payments.totalAmount))}
                  icon="payments"
                  to="/admin/payments"
                />
                <KpiCard
                  label="Successful payments"
                  value={num(payments.successful ?? payments.completed ?? payments.successCount)}
                  icon="verified"
                  accent="secondary"
                  to="/admin/payments"
                />
                <KpiCard
                  label="Escrow held"
                  value={formatUgx(num(escrow.held ?? escrow.totalHeld ?? escrow.balance))}
                  icon="account_balance"
                  accent="tertiary"
                  to="/admin/payments"
                />
                <KpiCard
                  label="Pending payouts"
                  value={num(payments.pendingPayouts ?? escrow.pendingPayouts)}
                  icon="send_money"
                  to="/admin/payments"
                />
              </div>
              {!Object.keys(payments).length && !Object.keys(escrow).length ? (
                <p className="text-sm text-ink-muted">No data available from payment dashboards.</p>
              ) : null}
            </Section>

            <Section
              id="trust"
              title="Trust analytics"
              subtitle="Reputation pulse and review health."
              action={
                <Link to="/admin/trust" className="text-sm font-medium text-primary hover:underline">
                  Open Trust Centre
                </Link>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Average trust"
                  value={Math.round(num(trust.average))}
                  icon="verified_user"
                  to="/admin/trust"
                />
                <KpiCard
                  label="Locked technicians"
                  value={num(dash.lockedTechnicians)}
                  icon="lock"
                  accent="danger"
                  to="/admin/locks"
                />
                <KpiCard
                  label="Reviews flagged"
                  value={num(reviews.flagged ?? reviews.flaggedCount ?? reviews.pending)}
                  icon="flag"
                  accent="tertiary"
                  to="/admin/reviews"
                />
                <KpiCard
                  label="Review volume"
                  value={num(reviews.total ?? reviews.count ?? reviews.totalReviews)}
                  icon="rate_review"
                  to="/admin/reviews"
                />
              </div>
            </Section>

            <Section
              id="marketing"
              title="Marketing analytics"
              subtitle="Campaign performance. Drill into dedicated marketing workspaces."
              action={
                <Link to="/admin/marketing" className="text-sm font-medium text-primary hover:underline">
                  Open marketing analytics
                </Link>
              }
            >
              {marketing ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="Views"
                    value={marketing.totals.views}
                    icon="visibility"
                    to="/admin/marketing?focus=traffic"
                  />
                  <KpiCard
                    label={`Clicks · CTR ${marketing.totals.ctr}%`}
                    value={marketing.totals.clicks}
                    icon="ads_click"
                    to="/admin/marketing?focus=ctr"
                  />
                  <KpiCard
                    label="Redemptions"
                    value={marketing.totals.redemptions}
                    icon="redeem"
                    accent="secondary"
                    to="/admin/marketing?focus=conversion"
                  />
                  <KpiCard
                    label="Campaign revenue"
                    value={formatUgx(marketing.totals.revenueGenerated)}
                    icon="payments"
                    accent="tertiary"
                    to="/admin/marketing?focus=revenue"
                  />
                  <KpiCard
                    label="Live offers"
                    value={marketing.totals.liveOffers}
                    icon="local_offer"
                    to="/admin/marketing/approved"
                  />
                  <KpiCard
                    label="Pending approval"
                    value={marketing.totals.pendingOffers}
                    icon="pending_actions"
                    to="/admin/marketing/pending"
                  />
                  <KpiCard
                    label="Platform promotions"
                    value={marketing.totals.platformPromotions}
                    icon="campaign"
                    to="/admin/marketing/platform"
                  />
                  <KpiCard
                    label="Sponsored active"
                    value={marketing.totals.sponsoredActive}
                    icon="star"
                    to="/admin/marketing/campaigns"
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                  No data available
                </p>
              )}
            </Section>

            <Section
              id="geography"
              title="Geographic analytics"
              subtitle="Jobs by district (Uganda). Deeper parish/village heatmaps require additional telemetry."
            >
              <Surface className="p-5">
                <BarList items={jobsByDistrict} emptyLabel="No data available for district breakdown." />
              </Surface>
            </Section>

            <Section id="capabilities" title="Related workspaces" subtitle="Operational modules that feed these reports.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { to: '/admin/dashboard', label: 'Command Centre', hint: 'Live ops overview' },
                  { to: '/admin/payments', label: 'Payments & Escrow', hint: 'Ledgers, refunds, CSV' },
                  { to: '/admin/trust', label: 'Trust Centre', hint: 'Scores & marketplace advantages' },
                  { to: '/admin/marketing', label: 'Marketing', hint: 'Offers, ads, campaigns' },
                  { to: '/admin/reviews', label: 'Reviews', hint: 'Reputation moderation' },
                  { to: '/admin/jobs', label: 'Jobs', hint: 'Lifecycle management' },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-canvas px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink-primary">{item.label}</span>
                      <span className="text-xs text-ink-muted">{item.hint}</span>
                    </span>
                    <Icon name="chevron_right" className="text-ink-muted" />
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        ) : null}
      </AsyncStateView>
    </div>
  )
}
