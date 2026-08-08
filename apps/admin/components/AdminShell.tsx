import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import {
  AiAssistantLauncher,
  Dialog,
  HamburgerIcon,
  HeaderGlyph,
  HeaderAdminSearch,
  HeaderNotificationsButton,
  HeaderProfileMenu,
  HeaderStatusControl,
  SectionErrorBoundary,
  SkipLink,
} from '@fixnow/shared'
import { cn } from '@fixnow/utils'
import { useAuth } from '@fixnow/hooks'
import { PLATFORM_MODE_CHANGED_EVENT, platformModeApi } from '@fixnow/api/admin'
import { BottomSheet, Icon as UiIcon } from '@fixnow/ui'
import { Icon } from './ui'
import { can, capabilityForAdminPath, CAP, type CapKey } from '../lib/adminCapabilities'

type NavItem = {
  to: string
  label: string
  icon: string
  capability?: CapKey
  /** Hidden when Platform Mode is Production (developer tooling). */
  developerOnly?: boolean
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', capability: CAP.CanViewReports },
      { to: '/admin/reports', label: 'Reports & Analytics', icon: 'analytics', capability: CAP.CanViewReports },
      { to: '/admin/trust', label: 'Trust Engine', icon: 'security', capability: CAP.CanManageSupport },
      { to: '/admin/reviews', label: 'Reviews', icon: 'rate_review', capability: CAP.CanManageSupport },
      { to: '/admin/marketing', label: 'Marketing', icon: 'campaign', capability: CAP.CanManageMarketing },
      { to: '/admin/payments', label: 'Payments & Escrow', icon: 'payments', capability: CAP.CanManageFinance },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { to: '/admin/technicians', label: 'Technicians', icon: 'engineering', capability: CAP.CanManageUsers },
      { to: '/admin/customers', label: 'Customers', icon: 'group', capability: CAP.CanManageUsers },
      { to: '/admin/jobs', label: 'Jobs', icon: 'work', capability: CAP.CanManageSupport },
      { to: '/admin/tracking', label: 'Live Tracking', icon: 'near_me', capability: CAP.CanManageSupport },
      { to: '/admin/verification', label: 'Verification', icon: 'verified_user', capability: CAP.CanManageSupport },
      { to: '/admin/portal', label: 'Portal production', icon: 'home_repair_service', capability: CAP.CanManageSupport },
      { to: '/admin/categories', label: 'Categories', icon: 'category', capability: CAP.CanManageSupport },
      { to: '/admin/marketing/pending', label: 'Offer review', icon: 'local_offer', capability: CAP.CanManageMarketing },
    ],
  },
  {
    label: 'Controls',
    items: [
      { to: '/admin/free-jobs', label: 'Marketplace Monetization', icon: 'tune', capability: CAP.CanManageSettings },
      { to: '/admin/locks', label: 'Lock Management', icon: 'lock', capability: CAP.CanManageSupport },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: 'workspace_premium', capability: CAP.CanManageSubscriptions },
      { to: '/admin/boosts', label: 'Profile Boosts', icon: 'rocket_launch', capability: CAP.CanManageSubscriptions },
      { to: '/admin/recommendations', label: 'Recommendations', icon: 'near_me', capability: CAP.CanManageSubscriptions },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/admin/notifications', label: 'Notifications', icon: 'campaign', capability: CAP.CanManageSupport },
      { to: '/admin/messages', label: 'Messages', icon: 'forum', capability: CAP.CanManageSupport },
      { to: '/admin/content', label: 'Content', icon: 'article', capability: CAP.CanManageContent },
      { to: '/admin/audit', label: 'Audit Logs', icon: 'history', capability: CAP.CanViewAudit },
    ],
  },
  {
    label: 'System Settings',
    items: [
      { to: '/admin/admins', label: 'Administrators', icon: 'admin_panel_settings', capability: CAP.CanManageAdmins },
      { to: '/admin/settings/providers', label: 'Provider Manager', icon: 'hub', capability: CAP.CanManageProviders },
      { to: '/admin/location', label: 'Location Services', icon: 'map', capability: CAP.CanManageProviders },
      { to: '/admin/settings/realtime', label: 'Platform health', icon: 'monitor_heart', capability: CAP.CanManageInfrastructure },
      {
        to: '/admin/settings/governance',
        label: 'Production Governance',
        icon: 'rocket_launch',
        capability: CAP.CanManageInfrastructure,
      },
      {
        to: '/admin/settings/launch-centre',
        label: 'Launch Centre',
        icon: 'flag',
        capability: CAP.CanManageInfrastructure,
      },
      {
        to: '/admin/settings/development',
        label: 'Development Controls',
        icon: 'developer_mode',
        capability: CAP.CanManageInfrastructure,
        developerOnly: true,
      },
      {
        to: '/admin/settings/development-access',
        label: 'Development Access',
        icon: 'security',
        capability: CAP.CanManageDevelopmentAccess,
        developerOnly: true,
      },
      {
        to: '/admin/settings/sandbox',
        label: 'Sandbox Management',
        icon: 'science',
        capability: CAP.CanManageInfrastructure,
        developerOnly: true,
      },
      {
        to: '/admin/settings/seed-platform',
        label: 'Seed Platform',
        icon: 'database',
        capability: CAP.CanManageInfrastructure,
        developerOnly: true,
      },
      {
        to: '/admin/settings/developer-preview',
        label: 'Developer Preview',
        icon: 'science',
        capability: CAP.CanManageInfrastructure,
        developerOnly: true,
      },
    ],
  },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const [developerUxVisible, setDeveloperUxVisible] = useState(true)

  const refreshMode = useCallback(() => {
    let active = true
    platformModeApi
      .publicStatus()
      .then((res) => {
        if (active) setDeveloperUxVisible(Boolean(res.data.developerUxVisible))
      })
      .catch(() => {
        if (active) setDeveloperUxVisible(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const cancel = refreshMode()
    const onModeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ developerUxVisible?: boolean } | null>).detail
      if (detail && typeof detail.developerUxVisible === 'boolean') {
        setDeveloperUxVisible(detail.developerUxVisible)
        return
      }
      refreshMode()
    }
    window.addEventListener(PLATFORM_MODE_CHANGED_EVENT, onModeChanged)
    return () => {
      cancel()
      window.removeEventListener(PLATFORM_MODE_CHANGED_EVENT, onModeChanged)
    }
  }, [refreshMode])

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.capability && !can(user, item.capability)) return false
        if (item.developerOnly && !developerUxVisible) return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-2 space-y-5 custom-scrollbar">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-secondary">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all',
                    isActive
                      ? 'text-primary font-bold border-l-4 border-primary bg-surface-alt'
                      : 'text-ink-secondary hover:bg-surface-container border-l-4 border-transparent',
                  )
                }
              >
                <Icon name={item.icon} className="!text-[20px]" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function AdminHelpButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canDevAccess = can(user, CAP.CanManageDevelopmentAccess)
  const canInfrastructure = can(user, CAP.CanManageInfrastructure)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'tap-target hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 text-on-surface-variant hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex',
          className,
        )}
        aria-label="Help"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="help_outline" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Admin help" description="Quick guidance for operators">
        <div className="space-y-3 pb-6">
          <p className="text-sm text-on-surface-variant">
            Use Audit logs for investigation, Notifications for platform broadcasts, and the Ops Assistant for
            guided recommendations. Dedicated help docs are coming soon.
          </p>
          <button
            type="button"
            className="tap-target flex w-full items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left text-sm font-semibold"
            onClick={() => {
              setOpen(false)
              navigate('/admin/audit')
            }}
          >
            <UiIcon name="history" className="text-primary" />
            Open audit activity
          </button>
          <button
            type="button"
            className="tap-target flex w-full items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left text-sm font-semibold"
            onClick={() => {
              setOpen(false)
              navigate('/admin/notifications')
            }}
          >
            <UiIcon name="campaign" className="text-primary" />
            Platform notifications
          </button>
          {canDevAccess ? (
            <button
              type="button"
              className="tap-target flex w-full items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left text-sm font-semibold"
              onClick={() => {
                setOpen(false)
                navigate('/admin/settings/development-access')
              }}
            >
              <UiIcon name="security" className="text-primary" />
              Development Access
            </button>
          ) : null}
          {canInfrastructure ? (
            <button
              type="button"
              className="tap-target flex w-full items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left text-sm font-semibold"
              onClick={() => {
                setOpen(false)
                navigate('/admin/settings/development')
              }}
            >
              <UiIcon name="developer_mode" className="text-primary" />
              Development controls
            </button>
          ) : null}
        </div>
      </BottomSheet>
    </>
  )
}

