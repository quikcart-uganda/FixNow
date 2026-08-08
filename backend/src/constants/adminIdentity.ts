/**
 * Admin identity catalogue — roles, statuses, and granular permissions.
 * Marketplace roles (customer/technician) are unchanged; this is admin-only.
 */

export const ADMIN_OPERATOR_STATUS = {
  PENDING_INVITATION: 'pending_invitation',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled',
  LOCKED: 'locked',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

export type AdminOperatorStatus =
  (typeof ADMIN_OPERATOR_STATUS)[keyof typeof ADMIN_OPERATOR_STATUS];

/** Only Active operators may authenticate into the Admin portal. */
export const ADMIN_LOGIN_ALLOWED_STATUSES: AdminOperatorStatus[] = [
  ADMIN_OPERATOR_STATUS.ACTIVE,
];

export const ADMIN_OPERATOR_ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATIONS: 'operations',
  SUPPORT: 'support',
  FINANCE: 'finance',
  MARKETING: 'marketing',
  CONTENT: 'content',
  VERIFICATION: 'verification',
  CUSTOMER_CARE: 'customer_care',
  AUDITOR: 'auditor',
} as const;

export type AdminOperatorRoleKey =
  (typeof ADMIN_OPERATOR_ROLES)[keyof typeof ADMIN_OPERATOR_ROLES];

/** Granular permissions — independently assignable; `*` = super admin wildcard. */
export const ADMIN_PERMISSIONS = {
  WILDCARD: '*',
  TECHNICIANS_MANAGE: 'technicians.manage',
  CUSTOMERS_MANAGE: 'customers.manage',
  JOBS_MANAGE: 'jobs.manage',
  CATEGORIES_MANAGE: 'categories.manage',
  OFFERS_MANAGE: 'offers.manage',
  PROMOTIONS_MANAGE: 'promotions.manage',
  PAYMENTS_MANAGE: 'payments.manage',
  REFUNDS_MANAGE: 'refunds.manage',
  REPORTS_VIEW: 'reports.view',
  MARKETING_MANAGE: 'marketing.manage',
  CONTENT_MANAGE: 'content.manage',
  VERIFICATION_MANAGE: 'verification.manage',
  ADMINS_MANAGE: 'admins.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',
  USERS_FORCE_LOGOUT: 'users.force_logout',
  USERS_RESET_PASSWORD: 'users.reset_password',
  DEV_CONTROLS: 'dev.controls',
} as const;

export type AdminPermissionKey =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export type PermissionDefinition = {
  key: string;
  name: string;
  description: string;
  module: string;
};

export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  {
    key: ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
    name: 'Manage Technicians',
    description: 'View and moderate technician accounts',
    module: 'marketplace',
  },
  {
    key: ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
    name: 'Manage Customers',
    description: 'View and moderate customer accounts',
    module: 'marketplace',
  },
  {
    key: ADMIN_PERMISSIONS.JOBS_MANAGE,
    name: 'Manage Jobs',
    description: 'View and intervene on marketplace jobs',
    module: 'marketplace',
  },
  {
    key: ADMIN_PERMISSIONS.CATEGORIES_MANAGE,
    name: 'Manage Categories',
    description: 'Create and order service categories',
    module: 'marketplace',
  },
  {
    key: ADMIN_PERMISSIONS.OFFERS_MANAGE,
    name: 'Manage Offers',
    description: 'Approve and moderate technician offers',
    module: 'marketing',
  },
  {
    key: ADMIN_PERMISSIONS.PROMOTIONS_MANAGE,
    name: 'Manage Promotions',
    description: 'Platform promotions and campaigns',
    module: 'marketing',
  },
  {
    key: ADMIN_PERMISSIONS.MARKETING_MANAGE,
    name: 'Manage Marketing',
    description: 'Full marketing subsystem access',
    module: 'marketing',
  },
  {
    key: ADMIN_PERMISSIONS.CONTENT_MANAGE,
    name: 'Manage Content',
    description: 'CMS pages and content blocks',
    module: 'content',
  },
  {
    key: ADMIN_PERMISSIONS.PAYMENTS_MANAGE,
    name: 'Manage Payments',
    description: 'Payments, escrow, and settlements',
    module: 'payments',
  },
  {
    key: ADMIN_PERMISSIONS.REFUNDS_MANAGE,
    name: 'Manage Refunds',
    description: 'Approve and process refunds',
    module: 'payments',
  },
  {
    key: ADMIN_PERMISSIONS.REPORTS_VIEW,
    name: 'Manage Reports',
    description: 'Analytics and operational reports',
    module: 'analytics',
  },
  {
    key: ADMIN_PERMISSIONS.VERIFICATION_MANAGE,
    name: 'Manage Verification',
    description: 'Identity and skill verification queue',
    module: 'trust',
  },
  {
    key: ADMIN_PERMISSIONS.ADMINS_MANAGE,
    name: 'Manage Admins',
    description: 'Invite, suspend, and permission other administrators',
    module: 'identity',
  },
  {
    key: ADMIN_PERMISSIONS.SETTINGS_MANAGE,
    name: 'Manage Settings',
    description: 'Platform and development settings',
    module: 'platform',
  },
  {
    key: ADMIN_PERMISSIONS.AUDIT_READ,
    name: 'View Audit Logs',
    description: 'Read the security and operations audit trail',
    module: 'security',
  },
  {
    key: ADMIN_PERMISSIONS.USERS_FORCE_LOGOUT,
    name: 'Force Logout Users',
    description: 'Invalidate sessions for any user',
    module: 'security',
  },
  {
    key: ADMIN_PERMISSIONS.USERS_RESET_PASSWORD,
    name: 'Reset User Passwords',
    description: 'Admin-initiated password resets for marketplace users',
    module: 'security',
  },
  {
    key: ADMIN_PERMISSIONS.DEV_CONTROLS,
    name: 'Development Controls',
    description: 'Toggle non-production development flags',
    module: 'platform',
  },
];

