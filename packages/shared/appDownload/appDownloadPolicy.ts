/** Trigger, cooldown, and route-block policy for the App Download Reminder. */

export type AppDownloadRole = 'customer' | 'technician'

/** Mid of 3–5 minutes of active authenticated use. */
export const APP_DOWNLOAD_DEFER_MS = 4 * 60_000

/** Minimum distinct route visits before deferred prompt may fire. */
export const APP_DOWNLOAD_MIN_PAGE_VIEWS = 3

/** "Maybe Later" suppression window. */
export const APP_DOWNLOAD_LATER_MS = 7 * 24 * 60 * 60_000

/** Stagger so this sheet rarely collides with location education (~3 min). */
export const APP_DOWNLOAD_LOCATION_STAGGER_MS = 90_000

export type AppDownloadTrigger =
  | 'deferred'
  | 'page_views'
  | 'post_job'
  | 'open_chat'
  | 'go_online'
  | 'view_jobs'

export type AppDownloadCopy = {
  title: string
  body: string
  primaryLabel: string
  laterLabel: string
  neverLabel: string
  comingSoonTitle: string
  comingSoonBody: string
}

export const APP_DOWNLOAD_COPY: Record<AppDownloadRole, AppDownloadCopy> = {
  customer: {
    title: 'Get the FixNow app',
    body: 'Faster booking, live technician tracking, and smoother payments — install FixNow for the best experience on your phone.',
    primaryLabel: 'Download the App',
    laterLabel: 'Maybe Later',
    neverLabel: "Don't show again",
    comingSoonTitle: 'Native app coming soon',
    comingSoonBody:
      'The FixNow mobile app is almost ready. Keep using the web app for now — we will notify you when downloads are available.',
  },
  technician: {
    title: 'Work better in the FixNow app',
    body: 'Get nearby job alerts, live navigation, and reliable tracking while you are en route. Install the technician app for peak performance.',
    primaryLabel: 'Download the App',
    laterLabel: 'Maybe Later',
    neverLabel: "Don't show again",
    comingSoonTitle: 'Technician app coming soon',
    comingSoonBody:
      'The FixNow technician app is preparing for store release. Continue on web for now — downloads will open here when published.',
  },
}

const BLOCKED_PREFIXES = [
  '/customer/login',
  '/customer/register',
  '/customer/forgot-password',
  '/customer/onboarding',
  '/customer/payments',
  '/customer/account/delete',
  '/technician/login',
  '/technician/register',
  '/technician/forgot-password',
  '/technician/onboarding',
  '/technician/account/delete',
  '/admin',
]

const BLOCKED_EXACT = ['/customer', '/technician', '/', '/role-select']

export function isAppDownloadPromptBlockedPath(pathname: string): boolean {
  const path = pathname.split('?')[0] || '/'
  if (BLOCKED_EXACT.includes(path)) return true
  return BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Path patterns that count as key engagement actions. */
export function engagementTriggerFromPath(
  pathname: string,
  role: AppDownloadRole,
): AppDownloadTrigger | null {
  const path = pathname.split('?')[0] || '/'
  if (role === 'customer') {
    if (path.startsWith('/customer/tracking/')) return 'post_job'
    if (path.startsWith('/customer/messages/')) return 'open_chat'
    if (path === '/customer/post-job') return null // wait until submit → tracking
  }
  if (role === 'technician') {
    if (path.startsWith('/technician/messages/')) return 'open_chat'
    if (path === '/technician/jobs' || path.startsWith('/technician/jobs/')) return 'view_jobs'
    if (path === '/technician/availability') return 'go_online'
  }
  return null
}

export function deepLinkForRole(role: AppDownloadRole, base: string): string {
  const root = role === 'technician' ? 'technician/dashboard' : 'customer/home'
  const b = (base || 'fixnow://').trim()

  if (/^fixnow:\/\//i.test(b)) {
    if (b === 'fixnow://' || b === 'fixnow:///') return `fixnow://${root}`
    return b
  }
  if (b.endsWith('://')) return `${b}${root}`

  try {
    const url = new URL(b)
    if (!url.pathname || url.pathname === '/') url.pathname = `/${root}`
    return url.toString()
  } catch {
    return `fixnow://${root}`
  }
}
