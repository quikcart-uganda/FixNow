import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAsync, useDebouncedValue, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, Dialog, FormError } from '@fixnow/shared'
import {
  adminApi,
  freeLimitLabel,
  getFriendlyErrorMessage,
  mapAdminTechnician,
} from '@fixnow/api/admin'
import type { AdminTechnician, LockStatus, VerificationStatus } from '@fixnow/types/admin'
import { safeArray } from '@fixnow/utils'
import { ProfileAvatar } from '@fixnow/ui'
import {
  Button,
  Icon,
  KpiCard,
  LevelBadge,
  PageHeader,
  StatusBadge,
  Surface,
  Toggle,
} from '../components/ui'
import { TechnicianDirectory } from '../components/technicians/TechnicianDirectory'
import type { TechnicianAction } from '../components/technicians/technicianMenu'
import {
  lockLabel,
  lockTone,
  profilePhotoSrc,
} from '../components/technicians/technicianHelpers'

type AccessFilter = 'all' | 'active' | 'locked'
type VerificationFilter = 'all' | VerificationStatus

const PAGE_SIZE = 24

function exportTechnician(technician: AdminTechnician) {
  const payload = {
    id: technician.id,
    name: technician.name,
    email: technician.email,
    phone: technician.phone,
    trade: technician.trade,
    categoryName: technician.categoryName,
    district: technician.district,
    parish: technician.parish,
    rating: technician.rating,
    trustScore: technician.scores.trust,
    completedJobs: technician.completedJobs,
    openJobs: technician.openJobs,
    successRate: technician.successRate,
    verification: technician.verification,
    lockStatus: technician.lockStatus,
    availableNow: technician.availableNow,
    subscriptionPlanCode: technician.subscriptionPlanCode,
    remainingFreeJobs: technician.remainingFreeJobs,
    level: technician.level,
    lastActive: technician.lastActive,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `technician-${technician.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function TechniciansPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [page, setPage] = useState(() => Math.max(1, Number(params.get('page')) || 1))
  const [accessFilter, setAccessFilter] = useState<AccessFilter>(() => {
    if (params.get('locked') === 'true') return 'locked'
    if (params.get('access') === 'active' || params.get('access') === 'locked') {
      return params.get('access') as AccessFilter
    }
    return 'all'
  })
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>(() => {
    const v = params.get('verification')
    if (v === 'pending' || v === 'verified' || v === 'rejected' || v === 'unverified') return v
    return 'all'
  })
  const [selected, setSelected] = useState<AdminTechnician | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const { data, status, error, reload } = useAsync(async () => {
    const res = await adminApi.listTechnicians({
      q: debouncedQuery.trim() || undefined,
      locked: accessFilter === 'locked' ? 'true' : undefined,
      page,
      limit: PAGE_SIZE,
    })
    return {
      items: safeArray(res.data?.items).map(mapAdminTechnician),
      meta: res.data?.meta as
        | { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
        | undefined,
    }
  }, [debouncedQuery, page, accessFilter])

  // Snapshot for KPI totals (first page of active directory, capped).
  const summaryQuery = useAsync(async () => {
    const res = await adminApi.listTechnicians({ limit: 100 })
    return safeArray(res.data?.items).map(mapAdminTechnician)
  }, [])

  useRealtimeReload(() => {
    void reload()
    void summaryQuery.reload()
  }, [
    SOCKET_EVENTS.TECHNICIAN_LOCKED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
    SOCKET_EVENTS.TRUST_SCORE_UPDATED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
    SOCKET_EVENTS.AVAILABILITY_CHANGED,
  ])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('q', query.trim())
    if (accessFilter === 'locked') next.set('locked', 'true')
    else if (accessFilter === 'active') next.set('access', 'active')
    if (verificationFilter !== 'all') next.set('verification', verificationFilter)
    if (page > 1) next.set('page', String(page))
    setParams(next, { replace: true })
  }, [debouncedQuery, accessFilter, verificationFilter, query, page, setParams])

  const didMountFilters = useRef(false)
  useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true
      return
    }
    setPage(1)
  }, [debouncedQuery, accessFilter, verificationFilter])

  const filtered = useMemo(() => {
    const list = safeArray(data?.items)
    const q = query.toLowerCase()
    return list.filter((t) => {
      if (accessFilter === 'active' && t.lockStatus !== 'active') return false
      if (verificationFilter !== 'all' && t.verification !== verificationFilter) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.trade.toLowerCase().includes(q) ||
        (t.categoryName ?? '').toLowerCase().includes(q) ||
        t.district.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.phone.includes(q)
      )
    })
  }, [query, data?.items, accessFilter, verificationFilter])

  const refreshSelected = useCallback(
    async (id: string) => {
      const updated = (await adminApi.listTechnicians({ q: id, limit: 100 })).data.items?.map(
        mapAdminTechnician,
      )
      const next = updated?.find((t) => t.id === id)
      if (next) setSelected(next)
    },
    [],
  )

  async function runAction(fn: () => Promise<unknown>, technicianId?: string) {
    setActionError(null)
    setActing(true)
    try {
      await fn()
      await Promise.all([reload(), summaryQuery.reload()])
      const id = technicianId ?? selected?.id
      if (id) await refreshSelected(id)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  async function handleAction(technician: AdminTechnician, action: TechnicianAction) {
    switch (action.type) {
      case 'view':
        setSelected(technician)
        return
      case 'jobs':
        navigate(`/admin/jobs?q=${encodeURIComponent(technician.name)}`)
        return
      case 'tracking':
        navigate(`/admin/tracking?q=${encodeURIComponent(technician.id)}`)
        return
      case 'suspend':
        if (!window.confirm(`Suspend ${technician.name}? They lose marketplace access until reactivated.`)) {
          return
        }
        await runAction(() => adminApi.suspendTechnician(technician.id), technician.id)
        return
      case 'activate':
        await runAction(() => adminApi.unlockTechnician(technician.id), technician.id)
        return
      case 'disable':
        if (!window.confirm(`Disable marketplace access for ${technician.name}?`)) return
        await runAction(
          () => adminApi.lockTechnician(technician.id, 'Disabled by admin'),
          technician.id,
        )
        return
      case 'verify':
        await runAction(
          () => adminApi.updateTechnician(technician.id, { verificationStatus: 'approved' }),
          technician.id,
        )
        return
      case 'verify-business':
        await runAction(
          () =>
            adminApi.updateTechnician(technician.id, {
              businessVerificationStatus: 'verified',
              businessVerificationNote: 'Verified by admin',
            }),
          technician.id,
        )
        return
      case 'reject-business':
        await runAction(
          () =>
            adminApi.updateTechnician(technician.id, {
              businessVerificationStatus: 'rejected',
              businessVerificationNote: 'Rejected by admin — update company documents and resubmit',
            }),
          technician.id,
        )
        return
      case 'reset-password': {
        const password = window.prompt(`Enter a temporary password for ${technician.name}`)
        if (!password?.trim()) return
        await runAction(() => adminApi.resetPassword(technician.id, password.trim()), technician.id)
        return
      }
      case 'admin-note':
        setSelected(technician)
        setAdminNote(technician.lockReason ?? '')
        setNoteOpen(true)
        return
      case 'audit':
        navigate(`/admin/audit?q=${encodeURIComponent(technician.name)}`)
        return
      case 'notify':
        navigate(`/admin/notifications?q=${encodeURIComponent(technician.name)}`)
        return
      case 'export':
        exportTechnician(technician)
        return
      case 'delete':
        if (
          !window.confirm(
            `Delete ${technician.name}? This suspends the account and removes marketplace access.`,
          )
        ) {
          return
        }
        await runAction(() => adminApi.suspendTechnician(technician.id, 'Deleted by admin'), technician.id)
        return
      case 'trust':
        navigate(`/admin/trust?q=${encodeURIComponent(technician.name)}`)
        return
      default:
        return
    }
  }

  async function saveAdminNote() {
    if (!selected) return
    const note = adminNote.trim()
    if (!note) {
      setActionError('Admin note cannot be empty.')
      return
    }
    if (
      selected.lockStatus === 'active' &&
      !window.confirm(
        `Saving this note will lock marketplace access for ${selected.name} with the note as the lock reason. Continue?`,
      )
    ) {
      return
    }
    setNoteOpen(false)
    await runAction(() => adminApi.lockTechnician(selected.id, note), selected.id)
  }

  const summaryRows = safeArray(summaryQuery.data)
  const activeCount = summaryRows.filter((t) => t.lockStatus === 'active').length
  const pendingVerification = summaryRows.filter((t) => t.verification === 'pending').length
  const lockedCount = summaryRows.filter((t) => t.lockStatus !== 'active').length
  const avgTrust = summaryRows.length
    ? Math.round(summaryRows.reduce((sum, t) => sum + t.scores.trust, 0) / summaryRows.length)
    : 0

  const meta = data?.meta
  const totalShown = filtered.length
  const totalDirectory = meta?.total ?? totalShown
  const totalPages = meta?.totalPages ?? 1

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
          <li className="font-semibold text-ink-primary">Technicians</li>
          {selected ? (
            <>
              <li aria-hidden="true">/</li>
              <li>{selected.name}</li>
            </>
          ) : null}
        </ol>
      </nav>

      <PageHeader
        title="Technician Management"
        subtitle="Workforce reputation, trust, verification, free-job limits, and compliance — open any card for full details."
        actions={
          <div className="relative w-full sm:w-72">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline !text-[18px]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, trade, district…"
              aria-label="Search technicians"
              className="w-full min-h-11 rounded-lg border border-border bg-canvas py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        }
      />

      {actionError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {actionError}
        </FormError>
      ) : null}

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Active Technicians"
              value={activeCount}
              icon="groups"
              onClick={() => {
                setAccessFilter('active')
                setPage(1)
              }}
            />
            <KpiCard
              label="Avg. Trust Score"
              value={avgTrust}
              icon="verified"
              accent="secondary"
              to="/admin/trust"
            />
            <KpiCard
              label="Verification Pending"
              value={pendingVerification}
              icon="hourglass_top"
              accent="tertiary"
              trendLabel="High priority"
              onClick={() => {
                setVerificationFilter('pending')
                setAccessFilter('all')
                setPage(1)
              }}
            />
            <KpiCard
              label="Locked / Suspended"
              value={lockedCount}
              icon="lock"
              accent="danger"
              to="/admin/locks"
            />
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter technicians">
            {(['all', 'active', 'locked'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={accessFilter === s}
                onClick={() => {
                  setAccessFilter(s)
                  setPage(1)
                }}
                className={`min-h-11 shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                  accessFilter === s
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-canvas text-ink-secondary hover:bg-surface-alt'
                }`}
              >
                {s === 'all' ? 'All access' : s}
              </button>
            ))}
            {(['all', 'pending', 'verified', 'rejected'] as const).map((s) => (
              <button
                key={`v-${s}`}
                type="button"
                role="tab"
                aria-selected={verificationFilter === s}
                onClick={() => {
                  setVerificationFilter(s)
                  setPage(1)
                }}
                className={`min-h-11 shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                  verificationFilter === s
                    ? 'border-secondary bg-secondary text-white'
                    : 'border-border bg-canvas text-ink-secondary hover:bg-surface-alt'
                }`}
              >
                {s === 'all' ? 'All verification' : s}
              </button>
            ))}
          </div>

          {totalShown === 0 ? (
            <Surface className="flex flex-col items-center gap-3 p-12 text-center">
              <Icon name="engineering" className="!text-[40px] text-ink-muted" />
              <p className="text-sm font-medium text-ink-primary">No technicians match</p>
              <p className="max-w-sm text-sm text-ink-muted">
                Adjust search or filters, or invite technicians to join the marketplace.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setAccessFilter('all')
                  setVerificationFilter('all')
                  setPage(1)
                }}
              >
                Clear filters
              </Button>
            </Surface>
          ) : (
            <Surface className="overflow-hidden !p-0">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-alt/50 px-4 py-4 sm:px-6">
                <div>
                  <h2 className="text-xl font-semibold text-ink-primary">Workforce Directory</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Professional technician roster · page {meta?.page ?? page} of {totalPages}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-ink-muted">
                  {totalShown} shown
                  {totalDirectory > totalShown ? ` · ${totalDirectory} total` : ''}
                </p>
              </div>

              <TechnicianDirectory
                technicians={filtered}
                acting={acting}
                canDelete
                onOpen={setSelected}
                onAction={(technician, action) => void handleAction(technician, action)}
              />

              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 sm:px-6">
                  <p className="text-sm text-ink-muted">
                    Showing page {meta?.page ?? page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting || !(meta?.hasPrev ?? page > 1)}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting || !(meta?.hasNext ?? page < totalPages)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </Surface>
          )}
        </>
      </AsyncStateView>

      <Dialog
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setNoteOpen(false)
        }}
        title={selected?.name ?? 'Technician'}
        description={selected ? `${selected.trade} · ${selected.district}` : undefined}
        placement="end"
        panelClassName="!p-0"
      >
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border p-6">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  alt={selected.name}
                  src={profilePhotoSrc(selected)}
                  role="technician"
                  verified={selected.verification === 'verified'}
                  online={selected.availableNow}
                  className="h-16 w-16 rounded-full border border-border shadow-sm"
                />
                <div>
                  <nav aria-label="Detail breadcrumb" className="mb-1 text-[11px] text-ink-muted">
                    Dashboard / Technicians / {selected.name}
                  </nav>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <LevelBadge level={selected.level} />
                    <StatusBadge
                      label={lockLabel(selected.lockStatus as LockStatus)}
                      tone={lockTone(selected.lockStatus)}
                    />
                    <StatusBadge
                      label={selected.verification}
                      tone={selected.verification === 'verified' ? 'success' : 'warning'}
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="tap-target rounded-lg p-2 hover:bg-surface-alt"
                aria-label="Close technician details"
                data-autofocus
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Trust', v: selected.scores.trust },
                  { label: 'Reliability', v: selected.scores.reliability },
                  { label: 'Completion', v: selected.scores.completion },
                  { label: 'Response', v: selected.scores.response },
                  { label: 'Punctuality', v: selected.scores.punctuality },
                  { label: 'Open jobs', v: selected.openJobs },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-surface-alt/80 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                      {s.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{s.v}</p>
                  </div>
                ))}
              </div>

              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Contact</dt>
                  <dd className="font-medium text-ink-primary">
                    {selected.phone || selected.email || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Location</dt>
                  <dd className="font-medium text-ink-primary">
                    {selected.district}, {selected.parish}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Jobs completed</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{selected.completedJobs}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Success rate</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">
                    {selected.successRate == null ? '—' : `${selected.successRate}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Response time</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">
                    {selected.responseTimeMinutesAvg == null
                      ? '—'
                      : `${selected.responseTimeMinutesAvg} min avg`}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Subscription</dt>
                  <dd className="font-medium text-ink-primary">
                    {selected.subscriptionPlanCode || 'Free plan'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Joined</dt>
                  <dd className="font-medium text-ink-primary">{selected.joinedAt || '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Last active</dt>
                  <dd className="font-medium text-ink-primary">{selected.lastActive || '—'}</dd>
                </div>
              </dl>

              <div className="space-y-3 rounded-lg bg-surface-alt/80 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">Job credits</span>
                  <span className="font-semibold tabular-nums">
                    {selected.remainingFreeJobs} / {freeLimitLabel(selected.freeLimit)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(
                    100,
                    typeof selected.freeLimit === 'number' && selected.freeLimit > 0
                      ? Math.round((selected.remainingFreeJobs / Number(selected.freeLimit)) * 100)
                      : 0,
                  )}
                  aria-label="Job credits remaining"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(
                        100,
                        typeof selected.freeLimit === 'number' && selected.freeLimit > 0
                          ? (selected.remainingFreeJobs / Number(selected.freeLimit)) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {noteOpen ? (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <label htmlFor="admin-note" className="text-sm font-medium text-ink-primary">
                    Admin note
                  </label>
                  <textarea
                    id="admin-note"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    placeholder="Reason or compliance note…"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={acting} onClick={() => void saveAdminNote()}>
                      Save note
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Link
                  to={`/admin/trust?q=${encodeURIComponent(selected.name)}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Trust Centre
                </Link>
                <Link
                  to="/admin/verification"
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Verification
                </Link>
                <Link
                  to={`/admin/jobs?q=${encodeURIComponent(selected.name)}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Jobs
                </Link>
                <Link
                  to={`/admin/tracking?q=${encodeURIComponent(selected.id)}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Live Tracking
                </Link>
                <Link
                  to="/admin/free-jobs"
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Wallet / Free jobs
                </Link>
                <Link
                  to={`/admin/audit?q=${encodeURIComponent(selected.name)}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
                >
                  Audit
                </Link>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Admin actions
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={acting}
                    onClick={() => void handleAction(selected, { type: 'suspend' })}
                  >
                    Suspend
                  </Button>
                  <Button
                    variant="outline"
                    disabled={acting}
                    onClick={() => void handleAction(selected, { type: 'activate' })}
                  >
                    Activate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={acting}
                    onClick={() => void handleAction(selected, { type: 'admin-note' })}
                  >
                    Admin note
                  </Button>
                  <Button
                    disabled={acting}
                    onClick={() => void handleAction(selected, { type: 'verify' })}
                  >
                    Verify
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Marketplace access</p>
                  <p className="text-xs text-ink-secondary">Toggle job notifications</p>
                </div>
                <Toggle
                  checked={selected.lockStatus === 'active'}
                  disabled={acting}
                  onChange={(on) => {
                    void runAction(
                      () =>
                        on
                          ? adminApi.unlockTechnician(selected.id)
                          : adminApi.suspendTechnician(selected.id),
                      selected.id,
                    )
                  }}
                  label="Marketplace access"
                />
              </div>
            </div>
          </>
        ) : null}
      </Dialog>
    </div>
  )
}
