import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Dialog } from '../a11y/Dialog'
import { Icon, ProfileAvatar } from '@fixnow/ui'
import { useAuth } from '@fixnow/hooks'
import type { HeaderMenuItem, PortalRole } from './types'
import { HamburgerIcon } from './HamburgerIcon'
import { HeaderGlyph } from './HeaderGlyph'
import { loginPath } from './menuConfig'

function groupItems(items: HeaderMenuItem[]): Array<{ section: string | null; items: HeaderMenuItem[] }> {
  const groups: Array<{ section: string | null; items: HeaderMenuItem[] }> = []
  for (const item of items) {
    const section = item.section || null
    const last = groups[groups.length - 1]
    if (last && last.section === section) {
      last.items.push(item)
    } else {
      groups.push({ section, items: [item] })
    }
  }
  return groups
}

/**
 * Hamburger / menu control — always opens navigation.
 * Dialog is portaled to document.body (see Dialog.tsx) so sticky/blur headers
 * cannot clip the drawer content.
 */
export function HeaderMenuButton({
  items,
  title = 'Menu',
  description = 'Navigate FixNow',
  className = '',
  role = 'customer',
  displayName,
  photoUrl,
  statusLabel,
}: {
  items: HeaderMenuItem[]
  title?: string
  description?: string
  className?: string
  role?: PortalRole
  displayName?: string
  photoUrl?: string | null
  statusLabel?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const groups = useMemo(() => groupItems(items), [items])

  const onLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    setNotice(null)
    try {
      await logout()
      setOpen(false)
      navigate(role === 'admin' ? '/' : loginPath(role), { replace: true })
    } catch {
      setNotice('Unable to sign out right now. Please try again.')
    } finally {
      setSigningOut(false)
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
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`tap-target touch-manip relative inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center overflow-visible rounded-full border border-border-subtle bg-surface p-0 text-on-surface shadow-sm transition-colors hover:border-primary/40 hover:bg-surface-container-low hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:bg-surface-container-high ${className}`}
        data-testid="header-menu-button"
      >
        <HamburgerIcon />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        placement="start"
        hideChrome
        panelClassName="!max-w-[320px] !rounded-none !p-0"
        bodyClassName="!px-0 !pb-0 flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border-subtle px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">{title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="tap-target rounded-lg p-2 hover:bg-surface-container-low"
                aria-label="Close menu"
                data-autofocus
              >
                <HeaderGlyph name="close" />
              </button>
            </div>
            {displayName ? (
              <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low/80 px-3 py-2.5">
                <ProfileAvatar alt={displayName} src={photoUrl} className="h-11 w-11 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface">{displayName}</p>
                  {statusLabel ? (
                    <p className="truncate text-xs font-medium capitalize text-on-surface-variant">{statusLabel}</p>
                  ) : (
                    <p className="truncate text-xs text-on-surface-variant">{description}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <nav
            aria-label={title}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-2 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            {items.length === 0 ? (
              <p className="px-3 py-6 text-sm text-on-surface-variant">No navigation items available.</p>
            ) : (
              groups.map((group) => (
                <div key={group.section || 'main'} className="space-y-0.5">
                  {group.section ? (
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                      {group.section}
                    </p>
                  ) : null}
                  {group.items.map((item) => {
                    if (item.action === 'logout') {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={signingOut}
                          onClick={() => void onLogout()}
                          className="tap-target flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-60"
                        >
                          <Icon name={item.icon} className="text-error" />
                          {signingOut ? 'Signing out…' : item.label}
                        </button>
                      )
                    }
                    if (item.action === 'coming_soon') {
                      return (
                        <p key={item.id} className="px-3 py-3 text-sm text-on-surface-variant" role="status">
                          {item.label} — {item.description || 'Coming soon'}
                        </p>
                      )
                    }
                    if (!item.to) {
                      return (
                        <p key={item.id} className="px-3 py-3 text-sm text-on-surface-variant" role="status">
                          {item.label}
                        </p>
                      )
                    }
                    return (
                      <NavLink
                        key={item.id}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `tap-target flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                            isActive
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'text-on-surface hover:bg-surface-container-low'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon name={item.icon} filled={isActive} className={isActive ? undefined : 'text-primary'} />
                            {item.label}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              ))
            )}
            {notice ? <p className="px-3 text-sm text-error">{notice}</p> : null}
          </nav>
        </div>
      </Dialog>
    </>
  )
}
