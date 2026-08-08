import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PortalHeaderProps } from './types'
import { HeaderMenuButton } from './HeaderMenuButton'
import { HeaderNotificationsButton } from './HeaderNotificationsButton'
import { HeaderProfileMenu } from './HeaderProfileMenu'
import { HeaderStatusControl } from './HeaderStatusControl'
import { customerNavItems, guestCustomerNavItems } from './menuConfig'

/**
 * Shared portal header chrome.
 * Behaviour is consistent across Customer / Technician / Admin;
 * only labels and destinations are role-specific.
 *
 * Right actions are a fixed grid: [Status] [Notifications] [Profile]
 * so badges never overlap the connection chip.
 */
export function PortalHeader({
  role,
  brand = 'FixNow',
  subtitle,
  showMenu = false,
  navItems,
  photoUrl,
  displayName = 'Account',
  availabilityStatus,
  onAvailabilityChange,
  hideNotifications = false,
  hideStatus = false,
  leftSlot,
  className = '',
  variant = 'default',
  guestMode = false,
}: PortalHeaderProps) {
  const [statusOpen, setStatusOpen] = useState(false)
  const menuItems =
    navItems ??
    (role === 'customer' ? (guestMode ? guestCustomerNavItems() : customerNavItems()) : [])

  const resolvedName = guestMode ? 'Guest' : displayName
  const resolvedSubtitle = guestMode ? 'Browsing as Guest' : subtitle

  const barClass =
    variant === 'admin'
      ? 'sticky top-0 z-40 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur-md'
      : variant === 'technician'
        ? 'sticky top-0 z-30 border-b border-border-subtle bg-surface/95 pt-safe backdrop-blur'
        : 'sticky top-0 z-40 border-b border-border-subtle bg-canvas-white/95 pt-safe backdrop-blur'

  const menuVisibilityClass =
    variant === 'technician' ? 'lg:hidden' : variant === 'admin' ? 'md:hidden' : 'md:hidden'

  return (
    <header className={`${barClass} ${className}`}>
      <div
        className={
          variant === 'technician'
            ? 'mx-auto flex min-h-16 w-full max-w-7xl min-w-0 items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] py-2 sm:gap-3'
            : variant === 'admin'
              ? 'mx-auto flex min-h-16 w-full max-w-[1440px] min-w-0 items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] md:gap-4'
              : 'flex min-h-14 w-full min-w-0 items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]'
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {showMenu && menuItems.length > 0 ? (
            <HeaderMenuButton
              items={menuItems}
              role={role}
              displayName={resolvedName}
              photoUrl={guestMode ? null : photoUrl}
              statusLabel={
                role === 'technician' && availabilityStatus
                  ? availabilityStatus.replace('_', ' ')
                  : undefined
              }
              title={role === 'admin' ? 'FixNow Admin' : role === 'technician' ? 'Technician menu' : 'FixNow'}
              description="Primary navigation"
              className={menuVisibilityClass}
            />
          ) : null}
          {leftSlot ?? (
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-tight text-primary sm:text-lg">{brand}</p>
              {resolvedSubtitle ? (
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                  {resolvedSubtitle}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {!hideStatus && !guestMode ? (
            <HeaderStatusControl
              role={role}
              availabilityStatus={availabilityStatus}
              onAvailabilityChange={onAvailabilityChange}
              open={statusOpen}
              onOpenChange={setStatusOpen}
              density="responsive"
            />
          ) : (
            <HeaderStatusControl
              role={role}
              availabilityStatus={availabilityStatus}
              onAvailabilityChange={onAvailabilityChange}
              open={statusOpen}
              onOpenChange={setStatusOpen}
              hideTrigger
            />
          )}
          {!hideNotifications && !guestMode ? <HeaderNotificationsButton role={role} /> : null}
          {guestMode ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/customer/login"
                className="hidden min-h-10 items-center rounded-lg px-2 text-xs font-bold text-primary sm:inline-flex"
              >
                Sign In
              </Link>
              <Link
                to="/customer/register"
                className="hidden min-h-10 items-center rounded-lg bg-primary px-3 text-xs font-bold text-white sm:inline-flex"
              >
                Create Account
              </Link>
              <HeaderProfileMenu
                role={role}
                displayName="Guest"
                photoUrl={null}
                guestMode
                onStatus={() => setStatusOpen(true)}
              />
            </div>
          ) : (
            <HeaderProfileMenu
              role={role}
              displayName={resolvedName}
              photoUrl={photoUrl}
              onStatus={() => setStatusOpen(true)}
            />
          )}
        </div>
      </div>
    </header>
  )
}
