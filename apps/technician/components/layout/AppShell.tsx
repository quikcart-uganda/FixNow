import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  AiAssistantLauncher,
  AppDownloadReminderHost,
  LocationPermissionHost,
  PortalHeader,
  SectionErrorBoundary,
  SkipLink,
  technicianNavItems,
} from '@fixnow/shared'
import { Icon } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'
import { FreeJobsMeter } from '@fixnow/ui'
import {
  planAssistantLabel,
  planShellSubtitle,
  planWorkspaceLabel,
  resolvePlanWorkspaceTier,
} from '@technician/lib/planWorkspace'

const mobileTabs = [
  { to: '/technician/dashboard', icon: 'dashboard', label: 'Home' },
  { to: '/technician/jobs', icon: 'work', label: 'Jobs' },
  { to: '/technician/messages', icon: 'chat', label: 'Inbox' },
  { to: '/technician/profile', icon: 'person', label: 'Profile' },
]

const desktopNav = [
  { to: '/technician/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/technician/jobs', icon: 'near_me', label: 'Nearby Jobs' },
  { to: '/technician/active', icon: 'assignment', label: 'Active Jobs' },
  { to: '/technician/portfolio', icon: 'photo_library', label: 'Portfolio' },
  { to: '/technician/reviews', icon: 'star', label: 'Reviews' },
  { to: '/technician/earnings', icon: 'payments', label: 'Earnings' },
  { to: '/technician/reputation', icon: 'workspace_premium', label: 'Reputation' },
  { to: '/technician/achievements', icon: 'emoji_events', label: 'Achievements' },
  { to: '/technician/community', icon: 'forum', label: 'Community' },
  { to: '/technician/referrals', icon: 'share', label: 'Referrals' },
  { to: '/technician/marketing', icon: 'campaign', label: 'Marketing' },
  { to: '/technician/boosts', icon: 'rocket_launch', label: 'Boosts' },
  { to: '/technician/upgrade', icon: 'upgrade', label: 'Upgrade Plan' },
  { to: '/technician/subscription', icon: 'workspace_premium', label: 'Subscription' },
  { to: '/technician/messages', icon: 'chat', label: 'Messages' },
  { to: '/technician/settings', icon: 'settings', label: 'Settings' },
]

const technicianMenuItems = technicianNavItems()

