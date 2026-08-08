import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import {
  adminApi,
  freeLimitLabel,
  getFriendlyErrorMessage,
  mapAdminTechnician,
} from '@fixnow/api/admin'
import type { AdminTechnician, LockStatus } from '@fixnow/types/admin'
import { safeArray } from '@fixnow/utils'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'
import { ProfileAvatar } from '@fixnow/ui'

type FilterKey = 'all' | LockStatus

function lockTone(s: LockStatus) {
  if (s === 'locked' || s === 'suspended') return 'danger' as const
  if (s === 'unlock_requested') return 'warning' as const
  return 'success' as const
}

export function LocksPage() {
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<AdminTechnician | null>(null)
  const [lockReason, setLockReason] = useState('')

  const { data: techs = [], status, error, reload } = useAsync(async () => {
    const res = await adminApi.listTechnicians({ locked: 'true', limit: 100 })
    return safeArray(res.data?.items).map(mapAdminTechnician)
  }, [])

  const audit = useAsync(async () => {
    const res = await adminApi.auditLogs({
      action: undefined,
      limit: 40,
    })
    return safeArray(res.data?.items).filter((row) =>
      /lock|unlock|suspend/i.test(String(row.action || '')),
    )
  }, [])

  useRealtimeReload(() => {
    void reload()
    void audit.reload()
  }, [
    SOCKET_EVENTS.TECHNICIAN_LOCKED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
    SOCKET_EVENTS.TRUST_SCORE_UPDATED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
  ])

  const safeTechs = safeArray(techs)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return safeTechs.filter((t) => {
      if (filter !== 'all' && t.lockStatus !== filter) return false
      if (!needle) return true
      return (
        t.name.toLowerCase().includes(needle) ||
        t.email.toLowerCase().includes(needle) ||
        t.trade.toLowerCase().includes(needle) ||
        (t.lockReason?.toLowerCase().includes(needle) ?? false)
      )
    })
  }, [safeTechs, filter, q])

  const stats = useMemo(() => {
    const locked = safeTechs.filter((t) => t.lockStatus === 'locked').length
    const unlockRequests = safeTechs.filter((t) => t.lockStatus === 'unlock_requested').length
    const suspended = safeTechs.filter((t) => t.lockStatus === 'suspended').length
    const freeJobLocks = safeTechs.filter((t) =>
      /free job/i.test(t.lockReason || ''),
    ).length
    return { locked, unlockRequests, suspended, freeJobLocks, total: safeTechs.length }
  }, [safeTechs])

  async function run(fn: () => Promise<unknown>) {
    setActionError(null)
    setActing(true)
    try {
      await fn()
      await reload()
      await audit.reload()
      setSelected(null)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Lock Management"
        subtitle="Temporarily or permanently restrict marketplace accounts, review unlock requests and maintain security audit history."
      />

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(
          [
            { key: 'locked' as FilterKey, label: 'Currently locked', value: stats.locked },
            { key: 'unlock_requested' as FilterKey, label: 'Unlock requests', value: stats.unlockRequests },
            { key: 'suspended' as FilterKey, label: 'Permanent bans', value: stats.suspended },
            { key: 'all' as FilterKey, label: 'Free-job locks', value: stats.freeJobLocks },
          ] as const
        ).map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setFilter(card.key)}
            className={`rounded-2xl border bg-canvas p-4 text-left transition hover:border-primary/30 ${
              filter === card.key ? 'border-primary ring-1 ring-primary/20' : 'border-border'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
          </button>
        ))}
      </div>

      <Surface className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Search</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, trade, reason…"
            aria-label="Search locked accounts"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Filter</span>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
          >
            <option value="all">All restricted</option>
            <option value="locked">Temporary locks</option>
            <option value="unlock_requested">Unlock requests</option>
            <option value="suspended">Permanent bans</option>
          </select>
        </label>
      </Surface>

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold">Restricted accounts</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Lock, unlock, and review reasons for marketplace access control.
                </p>
              </div>
              <StatusBadge label={`${filtered.length} shown`} tone="neutral" />
            </div>

            {filtered.length === 0 ? (
              <div className="space-y-3 p-10 text-center">
                <Icon name="lock_open" className="!text-[40px] text-ink-muted" />
                <p className="text-sm font-semibold text-ink-primary">No restricted accounts in this view</p>
                <p className="mx-auto max-w-md text-sm text-ink-muted">
                  Lock Management lets administrators temporarily lock technicians, suspend accounts,
                  review unlock requests, record reasons, and audit who performed each action. When a
                  technician exhausts free jobs or violates policy, they appear here.
                </p>
                <Link
                  to="/admin/technicians"
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-alt"
                >
                  Browse workforce to lock an account
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((t) => (
                  <li key={t.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setSelected(t)}
                    >
                      <ProfileAvatar
                        alt={t.name}
                        src={t.profileImageUrl || t.avatar}
                        role="technician"
                        className="h-11 w-11 rounded-full"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{t.name}</span>
                          <StatusBadge label={t.lockStatus.replace(/_/g, ' ')} tone={lockTone(t.lockStatus)} />
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {t.lockReason || 'No reason recorded'} · Free {t.freeJobsUsed}/
                          {freeLimitLabel(t.freeLimit)}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={acting} onClick={() => void run(() => adminApi.unlockTechnician(t.id))}>
                        <Icon name="lock_open" className="!text-[16px]" /> Unlock
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelected(t)}>
                        View
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface className="overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Lock history</h2>
              <p className="mt-1 text-sm text-ink-muted">Administrator actions from the audit trail</p>
            </div>
            <AsyncStateView status={audit.status} error={audit.error} onRetry={() => void audit.reload()}>
              {safeArray(audit.data).length ? (
                <ul className="divide-y divide-border">
                  {safeArray(audit.data).slice(0, 20).map((row) => (
                    <li key={row.id} className="px-5 py-3 text-sm">
                      <p className="font-medium text-ink-primary">{row.action}</p>
                      <p className="text-xs text-ink-muted">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                        {row.actorId ? ` · admin ${String(row.actorId).slice(-6)}` : ''}
                        {row.resourceId ? ` · target ${String(row.resourceId).slice(-6)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-8 text-center text-sm text-ink-muted">
                  Lock and unlock events will appear here as administrators take action.
                </p>
              )}
            </AsyncStateView>
            <div className="border-t border-border p-4">
              <Link to="/admin/audit" className="text-sm font-semibold text-primary hover:underline">
                Export / open full audit trail
              </Link>
            </div>
          </Surface>
        </div>
      </AsyncStateView>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Account restriction"
        description={selected?.name}
        placement="end"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                alt={selected.name}
                src={selected.profileImageUrl || selected.avatar}
                role="technician"
                className="h-14 w-14 rounded-2xl"
              />
              <div>
                <p className="font-semibold">{selected.name}</p>
                <StatusBadge label={selected.lockStatus.replace(/_/g, ' ')} tone={lockTone(selected.lockStatus)} />
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Reason</dt>
                <dd>{selected.lockReason || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Unlock request</dt>
                <dd>
                  {selected.unlockRequestedAt
                    ? new Date(selected.unlockRequestedAt).toLocaleString()
                    : 'None'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink-muted">Request note</dt>
                <dd>{selected.unlockRequestNote || '—'}</dd>
              </div>
            </dl>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Lock / suspend reason</span>
              <input
                className="rounded-lg border border-border px-3 py-2"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Reason recorded in audit history"
              />
            </label>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button disabled={acting} onClick={() => void run(() => adminApi.unlockTechnician(selected.id))}>
                Unlock
              </Button>
              <Button
                variant="outline"
                disabled={acting}
                onClick={() =>
                  void run(() => adminApi.lockTechnician(selected.id, lockReason || 'Locked by admin'))
                }
              >
                Lock
              </Button>
              <Button
                variant="outline"
                disabled={acting}
                onClick={() =>
                  void run(() => adminApi.suspendTechnician(selected.id, lockReason || 'Suspended by admin'))
                }
              >
                Permanent ban
              </Button>
              <Link
                to={`/admin/technicians?q=${encodeURIComponent(selected.name)}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium"
              >
                View profile
              </Link>
              <Link
                to={`/admin/jobs?q=${encodeURIComponent(selected.name)}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium"
              >
                View jobs
              </Link>
              <Link
                to="/admin/payments"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium"
              >
                View payments
              </Link>
              <Link
                to={`/admin/verification?q=${encodeURIComponent(selected.name)}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium"
              >
                View verification
              </Link>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
