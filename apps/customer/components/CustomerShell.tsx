import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  AiAssistantLauncher,
  AppDownloadReminderHost,
  AuthGateProvider,
  LocationPermissionHost,
  SectionErrorBoundary,
  SkipLink,
  isGuestSession,
  useAuthGate,
} from '@fixnow/shared'
import { cn } from '@fixnow/utils'
import { useAuth } from '@fixnow/hooks'

const tabs = [
  { to: '/customer/home', icon: 'home', label: 'Home', guestOk: true },
  { to: '/customer/search', icon: 'search', label: 'Search', guestOk: true },
  { to: '/customer/post-job', icon: 'add_circle', label: 'Post', guestOk: false, intent: 'post_job' },
  { to: '/customer/jobs', icon: 'work_history', label: 'Jobs', guestOk: false, intent: 'jobs' },
  { to: '/customer/messages', icon: 'chat', label: 'Chat', guestOk: false, intent: 'messages' },
]

/**
 * Customer shell — bottom tabs (mobile) + icon rail (md+).
 * Guests may browse; protected tabs open the auth gate.
 */
export function CustomerShell() {
  return (
    <AuthGateProvider>
      <CustomerShellInner />
    </AuthGateProvider>
  )
}

function CustomerShellInner() {
  const { isAuthenticated } = useAuth()
  const { requireAuth } = useAuthGate()
  const navigate = useNavigate()
  const guest = isGuestSession() && !isAuthenticated

  return (
    <AppDownloadReminderHost role="customer">
      <LocationPermissionHost role="customer">
        <div className="customer-theme min-h-dvh bg-background pt-safe">
          <SkipLink />
          <main id="fixnow-main" className="fixnow-ai-fab-pad outline-none md:pl-20" tabIndex={-1}>
            <SectionErrorBoundary title="We couldn't display this page">
              <Outlet />
            </SectionErrorBoundary>
          </main>

          <nav
            aria-label="Primary"
            className="fixed bottom-0 left-0 z-50 flex min-h-16 w-full items-center justify-around border-t border-border-subtle bg-canvas-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-sm md:hidden"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                onClick={(e) => {
                  if (guest && !tab.guestOk) {
                    e.preventDefault()
                    requireAuth({
                      intent: tab.intent || 'protected',
                      title: 'Create your free FixNow account',
                      message: 'Sign in or create an account to continue.',
                      resumePath: tab.to,
                    })
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    'tap-target touch-manip flex min-h-12 min-w-[52px] flex-col items-center justify-center rounded-xl px-1 py-1 transition-transform active:scale-95',
                    isActive ? 'font-semibold text-primary' : 'text-on-surface-variant',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className="material-symbols-outlined"
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {tab.icon}
                    </span>
                    <span className="mt-1 text-label-caps">{tab.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <aside className="fixed left-0 top-0 z-40 hidden h-full w-20 flex-col items-center gap-8 border-r border-border-subtle bg-canvas-white py-8 md:flex">
            {tabs.map((tab) => (
              <button
                key={tab.to}
                type="button"
                title={tab.label}
                aria-label={tab.label}
                onClick={() => {
                  if (guest && !tab.guestOk) {
                    requireAuth({
                      intent: tab.intent || 'protected',
                      resumePath: tab.to,
                    })
                    return
                  }
                  navigate(tab.to)
                }}
                className="rounded-xl p-3 text-on-surface-variant transition-colors hover:text-primary"
              >
                <span className="material-symbols-outlined">{tab.icon}</span>
              </button>
            ))}
          </aside>

          <AiAssistantLauncher role="customer" label="Ask FixNow" allowGuest />
        </div>
      </LocationPermissionHost>
    </AppDownloadReminderHost>
  )
}
