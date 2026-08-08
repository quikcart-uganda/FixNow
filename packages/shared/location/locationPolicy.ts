/** Location permission UX policy — timing, cooldowns, and critical-route guards. */

import type { LocationPermissionRole } from '@fixnow/native'

/** Active usage before deferred educational prompt (ms). */
export const LOCATION_DEFER_MS: Record<LocationPermissionRole, number> = {
  customer: 3 * 60_000, // mid of 2–5 min
  technician: 2.5 * 60_000, // mid of 2–3 min
}

/** After dismiss, wait this long before soft-ask again. */
export const LOCATION_DISMISS_COOLDOWN_MS = 48 * 60 * 60_000 // 48h within 24–72h

/** Soft deny without permanent flag — remind after several days of meaningful use. */
export const LOCATION_SOFT_DENY_COOLDOWN_MS = 72 * 60 * 60_000

export type LocationCopy = {
  title: string
  body: string
  enableLabel: string
  dismissLabel: string
  permanentTitle: string
  permanentBody: string
  openSettingsLabel: string
  fallbackNotice: string
}

export const LOCATION_COPY: Record<LocationPermissionRole, LocationCopy> = {
  customer: {
    title: 'Find trusted professionals near you',
    body: 'Turn on location to see nearby technicians, faster response times, and more accurate pricing.',
    enableLabel: 'Enable Location',
    dismissLabel: 'Not Now',
    permanentTitle: 'Location is currently disabled',
    permanentBody:
      'Enable it in your device settings to receive nearby recommendations and live technician tracking.',
    openSettingsLabel: 'Open Settings',
    fallbackNotice:
      'Browsing without live location — results use your city or the area you select. You can enable location anytime in Settings.',
  },
  technician: {
    title: 'Receive jobs near you',
    body: 'Enable location so we can match you with nearby jobs, improve arrival estimates, and update customers while you are en route.',
    enableLabel: 'Enable Location',
    dismissLabel: 'Later',
    permanentTitle: 'Location is currently disabled',
    permanentBody:
      'Enable it in your device settings to receive nearby jobs and live tracking while you are on a job.',
    openSettingsLabel: 'Open Settings',
    fallbackNotice:
      'Jobs are filtered by your configured service area or city. Enabling location improves matching and live tracking.',
  },
}

/** Path prefixes where location education must never interrupt. */
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
  '/admin/login',
  '/admin/forgot-password',
  '/admin/accept-invite',
]

/** Exact splash / role-select roots. */
const BLOCKED_EXACT = ['/customer', '/technician', '/admin', '/', '/role-select']

export function isLocationPromptBlockedPath(pathname: string): boolean {
  const path = pathname.split('?')[0] || '/'
  if (BLOCKED_EXACT.includes(path)) return true
  return BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Features that justify an immediate contextual education prompt. */
export type LocationTrigger =
  | 'deferred'
  | 'search'
  | 'post_job'
  | 'nearby_technicians'
  | 'share_location'
  | 'go_online'
  | 'view_jobs'
  | 'live_tracking'
  | 'settings'

export function isContextualTrigger(trigger: LocationTrigger): boolean {
  return trigger !== 'deferred'
}