export function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, refreshMe } = useAuth()
  const [developerUxVisible, setDeveloperUxVisible] = useState(true)

  useEffect(() => {
    // Refresh admin capabilities after login / governance changes so Command Center
    // does not fail-closed on a stale StoredUser without permissionKeys.
    void refreshMe()
  }, [refreshMe])

  const refreshMode = useCallback(() => {
    let active = true
    platformModeApi
      .publicStatus()
      .then((res) => {
        if (active) setDeveloperUxVisible(Boolean(res.data.developerUxVisible))
      })
      .catch(() => {
        if (active) setDeveloperUxVisible(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const cancel = refreshMode()
    const onModeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ developerUxVisible?: boolean } | null>).detail
      if (detail && typeof detail.developerUxVisible === 'boolean') {
        setDeveloperUxVisible(detail.developerUxVisible)
        return
      }
      refreshMode()
    }
    window.addEventListener(PLATFORM_MODE_CHANGED_EVENT, onModeChanged)
    return () => {
      cancel()
      window.removeEventListener(PLATFORM_MODE_CHANGED_EVENT, onModeChanged)
    }
  }, [refreshMode, location.pathname])

  useEffect(() => {
    if (developerUxVisible) return
    const path = location.pathname
    const blocked =
      path.startsWith('/admin/settings/development') ||
      path.startsWith('/admin/settings/sandbox') ||
      path.startsWith('/admin/settings/seed-platform') ||
      path.startsWith('/admin/settings/developer-preview')
    if (blocked) {
      navigate('/admin/settings/governance', { replace: true })
    }
  }, [developerUxVisible, location.pathname, navigate])

  const displayName = user?.fullName ?? 'Admin'
  const requiredCap = capabilityForAdminPath(location.pathname)
  const allowedHere = !requiredCap || can(user, requiredCap)

  async function handleLogout() {
    await logout()
    // Public landing / role entry — replace so Back cannot reopen admin.
    navigate('/', { replace: true })
  }

  const mobileTabs = [
    { to: '/admin/dashboard', icon: 'dashboard', label: 'Home', capability: CAP.CanViewReports },
    { to: '/admin/jobs', icon: 'work', label: 'Jobs', capability: CAP.CanManageSupport },
    { to: '/admin/verification', icon: 'verified_user', label: 'Verify', capability: CAP.CanManageSupport },
    { to: '/admin/payments', icon: 'payments', label: 'Finance', capability: CAP.CanManageFinance },
    { to: '/admin/reports', icon: 'analytics', label: 'Reports', capability: CAP.CanViewReports },
  ].filter((item) => can(user, item.capability))

  return (
    <div className="admin-theme flex min-h-dvh overflow-x-hidden bg-surface text-on-surface">
      <SkipLink />
      {/* Desktop / tablet sidebar */}
      <aside
        aria-label="Admin navigation"
        className="fixed left-0 top-0 z-50 hidden h-full w-[260px] flex-col border-r border-outline-variant bg-inverse-surface py-6 pt-safe text-inverse-on-surface md:flex"
      >
        <div className="mb-8 px-6">
          <h1 className="text-[22px] font-black tracking-tight text-primary-fixed">FixNow Admin</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-muted">Command Center</p>
        </div>
        <SidebarNav />
        <div className="mt-auto space-y-3 border-t border-white/10 px-6 pt-4">
          <HeaderProfileMenu
            role="admin"
            displayName={displayName}
            className="!border-primary-fixed"
            onStatus={() => setStatusOpen(true)}
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">{displayName}</p>
            <p className="truncate text-[10px] font-bold uppercase text-ink-muted">{user?.email || 'Admin'}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="tap-target flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-ink-muted hover:bg-white/5 hover:text-white"
            title="Sign out"
            aria-label="Sign out"
          >
            <Icon name="logout" className="!text-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="FixNow Admin"
        description="Command Center navigation"
        placement="start"
        panelClassName="!max-w-[280px] !rounded-none bg-canvas !p-0 md:hidden"
        className="md:hidden"
      >
        <div className="flex h-full flex-col py-2">
          <div className="mb-4 flex items-center justify-between px-6">
            <p className="text-[11px] uppercase tracking-widest text-ink-muted">Menu</p>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="tap-target rounded-lg p-2 hover:bg-surface-alt"
              aria-label="Close menu"
              data-autofocus
            >
              <HeaderGlyph name="close" />
            </button>
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <div className="mt-auto space-y-3 border-t border-border px-4 py-4">
            <p className="truncate px-2 text-xs text-ink-secondary">{displayName}</p>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false)
                void handleLogout()
              }}
              className="tap-target flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-semibold text-error hover:bg-error/5"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="logout" className="!text-[18px]" />
              Sign out
            </button>
          </div>
        </div>
      </Dialog>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:ml-[260px]">
        {/*
          Responsive header:
          - Mobile (≤768 / <md): hamburger · brand · notifications · avatar
          - Tablet (md–lg): compact Live · search · notifications · avatar
          - Desktop (≥lg): full toolbar (Live, help, sign out, avatar)
          min-h-16 + pt-safe (not fixed h-16) so iOS notches do not clip controls.
        */}
        <header className="sticky top-0 z-40 overflow-x-hidden border-b border-outline-variant bg-surface/80 pt-safe backdrop-blur-md">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] min-w-0 items-center gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] md:gap-3 md:pl-[max(1.5rem,env(safe-area-inset-left,0px))] md:pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
            {/* Left cluster */}
            <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
              <button
                type="button"
                className="tap-target touch-manip inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center overflow-visible rounded-full border border-border-subtle bg-surface p-0 text-on-surface shadow-sm transition-colors hover:border-primary/40 hover:bg-surface-alt hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:bg-surface-container-high md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileOpen}
              >
                <HamburgerIcon />
              </button>

              {/* Mobile brand — hidden once the sidebar owns branding (≥md) */}
              <div className="min-w-0 md:hidden">
                <p className="truncate text-base font-bold leading-tight text-primary">FixNow</p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Admin
                </p>
              </div>

              <HeaderAdminSearch className="min-w-0 flex-1" />
            </div>

            {/* Right toolbar — never shrinks; icons stay on-screen */}
            <div className="flex shrink-0 items-center gap-0.5 md:gap-1 lg:gap-2">
              <HeaderStatusControl
                role="admin"
                density="responsive"
                visibleFrom="md"
                open={statusOpen}
                onOpenChange={setStatusOpen}
              />

              <HeaderNotificationsButton role="admin" className="shrink-0" />
              <AdminHelpButton />
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="tap-target hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 text-on-surface-variant hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex"
                title="Sign out"
                aria-label="Sign out"
              >
                <Icon name="logout" />
              </button>
              <div className="mx-1 hidden h-8 w-px shrink-0 bg-outline-variant lg:block" aria-hidden="true" />
              <HeaderProfileMenu
                role="admin"
                displayName={displayName}
                className="shrink-0"
                onStatus={() => setStatusOpen(true)}
              />
            </div>
          </div>
        </header>

        <main id="fixnow-main" className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 outline-none md:p-8" tabIndex={-1}>
          <SectionErrorBoundary title="We couldn't display this admin page">
            {allowedHere ? (
              <Outlet />
            ) : (
              <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-border bg-canvas p-6 text-center">
                <h1 className="text-xl font-semibold">Access denied</h1>
                <p className="text-sm text-ink-secondary">
                  Your administrator role does not include this module. Contact a Super Admin if you need access.
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary"
                  onClick={() => navigate('/admin/dashboard')}
                >
                  Back to dashboard
                </button>
              </div>
            )}
          </SectionErrorBoundary>
        </main>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Admin"
          className="sticky bottom-0 z-40 flex justify-around border-t border-border bg-canvas/90 px-2 py-2 pb-safe backdrop-blur-md md:hidden"
        >
          {[
            ...mobileTabs,
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'tap-target flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium',
                  isActive ? 'text-primary' : 'text-ink-muted',
                )
              }
            >
              <Icon name={item.icon} className="!text-[22px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <AiAssistantLauncher role="admin" label="Ops Assistant" />
    </div>
  )
}
