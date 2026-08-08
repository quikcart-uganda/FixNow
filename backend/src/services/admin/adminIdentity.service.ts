/**
 * Admin identity — catalogue seed, invitations, operator lifecycle, recovery hooks.
 * Does not alter customer/technician registration or JWT shape.
 */

import crypto from 'node:crypto';
import { Types } from 'mongoose';
import {
  ADMIN_LOGIN_ALLOWED_STATUSES,
  ADMIN_OPERATOR_ROLES,
  ADMIN_OPERATOR_STATUS,
  ADMIN_PERMISSIONS,
  DEV_ADMIN,
  DEV_ADMIN_EMAIL_SUFFIXES,
  PERMISSION_CATALOGUE,
  PRODUCTION_ADMIN_ROLES,
  ROLE_CATALOGUE,
  isDevAdminEmail,
  isProductionAdminRole,
  type AdminOperatorStatus,
} from '../../constants/adminIdentity.js';
import { ROLES } from '../../constants/roles.js';
import { env } from '../../config/env.js';
import {
  AdminBootstrapState,
  AdminInvitation,
  AdminLoginEvent,
  AdminRecoveryRequest,
  AdminRole,
  AdminUser,
  Permission,
  User,
} from '../../models/index.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { getEmailProvider } from '../../providers/email/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { randomToken, sha256, timingSafeEqualStr } from '../../utils/crypto.js';
import { comparePassword, hashPassword } from '../../utils/password.js';

const BOOTSTRAP_KEY = 'super_admin_bootstrap';
const PASSWORD_POLICY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

export function assertAdminPasswordPolicy(password: string) {
  if (!PASSWORD_POLICY.test(password)) {
    throw AppError.badRequest(
      'Password must be 12–128 characters and include upper, lower, number, and symbol.',
    );
  }
}

export function formatRecoveryKey(): string {
  const raw = crypto.randomBytes(20).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g)!.join('-');
}

export async function ensurePermissionCatalogue() {
  for (const def of PERMISSION_CATALOGUE) {
    await Permission.updateOne(
      { key: def.key },
      {
        $set: {
          name: def.name,
          description: def.description,
          module: def.module,
          isActive: true,
          isDeleted: false,
        },
        $setOnInsert: { key: def.key },
      },
      { upsert: true },
    );
  }
  const perms = await Permission.find({ isActive: true }).lean();
  const byKey = new Map(perms.map((p) => [p.key, p._id]));

  for (const role of ROLE_CATALOGUE) {
    const permissionIds = role.permissionKeys
      .filter((k) => k !== ADMIN_PERMISSIONS.WILDCARD)
      .map((k) => byKey.get(k))
      .filter(Boolean) as Types.ObjectId[];

    await AdminRole.updateOne(
      { key: role.key },
      {
        $set: {
          name: role.name,
          description: role.description,
          permissionKeys: role.permissionKeys,
          permissionIds,
          isSystem: role.isSystem,
          isActive: true,
          isDeleted: false,
        },
        $setOnInsert: { key: role.key },
      },
      { upsert: true },
    );
  }

  return { permissions: perms.length, roles: ROLE_CATALOGUE.length };
}

function resolvePermissionKeys(roleKey: string, overrides?: string[]): string[] {
  const catalog = ROLE_CATALOGUE.find((r) => r.key === roleKey);
  if (overrides && overrides.length) {
    if (overrides.includes(ADMIN_PERMISSIONS.WILDCARD)) return [ADMIN_PERMISSIONS.WILDCARD];
    return [...new Set(overrides)];
  }
  return catalog?.permissionKeys?.length
    ? [...catalog.permissionKeys]
    : [ADMIN_PERMISSIONS.AUDIT_READ];
}

/**
 * Passwordless Development Administrator access.
 * Prefer `isDevLoginEnabled()` (async) — respects Super Admin transition controls.
 * Sync `devLoginEnabled()` is env-only and kept for non-async call sites.
 */
export function devLoginEnabled(): boolean {
  return env.allowDevAdminLogin && !env.isProductionEnv;
}

export async function isDevLoginEnabled(): Promise<boolean> {
  const { isDevLoginEnabled: check } = await import('./developmentAccess.service.js');
  return check();
}

/**
 * Idempotently ensure the seeded Development Administrator (Super Admin) exists.
 * Refuses entirely in production or when Development Access is off.
 */
export async function ensureDevAdmin() {
  if (!(await isDevLoginEnabled())) {
    throw AppError.forbidden(
      'Development administrator access is disabled. A Super Admin can re-enable it under Security → Development Access (non-production only).',
    );
  }

  await ensurePermissionCatalogue();
  const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.SUPER_ADMIN });
  if (!role) throw new AppError('Super Admin role missing after catalogue seed', 500);

  const email = DEV_ADMIN.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    // Random unguessable password — dev entry is passwordless and never uses it.
    const passwordHash = await hashPassword(`${randomToken(24)}Aa1!`);
    user = await User.create({
      email,
      fullName: DEV_ADMIN.fullName,
      passwordHash,
      role: ROLES.ADMIN,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      authProviders: ['password'],
      passwordChangedAt: new Date(),
    });
  } else if (
    user.role !== ROLES.ADMIN ||
    user.accountStatus !== ACCOUNT_STATUS.ACTIVE ||
    user.isDeleted
  ) {
    user.role = ROLES.ADMIN;
    user.accountStatus = ACCOUNT_STATUS.ACTIVE;
    user.isDeleted = false;
    user.lockUntil = undefined;
    user.failedLoginAttempts = 0;
    await user.save();
  }

  let adminUser = await AdminUser.findOne({ userId: user._id });
  if (!adminUser) {
    adminUser = await AdminUser.create({
      userId: user._id,
      adminRoleId: role._id,
      adminRoleKey: role.key,
      permissionKeys: [ADMIN_PERMISSIONS.WILDCARD],
      status: ADMIN_OPERATOR_STATUS.ACTIVE,
      isActive: true,
      department: DEV_ADMIN.department,
      governanceClassification: 'development',
      notes: 'Seeded development administrator — non-production only',
    });
  } else {
    // Always reinforce full Super Admin + development capabilities while ensuring account.
    // Do not leave an "active but stripped" profile that fails frontend/backend capability checks.
    adminUser.status = ADMIN_OPERATOR_STATUS.ACTIVE;
    adminUser.isActive = true;
    adminUser.isDeleted = false;
    adminUser.adminRoleId = role._id;
    adminUser.adminRoleKey = role.key;
    adminUser.permissionKeys = [ADMIN_PERMISSIONS.WILDCARD];
    adminUser.governanceClassification = 'development';
    if (!adminUser.notes || /disabled|transition/i.test(adminUser.notes)) {
      adminUser.notes = 'Seeded development administrator — non-production only';
    }
    await adminUser.save();
  }

  return { user, adminUser };
}

