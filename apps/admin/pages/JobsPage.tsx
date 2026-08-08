import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync, useDebouncedValue, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, ClickableRow, DataTable, Dialog, Th } from '@fixnow/shared'
import { adminApi, formatUgx, mapAdminJob } from '@fixnow/api/admin'
import type { AdminJob, JobStatus } from '@fixnow/types/admin'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'
import { CopyableId } from '../components/CopyableId'
import { safeArray } from '@fixnow/utils'

const statuses: Array<JobStatus | 'all'> = [
  'all',
  'posted',
  'assigned',
  'in_progress',
  'awaiting_confirmation',
  'completed',
  'cancelled',
  'disputed',
]

type AppRow = {
  id: string
  technicianId: string
  jobId: string
  status: string
  createdAt: string
  message: string
  category: string
}

function toneFor(status: JobStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'disputed' || status === 'cancelled') return 'danger' as const
  if (status === 'awaiting_confirmation') return 'warning' as const
  if (status === 'in_progress' || status === 'assigned') return 'info' as const
  return 'neutral' as const
}

function isJobStatus(v: string | null): v is JobStatus {
  return Boolean(v && statuses.includes(v as JobStatus))
}

function mapApp(raw: unknown): AppRow {
  const app = (raw ?? {}) as Record<string, unknown>
  const id = String(app._id ?? app.id ?? '')
  return {
    id,
    technicianId: String(app.technicianId ?? app.technician ?? ''),
    jobId: String(app.jobId ?? app.job ?? ''),
    status: String(app.status ?? 'pending'),
    createdAt: String(app.createdAt ?? ''),
    message: String(app.message ?? app.coverLetter ?? app.note ?? ''),
    category: String(app.category ?? app.trade ?? ''),
  }
}

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const initialStatus = params.get('status')
  const [filter, setFilter] = useState<(typeof statuses)[number]>(
    isJobStatus(initialStatus) ? initialStatus : 'all',
  )
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [selected, setSelected] = useState<AdminJob | null>(null)
  const [selectedApp, setSelectedApp] = useState<AppRow | null>(null)
  const focusApplications = params.get('focus') === 'applications'

  const { data: jobs = [], status, error, reload } = useAsync(async () => {
    const res = await adminApi.listJobs({
      q: debouncedQuery.trim() || undefined,
      status: filter === 'all' ? undefined : filter,
      limit: 100,
    })
    return safeArray(res.data?.items).map(mapAdminJob)
  }, [filter, debouncedQuery])

  const {
    data: applications = [],
    status: appsStatus,
    error: appsError,
    reload: reloadApps,
  } = useAsync(async () => {
    if (!focusApplications) return [] as AppRow[]
    const res = await adminApi.listApplications({ status: 'pending', limit: 100 })
    return safeArray(res.data?.items).map(mapApp)
  }, [focusApplications])

  useRealtimeReload(() => {
    void reload()
    if (focusApplications) void reloadApps()
  }, [
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
  ])

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (filter === 'all') next.delete('status')
    else next.set('status', filter)
    if (query.trim()) next.set('q', query.trim())
    else next.delete('q')
    if (focusApplications) next.set('focus', 'applications')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL from local filter/query only
  }, [filter, debouncedQuery])

  const filtered = useMemo(() => {
    const list = safeArray(jobs)
    const q = query.toLowerCase()
    if (!q) return list
    return list.filter((j) => {
      return (
        j.title.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        (j.publicJobReference?.toLowerCase().includes(q) ?? false) ||
        j.customer.toLowerCase().includes(q) ||
        (j.technician?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [jobs, query])

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
          <li className="font-semibold text-ink-primary">
            {focusApplications ? 'Application Queue' : 'Jobs'}
          </li>
          {filter !== 'all' ? (
            <>
              <li aria-hidden="true">/</li>
              <li className="capitalize">{filter.replace(/_/g, ' ')}</li>
            </>
          ) : null}
        </ol>
      </nav>

      <PageHeader
        title={focusApplications ? 'Application Queue' : 'Job Management'}
        subtitle={
          focusApplications
            ? 'Pending technician applications — open a row for full context and related actions.'
            : 'Monitor every marketplace job from post to completion — including disputes.'
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {focusApplications ? (
              <Link
                to="/admin/jobs"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                All jobs
              </Link>
            ) : (
              <Link
                to="/admin/jobs?focus=applications"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Applications
              </Link>
            )}
            <div className="relative w-full sm:w-72">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline !text-[18px]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={focusApplications ? 'Search jobs…' : 'Search jobs…'}
                aria-label="Search jobs"
                className="w-full rounded-lg border border-border bg-canvas py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>
        }
      />

      {focusApplications ? (
        <AsyncStateView status={appsStatus} error={appsError} onRetry={() => void reloadApps()}>
          {safeArray(applications).length === 0 ? (
            <Surface className="flex flex-col items-center gap-3 p-12 text-center">
              <Icon name="inbox" className="!text-[40px] text-ink-muted" />
              <p className="text-sm font-medium text-ink-primary">No pending applications</p>
              <p className="max-w-sm text-sm text-ink-muted">
                New technician applications on posted jobs will appear here for operational review.
              </p>
              <Link to="/admin/jobs?status=posted" className="text-sm font-medium text-primary hover:underline">
                Review posted jobs
              </Link>
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <DataTable caption="Pending job applications">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <Th className="min-w-[9rem]">Application</Th>
                    <Th className="min-w-[9rem]">Applicant</Th>
                    <Th className="min-w-[9rem]">Job</Th>
                    <Th className="hidden sm:table-cell">Submitted</Th>
                    <Th>Status</Th>
                    <Th align="right">Open</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {safeArray(applications).map((app) => (
                    <ClickableRow
                      key={app.id}
                      label={`Open application ${app.id.slice(-8)}`}
                      onActivate={() => setSelectedApp(app)}
                    >
                      <td className="px-3 py-3 sm:px-6 sm:py-4">
                        <CopyableId
                          value={app.id}
                          label="Application ID"
                          onOpen={() => setSelectedApp(app)}
                        />
                      </td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4">
                        <CopyableId value={app.technicianId} label="Technician ID" />
                      </td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4">
                        <CopyableId value={app.jobId} label="Job ID" />
                      </td>
                      <td className="hidden px-3 py-3 text-sm tabular-nums text-ink-secondary sm:table-cell sm:px-6 sm:py-4">
                        {app.createdAt ? new Date(app.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4">
                        <StatusBadge label={app.status} tone="warning" />
                      </td>
                      <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                        <Icon name="chevron_right" className="!text-[18px] text-ink-muted" />
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
              </DataTable>
            </Surface>
          )}
        </AsyncStateView>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={filter === s}
                onClick={() => setFilter(s)}
                className={`min-h-10 shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  filter === s
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-canvas text-ink-secondary hover:bg-surface-alt'
                }`}
              >
                {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <AsyncStateView
            status={status}
            error={error}
            onRetry={() => void reload()}
            emptyTitle="No jobs match"
            emptyHint="Try another status filter or clear your search."
          >
            {safeArray(filtered).length === 0 ? (
              <Surface className="flex flex-col items-center gap-3 p-12 text-center">
                <Icon name="work_off" className="!text-[40px] text-ink-muted" />
                <p className="text-sm font-medium text-ink-primary">No jobs found</p>
                <p className="max-w-sm text-sm text-ink-muted">
                  Adjust filters or wait for customers to post new work in this status.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('all')
                    setQuery('')
                  }}
                >
                  Clear filters
                </Button>
              </Surface>
            ) : (
              <>
                {/* Mobile / narrow: stacked job cards — identifiers never wrap */}
                <div className="space-y-3 md:hidden" role="list" aria-label="Marketplace jobs">
                  {safeArray(filtered).map((j) => {
                    const ref = j.publicJobReference || j.id.slice(-8)
                    return (
                      <article
                        key={j.id}
                        role="listitem"
                        className="rounded-2xl border border-border bg-canvas p-3.5 shadow-sm"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelected(j)}
                          aria-label={`Open details for ${j.title}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink-primary">
                              {j.title}
                            </p>
                            <StatusBadge
                              label={j.status.replace(/_/g, ' ')}
                              tone={toneFor(j.status)}
                            />
                          </div>
                          <p className="mt-0.5 text-xs text-ink-secondary">{j.category || '—'}</p>
                        </button>
                        <div className="mt-1.5">
                          <CopyableId
                            value={ref}
                            label="Job reference"
                            onOpen={() => setSelected(j)}
                          />
                        </div>
                        <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-border pt-3 text-xs text-ink-secondary">
                          <div className="flex min-w-0 gap-1">
                            <dt className="shrink-0 font-medium text-ink-muted">Customer:</dt>
                            <dd className="min-w-0 truncate font-medium text-ink-primary">
                              {j.customer || '—'}
                            </dd>
                          </div>
                          <div className="flex min-w-0 gap-1">
                            <dt className="shrink-0 font-medium text-ink-muted">Technician:</dt>
                            <dd className="min-w-0 truncate font-medium text-ink-primary">
                              {j.technician ?? 'Unassigned'}
                            </dd>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <p className="text-ink-secondary">
                              {[j.district, j.parish].filter(Boolean).join(', ') || '—'}
                            </p>
                            <p className="font-semibold tabular-nums text-ink-primary">
                              {formatUgx(j.budget)}
                            </p>
                          </div>
                        </dl>
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(j)}>
                            <Icon name="open_in_new" className="!text-[16px]" /> View
                          </Button>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {/* Tablet / desktop: wider Job column, single-line references */}
                <Surface className="hidden overflow-hidden md:block">
                  <DataTable caption="Marketplace jobs directory">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt">
                        <Th className="min-w-[18rem] lg:min-w-[24rem]">Job</Th>
                        <Th className="min-w-[9rem]">Parties</Th>
                        <Th className="hidden min-w-[8rem] lg:table-cell">Location</Th>
                        <Th className="min-w-[6.5rem]">Budget</Th>
                        <Th>Status</Th>
                        <Th align="right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {safeArray(filtered).map((j) => {
                        const ref = j.publicJobReference || j.id.slice(-8)
                        return (
                          <ClickableRow
                            key={j.id}
                            label={`Open details for ${j.title}`}
                            onActivate={() => setSelected(j)}
                          >
                            <td className="max-w-[22rem] px-4 py-3 lg:px-6 lg:py-4">
                              <p className="text-sm font-semibold leading-snug text-ink-primary">
                                {j.title}
                              </p>
                              <p className="mt-0.5 text-xs text-ink-secondary">{j.category || '—'}</p>
                              <div className="mt-1">
                                <CopyableId
                                  value={ref}
                                  label="Job reference"
                                  onOpen={() => setSelected(j)}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm lg:px-6 lg:py-4">
                              <p className="font-medium text-ink-primary">{j.customer}</p>
                              <p className="text-xs text-ink-secondary">
                                {j.technician ?? 'Unassigned'}
                              </p>
                            </td>
                            <td className="hidden px-4 py-3 text-sm text-ink-secondary lg:table-cell lg:px-6 lg:py-4">
                              {[j.district, j.parish].filter(Boolean).join(', ') || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm tabular-nums lg:px-6 lg:py-4">
                              {formatUgx(j.budget)}
                            </td>
                            <td className="px-4 py-3 lg:px-6 lg:py-4">
                              <StatusBadge
                                label={j.status.replace(/_/g, ' ')}
                                tone={toneFor(j.status)}
                              />
                            </td>
                            <td
                              className="px-4 py-3 text-right lg:px-6 lg:py-4"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Button size="sm" variant="ghost" onClick={() => setSelected(j)}>
                                <Icon name="open_in_new" className="!text-[16px]" /> View
                              </Button>
                            </td>
                          </ClickableRow>
                        )
                      })}
                    </tbody>
                  </DataTable>
                </Surface>
              </>
            )}
          </AsyncStateView>
        </>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Job details'}
        description={selected?.publicJobReference || undefined}
        placement="end"
        panelClassName="md:!max-w-xl"
      >
        {selected ? (
          <div className="space-y-6">
            <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
              Dashboard / Jobs / <span className="text-ink-primary">{selected.title}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={selected.status.replace(/_/g, ' ')} tone={toneFor(selected.status)} />
              {selected.disputed ? <StatusBadge label="Disputed" tone="danger" /> : null}
              {selected.publicJobReference ? (
                <CopyableId
                  value={selected.publicJobReference}
                  label="Job reference"
                  size="md"
                />
              ) : null}
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Overview</h3>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Public reference</dt>
                  <dd className="mt-0.5">
                    <CopyableId
                      value={selected.publicJobReference || null}
                      label="Job reference"
                      size="md"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Internal ID</dt>
                  <dd className="mt-0.5">
                    <CopyableId value={selected.id} label="Internal job ID" />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Category</dt>
                  <dd className="font-medium text-ink-primary">{selected.category}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Budget</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{formatUgx(selected.budget)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Location</dt>
                  <dd className="font-medium text-ink-primary">
                    {selected.district}, {selected.parish}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Created</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">
                    {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-muted">Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-ink-secondary">
                    {selected.description || 'No description provided.'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Customer</h3>
              <div className="rounded-xl border border-border bg-surface-alt/50 p-3 text-sm">
                <p className="font-medium text-ink-primary">{selected.customer}</p>
                <Link
                  to={`/admin/customers?q=${encodeURIComponent(selected.customer)}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open customer profile
                </Link>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Assigned technician</h3>
              <div className="rounded-xl border border-border bg-surface-alt/50 p-3 text-sm">
                <p className="font-medium text-ink-primary">{selected.technician ?? 'Unassigned'}</p>
                {selected.technician ? (
                  <Link
                    to={`/admin/technicians?q=${encodeURIComponent(selected.technician)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open technician profile
                  </Link>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">Use Applications or Technicians to assign.</p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Applications</h3>
              <div className="rounded-xl border border-border bg-surface-alt/50 p-3 text-sm">
                <p className="font-medium text-ink-primary">
                  {selected.applicationCount ?? 0} application{(selected.applicationCount ?? 0) === 1 ? '' : 's'}
                </p>
                <Link to="/admin/jobs?focus=applications" className="text-xs text-primary hover:underline">
                  Open application queue
                </Link>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Tracking · Payments · Escrow · Chat</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  to={`/admin/tracking?q=${encodeURIComponent(selected.publicJobReference || selected.id)}`}
                  className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-alt"
                >
                  <span className="font-semibold text-ink-primary">Live tracking</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">Map, ETA, session controls</span>
                </Link>
                <Link
                  to="/admin/payments"
                  className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-alt"
                >
                  <span className="font-semibold text-ink-primary">Payments & escrow</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">Open payment workspace</span>
                </Link>
                <Link
                  to="/admin/messages"
                  className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-alt"
                >
                  <span className="font-semibold text-ink-primary">Chat / messages</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">Message customer or technician</span>
                </Link>
                <Link
                  to={`/admin/technicians?q=${encodeURIComponent(selected.district)}`}
                  className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-alt"
                >
                  <span className="font-semibold text-ink-primary">Nearby technicians</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Filter workforce by {selected.district}
                  </span>
                </Link>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Photos</h3>
              {selected.photoUrls?.length ? (
                <ul className="grid grid-cols-3 gap-2">
                  {selected.photoUrls.slice(0, 6).map((url) => (
                    <li key={url} className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-alt">
                      <LazyImage
                        src={resolveMediaUrl(url)}
                        alt="Job photo"
                        className="h-full w-full object-cover"
                        emptyContent={<span className="flex h-full items-center justify-center text-xs text-ink-muted">—</span>}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No photos attached</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Documents · Audit · Report</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link to="/admin/audit" className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-alt">
                  Audit trail
                </Link>
                <Link to="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-alt">
                  Generate report
                </Link>
                <Link to="/admin/messages" className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-alt">
                  Activity log (messages)
                </Link>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Status history</h3>
              {selected.statusHistory?.length ? (
                <ol className="space-y-2">
                  {selected.statusHistory
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <li key={`${h.status}-${h.changedAt}-${i}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                        <p className="font-semibold capitalize text-ink-primary">{h.status.replace(/_/g, ' ')}</p>
                        <p className="text-ink-muted">
                          {h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}
                          {h.note ? ` · ${h.note}` : ''}
                        </p>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-muted">No data available</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Activity timeline</h3>
              {selected.timeline?.length ? (
                <ol className="space-y-2">
                  {selected.timeline
                    .slice()
                    .reverse()
                    .slice(0, 12)
                    .map((ev, i) => (
                      <li key={`${ev.type}-${ev.at}-${i}`} className="flex justify-between gap-2 text-xs">
                        <span className="text-ink-secondary">{ev.type}</span>
                        <span className="shrink-0 tabular-nums text-ink-muted">
                          {ev.at ? new Date(ev.at).toLocaleString() : '—'}
                        </span>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-muted">No data available</p>
              )}
            </section>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Link
                to={`/admin/tracking?q=${encodeURIComponent(selected.publicJobReference || selected.id)}`}
                className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white"
              >
                Track live
              </Link>
              <Link
                to={`/admin/customers?q=${encodeURIComponent(selected.customer)}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Message customer
              </Link>
              {selected.technician ? (
                <Link
                  to={`/admin/technicians?q=${encodeURIComponent(selected.technician)}`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Technician
                </Link>
              ) : (
                <Link
                  to="/admin/technicians"
                  className="inline-flex min-h-10 items-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary"
                >
                  Assign technician
                </Link>
              )}
              <Link
                to="/admin/payments"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Open payment
              </Link>
              <Link
                to="/admin/payments"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Refund
              </Link>
              <Link
                to="/admin/jobs?focus=applications"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Applications
              </Link>
              <Link
                to="/admin/audit"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Escalate
              </Link>
              <Link
                to="/admin/reports"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Generate report
              </Link>
              <Link
                to="/admin/jobs"
                className="inline-flex min-h-10 items-center rounded-lg border border-error/40 px-3 text-sm font-medium text-error hover:bg-error/5"
              >
                Cancel
              </Link>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(selectedApp)}
        onClose={() => setSelectedApp(null)}
        title="Application details"
        placement="end"
      >
        {selectedApp ? (
          <div className="space-y-5">
            <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
              Dashboard / Applications / <span className="tabular-nums text-ink-primary">{selectedApp.id.slice(-8)}</span>
            </nav>
            <StatusBadge label={selectedApp.status} tone="warning" />
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Application ID</dt>
                <dd className="mt-0.5">
                  <CopyableId value={selectedApp.id} label="Application ID" size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Applicant</dt>
                <dd className="mt-0.5">
                  <CopyableId value={selectedApp.technicianId} label="Technician ID" size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Job</dt>
                <dd className="mt-0.5">
                  <CopyableId value={selectedApp.jobId} label="Job ID" size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Category</dt>
                <dd className="font-medium text-ink-primary">{selectedApp.category || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Submitted</dt>
                <dd className="font-medium tabular-nums text-ink-primary">
                  {selectedApp.createdAt ? new Date(selectedApp.createdAt).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            {selectedApp.message ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Message</p>
                <p className="mt-1 text-sm text-ink-primary">{selectedApp.message}</p>
              </div>
            ) : null}
            <p className="text-xs text-ink-muted">
              Acceptance is decided by the customer on the job. Use the links below to inspect parties,
              documents context, and assignment state. Request more information via Messages if needed.
            </p>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {selectedApp.jobId ? (
                <Link
                  to={`/admin/jobs?q=${encodeURIComponent(selectedApp.jobId)}`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Open job
                </Link>
              ) : null}
              {selectedApp.technicianId ? (
                <Link
                  to={`/admin/technicians?q=${encodeURIComponent(selectedApp.technicianId)}`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Applicant profile
                </Link>
              ) : null}
              <Link
                to="/admin/verification"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Verification
              </Link>
              <Link
                to="/admin/messages"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Request more info
              </Link>
              <Link
                to="/admin/audit"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Audit history
              </Link>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
