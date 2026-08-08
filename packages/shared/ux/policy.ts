/**
 * FixNow UX Message Policy
 *
 * Public UX: plain, reassuring, action-oriented — no technical jargon.
 * Admin: operational information for administrators only.
 * Developer: diagnostics / Development Mode guidance — never in production UI
 *            for ordinary customers or technicians.
 *
 * Presentation only. Does not change auth, payment, governance, or entitlements.
 */

export type UxAudience = 'public' | 'admin' | 'developer'

export type UxMessageKey = string

/** Audience that may see a catalogued message. */
export type UxMessageMeta = {
  audience: UxAudience
  /** Stable key for future localisation. */
  key: UxMessageKey
  text: string
}

export function isPublicAudience(audience: UxAudience): boolean {
  return audience === 'public'
}

export function isDeveloperAudience(audience: UxAudience): boolean {
  return audience === 'developer'
}