export async function getActiveAdminProfile(userId: string) {
  return AdminUser.findOne({
    userId,
    status: ADMIN_OPERATOR_STATUS.ACTIVE,
    isActive: true,
    isDeleted: { $ne: true },
  });
}

export async function assertAdminMayLogin(user: {
  _id: Types.ObjectId;
  email: string;
  role: string;
  accountStatus: string;
}) {
  if (user.role !== ROLES.ADMIN) return null;

  if (isDevAdminEmail(user.email) && !env.allowDevAdminLogin) {
    throw AppError.forbidden(
      'Development administrator accounts are disabled. Set ALLOW_DEV_ADMIN_LOGIN=true only in non-production environments.',
    );
  }

  let profile = await AdminUser.findOne({ userId: user._id, isDeleted: { $ne: true } });

  // Legacy migration: existing role=admin users without AdminUser get a provisional ops profile
  // only when ALLOW_DEV_ADMIN_LOGIN (or non-production bootstrap) — never invent Super Admin.
  if (!profile && env.allowDevAdminLogin && !env.isProductionEnv) {
    await ensurePermissionCatalogue();
    const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.OPERATIONS });
    if (role) {
      profile = await AdminUser.create({
        userId: user._id,
        adminRoleId: role._id,
        adminRoleKey: role.key,
        permissionKeys: role.permissionKeys,
        status: ADMIN_OPERATOR_STATUS.ACTIVE,
        isActive: true,
        department: 'Legacy',
        notes: 'Auto-linked legacy admin during identity migration',
      });
      await writeAuditLog({
        actorId: user._id.toString(),
        actorRole: ROLES.ADMIN,
        action: 'admin.identity.legacy_linked',
        resourceType: 'AdminUser',
        resourceId: profile._id.toString(),
        severity: 'warning',
      });
    }
  }

  if (!profile) {
    throw AppError.forbidden(
      'No administrator profile. Complete Super Admin bootstrap or accept an invitation.',
    );
  }

  if (!ADMIN_LOGIN_ALLOWED_STATUSES.includes(profile.status as AdminOperatorStatus)) {
    throw AppError.forbidden(`Administrator account is ${profile.status.replace(/_/g, ' ')}`);
  }

  if (!profile.isActive) {
    throw AppError.forbidden('Administrator account is inactive');
  }

  return profile;
}

export async function recordAdminLoginEvent(input: {
  userId: string;
  adminUserId?: string;
  email: string;
  success: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}) {
  try {
    await AdminLoginEvent.create({
      userId: input.userId,
      adminUserId: input.adminUserId,
      email: input.email.toLowerCase(),
      success: input.success,
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent,
      deviceId: input.deviceId,
    });
  } catch {
    /* never block auth on telemetry */
  }
}

export async function revokeAllAdminSessions(userId: string) {
  const user = await User.findById(userId);
  if (!user) return;
  user.refreshTokenVersion += 1;
  await user.save();
  try {
    const { Session } = await import('../../models/index.js');
    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: 'admin_recovery' } },
    );
  } catch {
    /* sessions optional */
  }
}

