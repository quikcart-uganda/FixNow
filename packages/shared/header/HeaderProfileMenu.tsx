import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { BottomSheet, Icon, ProfileAvatar } from '@fixnow/ui'
import { guestProfileMenuItems, loginPath, profileMenuItems } from './menuConfig'
import type { HeaderMenuItem, PortalRole } from './types'

/**
 * Profile avatar — opens a role-aware account sheet.
 * Guest mode shows a Guest badge and auth CTAs instead of private account links.
 */
export function HeaderProfileMenu({
  role,
  displayName = 'Account',
  photoUrl,
  className = '',
  extraItems,
  onStatus,
  guestMode = false,
}: {
  role: PortalRole
  displayName?: string
  photoUrl?: string | null
  className?: string
  extraItems?: HeaderMenuItem[]
  onStatus?: () => void
  guestMode?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()

  const baseItems = guestMode ? guestProfileMenuItems() : profileMenuItems(role)
  const items = [...(extraItems ?? []), ...baseItems].filter(
    (item, index, all) => all.findIndex((x) => x.id === item.id) === index,
  )

  const onSelect = async (item: HeaderMenuItem) => {
    setNotice(null)
    if (item.action === 'coming_soon') {
      setNotice(item.description || 'This feature is coming soon.')
      return
    }
    if (item.action === 'status') {
      setOpen(false)
      onStatus?.()
      return
    }
    if (item.action === 'logout') {
      if (signingOut) return
      setSigningOut(true)
      try {
        await logout()
        setOpen(false)
        navigate(role === 'admin' ? '/' : loginPath(role), { replace: true })
      } catch {
        setNotice('Unable to sign out right now. Please try again.')
      } finally {
        setSigningOut(false)
      }
      return
    }
    if (item.to) {
      setOpen(false)
      navigate(item.to)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null)
          setOpen(true)
        }}
        aria-label={guestMode ? 'Guest account menu' : `Account menu for ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`tap-target touch-manip inline-flex h-10 w-10 min-h-11 min-w-11 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-container transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 ${className}`}
      >
        {guestMode ? (
          <span
            className="flex h-full w-full items-center justify-center bg-primary/10 text-[10px] font-bold uppercase tracking-wide text-primary"
            aria-hidden
          >
            Guest
          </span>
        ) : (
          <ProfileAvatar alt={displayName} src={photoUrl} className="h-full w-full rounded-full" />
        )}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={guestMode ? 'Browsing as Guest' : displayName}
        description={guestMode ? 'Sign in to book, chat, and save favourites' : 'Account and settings'}
      >
        <ul className="space-y-1 pb-6">
          {items.map((item) => {
            const content = (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high text-primary">
                  <Icon name={item.icon} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className={`block text-sm font-semibold ${item.danger ? 'text-error' : 'text-on-surface'}`}>
                    {item.label}
                  </span>
                  {item.description && (item.action === 'coming_soon' || item.action === 'status') ? (
                    <span className="block text-xs text-on-surface-variant">
                      {item.action === 'coming_soon' ? 'Coming soon' : item.description}
                    </span>
                  ) : null}
                </span>
                <Icon name="chevron_right" className="text-on-surface-variant" />
              </>
            )

            if (item.to && !item.action) {
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="tap-target flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-container-low"
                  >
                    {content}
                  </Link>
                </li>
              )
            }

            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={signingOut && item.action === 'logout'}
                  onClick={() => void onSelect(item)}
                  className="tap-target flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-container-low disabled:opacity-60"
                >
                  {content}
                </button>
              </li>
            )
          })}
        </ul>
        {notice ? (
          <p className="mb-4 rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface" role="status">
            {notice}
          </p>
        ) : null}
      </BottomSheet>
    </>
  )
}
