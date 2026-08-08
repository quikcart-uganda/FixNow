import type { StoredUser } from '@fixnow/api'
import { getLastSelectedRole } from '@fixnow/api'

export type MarketplaceRole = 'customer' | 'technician'

export const ROLE_SELECT_PATH = '/select-role'

export const ROLE_HOME: Record<MarketplaceRole, string> = {
  customer: '/customer/home',
  technician: '/technician/dashboard',
}

export const ROLE_LOGIN: Record<MarketplaceRole, string> = {
  customer: '/customer/login',
  technician: '/technician/login',
}

const ROLE_META: Record<
  MarketplaceRole,
  { title: string; description: string; icon: string }
> = {
  customer: {
    title: 'Customer',
    description: 'Book trusted professionals.',
    icon: 'person_search',
  },
  technician: {
    title: 'Technician',
    description: 'Manage jobs, offers and earnings.',
    icon: 'engineering',
  },
}

export function roleMeta(role: MarketplaceRole) {
  return ROLE_META[role]
}

/** Marketplace profiles on this identity (excludes admin). */
export function marketplaceRolesOf(
  user: Pick<StoredUser, 'role' | 'availableRoles'> | null | undefined,
): MarketplaceRole[] {
  if (!user) return []
  const raw = Array.isArray(user.availableRoles) && user.availableRoles.length > 0
    ? user.availableRoles
    : [user.role]
  const roles = raw.filter((r): r is MarketplaceRole => r === 'customer' || r === 'technician')
  // Never drop the active marketplace role if availableRoles is malformed.
  if (
    roles.length === 0 &&
    (user.role === 'customer' || user.role === 'technician')
  ) {
    return [user.role]
  }
  return roles
}

export function homePathForRole(role: MarketplaceRole): string {
  return ROLE_HOME[role]
}

/**
 * After an explicit login / Google sign-in:
 * one role → that experience; multiple → role selector.
 */
export function resolvePostAuthDestination(
  user: Pick<StoredUser, 'role' | 'availableRoles'> | null | undefined,
): string {
  const roles = marketplaceRolesOf(user)
  if (roles.length === 1) return homePathForRole(roles[0])
  if (roles.length > 1) return ROLE_SELECT_PATH
  if (user?.role === 'admin') return '/admin/dashboard'
  return '/'
}

/**
 * Cold-start / landing resume for an already authenticated session.
 * Prefers the last selected marketplace role when still available.
 */
export function resolveSessionResumeDestination(
  user: Pick<StoredUser, 'role' | 'availableRoles'> | null | undefined,
): string {
  const roles = marketplaceRolesOf(user)
  if (roles.length === 0) {
    return user?.role === 'admin' ? '/admin/dashboard' : '/'
  }
  if (roles.length === 1) return homePathForRole(roles[0])

  const last = getLastSelectedRole()
  if (last && roles.includes(last)) return homePathForRole(last)
  return ROLE_SELECT_PATH
}

/** Role to activate for session resume (may differ from JWT active role). */
export function resolveResumeRole(
  user: Pick<StoredUser, 'role' | 'availableRoles'> | null | undefined,
): MarketplaceRole | null {
  const roles = marketplaceRolesOf(user)
  if (roles.length === 0) return null
  if (roles.length === 1) return roles[0]
  const last = getLastSelectedRole()
  if (last && roles.includes(last)) return last
  return null
}
