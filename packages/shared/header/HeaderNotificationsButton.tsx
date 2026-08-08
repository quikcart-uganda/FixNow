import { Link } from 'react-router-dom'
import { usePush } from '@fixnow/hooks'
import { notificationsPath } from './menuConfig'
import type { PortalRole } from './types'
import { HeaderGlyph } from './HeaderGlyph'

/**
 * Notification bell — always navigates to the role inbox.
 * Unread badge uses live push count (never a hardcoded dot).
 */
export function HeaderNotificationsButton({
  role,
  className = '',
}: {
  role: PortalRole
  className?: string
}) {
  const { unreadCount } = usePush()
  const to = notificationsPath(role)
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <Link
      to={to}
      aria-label={label}
      className={`tap-target touch-manip relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-on-surface-variant transition hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 ${className}`}
    >
      <HeaderGlyph name="notifications" />
      {unreadCount > 0 ? (
        <>
          <span
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
          <span className="sr-only">{unreadCount} unread</span>
        </>
      ) : null}
    </Link>
  )
}
