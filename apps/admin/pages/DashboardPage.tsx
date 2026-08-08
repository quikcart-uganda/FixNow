import { Link, useNavigate } from 'react-router-dom'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, ClickableRow, DataTable, Th } from '@fixnow/shared'
import {
  adminApi,
  categoriesApi,
  mapCategory,
} from '@fixnow/api/admin'
import { Button, Icon, KpiCard, PageHeader, StatusBadge, Surface, TrustGauge } from '../components/ui'
import { CopyableId } from '../components/CopyableId'
import { safeArray } from '@fixnow/utils'

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v)
}

function idOf(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const r = v as Record<string, unknown>
    return str(r._id ?? r.id)
  }
  return String(v)
}

const COMMAND_LINKS = [
  { to: '/admin/verification', label: 'Verifications', icon: 'verified_user', hint: 'ID & skill review' },
  { to: '/admin/payments', label: 'Payments', icon: 'payments', hint: 'Escrow & settlements' },
  { to: '/admin/marketing/pending', label: 'Offers', icon: 'local_offer', hint: 'Moderation queue' },
  { to: '/admin/marketing/platform', label: 'Promotions', icon: 'campaign', hint: 'Platform campaigns' },
  { to: '/admin/reports', label: 'Reports', icon: 'assessment', hint: 'Ops analytics' },
  { to: '/admin/audit', label: 'Audit Logs', icon: 'history', hint: 'Security trail' },
  { to: '/admin/categories', label: 'Categories', icon: 'category', hint: 'Service catalogue' },
  { to: '/admin/reviews', label: 'Reviews', icon: 'rate_review', hint: 'Reputation queue' },
] as const

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { data, status, error, reload } = useAsync(async () => {
    const [dashRes, metricsRes, catRes, appsRes] = await Promise.all([
      adminApi.getDashboard(),
      adminApi.marketplaceMetrics({ days: 30 }),
      categoriesApi.list({ active: 'false', limit: 50 }),
      adminApi.listApplications({ status: 'pending', limit: 10 }),
    ])
    return {
      dashboard: dashRes.data,
      metrics: metricsRes.data,
      categories: safeArray(catRes.data?.items).map(mapCategory),
      applications: safeArray(appsRes.data?.items),
    }
  }, [])

  useRealtimeReload(() => void reload(), [
    SOCKET_EVENTS.DASHBOARD_METRICS_UPDATED,
    SOCKET_EVENTS.MARKETPLACE_STATS_UPDATED,
    SOCKET_EVENTS.USER_REGISTERED,
    SOCKET_EVENTS.USER_ONLINE,
    SOCKET_EVENTS.USER_OFFLINE,
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_UPDATED,
    SOCKET_EVENTS.JOB_PUBLISHED,
    SOCKET_EVENTS.JOB_CANCELLED,
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.APPLICATION_SUBMITTED,
    SOCKET_EVENTS.APPLICATION_WITHDRAWN,
    SOCKET_EVENTS.APPLICATION_REJECTED,
    SOCKET_EVENTS.APPLICATION_ACCEPTED,
    SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
    SOCKET_EVENTS.TECHNICIAN_LOCKED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
  ])

  const dash = data?.dashboard ?? {}
  const jobs = (dash.jobs ?? {}) as Record<string, unknown>
  const trust = (dash.trust ?? {}) as Record<string, unknown>
  const customers = num(dash.customers)
  const technicians = num(dash.technicians)
  const posted = num(jobs.posted)
  const assigned = num(jobs.assigned)
  const completed = num(jobs.completed)
  const lockedTechnicians = num(dash.lockedTechnicians)
  const applicationsCount = num(dash.applications)
  const trustAvg = Math.round(num(trust.average))
  const pendingApps = safeArray(data?.applications)

  const jobsByStatus = (data?.metrics?.jobsByStatus ?? {}) as Record<string, number>
  const statusBars = Object.entries(jobsByStatus).map(([key, count]) => ({
    key,
    label: key.replace(/_/g, ' '),
    count: num(count),
  }))
  const maxStatusCount = Math.max(...statusBars.map((b) => b.count), 1)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Command Centre"
        subtitle="Operational overview — tap any metric to drill into live marketplace data."
        actions={
          <>
            <Button variant="secondary" disabled title="Reporting window is fixed to the last 30 days">
              <Icon name="calendar_today" className="!text-[18px]" /> Last 30 Days
            </Button>
            <Link
              to="/admin/reports"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/20 transition hover:opacity-90"
            >
              <Icon name="assessment" className="!text-[18px]" /> Open Reports
            </Link>
          </>
        }
      />

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <>
          <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li className="font-semibold text-ink-primary">Dashboard</li>
              <li aria-hidden="true">/</li>
              <li>Marketplace overview</li>
            </ol>
          </nav>

          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Key performance indicators">
            <KpiCard label="Total Customers" value={customers} icon="person" to="/admin/customers" />
            <KpiCard
              label="Total Technicians"
              value={technicians}
              icon="construction"
              accent="secondary"
              to="/admin/technicians"
            />
            <KpiCard
              label="Posted Jobs"
              value={posted}
              icon="rocket_launch"
              accent="tertiary"
              to="/admin/jobs?status=posted"
            />
            <KpiCard
              label="Assigned Jobs"
              value={assigned}
              icon="assignment_ind"
              accent="tertiary"
              to="/admin/jobs?status=assigned"
            />
            <KpiCard
              label="Completed Jobs"
              value={completed}
              icon="task_alt"
              accent="secondary"
              to="/admin/jobs?status=completed"
            />
            <KpiCard
              label="Locked Technicians"
              value={lockedTechnicians}
              icon="lock"
              trendLabel="High Priority"
              accent="danger"
              to="/admin/locks"
            />
            <KpiCard
              label="Pending Applications"
              value={pendingApps.length || applicationsCount}
              icon="inbox"
              to="/admin/jobs?focus=applications"
            />
            <KpiCard label="Trust Pulse" value={`${trustAvg}`} icon="verified" accent="secondary" to="/admin/trust" />
            <KpiCard
              label="Service Categories"
              value={safeArray(data?.categories).length}
              icon="category"
              to="/admin/categories"
            />
          </section>

          <section aria-label="Operations shortcuts">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Explore</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {COMMAND_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex min-h-11 items-start gap-3 rounded-xl border border-border bg-canvas p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon name={item.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-primary group-hover:text-primary">
                      {item.label}
                    </span>
                    <span className="block text-xs text-ink-muted">{item.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Surface className="p-6 lg:col-span-2">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink-primary">Marketplace Health</h2>
                  <p className="text-sm text-ink-secondary">Tap a status to open matching jobs</p>
                </div>
                <Link to="/admin/jobs" className="text-sm font-medium text-primary hover:underline">
                  All jobs →
                </Link>
              </div>
              {statusBars.length ? (
                <div className="relative flex h-[260px] items-end justify-between gap-2 px-2">
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between opacity-10">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-full border-t border-ink-primary" />
                    ))}
                  </div>
                  {statusBars.map((d) => (
                    <Link
                      key={d.key}
                      to={`/admin/jobs?status=${encodeURIComponent(d.key)}`}
                      className="z-10 flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40"
                      aria-label={`${d.count} ${d.label} jobs — open list`}
                    >
                      <div className="flex h-[220px] w-full items-end justify-center">
                        <div
                          className="w-full max-w-[48px] rounded-t bg-primary transition-all"
                          style={{ height: `${(d.count / maxStatusCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-full truncate text-center text-[10px] font-semibold capitalize text-ink-muted">
                        {d.label}
                      </span>
                      <span className="text-[11px] font-bold tabular-nums text-ink-primary">{d.count}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Icon name="bar_chart" className="!text-[40px] text-ink-muted" />
                  <p className="text-sm text-ink-muted">No job status data yet.</p>
                  <Link to="/admin/jobs" className="text-sm font-medium text-primary hover:underline">
                    Open job management
                  </Link>
                </div>
              )}
            </Surface>

            <Surface className="flex flex-col p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink-primary">Service Categories</h2>
                <Link to="/admin/categories" className="text-xs font-semibold text-primary hover:underline">
                  Manage
                </Link>
              </div>
              <div className="flex-1 space-y-3">
                {safeArray(data?.categories).slice(0, 5).map((c) => (
                  <Link
                    key={c.id}
                    to={`/admin/categories?q=${encodeURIComponent(c.name)}`}
                    className="block space-y-2 rounded-lg p-2 transition hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label={`Open category ${c.name}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-on-surface">{c.name}</span>
                      <span className="text-[13px] font-bold text-primary">
                        {(c.subcategories?.length ?? 0)} subs
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, Math.max(8, (c.subcategories?.length ?? 0) * 12))}%`,
                        }}
                      />
                    </div>
                  </Link>
                ))}
                {safeArray(data?.categories).length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">No categories yet.</p>
                ) : null}
              </div>
              <Link
                to="/admin/categories"
                className="mt-6 text-center text-[13px] font-medium text-primary hover:underline"
              >
                View all categories
              </Link>
            </Surface>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Surface className="overflow-hidden xl:col-span-2">
              <div className="flex items-center justify-between border-b border-outline-variant bg-surface-alt/30 p-6">
                <div>
                  <h2 className="text-xl font-semibold text-ink-primary">Pending Applications</h2>
                  <p className="text-sm text-ink-secondary">Tap a row to open the related job or technician</p>
                </div>
                <Link to="/admin/jobs?focus=applications">
                  <StatusBadge label={`${pendingApps.length} Pending`} tone="info" />
                </Link>
              </div>
              {pendingApps.length ? (
                <DataTable caption="Pending job applications">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-alt">
                      <Th>Application</Th>
                      <Th>Technician</Th>
                      <Th>Job</Th>
                      <Th>Status</Th>
                      <Th>When</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {pendingApps.slice(0, 8).map((raw) => {
                      const app = raw as Record<string, unknown>
                      const appId = idOf(app)
                      const techId = str(app.technicianId)
                      const jobId = str(app.jobId)
                      const target = jobId
                        ? `/admin/jobs?q=${encodeURIComponent(jobId)}`
                        : techId
                          ? `/admin/technicians?q=${encodeURIComponent(techId)}`
                          : '/admin/jobs'
                      return (
                        <ClickableRow
                          key={appId}
                          label={`Open application ${appId.slice(-8) || 'details'}`}
                          onActivate={() => navigate(target)}
                        >
                          <td className="px-3 py-3 sm:px-6 sm:py-4">
                            <CopyableId value={appId} label="Application ID" onOpen={() => navigate(target)} />
                          </td>
                          <td className="px-3 py-3 sm:px-6 sm:py-4">
                            <CopyableId value={techId} label="Technician ID" />
                          </td>
                          <td className="px-3 py-3 sm:px-6 sm:py-4">
                            <CopyableId value={jobId} label="Job ID" />
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge label={str(app.status, 'pending')} tone="warning" />
                          </td>
                          <td className="px-6 py-4 text-sm tabular-nums text-ink-secondary">
                            {app.createdAt ? new Date(str(app.createdAt)).toLocaleDateString() : '—'}
                          </td>
                        </ClickableRow>
                      )
                    })}
                  </tbody>
                </DataTable>
              ) : (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <Icon name="inbox" className="!text-[40px] text-ink-muted" />
                  <p className="text-sm font-medium text-ink-primary">No pending applications</p>
                  <p className="max-w-sm text-sm text-ink-muted">
                    New technician applications on posted jobs will appear here for review.
                  </p>
                  <Link
                    to="/admin/jobs?status=posted"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Review posted jobs
                  </Link>
                </div>
              )}
            </Surface>

            <Link
              to="/admin/trust"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Open Trust Centre"
            >
              <Surface className="h-full space-y-5 p-6 transition hover:border-primary/30 hover:shadow-sm">
                <h2 className="text-xl font-semibold text-ink-primary">Trust Pulse</h2>
                <p className="text-sm text-ink-secondary">
                  Platform-wide reputation health. Open the Trust Centre for history, risk, and adjustments.
                </p>
                <div className="flex items-center gap-4">
                  <TrustGauge score={trustAvg} size={72} />
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-ink-primary">{trustAvg} / 100</p>
                    <p className="text-xs text-ink-muted">Avg technician trust score</p>
                  </div>
                </div>
                <span className="inline-flex text-sm font-medium text-primary">Open Trust Centre →</span>
              </Surface>
            </Link>
          </section>
        </>
      </AsyncStateView>
    </div>
  )
}
