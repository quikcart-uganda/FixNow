export const ROLES = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = [ROLES.CUSTOMER, ROLES.TECHNICIAN, ROLES.ADMIN];

/**
 * Legacy admin role keys — kept for existing requireSuperAdmin checks.
 * Prefer ADMIN_OPERATOR_ROLES from adminIdentity.ts for new code.
 */
export const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATIONS: 'operations_admin',
  SUPPORT: 'support_admin',
  FINANCE: 'finance_admin',
  /** New catalogue keys (aliases accepted by middleware). */
  OPERATIONS_V2: 'operations',
  SUPPORT_V2: 'support',
  FINANCE_V2: 'finance',
} as const;

export type AdminRole = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES];

export {
  ADMIN_OPERATOR_ROLES,
  ADMIN_OPERATOR_STATUS,
  ADMIN_PERMISSIONS,
  ADMIN_LOGIN_ALLOWED_STATUSES,
  PERMISSION_CATALOGUE,
  ROLE_CATALOGUE,
  isDevAdminEmail,
  type AdminOperatorRoleKey,
  type AdminOperatorStatus,
  type AdminPermissionKey,
} from './adminIdentity.js';
