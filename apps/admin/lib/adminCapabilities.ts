import type { StoredUser } from '@fixnow/api'

/** Mirrors backend ADMIN_CAPABILITIES — use values from /auth/me when present. */
export const CAP = {
  CanManageFinance: 'CanManageFinance',
  CanManageSupport: 'CanManageSupport',
  CanManageSubscriptions: 'CanManageSubscriptions',
  CanManageUsers: 'CanManageUsers',
  CanManageAdmins: 'CanManageAdmins',
  CanManageSettings: 'CanManageSettings',
  CanManageInfrastructure: 'CanManageInfrastructure',
  CanManageProviders: 'CanManageProviders',
  CanManageAI: 'CanManageAI',
  CanManageContent: 'CanManageContent',
  CanManageMarketing: 'CanManageMarketing',
  CanViewReports: 'CanViewReports',
  CanViewAudit: 'CanViewAudit',
  CanManageDevelopmentAccess: 'CanManageDevelopmentAccess',
} as const

export type CapKey = (typeof CAP)[keyof typeof CAP]

/** Development Administrator / Super Admin — full Command Center access. */
export function isSuperAdmin(user: StoredUser | null | undefined): boolean {
  if (!user || user.role !== 'admin') return false
  if (user.adminRoleKey === 'super_admin') return true
  if (Boolean(user.permissionKeys?.includes('*'))) return true
  if (Boolean(user.capabilities?.CanManageDevelopmentAccess)) return true
  // Development Administrator profiles are classified as development + Super Admin RBAC.
  if (user.governanceClassification === 'development') {
    if (user.adminRoleKey === 'super_admin' || Boolean(user.permissionKeys?.includes('*'))) return true
    // Fail-open for classified Development Admin when capabilities map is present and grants infra.
    if (user.capabilities?.CanManageInfrastructure === true) return true
  }
  return false
}

/**
 * Capability check for admin Command Center modules.
 * Super Admin / Development Admin receive all capabilities (fail-open for them only).
 * Limited roles fail closed when capabilities are missing.
 */
export function can(user: StoredUser | null | undefined, capability: CapKey): boolean {
  if (!user || user.role !== 'admin') return false
  if (isSuperAdmin(user)) return true
  if (user.capabilities && typeof user.capabilities[capability] === 'boolean') {
    return Boolean(user.capabilities[capability])
  }
  // Fail closed when capabilities missing (stale session) — Super Admin check already passed.
  return false
}

export function capabilityForAdminPath(pathname: string): CapKey | null {
  const rules: Array<{ prefix: string; capability: CapKey }> = [
    { prefix: '/admin/admins', capability: CAP.CanManageAdmins },
    { prefix: '/admin/settings/development-access', capability: CAP.CanManageDevelopmentAccess },
    { prefix: '/admin/settings/development', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/settings/sandbox', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/settings/seed-platform', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/settings/developer-preview', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/settings/governance', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/settings/launch-centre', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/location', capability: CAP.CanManageProviders },
    { prefix: '/admin/settings/providers', capability: CAP.CanManageProviders },
    { prefix: '/admin/settings/realtime', capability: CAP.CanManageInfrastructure },
    { prefix: '/admin/payments', capability: CAP.CanManageFinance },
    { prefix: '/admin/subscriptions', capability: CAP.CanManageSubscriptions },
    { prefix: '/admin/boosts', capability: CAP.CanManageSubscriptions },
    { prefix: '/admin/recommendations', capability: CAP.CanManageSubscriptions },
    { prefix: '/admin/free-jobs', capability: CAP.CanManageSettings },
    { prefix: '/admin/locks', capability: CAP.CanManageSupport },
    { prefix: '/admin/technicians', capability: CAP.CanManageUsers },
    { prefix: '/admin/customers', capability: CAP.CanManageUsers },
    { prefix: '/admin/jobs', capability: CAP.CanManageSupport },
    { prefix: '/admin/tracking', capability: CAP.CanManageSupport },
    { prefix: '/admin/verification', capability: CAP.CanManageSupport },
    { prefix: '/admin/categories', capability: CAP.CanManageSupport },
    { prefix: '/admin/marketing', capability: CAP.CanManageMarketing },
    { prefix: '/admin/content', capability: CAP.CanManageContent },
    { prefix: '/admin/notifications', capability: CAP.CanManageSupport },
    { prefix: '/admin/messages', capability: CAP.CanManageSupport },
    { prefix: '/admin/audit', capability: CAP.CanViewAudit },
    { prefix: '/admin/reports', capability: CAP.CanViewReports },
    { prefix: '/admin/trust', capability: CAP.CanManageSupport },
    { prefix: '/admin/reviews', capability: CAP.CanManageSupport },
    { prefix: '/admin/portal', capability: CAP.CanManageSupport },
    { prefix: '/admin/dashboard', capability: CAP.CanViewReports },
  ]
  const hit = rules.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  return hit?.capability ?? null
}