export function AppShell() {
  const {
    profile,
    profileLoading,
    isLocked,
    remainingFreeJobs,
    previewActive,
    entitlementPlanCode,
    hasActiveSubscription,
    subscriptionReady,
  } = useApp()
  const location = useLocation()
  const hideChrome = location.pathname.startsWith('/technician/messages/')
  const [availability, setAvailability] = useState<'available' | 'busy' | 'offline' | 'on_job'>(() =>
    /available/i.test(profile.availability) ? 'available' : 'offline',
  )

  const planTier = useMemo(
    () => resolvePlanWorkspaceTier(entitlementPlanCode, hasActiveSubscription),
    [entitlementPlanCode, hasActiveSubscription],
  )
  const shellSubtitle = planShellSubtitle(planTier)
  const assistantLabel = planAssistantLabel(planTier)
  const planLabel = planWorkspaceLabel(planTier)

  /** Mobile subtitle: plan when paid; progress level when free — never flash wrong plan. */
  const mobileAccountTag = !subscriptionReady || profileLoading
    ? '…'
    : hasActiveSubscription
      ? planLabel
      : profile.level

  useEffect(() => {
    setAvailability(/available/i.test(profile.availability) ? 'available' : 'offline')
  }, [profile.availability])

  return (
    <AppDownloadReminderHost role="technician">
    <LocationPermissionHost role="technician">
    <div className="min-h-dvh bg-background" data-plan-tier={planTier}>
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border-subtle bg-surface p-4 lg:flex">
        <div className="mb-8 px-2">
          <p className="text-display-mobile text-primary">FixNow</p>
          <p className="text-label text-on-surface-variant">{shellSubtitle}</p>
          {hasActiveSubscription && subscriptionReady ? (
            <p
              className={cn(
                'mt-2 inline-flex rounded-lg px-2 py-1 text-caps',
                planTier === 'business' && 'bg-teal-700/10 text-teal-900',
                planTier === 'professional' && 'bg-[#0A2540]/10 text-[#0A2540]',
                planTier === 'starter' && 'bg-primary/10 text-primary',
              )}
            >
              {planLabel} plan
            </p>
          ) : null}
          {previewActive ? (
            <p className="mt-2 rounded-lg bg-teal-700/10 px-2 py-1 text-caps text-teal-900">
              Preview · {String(entitlementPlanCode || 'Plan').replace('_', ' + ')}
            </p>
          ) : null}
        </div>
        <nav aria-label="Technician" className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          {desktopNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-title transition',
                  isActive
                    ? 'translate-x-1 bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-low',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 rounded-2xl border border-border-subtle p-3">
          {hasActiveSubscription ? (
            <>
              <p className="text-caps text-on-surface-variant">Workspace</p>
              <p className="mt-1 text-label font-semibold text-on-surface">{planLabel} · unlimited apply</p>
              <Link to="/technician/subscription" className="mt-3 block text-center text-label font-semibold text-primary">
                Subscription Centre
              </Link>
            </>
          ) : (
            <>
              <FreeJobsMeter used={profile.freeJobsUsed} limit={profile.freeJobLimit} compact />
              {isLocked ? (
                <Link to="/technician/locked" className="mt-3 block text-center text-label font-semibold text-warning">
                  Account locked — Upgrade Plan
                </Link>
              ) : null}
              <Link to="/technician/upgrade" className="mt-3 block text-center text-label font-semibold text-primary">
                Upgrade Plan
              </Link>
            </>
          )}
        </div>
      </aside>

      <div className="lg:pl-64">
        {!hideChrome ? (
          <PortalHeader
            role="technician"
            variant="technician"
            showMenu
            navItems={technicianMenuItems}
            displayName={profile.name || 'Technician'}
            photoUrl={profile.photo}
            availabilityStatus={availability}
            onAvailabilityChange={setAvailability}
            leftSlot={
              <div className="min-w-0">
                <p className="truncate text-base font-bold leading-tight text-primary lg:text-on-surface">
                  <span className="lg:hidden">FixNow</span>
                  <span className="hidden lg:inline">{profile.name || 'Technician'}</span>
                </p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant sm:text-xs">
                  <span className="lg:hidden">{mobileAccountTag}</span>
                  <span className="hidden normal-case tracking-normal lg:inline">
                    {!subscriptionReady || profileLoading
                      ? 'Loading workspace…'
                      : hasActiveSubscription
                        ? `${planLabel} · Trust ${profile.trust.trust}`
                        : `${remainingFreeJobs} applications left · Trust ${profile.trust.trust}`}
                  </span>
                </p>
              </div>
            }
          />
        ) : null}

        <main
          id="fixnow-main"
          className={cn('mx-auto max-w-7xl px-4 py-6 outline-none', !hideChrome && 'fixnow-ai-fab-pad')}
          tabIndex={-1}
        >
          <SectionErrorBoundary title="We couldn't display this page">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>

      {!hideChrome ? (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface pb-safe shadow-float lg:hidden"
        >
          <div className="flex items-center justify-around px-2 pt-2">
            {mobileTabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'tap-target touch-manip flex min-w-[72px] flex-col items-center rounded-xl px-3 py-2 text-label transition active:scale-95',
                    isActive ? 'scale-90 bg-trust-blue-subtle text-primary' : 'text-on-surface-variant',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={tab.icon} filled={isActive} />
                    {tab.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      {!hideChrome ? <AiAssistantLauncher role="technician" label={assistantLabel} /> : null}
    </div>
    </LocationPermissionHost>
    </AppDownloadReminderHost>
  )
}