export const adminIdentityService = {
  async seedCatalogue() {
    return ensurePermissionCatalogue();
  },

  async bootstrapStatus() {
    const state = await AdminBootstrapState.findOne({ key: BOOTSTRAP_KEY });

    // Seeded development administrators must never count as system initialization.
    // Otherwise one dev quick login would permanently flip /admin to the standard
    // login screen even though no real administrator exists.
    const devAdminUserIds = (
      await User.find(
        {
          role: ROLES.ADMIN,
          email: {
            $in: DEV_ADMIN_EMAIL_SUFFIXES.map(
              (suffix) => new RegExp(`${suffix.replace(/\./g, '\\.')}$`, 'i'),
            ),
          },
        },
        { _id: 1 },
      ).lean()
    ).map((u) => u._id);

    const excludeDevAdmins = devAdminUserIds.length ? { userId: { $nin: devAdminUserIds } } : {};

    const superCount = await AdminUser.countDocuments({
      adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
      status: ADMIN_OPERATOR_STATUS.ACTIVE,
      isDeleted: { $ne: true },
      ...excludeDevAdmins,
    });
    const adminCount = await AdminUser.countDocuments({
      status: { $ne: ADMIN_OPERATOR_STATUS.DELETED },
      isDeleted: { $ne: true },
      ...excludeDevAdmins,
    });
    return {
      completed: Boolean(state?.completed) || superCount > 0 || adminCount > 0,
      superAdminCount: superCount,
      adminCount,
      recoveryKeyHint: state?.recoveryKeyHint ?? null,
      /** Drives the login page Development Access button — not rendered when false. */
      devLoginEnabled: await isDevLoginEnabled(),
      environment: env.appEnv,
    };
  },

  /**
   * Public first-Super-Admin creation used by the guided web wizard. Delegates to
   * the same guarded bootstrap routine, so it refuses once any admin exists.
   */
  async bootstrapFirstSuperAdmin(input: {
    email: string;
    fullName: string;
    password: string;
    phone?: string;
  }) {
    return this.bootstrapSuperAdmin(input);
  },

  /**
   * One-time Super Admin creation. Idempotent once completed — never creates a second auto Super Admin.
   */
  async bootstrapSuperAdmin(input: {
    email: string;
    fullName: string;
    password: string;
    phone?: string;
  }) {
    const status = await this.bootstrapStatus();
    if (status.completed) {
      throw AppError.conflict('Super Admin bootstrap already completed');
    }

    const claimUntil = new Date(Date.now() + 120_000);
    let claimed: typeof status | null = null;
    try {
      claimed = await AdminBootstrapState.findOneAndUpdate(
        {
          key: BOOTSTRAP_KEY,
          completed: { $ne: true },
          $or: [{ claimLockUntil: { $exists: false } }, { claimLockUntil: { $lte: new Date() } }],
        },
        {
          $set: { claimLockUntil: claimUntil },
          $setOnInsert: { key: BOOTSTRAP_KEY, completed: false },
        },
        { upsert: true, new: true },
      );
    } catch {
      const existing = await AdminBootstrapState.findOne({ key: BOOTSTRAP_KEY }).lean();
      if (existing?.completed) {
        throw AppError.conflict('Super Admin bootstrap already completed');
      }
      throw AppError.conflict('Bootstrap already in progress. Retry shortly.');
    }
    if (!claimed || claimed.completed) {
      const existing = await AdminBootstrapState.findOne({ key: BOOTSTRAP_KEY }).lean();
      if (existing?.completed) {
        throw AppError.conflict('Super Admin bootstrap already completed');
      }
      throw AppError.conflict('Bootstrap already in progress. Retry shortly.');
    }

    assertAdminPasswordPolicy(input.password);
    await ensurePermissionCatalogue();

    const email = input.email.toLowerCase().trim();
    if (env.isProductionEnv && isDevAdminEmail(email)) {
      throw AppError.badRequest('Demo admin emails cannot bootstrap production');
    }

    const existing = await User.findOne({ email });
    if (existing && existing.role !== ROLES.ADMIN) {
      throw AppError.conflict('Email already belongs to a non-admin account');
    }

    const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.SUPER_ADMIN });
    if (!role) throw new AppError('Super Admin role missing after catalogue seed', 500);

    const passwordHash = await hashPassword(input.password);
    let user = existing;
    if (!user) {
      user = await User.create({
        email,
        fullName: input.fullName.trim(),
        phone: input.phone,
        passwordHash,
        role: ROLES.ADMIN,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        emailVerifiedAt: new Date(),
        authProviders: ['password'],
        passwordChangedAt: new Date(),
      });
    } else {
      user.passwordHash = passwordHash;
      user.fullName = input.fullName.trim();
      user.role = ROLES.ADMIN;
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
      user.passwordChangedAt = new Date();
      user.refreshTokenVersion += 1;
      await user.save();
    }

    const recoveryKey = formatRecoveryKey();
    const recoveryKeyHash = sha256(recoveryKey);

    let adminUser = await AdminUser.findOne({ userId: user._id });
    if (!adminUser) {
      adminUser = await AdminUser.create({
        userId: user._id,
        adminRoleId: role._id,
        adminRoleKey: role.key,
        permissionKeys: [ADMIN_PERMISSIONS.WILDCARD],
        status: ADMIN_OPERATOR_STATUS.ACTIVE,
        isActive: true,
        department: 'Executive',
        createdBy: user._id,
        bootstrapRecoveryKeyHash: recoveryKeyHash,
        bootstrapRecoveryKeyCreatedAt: new Date(),
      });
    } else {
      adminUser.adminRoleId = role._id;
      adminUser.adminRoleKey = role.key;
      adminUser.permissionKeys = [ADMIN_PERMISSIONS.WILDCARD];
      adminUser.status = ADMIN_OPERATOR_STATUS.ACTIVE;
      adminUser.isActive = true;
      adminUser.bootstrapRecoveryKeyHash = recoveryKeyHash;
      adminUser.bootstrapRecoveryKeyCreatedAt = new Date();
      await adminUser.save();
    }

    await AdminBootstrapState.findOneAndUpdate(
      { key: BOOTSTRAP_KEY },
      {
        $set: {
          completed: true,
          completedAt: new Date(),
          superAdminUserId: user._id,
          recoveryKeyHash,
          recoveryKeyHint: recoveryKey.slice(0, 9) + '…',
          claimLockUntil: undefined,
        },
      },
      { upsert: true },
    );

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: ROLES.ADMIN,
      action: 'admin.bootstrap.completed',
      resourceType: 'AdminUser',
      resourceId: adminUser._id.toString(),
      severity: 'critical',
      after: { email, role: ADMIN_OPERATOR_ROLES.SUPER_ADMIN },
    });

    // Automatic awareness that a real Super Admin exists — do NOT lock Development tooling
    // while Platform Mode remains Development (restriction happens on enter Production Mode).
    try {
      const { completeDevelopmentTransition } = await import('./developmentAccess.service.js');
      await completeDevelopmentTransition({
        actorId: user._id.toString(),
        reason: 'First real Super Admin created — Development Admin remains available until Production Mode',
        action: 'transition_completed',
      });
    } catch {
      /* transition must not fail bootstrap */
    }

    return {
      userId: user._id.toString(),
      adminUserId: adminUser._id.toString(),
      email: user.email,
      /** Shown once — never persisted in plaintext */
      bootstrapRecoveryKey: recoveryKey,
      message:
        'Store the bootstrap recovery key offline. It will not be shown again and is required for catastrophic Super Admin recovery. Development Administrator access has been automatically disabled.',
    };
  },

  async listOperators(query: {
    q?: string;
    status?: string;
    role?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (query.status) filter.status = query.status;
    if (query.role) filter.adminRoleKey = query.role;

    const rows = await AdminUser.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const userIds = rows.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('email fullName phone accountStatus lastLoginAt createdAt')
      .lean();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    let items = rows.map((r) => {
      const u = byId.get(r.userId.toString());
      return {
        id: r._id.toString(),
        userId: r.userId.toString(),
        email: u?.email ?? '',
        fullName: u?.fullName ?? '',
        phone: u?.phone ?? '',
        department: r.department ?? '',
        role: r.adminRoleKey,
        permissions: r.permissionKeys,
        status: r.status,
        isActive: r.isActive,
        mfaEnabled: r.mfaEnabled,
        lastLoginAt: r.lastLoginAt ?? u?.lastLoginAt ?? null,
        createdAt: r.createdAt,
        accountStatus: u?.accountStatus ?? null,
      };
    });

    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.email.includes(q) ||
          i.fullName.toLowerCase().includes(q) ||
          i.department.toLowerCase().includes(q),
      );
    }

    const total = await AdminUser.countDocuments(filter);
    return { items, meta: { page, limit, total } };
  },

  async invite(input: {
    email: string;
    fullName: string;
    phone?: string;
    department?: string;
    adminRoleKey: string;
    permissionKeys?: string[];
    invitedByUserId: string;
  }) {
    await ensurePermissionCatalogue();
    const email = input.email.toLowerCase().trim();
    if (env.isProductionEnv && isDevAdminEmail(email)) {
      throw AppError.badRequest('Cannot invite demo administrator emails in production');
    }

    const role = await AdminRole.findOne({ key: input.adminRoleKey, isActive: true });
    if (!role) throw AppError.badRequest('Unknown administrator role');

    if (!isProductionAdminRole(role.key)) {
      throw AppError.badRequest(
        'Only Super Admin, Finance Admin, or Support Admin may be assigned to new administrators',
      );
    }

    if (role.key === ADMIN_OPERATOR_ROLES.SUPER_ADMIN) {
      const actor = await AdminUser.findOne({
        userId: input.invitedByUserId,
        status: ADMIN_OPERATOR_STATUS.ACTIVE,
      });
      if (
        actor?.adminRoleKey !== ADMIN_OPERATOR_ROLES.SUPER_ADMIN &&
        !actor?.permissionKeys?.includes(ADMIN_PERMISSIONS.WILDCARD)
      ) {
        throw AppError.forbidden('Only Super Administrators can invite another Super Admin');
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.role !== ROLES.ADMIN) {
      throw AppError.conflict('Email already registered as a marketplace account');
    }
    if (existingUser) {
      const existingAdmin = await AdminUser.findOne({
        userId: existingUser._id,
        status: { $nin: [ADMIN_OPERATOR_STATUS.DELETED, ADMIN_OPERATOR_STATUS.ARCHIVED] },
      });
      if (existingAdmin && existingAdmin.status === ADMIN_OPERATOR_STATUS.ACTIVE) {
        throw AppError.conflict('An active administrator already uses this email');
      }
    }

    await AdminInvitation.updateMany(
      { email, status: 'pending' },
      { $set: { status: 'revoked', revokedAt: new Date() } },
    );

    const rawToken = randomToken(32);
    const permissionKeys = resolvePermissionKeys(role.key, input.permissionKeys);
    const expiresAt = new Date(Date.now() + env.adminInviteTtlHours * 60 * 60 * 1000);

    const invitation = await AdminInvitation.create({
      email,
      fullName: input.fullName.trim(),
      phone: input.phone,
      department: input.department,
      adminRoleKey: role.key,
      permissionKeys,
      invitedBy: input.invitedByUserId,
      tokenHash: sha256(rawToken),
      expiresAt,
      status: 'pending',
    });

    const acceptUrl = `${env.adminFrontendUrl.replace(/\/$/, '')}/admin/accept-invite?token=${rawToken}`;

    try {
      await getEmailProvider().send({
        to: email,
        subject: 'FixNow Admin invitation',
        text: `You have been invited to FixNow Admin as ${role.name}.\n\nOpen this link within ${env.adminInviteTtlHours} hours to set your password:\n${acceptUrl}\n\nIf you did not expect this, ignore this email.`,
        html: `<p>You have been invited to <strong>FixNow Admin</strong> as <strong>${role.name}</strong>.</p><p><a href="${acceptUrl}">Set your password and activate</a></p><p>This link expires in ${env.adminInviteTtlHours} hours and can be used once.</p>`,
      });
    } catch (err) {
      await writeAuditLog({
        actorId: input.invitedByUserId,
        actorRole: ROLES.ADMIN,
        action: 'admin.invite.email_failed',
        resourceType: 'AdminInvitation',
        resourceId: invitation._id.toString(),
        severity: 'warning',
        after: { email, error: err instanceof Error ? err.message : 'send_failed' },
      });
    }

    await writeAuditLog({
      actorId: input.invitedByUserId,
      actorRole: ROLES.ADMIN,
      action: 'admin.invite.sent',
      resourceType: 'AdminInvitation',
      resourceId: invitation._id.toString(),
      severity: 'critical',
      after: { email, role: role.key, expiresAt },
    });

    return {
      invitationId: invitation._id.toString(),
      email,
      role: role.key,
      expiresAt,
      /** Returned only outside production so local QA can activate without email. */
      acceptToken: env.isProductionEnv ? undefined : rawToken,
      acceptUrl: env.isProductionEnv ? undefined : acceptUrl,
    };
  },

  async acceptInvitation(input: { token: string; password: string }) {
    assertAdminPasswordPolicy(input.password);
    const tokenHash = sha256(input.token.trim());
    const invitation = await AdminInvitation.findOne({ tokenHash }).select('+tokenHash');
    if (!invitation || invitation.status !== 'pending') {
      throw AppError.badRequest('Invitation is invalid or already used');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = 'expired';
      await invitation.save();
      throw AppError.badRequest('Invitation has expired');
    }

    await ensurePermissionCatalogue();
    const role = await AdminRole.findOne({ key: invitation.adminRoleKey });
    if (!role) throw new AppError('Invited role no longer exists', 500);

    const passwordHash = await hashPassword(input.password);
    let user = await User.findOne({ email: invitation.email });
    if (!user) {
      user = await User.create({
        email: invitation.email,
        fullName: invitation.fullName,
        phone: invitation.phone,
        passwordHash,
        role: ROLES.ADMIN,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        emailVerifiedAt: new Date(),
        authProviders: ['password'],
        passwordChangedAt: new Date(),
      });
    } else {
      user.passwordHash = passwordHash;
      user.fullName = invitation.fullName;
      user.role = ROLES.ADMIN;
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
      user.passwordChangedAt = new Date();
      user.refreshTokenVersion += 1;
      await user.save();
    }

    let adminUser = await AdminUser.findOne({ userId: user._id });
    if (!adminUser) {
      adminUser = await AdminUser.create({
        userId: user._id,
        adminRoleId: role._id,
        adminRoleKey: role.key,
        permissionKeys: invitation.permissionKeys.length
          ? invitation.permissionKeys
          : role.permissionKeys,
        department: invitation.department,
        status: ADMIN_OPERATOR_STATUS.ACTIVE,
        isActive: true,
        invitedBy: invitation.invitedBy,
        createdBy: invitation.invitedBy,
        invitationId: invitation._id,
      });
    } else {
      adminUser.adminRoleId = role._id;
      adminUser.adminRoleKey = role.key;
      adminUser.permissionKeys = invitation.permissionKeys.length
        ? invitation.permissionKeys
        : role.permissionKeys;
      adminUser.department = invitation.department;
      adminUser.status = ADMIN_OPERATOR_STATUS.ACTIVE;
      adminUser.isActive = true;
      adminUser.invitedBy = invitation.invitedBy;
      adminUser.invitationId = invitation._id;
      await adminUser.save();
    }

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    invitation.acceptedUserId = user._id;
    await invitation.save();

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: ROLES.ADMIN,
      action: 'admin.invite.accepted',
      resourceType: 'AdminUser',
      resourceId: adminUser._id.toString(),
      severity: 'critical',
      after: { email: user.email, role: role.key },
    });

    return {
      userId: user._id.toString(),
      email: user.email,
      role: role.key,
      message: 'Administrator account activated. You can sign in to the Command Center.',
    };
  },

  async updateOperatorStatus(input: {
    adminUserId: string;
    status: AdminOperatorStatus;
    actorUserId: string;
    reason?: string;
  }) {
    const target = await AdminUser.findById(input.adminUserId);
    if (!target || target.isDeleted) throw AppError.notFound('Administrator not found');

    if (
      target.adminRoleKey === ADMIN_OPERATOR_ROLES.SUPER_ADMIN &&
      input.status !== ADMIN_OPERATOR_STATUS.ACTIVE
    ) {
      const otherSupers = await AdminUser.countDocuments({
        _id: { $ne: target._id },
        adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
        status: ADMIN_OPERATOR_STATUS.ACTIVE,
        isDeleted: { $ne: true },
      });
      if (otherSupers < 1) {
        throw AppError.badRequest('Cannot deactivate the only active Super Administrator');
      }
    }

    const before = { status: target.status, isActive: target.isActive };
    target.status = input.status;
    target.isActive = input.status === ADMIN_OPERATOR_STATUS.ACTIVE;
    if (input.status === ADMIN_OPERATOR_STATUS.DELETED) {
      target.isDeleted = true;
      target.deletedAt = new Date();
    }
    await target.save();

    const user = await User.findById(target.userId);
    if (user) {
      if (input.status === ADMIN_OPERATOR_STATUS.SUSPENDED) {
        user.accountStatus = ACCOUNT_STATUS.SUSPENDED;
      } else if (input.status === ADMIN_OPERATOR_STATUS.LOCKED) {
        user.accountStatus = ACCOUNT_STATUS.LOCKED;
        user.lockUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      } else if (input.status === ADMIN_OPERATOR_STATUS.ACTIVE) {
        user.accountStatus = ACCOUNT_STATUS.ACTIVE;
        user.lockUntil = undefined;
        user.failedLoginAttempts = 0;
      } else if (
        input.status === ADMIN_OPERATOR_STATUS.DISABLED ||
        input.status === ADMIN_OPERATOR_STATUS.ARCHIVED ||
        input.status === ADMIN_OPERATOR_STATUS.DELETED
      ) {
        user.accountStatus = ACCOUNT_STATUS.SUSPENDED;
      }
      user.refreshTokenVersion += 1;
      await user.save();
    }

    await writeAuditLog({
      actorId: input.actorUserId,
      actorRole: ROLES.ADMIN,
      action: `admin.status.${input.status}`,
      resourceType: 'AdminUser',
      resourceId: target._id.toString(),
      severity: 'critical',
      before,
      after: { status: target.status, isActive: target.isActive, reason: input.reason },
    });

    return { id: target._id.toString(), status: target.status };
  },

  async updatePermissions(input: {
    adminUserId: string;
    adminRoleKey?: string;
    permissionKeys?: string[];
    department?: string;
    actorUserId: string;
  }) {
    const target = await AdminUser.findById(input.adminUserId);
    if (!target || target.isDeleted) throw AppError.notFound('Administrator not found');

    const before = {
      role: target.adminRoleKey,
      permissions: [...target.permissionKeys],
      department: target.department,
    };

    if (input.adminRoleKey) {
      const role = await AdminRole.findOne({ key: input.adminRoleKey, isActive: true });
      if (!role) throw AppError.badRequest('Unknown role');
      target.adminRoleId = role._id;
      target.adminRoleKey = role.key;
      target.permissionKeys = resolvePermissionKeys(role.key, input.permissionKeys);
    } else if (input.permissionKeys) {
      target.permissionKeys = resolvePermissionKeys(target.adminRoleKey, input.permissionKeys);
    }
    if (input.department !== undefined) target.department = input.department;
    await target.save();

    await writeAuditLog({
      actorId: input.actorUserId,
      actorRole: ROLES.ADMIN,
      action: 'admin.permissions.changed',
      resourceType: 'AdminUser',
      resourceId: target._id.toString(),
      severity: 'critical',
      before,
      after: {
        role: target.adminRoleKey,
        permissions: target.permissionKeys,
        department: target.department,
      },
    });

    return {
      id: target._id.toString(),
      role: target.adminRoleKey,
      permissions: target.permissionKeys,
    };
  },

  async resendInvitation(invitationId: string, actorUserId: string) {
    const invitation = await AdminInvitation.findById(invitationId);
    if (!invitation) throw AppError.notFound('Invitation not found');
    if (invitation.status === 'accepted') {
      throw AppError.badRequest('Invitation already accepted');
    }

    return this.invite({
      email: invitation.email,
      fullName: invitation.fullName,
      phone: invitation.phone,
      department: invitation.department,
      adminRoleKey: invitation.adminRoleKey,
      permissionKeys: invitation.permissionKeys,
      invitedByUserId: actorUserId,
    });
  },

  async listLoginHistory(adminUserId: string, limit = 50) {
    const admin = await AdminUser.findById(adminUserId);
    if (!admin) throw AppError.notFound('Administrator not found');
    const items = await AdminLoginEvent.find({ userId: admin.userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, limit))
      .lean();
    return {
      items: items.map((e) => ({
        id: e._id.toString(),
        success: e.success,
        reason: e.reason,
        ip: e.ip,
        userAgent: e.userAgent,
        createdAt: e.createdAt,
      })),
    };
  },

  async generateRecoveryCodes(userId: string) {
    const admin = await AdminUser.findOne({ userId }).select('+recoveryCodeHashes');
    if (!admin) throw AppError.notFound('Administrator profile not found');
    const codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
    admin.recoveryCodeHashes = codes.map((c) => sha256(c));
    admin.recoveryCodesGeneratedAt = new Date();
    await admin.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: ROLES.ADMIN,
      action: 'admin.recovery_codes.generated',
      resourceType: 'AdminUser',
      resourceId: admin._id.toString(),
      severity: 'critical',
    });
    return { codes, message: 'Store these codes offline. They are shown once.' };
  },

  async startMfaEnrollment(userId: string) {
    const { buildOtpauthUrl, generateTotpSecret } = await import('../../utils/totp.js');
    const admin = await AdminUser.findOne({ userId }).select('+mfaSecret');
    if (!admin) throw AppError.notFound('Administrator profile not found');
    if (admin.mfaEnabled) {
      throw AppError.conflict('MFA is already enabled. Disable it before re-enrolling.');
    }
    const user = await User.findById(userId).select('email').lean();
    const secret = generateTotpSecret();
    admin.mfaSecret = secret;
    admin.mfaEnabled = false;
    await admin.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: ROLES.ADMIN,
      action: 'admin.mfa.enroll_started',
      resourceType: 'AdminUser',
      resourceId: admin._id.toString(),
      severity: 'warning',
    });
    return {
      secret,
      otpauthUrl: buildOtpauthUrl({
        secret,
        accountName: user?.email || userId,
        issuer: 'FixNow Admin',
      }),
      message: 'Scan the otpauth URL / secret in an authenticator app, then confirm with a 6-digit code.',
    };
  },

  async confirmMfaEnrollment(userId: string, token: string) {
    const { verifyTotp } = await import('../../utils/totp.js');
    const admin = await AdminUser.findOne({ userId }).select('+mfaSecret +recoveryCodeHashes');
    if (!admin) throw AppError.notFound('Administrator profile not found');
    if (!admin.mfaSecret) throw AppError.badRequest('Start MFA enrollment first');
    if (!verifyTotp(admin.mfaSecret, token)) {
      throw AppError.badRequest('Invalid MFA token');
    }
    admin.mfaEnabled = true;
    admin.failedMfaAttempts = 0;
    admin.mfaLockUntil = undefined;
    await admin.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: ROLES.ADMIN,
      action: 'admin.mfa.enabled',
      resourceType: 'AdminUser',
      resourceId: admin._id.toString(),
      severity: 'critical',
    });
    return { mfaEnabled: true };
  },

  async disableMfa(userId: string, token: string) {
    const { verifyTotp } = await import('../../utils/totp.js');
    const admin = await AdminUser.findOne({ userId }).select('+mfaSecret +recoveryCodeHashes');
    if (!admin) throw AppError.notFound('Administrator profile not found');
    if (!admin.mfaEnabled) return { mfaEnabled: false };
    const totpOk = admin.mfaSecret ? verifyTotp(admin.mfaSecret, token) : false;
    const recoveryOk = !totpOk ? await this.consumeRecoveryCode(userId, token) : false;
    if (!totpOk && !recoveryOk) {
      throw AppError.badRequest('Invalid MFA or recovery code');
    }
    admin.mfaEnabled = false;
    admin.mfaSecret = undefined;
    await admin.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: ROLES.ADMIN,
      action: 'admin.mfa.disabled',
      resourceType: 'AdminUser',
      resourceId: admin._id.toString(),
      severity: 'critical',
    });
    return { mfaEnabled: false };
  },

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const { verifyTotp } = await import('../../utils/totp.js');
    const admin = await AdminUser.findOne({ userId }).select('+mfaSecret +recoveryCodeHashes mfaEnabled mfaLockUntil failedMfaAttempts');
    if (!admin?.mfaEnabled) return true;
    if (admin.mfaLockUntil && admin.mfaLockUntil.getTime() > Date.now()) {
      throw AppError.accountLocked('MFA temporarily locked. Try again later.');
    }
    const totpOk = admin.mfaSecret ? verifyTotp(admin.mfaSecret, String(token || '')) : false;
    if (totpOk) {
      if (admin.failedMfaAttempts) {
        admin.failedMfaAttempts = 0;
        await admin.save();
      }
      return true;
    }
    const recoveryOk = await this.consumeRecoveryCode(userId, String(token || ''));
    if (recoveryOk) return true;
    admin.failedMfaAttempts = (admin.failedMfaAttempts || 0) + 1;
    if (admin.failedMfaAttempts >= 5) {
      admin.mfaLockUntil = new Date(Date.now() + 15 * 60 * 1000);
      admin.failedMfaAttempts = 0;
    }
    await admin.save();
    return false;
  },

  async consumeRecoveryCode(userId: string, code: string) {
    const admin = await AdminUser.findOne({ userId }).select('+recoveryCodeHashes');
    if (!admin?.recoveryCodeHashes?.length) return false;
    const hash = sha256(code.trim().toUpperCase());
    const idx = admin.recoveryCodeHashes.findIndex((h) => timingSafeEqualStr(h, hash));
    if (idx < 0) return false;
    admin.recoveryCodeHashes.splice(idx, 1);
    await admin.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: ROLES.ADMIN,
      action: 'admin.recovery_codes.consumed',
      resourceType: 'AdminUser',
      resourceId: admin._id.toString(),
      severity: 'critical',
    });
    return true;
  },

  async requestSuperAdminRecovery(input: {
    targetEmail: string;
    requestedByUserId?: string;
    useBootstrapKey?: string;
  }) {
    const user = await User.findOne({ email: input.targetEmail.toLowerCase(), role: ROLES.ADMIN });
    if (!user) throw AppError.notFound('Administrator not found');
    const admin = await AdminUser.findOne({ userId: user._id }).select('+bootstrapRecoveryKeyHash');
    if (!admin || admin.adminRoleKey !== ADMIN_OPERATOR_ROLES.SUPER_ADMIN) {
      throw AppError.badRequest('Target is not a Super Administrator');
    }

    const superCount = await AdminUser.countDocuments({
      adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
      status: ADMIN_OPERATOR_STATUS.ACTIVE,
      isDeleted: { $ne: true },
    });

    if (input.useBootstrapKey) {
      if (superCount > 1) {
        throw AppError.badRequest('Bootstrap recovery key is only for single-Super-Admin emergencies');
      }
      const state = await AdminBootstrapState.findOne({ key: BOOTSTRAP_KEY }).select(
        '+recoveryKeyHash',
      );
      const expected = admin.bootstrapRecoveryKeyHash || state?.recoveryKeyHash;
      if (!expected || !timingSafeEqualStr(expected, sha256(input.useBootstrapKey.trim()))) {
        await writeAuditLog({
          actorId: user._id.toString(),
          actorRole: ROLES.ADMIN,
          action: 'admin.recovery.bootstrap_key_failed',
          resourceType: 'AdminUser',
          resourceId: admin._id.toString(),
          severity: 'critical',
        });
        throw AppError.unauthorized('Invalid bootstrap recovery key');
      }
      const rawToken = randomToken(24);
      const reqDoc = await AdminRecoveryRequest.create({
        targetUserId: user._id,
        type: 'bootstrap_key',
        status: 'approved',
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        requiredApprovals: 0,
        approvals: [],
        meta: { channel: 'bootstrap_recovery_key' },
      });
      admin.bootstrapRecoveryKeyUsedAt = new Date();
      await admin.save();
      await writeAuditLog({
        actorId: user._id.toString(),
        actorRole: ROLES.ADMIN,
        action: 'admin.recovery.bootstrap_key_used',
        resourceType: 'AdminRecoveryRequest',
        resourceId: reqDoc._id.toString(),
        severity: 'critical',
      });
      return {
        recoveryRequestId: reqDoc._id.toString(),
        recoveryToken: rawToken,
        expiresAt: reqDoc.expiresAt,
        message: 'Bootstrap recovery approved. Set a new password with the recovery token.',
      };
    }

    const reqDoc = await AdminRecoveryRequest.create({
      targetUserId: user._id,
      requestedByUserId: input.requestedByUserId,
      type: 'super_admin_recovery',
      status: 'pending',
      requiredApprovals: Math.min(2, Math.max(1, superCount - 1)),
      approvals: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await writeAuditLog({
      actorId: input.requestedByUserId || user._id.toString(),
      actorRole: ROLES.ADMIN,
      action: 'admin.recovery.requested',
      resourceType: 'AdminRecoveryRequest',
      resourceId: reqDoc._id.toString(),
      severity: 'critical',
    });

    return {
      recoveryRequestId: reqDoc._id.toString(),
      requiredApprovals: reqDoc.requiredApprovals,
      message:
        superCount <= 1
          ? 'Only one Super Admin exists — use the offline Bootstrap Recovery Key.'
          : 'Awaiting approval from two active Super Administrators.',
    };
  },

  async approveRecovery(input: {
    recoveryRequestId: string;
    approverUserId: string;
    decision: 'approved' | 'denied';
    note?: string;
  }) {
    const reqDoc = await AdminRecoveryRequest.findById(input.recoveryRequestId).select('+tokenHash');
    if (!reqDoc || reqDoc.status !== 'pending') {
      throw AppError.badRequest('Recovery request is not pending');
    }
    const approver = await AdminUser.findOne({
      userId: input.approverUserId,
      status: ADMIN_OPERATOR_STATUS.ACTIVE,
      adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
    });
    if (!approver) throw AppError.forbidden('Only active Super Administrators may approve');

    if (approver.userId.toString() === reqDoc.targetUserId.toString()) {
      throw AppError.forbidden('Cannot approve your own Super Admin recovery');
    }

    if (reqDoc.approvals.some((a) => a.approverUserId.toString() === input.approverUserId)) {
      throw AppError.badRequest('You already decided on this request');
    }

    reqDoc.approvals.push({
      approverUserId: new Types.ObjectId(input.approverUserId),
      decidedAt: new Date(),
      decision: input.decision,
      note: input.note,
    });

    if (input.decision === 'denied') {
      reqDoc.status = 'denied';
      await reqDoc.save();
      await writeAuditLog({
        actorId: input.approverUserId,
        actorRole: ROLES.ADMIN,
        action: 'admin.recovery.denied',
        resourceType: 'AdminRecoveryRequest',
        resourceId: reqDoc._id.toString(),
        severity: 'critical',
      });
      return { status: reqDoc.status };
    }

    const approvals = reqDoc.approvals.filter((a) => a.decision === 'approved').length;
    if (approvals >= reqDoc.requiredApprovals) {
      const rawToken = randomToken(24);
      reqDoc.status = 'approved';
      reqDoc.tokenHash = sha256(rawToken);
      reqDoc.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await reqDoc.save();
      await writeAuditLog({
        actorId: input.approverUserId,
        actorRole: ROLES.ADMIN,
        action: 'admin.recovery.approved',
        resourceType: 'AdminRecoveryRequest',
        resourceId: reqDoc._id.toString(),
        severity: 'critical',
      });
      return {
        status: reqDoc.status,
        recoveryToken: env.isProductionEnv ? undefined : rawToken,
        expiresAt: reqDoc.expiresAt,
        message: 'Recovery approved. Deliver the temporary token out-of-band to the operator.',
        // Always return token to the approving Super Admin response (authenticated channel).
        temporaryRecoveryToken: rawToken,
      };
    }

    await reqDoc.save();
    return { status: 'pending', approvals, required: reqDoc.requiredApprovals };
  },

  async completeRecoveryPassword(input: { recoveryToken: string; newPassword: string }) {
    assertAdminPasswordPolicy(input.newPassword);
    const tokenHash = sha256(input.recoveryToken.trim());
    const reqDoc = await AdminRecoveryRequest.findOne({
      tokenHash,
      status: 'approved',
    }).select('+tokenHash');
    if (!reqDoc) throw AppError.badRequest('Invalid or expired recovery token');
    if (reqDoc.expiresAt && reqDoc.expiresAt.getTime() < Date.now()) {
      reqDoc.status = 'expired';
      await reqDoc.save();
      throw AppError.badRequest('Recovery token expired');
    }

    const user = await User.findById(reqDoc.targetUserId).select('+passwordHash');
    if (!user) throw AppError.notFound('User not found');
    user.passwordHash = await hashPassword(input.newPassword);
    user.passwordChangedAt = new Date();
    user.accountStatus = ACCOUNT_STATUS.ACTIVE;
    user.lockUntil = undefined;
    user.failedLoginAttempts = 0;
    user.refreshTokenVersion += 1;
    await user.save();

    const admin = await AdminUser.findOne({ userId: user._id });
    if (admin) {
      admin.status = ADMIN_OPERATOR_STATUS.ACTIVE;
      admin.isActive = true;
      await admin.save();
    }

    reqDoc.status = 'completed';
    reqDoc.completedAt = new Date();
    reqDoc.tokenHash = undefined;
    await reqDoc.save();

    await revokeAllAdminSessions(user._id.toString());

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: ROLES.ADMIN,
      action: 'admin.recovery.completed',
      resourceType: 'AdminRecoveryRequest',
      resourceId: reqDoc._id.toString(),
      severity: 'critical',
    });

    return { message: 'Password updated. All sessions were revoked. Sign in again.' };
  },

  catalogue() {
    return {
      roles: ROLE_CATALOGUE,
      /** Roles allowed when inviting production administrators. */
      productionRoles: ROLE_CATALOGUE.filter((r) =>
        (PRODUCTION_ADMIN_ROLES as readonly string[]).includes(r.key),
      ),
      permissions: PERMISSION_CATALOGUE,
      statuses: Object.values(ADMIN_OPERATOR_STATUS),
    };
  },
};

export { comparePassword };
