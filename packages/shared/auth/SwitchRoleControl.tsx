import { useNavigate } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { ROLE_SELECT_PATH } from './roleNavigation'

type Props = {
  /** Visual density for profile/settings surfaces. */
  className?: string
}

/**
 * Opens the role selector so multi-role users can change experience
 * without signing out.
 */
export function SwitchRoleControl({ className = '' }: Props) {
  const navigate = useNavigate()
  const { canSwitchRole, user } = useAuth()

  if (!canSwitchRole || !user || (user.role !== 'customer' && user.role !== 'technician')) {
    return null
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => navigate(ROLE_SELECT_PATH)}
        className="flex h-12 w-full items-center justify-center rounded-lg border border-primary/30 font-semibold text-primary"
      >
        Switch Role
      </button>
      <p className="mt-1.5 text-center text-xs text-on-surface-variant">
        Same account · choose Customer or Technician
      </p>
    </div>
  )
}
