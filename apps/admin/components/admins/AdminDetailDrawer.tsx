import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import { cn, safeArray } from '@fixnow/utils'
import { Avatar, Button, Icon, StatusBadge } from '../ui'
import { AdminActionsMenu } from './AdminActionsMenu'
import type { AdminAction, AdminDetailTab } from './adminMenu'
import {
  ADMIN_STATUS,
  describeUserAgent,
  deviceIcon,
  formatDateTime,
  generateTemporaryPassword,
  humanize,
  permissionLabel,
  relativeTime,
  roleLabel,
  statusMeta,
  summarizeDevices,
  toLoginEvents,
  type AdminOperator,
  type AdminPermissionOption,
  type AdminRoleOption,
  type LoginEvent,
} from './adminHelpers'

const TABS: Array<{ key: AdminDetailTab; label: string; icon: string }> = [
  { key: 'profile', label: 'Profile', icon: 'badge' },
  { key: 'permissions', label: 'Permissions', icon: 'shield_person' },
  { key: 'history', label: 'Login history', icon: 'history' },
  { key: 'devices', label: 'Devices', icon: 'devices' },
  { key: 'sessions', label: 'Sessions', icon: 'sensors' },
  { key: 'recovery', label: 'Recovery', icon: 'key' },
  { key: 'audit', label: 'Audit trail', icon: 'receipt_long' },
]

const HISTORY_TABS: AdminDetailTab[] = ['history', 'devices', 'sessions']

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[128px_1fr] items-start gap-3 border-b border-border py-3 last:border-b-0">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink-primary">{value || '—'}</dd>
    </div>
  )
}

function TabEmpty({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-ink-muted">
        <Icon name={icon} />
      </span>
      <p className="text-sm font-semibold text-ink-primary">{title}</p>
      <p className="max-w-[38ch] text-[13px] text-ink-secondary">{hint}</p>
    </div>
  )
}

function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
      <Icon name="info" className="!text-[16px] shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  )
}

