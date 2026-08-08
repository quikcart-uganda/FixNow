import { Avatar, Icon, StatusBadge } from '../ui'
import { AdminActionsMenu } from './AdminActionsMenu'
import type { AdminAction } from './adminMenu'
import {
  relativeTime,
  roleLabel,
  statusMeta,
  type AdminOperator,
  type AdminRoleOption,
} from './adminHelpers'

/**
 * Mobile/tablet representation of one administrator. The name button uses a
 * stretched overlay so the whole card is one large touch target, while the
 * overflow menu stays above it as a separate control.
 */
export function AdminCard({
  admin,
  roles,
  isSelf,
  onOpen,
  onAction,
}: {
  admin: AdminOperator
  roles: AdminRoleOption[]
  isSelf: boolean
  onOpen: () => void
  onAction: (action: AdminAction) => void
}) {
  const status = statusMeta(admin.status)

  return (
    <li className="relative rounded-xl border border-border bg-canvas p-4 transition-colors focus-within:border-primary hover:border-border-strong">
      <div className="flex items-start gap-3">
        <Avatar name={admin.fullName} email={admin.email} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus:outline-none"
          >
            <span className="block truncate text-[15px] font-semibold text-ink-primary">
              {admin.fullName || 'Unnamed administrator'}
              {isSelf ? <span className="ml-2 text-[11px] font-medium text-ink-muted">You</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-ink-secondary">{admin.email}</span>
          </button>
        </div>
        <div className="relative z-10 -mr-2 -mt-1">
          <AdminActionsMenu admin={admin} isSelf={isSelf} onAction={onAction} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
          <Icon name="shield_person" className="!text-[13px]" />
          {roleLabel(admin.role, roles)}
        </span>
        <StatusBadge label={status.label} tone={status.tone} icon={status.icon} />
        {admin.department ? (
          <span className="truncate text-[12px] text-ink-muted">{admin.department}</span>
        ) : null}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Icon name="schedule" className="!text-[15px]" />
        Last login {relativeTime(admin.lastLoginAt)}
      </p>
    </li>
  )
}