export const ROLE_CATALOGUE: Array<{
  key: AdminOperatorRoleKey;
  name: string;
  description: string;
  permissionKeys: string[];
  isSystem: boolean;
}> = [
  {
    key: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full platform control including admin identity and Development Access',
    permissionKeys: [ADMIN_PERMISSIONS.WILDCARD],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.OPERATIONS,
    name: 'Operations',
    description: 'Marketplace operations and job oversight',
    permissionKeys: [
      ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
      ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
      ADMIN_PERMISSIONS.JOBS_MANAGE,
      ADMIN_PERMISSIONS.CATEGORIES_MANAGE,
      ADMIN_PERMISSIONS.REPORTS_VIEW,
      ADMIN_PERMISSIONS.AUDIT_READ,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.SUPPORT,
    name: 'Support Admin',
    description:
      'Day-to-day operations: customers, technicians, verification, CMS, offers, moderation — no finance or system settings',
    permissionKeys: [
      ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
      ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
      ADMIN_PERMISSIONS.JOBS_MANAGE,
      ADMIN_PERMISSIONS.CATEGORIES_MANAGE,
      ADMIN_PERMISSIONS.VERIFICATION_MANAGE,
      ADMIN_PERMISSIONS.CONTENT_MANAGE,
      ADMIN_PERMISSIONS.OFFERS_MANAGE,
      ADMIN_PERMISSIONS.PROMOTIONS_MANAGE,
      ADMIN_PERMISSIONS.MARKETING_MANAGE,
      ADMIN_PERMISSIONS.REPORTS_VIEW,
      ADMIN_PERMISSIONS.AUDIT_READ,
      ADMIN_PERMISSIONS.USERS_FORCE_LOGOUT,
      ADMIN_PERMISSIONS.USERS_RESET_PASSWORD,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.FINANCE,
    name: 'Finance Admin',
    description:
      'Subscription payments, refunds, boost payments, revenue analytics — no system settings or role management',
    permissionKeys: [
      ADMIN_PERMISSIONS.PAYMENTS_MANAGE,
      ADMIN_PERMISSIONS.REFUNDS_MANAGE,
      ADMIN_PERMISSIONS.REPORTS_VIEW,
      ADMIN_PERMISSIONS.AUDIT_READ,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.MARKETING,
    name: 'Marketing',
    description: 'Offers, promotions, and campaigns',
    permissionKeys: [
      ADMIN_PERMISSIONS.OFFERS_MANAGE,
      ADMIN_PERMISSIONS.PROMOTIONS_MANAGE,
      ADMIN_PERMISSIONS.MARKETING_MANAGE,
      ADMIN_PERMISSIONS.CONTENT_MANAGE,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.CONTENT,
    name: 'Content',
    description: 'CMS and educational content',
    permissionKeys: [ADMIN_PERMISSIONS.CONTENT_MANAGE],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.VERIFICATION,
    name: 'Verification',
    description: 'Identity and skill verification',
    permissionKeys: [
      ADMIN_PERMISSIONS.VERIFICATION_MANAGE,
      ADMIN_PERMISSIONS.TECHNICIANS_MANAGE,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.CUSTOMER_CARE,
    name: 'Customer Care',
    description: 'Front-line customer support',
    permissionKeys: [
      ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
      ADMIN_PERMISSIONS.JOBS_MANAGE,
      ADMIN_PERMISSIONS.USERS_RESET_PASSWORD,
    ],
    isSystem: true,
  },
  {
    key: ADMIN_OPERATOR_ROLES.AUDITOR,
    name: 'Read-only Auditor',
    description: 'Audit logs and reports only',
    permissionKeys: [ADMIN_PERMISSIONS.AUDIT_READ, ADMIN_PERMISSIONS.REPORTS_VIEW],
    isSystem: true,
  },
];

/** Demo / seed admin emails — blocked in production unless ALLOW_DEV_ADMIN_LOGIN. */
export const DEV_ADMIN_EMAIL_SUFFIXES = ['@fixnow.demo', '@example.com', '@test.local'] as const;

export function isDevAdminEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  return DEV_ADMIN_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Canonical seeded Development Administrator.
 * Exists ONLY when ALLOW_DEV_ADMIN_LOGIN=true and the environment is non-production.
 * Never migrated or exposed in production (its email matches isDevAdminEmail and is
 * additionally guarded by the login gate).
 */
export const DEV_ADMIN = {
  email: 'dev.admin@fixnow.demo',
  fullName: 'Development Administrator',
  department: 'Development',
} as const;

/** Only these three roles may be assigned to new production administrators. */
export const PRODUCTION_ADMIN_ROLES = [
  ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
  ADMIN_OPERATOR_ROLES.FINANCE,
  ADMIN_OPERATOR_ROLES.SUPPORT,
] as const;

export type ProductionAdminRole = (typeof PRODUCTION_ADMIN_ROLES)[number];

export function isProductionAdminRole(key: string): key is ProductionAdminRole {
  return (PRODUCTION_ADMIN_ROLES as readonly string[]).includes(key);
}
