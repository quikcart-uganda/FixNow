import { OverflowMenu } from '../ui'
import type { AdminOperator } from './adminHelpers'
import { buildAdminMenuSections, type AdminAction } from './adminMenu'

export function AdminActionsMenu({
  admin,
  isSelf,
  disabled,
  onAction,
}: {
  admin: AdminOperator
  isSelf: boolean
  disabled?: boolean
  onAction: (action: AdminAction) => void
}) {
  return (
    <OverflowMenu
      label={`Actions for ${admin.fullName || admin.email}`}
      disabled={disabled}
      sections={buildAdminMenuSections({ admin, isSelf, onAction })}
    />
  )
}
