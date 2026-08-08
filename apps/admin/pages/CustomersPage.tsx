import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync, useDebouncedValue, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, ClickableRow, DataTable, FormError, Th } from '@fixnow/shared'
import {
  adminApi,
  formatUgx,
  getFriendlyErrorMessage,
  mapAdminCustomer,
  mapAdminJob,
} from '@fixnow/api/admin'
import type { AdminCustomer, AdminJob } from '@fixnow/types/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'
import { ProfileAvatar } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

export function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>(
    () => (params.get('status') === 'suspended' || params.get('status') === 'active' ? params.get('status')! : 'all') as
      | 'all'
      | 'active'
      | 'suspended',
  )
  const [selected, setSelected] = useState<AdminCustomer | null>(null)
  const [history, setHistory] = useState<AdminJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const { data: rows = [], status, error, reload } = useAsync(async () => {
    const res = await adminApi.listUsers({ q: debouncedQuery.trim() || undefined, limit: 100 })
    return safeArray(res.data?.items)
      .filter((raw) => {
        const row = raw as Record<string, unknown>
        const user = (row.user ?? row) as Record<string, unknown>
        return user.role == null || user.role === 'customer'
      })
      .map(mapAdminCustomer)
  }, [debouncedQuery])

  useRealtimeReload(() => void reload(), [
    SOCKET_EVENTS.DASHBOARD_METRICS_UPDATED,
    SOCKET_EVENTS.MARKETPLACE_STATS_UPDATED,
    SOCKET_EVENTS.USER_REGISTERED,
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.JOB_CANCELLED,
  ])

  const filtered = useMemo(() => {
    const list = safeArray(rows)
    const q = query.toLowerCase()
    return list.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.id.toLowerCase().includes(q)
      )
    })
  }, [query, rows, statusFilter])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('q', query.trim())
    if (statusFilter !== 'all') next.set('status', statusFilter)
    setParams(next, { replace: true })
  }, [debouncedQuery, statusFilter, query, setParams])

  useEffect(() => {
    if (!selected) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    adminApi
      .getCustomer(selected.id)
      .then((res) => {
        const data = res.data as { recentJobs?: unknown[] }
        setHistory(safeArray(data.recentJobs).map(mapAdminJob))
      })
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [selected])

  async function toggleSuspend(id: string, currentlyActive: boolean) {
    setActionError(null)
    setActing(true)
    try {
      if (currentlyActive) {
        await adminApi.suspendUser(id)
      } else {
        await adminApi.unlockUser(id)
      }
      await reload()
      if (selected?.id === id) {
        setSelected((prev) =>
          prev ? { ...prev, status: currentlyActive ? 'suspended' : 'active' } : prev,
        )
      }
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
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
          <li className="font-semibold text-ink-primary">Customers</li>
          {selected ? (
            <>
              <li aria-hidden="true">/</li>
              <li>{selected.name}</li>
            </>
          ) : null}
        </ol>
      </nav>

      <PageHeader
        title="Customer Management"
        subtitle="Search, filter, and open profiles — jobs, spend, and account actions."
        actions={
          <div className="relative w-full sm:w-72">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline !text-[18px]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-canvas border border-border text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {(['all', 'active', 'suspended'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
              statusFilter === s
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-canvas text-ink-secondary hover:bg-surface-alt'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {actionError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{actionError}</FormError>
      ) : null}

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        {safeArray(filtered).length === 0 ? (
          <Surface className="flex flex-col items-center gap-3 p-12 text-center">
            <Icon name="person_off" className="!text-[40px] text-ink-muted" />
            <p className="text-sm font-medium text-ink-primary">No customers match</p>
            <p className="max-w-sm text-sm text-ink-muted">
              Adjust search or status filters to find registered customers.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery('')
                setStatusFilter('all')
              }}
            >
              Clear filters
            </Button>
          </Surface>
        ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Surface className="xl:col-span-2 overflow-hidden">
            <DataTable caption="Customer directory">
              <thead>
                <tr className="bg-surface-alt border-b border-border">
                  <Th>Customer</Th>
                  <Th>Location</Th>
                  <Th>Jobs</Th>
                  <Th>Spent</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safeArray(filtered).map((c) => (
                  <ClickableRow
                    key={c.id}
                    label={`Open details for ${c.name}`}
                    onActivate={() => setSelected(c)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar
                          alt={c.name}
                          src={c.avatar}
                          role="customer"
                          className="h-10 w-10 rounded-full"
                        />
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-ink-secondary">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-secondary">{c.district}, {c.parish}</td>
                    <td className="px-6 py-4 text-sm tabular-nums">{c.jobsCompleted}/{c.jobsPosted}</td>
                    <td className="px-6 py-4 text-sm tabular-nums">{formatUgx(c.totalSpent)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge label={c.status} tone={c.status === 'active' ? 'success' : 'danger'} />
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant={c.status === 'active' ? 'outline' : 'primary'}
                        disabled={acting}
                        onClick={() => void toggleSuspend(c.id, c.status === 'active')}
                      >
                        {c.status === 'active' ? 'Suspend' : 'Reinstate'}
                      </Button>
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </DataTable>
          </Surface>

          <Surface className="p-6">
            {selected ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <ProfileAvatar
                    alt={selected.name}
                    src={selected.avatar}
                    role="customer"
                    className="h-10 w-10 rounded-full"
                  />
                  <div>
                    <h3 className="font-semibold text-lg">{selected.name}</h3>
                    <p className="text-sm text-ink-muted">{selected.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <p className="text-ink-muted text-xs uppercase tracking-wider">Joined</p>
                    <p className="font-medium mt-1">{selected.joinedAt || '—'}</p>
                  </div>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <p className="text-ink-muted text-xs uppercase tracking-wider">Last job</p>
                    <p className="font-medium mt-1">{selected.lastJobAt || '—'}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-3">Job history</h4>
                  <div className="space-y-2">
                    {historyLoading ? (
                      <p className="text-sm text-ink-muted">Loading jobs…</p>
                    ) : history.length ? (
                      history.map((j) => (
                        <Link
                          key={j.id}
                          to={`/admin/jobs?q=${encodeURIComponent(j.id)}`}
                          className="flex justify-between gap-2 border border-border rounded-lg p-3 text-sm transition hover:border-primary/40 hover:bg-surface-alt"
                        >
                          <div>
                            <p className="font-medium">{j.title}</p>
                            <p className="text-xs text-ink-muted">{j.id} · {j.category}</p>
                          </div>
                          <StatusBadge
                            label={j.status.replace(/_/g, ' ')}
                            tone={j.status === 'completed' ? 'success' : j.status === 'disputed' ? 'danger' : 'neutral'}
                          />
                        </Link>
                      ))
                    ) : (
                      <p className="text-sm text-ink-muted">No jobs for this customer yet.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/admin/jobs?q=${encodeURIComponent(selected.name)}`}
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                  >
                    All jobs
                  </Link>
                  <Link
                    to="/admin/payments"
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                  >
                    Payments
                  </Link>
                  <Link
                    to="/admin/audit"
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                  >
                    Audit
                  </Link>
                  <Link
                    to="/admin/reports"
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                  >
                    Reports
                  </Link>
                </div>
                <Button
                  className="w-full"
                  variant={selected.status === 'active' ? 'danger' : 'primary'}
                  disabled={acting}
                  onClick={() => void toggleSuspend(selected.id, selected.status === 'active')}
                >
                  {selected.status === 'active' ? 'Suspend user' : 'Reinstate user'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Icon name="person_search" className="!text-[36px] text-ink-muted" />
                <p className="text-sm font-medium text-ink-primary">Select a customer</p>
                <p className="text-sm text-ink-muted">Open a row to view profile, jobs, and account actions.</p>
              </div>
            )}
          </Surface>
        </div>
        )}
      </AsyncStateView>
    </div>
  )
}
