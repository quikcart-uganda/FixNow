/**
 * Centralized Admin capability / role engine.
 * Pages and APIs should call CanManage* helpers — never hardcode role strings in UI/routes.
 */

import {
  ADMIN_OPERATOR_ROLES,
  ADMIN_PERMISSIONS,
  PRODUCTION_ADMIN_ROLES,
  isProductionAdminRole,
  type AdminOperatorRoleKey,
} from '../../constants/adminIdentity.js';

export { PRODUCTION_ADMIN_ROLES, isProductionAdminRole };

export const ADMIN_CAPABILITIES = {
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
} as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[keyof typeof ADMIN_CAPABILITIES];

/** @deprecated use PRODUCTION_ADMIN_ROLES from constants — kept for import compatibility */
export type ProductionAdminRole = (typeof PRODUCTION_ADMIN_ROLES)[number];

/** Permission keys that satisfy each capability (OR). Wildcard `*` always grants. */
export const CAPABILITY_PERMISSIONS: Record<AdminCapability, string[]> = {
  CanManageFinance: [
    ADMIN_PERMISSIONS.PAYMENTS_MANAGE,
    ADMIN_PERMISSIONS.REFUNDS_MANAGE,
  ],
  CanManageSupport: [
    ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
    ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
    ADMIN_PERMISSIONS.JOBS_MANAGE,
    ADMIN_PERMISSIONS.VERIFICATION_MANAGE,
    ADMIN_PERMISSIONS.CONTENT_MANAGE,
    ADMIN_PERMISSIONS.OFFERS_MANAGE,
    ADMIN_PERMISSIONS.MARKETING_MANAGE,
  ],
  CanManageSubscriptions: [ADMIN_PERMISSIONS.PAYMENTS_MANAGE],
  CanManageUsers: [
    ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
    ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  CanManageAdmins: [ADMIN_PERMISSIONS.ADMINS_MANAGE],
  CanManageSettings: [ADMIN_PERMISSIONS.SETTINGS_MANAGE],
  CanManageInfrastructure: [ADMIN_PERMISSIONS.SETTINGS_MANAGE, ADMIN_PERMISSIONS.DEV_CONTROLS],
  CanManageProviders: [ADMIN_PERMISSIONS.SETTINGS_MANAGE],
  CanManageAI: [ADMIN_PERMISSIONS.SETTINGS_MANAGE],
  CanManageContent: [ADMIN_PERMISSIONS.CONTENT_MANAGE],
  CanManageMarketing: [
    ADMIN_PERMISSIONS.MARKETING_MANAGE,
    ADMIN_PERMISSIONS.OFFERS_MANAGE,
    ADMIN_PERMISSIONS.PROMOTIONS_MANAGE,
  ],
  CanViewReports: [ADMIN_PERMISSIONS.REPORTS_VIEW],
  CanViewAudit: [ADMIN_PERMISSIONS.AUDIT_READ],
  CanManageDevelopmentAccess: [ADMIN_PERMISSIONS.WILDCARD, ADMIN_PERMISSIONS.DEV_CONTROLS],
};

export type AdminAuthProfile = {
  adminRoleKey?: string | null;
  permissionKeys?: string[] | null;
};

export function hasWildcard(profile: AdminAuthProfile | null | undefined): boolean {
  return Boolean(profile?.permissionKeys?.includes(ADMIN_PERMISSIONS.WILDCARD));
}

export function isSuperAdmin(profile: AdminAuthProfile | null | undefined): boolean {
  return (
    profile?.adminRoleKey === ADMIN_OPERATOR_ROLES.SUPER_ADMIN || hasWildcard(profile)
  );
}

export function hasPermission(
  profile: AdminAuthProfile | null | undefined,
  ...keys: string[]
): boolean {
  if (!profile) return false;
  if (hasWildcard(profile)) return true;
  const owned = profile.permissionKeys ?? [];
  return keys.some((k) => owned.includes(k));
}

export function can(
  profile: AdminAuthProfile | null | undefined,
  capability: AdminCapability,
): boolean {
  if (!profile) return false;
  if (isSuperAdmin(profile)) return true;
  // Development Access is Super Admin only even if DEV_CONTROLS is present on others.
  if (capability === ADMIN_CAPABILITIES.CanManageDevelopmentAccess) {
    return profile.adminRoleKey === ADMIN_OPERATOR_ROLES.SUPER_ADMIN || hasWildcard(profile);
  }
  const needed = CAPABILITY_PERMISSIONS[capability] || [];
  return hasPermission(profile, ...needed);
}

export function resolveCapabilities(
  profile: AdminAuthProfile | null | undefined,
): Record<AdminCapability, boolean> {
  const out = {} as Record<AdminCapability, boolean>;
  for (const key of Object.values(ADMIN_CAPABILITIES)) {
    out[key] = can(profile, key);
  }
  return out;
}

/** Nav / route path → required capability (first match wins for page guards). */
export const ADMIN_ROUTE_CAPABILITIES: Array<{ prefix: string; capability: AdminCapability }> = [
  { prefix: '/admin/admins', capability: ADMIN_CAPABILITIES.CanManageAdmins },
  { prefix: '/admin/settings/development-access', capability: ADMIN_CAPABILITIES.CanManageDevelopmentAccess },
  { prefix: '/admin/settings/development', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/settings/sandbox', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/settings/seed-platform', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/settings/developer-preview', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/settings/governance', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/settings/launch-centre', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/location', capability: ADMIN_CAPABILITIES.CanManageProviders },
  { prefix: '/admin/providers', capability: ADMIN_CAPABILITIES.CanManageProviders },
  { prefix: '/admin/settings/providers', capability: ADMIN_CAPABILITIES.CanManageProviders },
  { prefix: '/admin/settings/realtime', capability: ADMIN_CAPABILITIES.CanManageInfrastructure },
  { prefix: '/admin/payments', capability: ADMIN_CAPABILITIES.CanManageFinance },
  { prefix: '/admin/subscriptions', capability: ADMIN_CAPABILITIES.CanManageSubscriptions },
  { prefix: '/admin/boosts', capability: ADMIN_CAPABILITIES.CanManageSubscriptions },
  { prefix: '/admin/recommendations', capability: ADMIN_CAPABILITIES.CanManageSubscriptions },
  { prefix: '/admin/free-jobs', capability: ADMIN_CAPABILITIES.CanManageSettings },
  { prefix: '/admin/locks', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/technicians', capability: ADMIN_CAPABILITIES.CanManageUsers },
  { prefix: '/admin/customers', capability: ADMIN_CAPABILITIES.CanManageUsers },
  { prefix: '/admin/jobs', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/tracking', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/verification', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/categories', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/marketing', capability: ADMIN_CAPABILITIES.CanManageMarketing },
  { prefix: '/admin/content', capability: ADMIN_CAPABILITIES.CanManageContent },
  { prefix: '/admin/notifications', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/messages', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/audit', capability: ADMIN_CAPABILITIES.CanViewAudit },
  { prefix: '/admin/reports', capability: ADMIN_CAPABILITIES.CanViewReports },
  { prefix: '/admin/trust', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/reviews', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/portal', capability: ADMIN_CAPABILITIES.CanManageSupport },
  { prefix: '/admin/dashboard', capability: ADMIN_CAPABILITIES.CanViewReports },
];

export function capabilityForPath(pathname: string): AdminCapability | null {
  const hit = ADMIN_ROUTE_CAPABILITIES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  return hit?.capability ?? null;
}

export function roleDisplayName(key: string): string {
  if (key === ADMIN_OPERATOR_ROLES.SUPER_ADMIN) return 'Super Admin';
  if (key === ADMIN_OPERATOR_ROLES.FINANCE) return 'Finance Admin';
  if (key === ADMIN_OPERATOR_ROLES.SUPPORT) return 'Support Admin';
  return key.replace(/_/g, ' ');
}

export type { AdminOperatorRoleKey };