export function AdminDetailDrawer({
  admin,
  open,
  tab,
  onTabChange,
  onClose,
  roles,
  permissions,
  currentUserId,
  onAction,
  onMutated,
}: {
  admin: AdminOperator | null
  open: boolean
  tab: AdminDetailTab
  onTabChange: (tab: AdminDetailTab) => void
  onClose: () => void
  roles: AdminRoleOption[]
  permissions: AdminPermissionOption[]
  currentUserId: string | null
  onAction: (admin: AdminOperator, action: AdminAction) => void
  onMutated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const isSelf = Boolean(currentUserId) && admin?.userId === currentUserId
  const status = statusMeta(admin?.status ?? '')

  useEffect(() => {
    setError(null)
    setNotice(null)
    setTempPassword(null)
  }, [admin?.id])

  const historyQuery = useAsync(
    async () => {
      if (!admin) return [] as LoginEvent[]
      const res = await adminApi.adminLoginHistory(admin.id)
      return toLoginEvents(res.data.items)
    },
    [admin?.id],
    { enabled: open && Boolean(admin) && HISTORY_TABS.includes(tab) },
  )

  const auditQuery = useAsync(
    async () => {
      if (!admin) return []
      const res = await adminApi.auditLogs({ actorId: admin.userId, limit: 25 })
      return res.data.items ?? []
    },
    [admin?.userId],
    { enabled: open && Boolean(admin) && tab === 'audit' },
  )

  const events = useMemo(() => safeArray(historyQuery.data), [historyQuery.data])
  const devices = useMemo(() => summarizeDevices(events), [events])
  const successfulLogins = useMemo(() => events.filter((e) => e.success), [events])
  const failedLogins = useMemo(() => events.filter((e) => !e.success), [events])

  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const key of admin?.permissions ?? []) {
      const module = permissions.find((p) => p.key === key)?.module ?? 'Other'
      groups.set(module, [...(groups.get(module) ?? []), key])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [admin?.permissions, permissions])

  const roleDetail = roles.find((r) => r.key === admin?.role)

  async function runAction(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(label)
      onMutated()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    if (!admin) return
    const confirmed = window.confirm(
      `Reset the password for ${admin.email}? Their current password stops working immediately.`,
    )
    if (!confirmed) return
    const next = generateTemporaryPassword()
    await runAction('Password reset. Share the one-time password securely.', async () => {
      await adminApi.resetPassword(admin.userId, next)
      setTempPassword(next)
    })
  }

  async function forceSignOut() {
    if (!admin) return
    const confirmed = window.confirm(
      `Sign ${admin.email} out of every device? Any active Command Center session ends immediately.`,
    )
    if (!confirmed) return
    await runAction('All sessions revoked.', () => adminApi.forceLogout(admin.userId))
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + TABS.length) % TABS.length
    onTabChange(TABS[next].key)
    tabRefs.current[next]?.focus()
  }

  if (!admin) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={admin.fullName || 'Administrator'}
      description={admin.email}
      placement="end"
      panelClassName="!max-w-[560px] !overflow-hidden"
      bodyClassName="min-h-0"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close administrator details"
        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Icon name="close" />
      </button>

      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-3">
          <Avatar name={admin.fullName} email={admin.email} size="lg" />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge label={status.label} tone={status.tone} icon={status.icon} />
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
              <Icon name="shield_person" className="!text-[13px]" />
              {roleLabel(admin.role, roles)}
            </span>
            {isSelf ? (
              <span className="text-[11px] font-medium text-ink-muted">This is your account</span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-y border-border bg-canvas">
          <div
            role="tablist"
            aria-label="Administrator details sections"
            className="flex gap-1 overflow-x-auto px-4 py-2"
          >
            {TABS.map((entry, index) => {
              const selected = entry.key === tab
              return (
                <button
                  key={entry.key}
                  ref={(node) => {
                    tabRefs.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  id={`admin-tab-${entry.key}`}
                  aria-selected={selected}
                  aria-controls={`admin-panel-${entry.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onTabChange(entry.key)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'text-ink-secondary hover:bg-surface-alt hover:text-ink-primary',
                  )}
                >
                  <Icon name={entry.icon} className="!text-[17px]" />
                  {entry.label}
                </button>
              )
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          id={`admin-panel-${tab}`}
          aria-labelledby={`admin-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {error ? (
            <p role="alert" className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5 text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[13px] text-ink-primary">
              {notice}
            </p>
          ) : null}

          {tab === 'profile' ? (
            <dl>
              <Row label="Full name" value={admin.fullName} />
              <Row label="Email" value={admin.email} />
              <Row label="Phone" value={admin.phone} />
              <Row label="Department" value={admin.department} />
              <Row label="Role" value={roleLabel(admin.role, roles)} />
              <Row
                label="Status"
                value={<StatusBadge label={status.label} tone={status.tone} icon={status.icon} />}
              />
              <Row
                label="MFA"
                value={
                  admin.mfaEnabled ? (
                    <StatusBadge label="Enabled" tone="success" icon="verified_user" />
                  ) : (
                    <StatusBadge label="Not enabled" tone="warning" icon="gpp_maybe" />
                  )
                }
              />
              <Row label="Last login" value={`${relativeTime(admin.lastLoginAt)} · ${formatDateTime(admin.lastLoginAt)}`} />
              <Row label="Created" value={formatDateTime(admin.createdAt)} />
              <Row
                label="Identifiers"
                value={
                  <span className="block space-y-0.5 font-mono text-[11px] text-ink-secondary">
                    <span className="block">admin {admin.id}</span>
                    <span className="block">user {admin.userId}</span>
                  </span>
                }
              />
            </dl>
          ) : null}

          {tab === 'permissions' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-ink-primary">{roleLabel(admin.role, roles)}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                  {roleDetail?.description ?? 'Role description is not available from the catalogue.'}
                </p>
              </div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                Effective permissions ({admin.permissions.length})
              </p>
              {permissionsByModule.length ? (
                <div className="space-y-4">
                  {permissionsByModule.map(([module, keys]) => (
                    <div key={module}>
                      <p className="mb-2 text-[13px] font-semibold text-ink-primary">{humanize(module)}</p>
                      <ul className="space-y-1.5">
                        {keys.map((key) => (
                          <li
                            key={key}
                            className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-[13px]"
                          >
                            <Icon name="check" className="!text-[16px] mt-0.5 text-secondary" />
                            <span className="min-w-0">
                              <span className="block text-ink-primary">
                                {permissionLabel(key, permissions)}
                              </span>
                              <span className="block font-mono text-[11px] text-ink-muted">{key}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <TabEmpty
                  icon="shield"
                  title="No explicit permissions"
                  hint="This operator inherits access from their role only."
                />
              )}
              <SectionNote>
                Permissions are read-only here. Change them by updating the operator’s role so the
                grant stays auditable.
              </SectionNote>
            </div>
          ) : null}

          {tab === 'history' ? (
            <AsyncStateView
              status={historyQuery.status}
              error={historyQuery.error}
              onRetry={() => void historyQuery.reload()}
              emptyTitle="No sign-in attempts"
              emptyHint="Login attempts appear here once this operator signs in."
            >
              {events.length ? (
                <ol className="space-y-2">
                  {events.map((event) => (
                    <li key={event.id} className="rounded-lg border border-border px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <StatusBadge
                          label={event.success ? 'Success' : 'Failed'}
                          tone={event.success ? 'success' : 'danger'}
                          icon={event.success ? 'login' : 'error'}
                        />
                        <span className="text-[12px] tabular-nums text-ink-muted">
                          {relativeTime(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink-secondary">
                        {formatDateTime(event.createdAt)}
                        {event.ip ? ` · ${event.ip}` : ''}
                      </p>
                      {event.reason ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">{humanize(event.reason)}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <TabEmpty
                  icon="history"
                  title="No sign-in attempts"
                  hint="Login attempts appear here once this operator signs in."
                />
              )}
            </AsyncStateView>
          ) : null}

          {tab === 'devices' ? (
            <AsyncStateView
              status={historyQuery.status}
              error={historyQuery.error}
              onRetry={() => void historyQuery.reload()}
            >
              {devices.length ? (
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div key={device.key} className="flex gap-3 rounded-xl border border-border p-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-ink-secondary">
                        <Icon name={deviceIcon(device.device)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-primary">
                          {device.platform} · {device.browser}
                        </p>
                        <p className="text-[12px] text-ink-muted">
                          {device.device} · last seen {relativeTime(device.lastSeenAt)}
                        </p>
                        <p className="mt-1 text-[12px] text-ink-secondary">
                          {device.signIns} sign-in{device.signIns === 1 ? '' : 's'}
                          {device.failures ? ` · ${device.failures} failed` : ''}
                          {device.ips.length ? ` · ${device.ips.slice(0, 2).join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  <SectionNote>
                    Devices are reconstructed from sign-in records, so they reflect where this
                    operator has authenticated rather than a live device registry.
                  </SectionNote>
                </div>
              ) : (
                <TabEmpty
                  icon="devices"
                  title="No devices recorded"
                  hint="Devices appear after this operator signs in at least once."
                />
              )}
            </AsyncStateView>
          ) : null}

          {tab === 'sessions' ? (
            <AsyncStateView
              status={historyQuery.status}
              error={historyQuery.error}
              onRetry={() => void historyQuery.reload()}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                      Last sign-in
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink-primary">
                      {relativeTime(successfulLogins[0]?.createdAt ?? admin.lastLoginAt)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                      Recent sign-ins
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-ink-primary">
                      {successfulLogins.length}
                      {failedLogins.length ? (
                        <span className="ml-2 text-[12px] font-medium text-error">
                          {failedLogins.length} failed
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>

                {successfulLogins.length ? (
                  <ol className="space-y-2">
                    {successfulLogins.slice(0, 8).map((event) => {
                      const { platform, browser } = describeUserAgent(event.userAgent)
                      return (
                        <li key={event.id} className="rounded-lg border border-border px-3 py-2.5">
                          <p className="text-[13px] font-medium text-ink-primary">
                            {platform} · {browser}
                          </p>
                          <p className="text-[12px] text-ink-muted">
                            {formatDateTime(event.createdAt)}
                            {event.ip ? ` · ${event.ip}` : ''}
                          </p>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <TabEmpty
                    icon="sensors"
                    title="No sessions on record"
                    hint="Session activity appears after this operator signs in."
                  />
                )}

                <Button
                  variant="danger"
                  className="w-full"
                  disabled={busy || isSelf}
                  onClick={() => void forceSignOut()}
                >
                  <Icon name="logout" className="!text-[18px]" />
                  Revoke all sessions
                </Button>
                <SectionNote>
                  {isSelf
                    ? 'You cannot revoke your own sessions from this screen.'
                    : 'Revoking sessions invalidates every refresh token for this operator. Individual session records are not exposed by the API, so the list above is derived from sign-in events.'}
                </SectionNote>
              </div>
            </AsyncStateView>
          ) : null}

          {tab === 'recovery' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-ink-primary">Multi-factor authentication</p>
                <p className="mt-1 text-[13px] text-ink-secondary">
                  {admin.mfaEnabled
                    ? 'MFA is enabled for this operator.'
                    : 'MFA is not enabled for this operator.'}
                </p>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-ink-primary">Reset password</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                  Generates a one-time password and revokes existing sessions. Share it over a
                  trusted channel and ask the operator to change it after signing in.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void resetPassword()}
                >
                  <Icon name="key" className="!text-[18px]" />
                  Generate one-time password
                </Button>
                {tempPassword ? (
                  <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                      One-time password — shown once
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink-primary">
                        {tempPassword}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void navigator.clipboard?.writeText(tempPassword)}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-ink-primary">Recovery codes</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                  Recovery codes are self-service — each administrator generates their own set, and
                  Super Administrator recovery runs through the approval workflow. They cannot be
                  issued on someone else’s behalf.
                </p>
              </div>

              <SectionNote>
                Every action on this tab is written to the audit log with critical severity.
              </SectionNote>
            </div>
          ) : null}

          {tab === 'audit' ? (
            <AsyncStateView
              status={auditQuery.status}
              error={auditQuery.error}
              onRetry={() => void auditQuery.reload()}
              emptyTitle="No audit entries"
              emptyHint="Actions taken by this administrator will appear here."
            >
              {safeArray(auditQuery.data).length ? (
                <div className="space-y-3">
                  <ol className="space-y-2">
                    {safeArray(auditQuery.data).map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-border px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 text-[13px] font-medium text-ink-primary">
                            {humanize(entry.action)}
                          </p>
                          <StatusBadge
                            label={entry.severity}
                            tone={
                              entry.severity === 'critical'
                                ? 'danger'
                                : entry.severity === 'warning'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          />
                        </div>
                        <p className="mt-1 text-[12px] text-ink-muted">
                          {entry.resourceType}
                          {entry.resourceId ? ` · ${entry.resourceId}` : ''}
                        </p>
                        <p className="text-[12px] text-ink-secondary">
                          {formatDateTime(entry.createdAt)}
                          {entry.ip ? ` · ${entry.ip}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <SectionNote>Showing actions performed by this administrator.</SectionNote>
                </div>
              ) : (
                <TabEmpty
                  icon="receipt_long"
                  title="No audit entries"
                  hint="Actions taken by this administrator will appear here."
                />
              )}
            </AsyncStateView>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          {admin.status === ADMIN_STATUS.active ? null : (
            <Button
              className="flex-1"
              disabled={busy || isSelf}
              onClick={() => onAction(admin, { type: 'status', status: ADMIN_STATUS.active })}
            >
              <Icon name="check_circle" className="!text-[18px]" />
              Activate
            </Button>
          )}
          <AdminActionsMenu
            admin={admin}
            isSelf={isSelf}
            disabled={busy}
            onAction={(action) => onAction(admin, action)}
          />
        </div>
      </div>
    </Dialog>
  )
}
