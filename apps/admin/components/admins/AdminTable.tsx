import { ClickableRow } from '@fixnow/shared'
import { Avatar, StatusBadge } from '../ui'
import { AdminActionsMenu } from './AdminActionsMenu'
import type { AdminAction } from './adminMenu'
import {
  formatDateTime,
  relativeTime,
  roleLabel,
  statusMeta,
  type AdminOperator,
  type AdminRoleOption,
} from './adminHelpers'

const HEAD_CELL =
  'sticky top-16 z-20 bg-surface-alt px-6 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary'

/**
 * Desktop directory. The header sticks under the shell app bar (h-16) so column
 * meaning is preserved while scrolling long operator lists.
 */
export function AdminTable({
  admins,
  roles,
  currentUserId,
  onOpen,
  onAction,
}: {
  admins: AdminOperator[]
  roles: AdminRoleOption[]
  currentUserId: string | null
  onOpen: (admin: AdminOperator) => void
  onAction: (admin: AdminOperator, action: AdminAction) => void
}) {
  return (
    <div role="region" aria-label="Administrator directory">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Administrators with role, status, last login, and available actions
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} rounded-tl-xl`}>
              Administrator
            </th>
            <th scope="col" className={HEAD_CELL}>
              Role
            </th>
            <th scope="col" className={HEAD_CELL}>
              Status
            </th>
            <th scope="col" className={HEAD_CELL}>
              Last login
            </th>
            <th scope="col" className={`${HEAD_CELL} rounded-tr-xl text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {admins.map((admin) => {
            const isSelf = Boolean(currentUserId) && admin.userId === currentUserId
            const status = statusMeta(admin.status)
            return (
              <ClickableRow
                key={admin.id}
                label={`Open details for ${admin.fullName || admin.email}`}
                onActivate={() => onOpen(admin)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={admin.fullName} email={admin.email} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-primary">
                        {admin.fullName || 'Unnamed administrator'}
                        {isSelf ? (
                          <span className="ml-2 text-[11px] font-medium text-ink-muted">You</span>
                        ) : null}
                      </p>
                      <p className="truncate text-[13px] text-ink-secondary">{admin.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-ink-primary">{roleLabel(admin.role, roles)}</p>
                  {admin.department ? (
                    <p className="text-xs text-ink-muted">{admin.department}</p>
                  ) : null}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge label={status.label} tone={status.tone} icon={status.icon} />
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm tabular-nums text-ink-primary">
                    {relativeTime(admin.lastLoginAt)}
                  </p>
                  <p className="text-xs text-ink-muted">{formatDateTime(admin.lastLoginAt)}</p>
                </td>
                <td
                  className="px-4 py-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end">
                    <AdminActionsMenu
                      admin={admin}
                      isSelf={isSelf}
                      onAction={(action) => onAction(admin, action)}
                    />
                  </div>
                </td>
              </ClickableRow>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
