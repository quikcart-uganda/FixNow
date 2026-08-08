/**
 * Production Owner (first Production Super Admin) setup.
 * Does not replace bootstrap Super Admin — adds governanceClassification=production.
 */

import {
  ADMIN_OPERATOR_ROLES,
  ADMIN_OPERATOR_STATUS,
  ADMIN_PERMISSIONS,
  DEV_ADMIN,
  isDevAdminEmail,
} from '../../constants/adminIdentity.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AdminRole, AdminUser, PlatformSetting, User } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { hashPassword } from '../../utils/password.js';
import { assertAdminPasswordPolicy } from './adminIdentity.service.js';
import { ensurePermissionCatalogue } from './adminIdentity.service.js';
import { hasProductionSuperAdmin, isProductionSuperAdmin } from '../platform/platformMode.service.js';

const PSA_CLAIM_KEY = 'production_owner_claim';

export type ProductionOwnerInput = {
  fullName: string;
  email: string;
  password: string;
  recoveryEmail: string;
  recoveryPhone?: string;
  phone?: string;
  enableMfaIntent?: boolean;
};

async function assertNotDemoEmail(email: string) {
  if (email === DEV_ADMIN.email.toLowerCase() || isDevAdminEmail(email)) {
    throw AppError.badRequest('Demo / Development Admin emails cannot become Production Super Admin');
  }
}

/**
 * Create or upgrade the first Production Super Admin.
 * Public when none exists; also callable by an authenticated Super Admin.
 */
export async function createProductionOwner(
  input: ProductionOwnerInput,
  meta: { actorUserId?: string | null; ip?: string } = {},
) {
  if (await hasProductionSuperAdmin()) {
    throw AppError.conflict('A Production Super Admin already exists');
  }

  const claimUntil = new Date(Date.now() + 120_000).toISOString();
  try {
    const claim = await PlatformSetting.findOneAndUpdate(
      {
        key: PSA_CLAIM_KEY,
        $or: [
          { 'value.completed': { $ne: true } },
          { value: { $exists: false } },
        ],
        $and: [
          {
            $or: [
              { 'value.claimLockUntil': { $exists: false } },
              { 'value.claimLockUntil': { $lte: new Date().toISOString() } },
            ],
          },
        ],
      },
      {
        $set: {
          value: { completed: false, claimLockUntil: claimUntil },
          scope: 'admin',
          description: 'Atomic claim for first Production Super Admin',
          isSecret: false,
        },
        $setOnInsert: { key: PSA_CLAIM_KEY },
      },
      { upsert: true, new: true },
    );
    if (!claim || (claim.value as { completed?: boolean })?.completed) {
      throw AppError.conflict('A Production Super Admin already exists');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (await hasProductionSuperAdmin()) {
      throw AppError.conflict('A Production Super Admin already exists');
    }
    throw AppError.conflict('Production Owner setup already in progress. Retry shortly.');
  }

  assertAdminPasswordPolicy(input.password);
  await ensurePermissionCatalogue();

  const email = input.email.toLowerCase().trim();
  const recoveryEmail = input.recoveryEmail.toLowerCase().trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw AppError.badRequest('Valid business email is required');
  }
  if (!recoveryEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recoveryEmail)) {
    throw AppError.badRequest('Valid recovery email is required');
  }
  if (input.fullName.trim().length < 2) {
    throw AppError.badRequest('Full name is required');
  }
  await assertNotDemoEmail(email);

  const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.SUPER_ADMIN });
  if (!role) throw new AppError('Super Admin role missing after catalogue seed', 500);

  const passwordHash = await hashPassword(input.password);
  let user = await User.findOne({ email });
  if (user && user.role !== ROLES.ADMIN) {
    throw AppError.conflict('Email already belongs to a non-admin account');
  }

  if (!user) {
    user = await User.create({
      email,
      fullName: input.fullName.trim(),
      phone: input.phone || input.recoveryPhone,
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
    if (input.phone || input.recoveryPhone) {
      user.phone = input.phone || input.recoveryPhone;
    }
    user.refreshTokenVersion += 1;
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
      department: 'Executive',
      governanceClassification: 'production',
      recoveryEmail,
      recoveryPhone: input.recoveryPhone?.trim() || undefined,
      createdBy: meta.actorUserId || user._id,
      notes: input.enableMfaIntent
        ? 'Production Super Admin — MFA enrollment recommended'
        : 'Production Super Admin',
      mfaEnabled: false,
    });
  } else {
    adminUser.adminRoleId = role._id;
    adminUser.adminRoleKey = role.key;
    adminUser.permissionKeys = [ADMIN_PERMISSIONS.WILDCARD];
    adminUser.status = ADMIN_OPERATOR_STATUS.ACTIVE;
    adminUser.isActive = true;
    adminUser.governanceClassification = 'production';
    adminUser.recoveryEmail = recoveryEmail;
    adminUser.recoveryPhone = input.recoveryPhone?.trim() || adminUser.recoveryPhone;
    adminUser.notes = 'Production Super Admin (owner wizard)';
    await adminUser.save();
  }

  await writeAuditLog({
    actorId: meta.actorUserId || user._id.toString(),
    actorRole: 'admin',
    action: 'admin.production_owner.created',
    resourceType: 'AdminUser',
    resourceId: adminUser._id.toString(),
    severity: 'critical',
    after: {
      email,
      governanceClassification: 'production',
      recoveryEmail,
    },
    meta: { ip: meta.ip },
  });

  await PlatformSetting.findOneAndUpdate(
    { key: PSA_CLAIM_KEY },
    {
      $set: {
        value: {
          completed: true,
          completedAt: new Date().toISOString(),
          productionOwnerUserId: user._id.toString(),
        },
        scope: 'admin',
        isSecret: false,
      },
    },
    { upsert: true },
  );

  return {
    userId: user._id.toString(),
    adminUserId: adminUser._id.toString(),
    email: user.email,
    governanceClassification: 'production' as const,
    message:
      'Production Super Admin created. Sign in, then open Production Governance to enter Production Mode.',
  };
}

/** Existing Super Admin designates themselves as Production Super Admin. */
export async function designateSelfAsProductionOwner(userId: string) {
  if (await hasProductionSuperAdmin()) {
    throw AppError.conflict('A Production Super Admin already exists');
  }

  const user = await User.findById(userId).select('email fullName').lean();
  if (!user) throw AppError.notFound('User not found');
  const email = String(user.email || '').toLowerCase();
  await assertNotDemoEmail(email);

  const adminUser = await AdminUser.findOne({
    userId,
    status: ADMIN_OPERATOR_STATUS.ACTIVE,
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (!adminUser) throw AppError.forbidden('Active administrator profile required');
  const isSuper =
    adminUser.adminRoleKey === ADMIN_OPERATOR_ROLES.SUPER_ADMIN ||
    adminUser.permissionKeys.includes(ADMIN_PERMISSIONS.WILDCARD);
  if (!isSuper) throw AppError.forbidden('Only a Super Admin may become Production Super Admin');

  adminUser.governanceClassification = 'production';
  if (!adminUser.recoveryEmail) adminUser.recoveryEmail = email;
  await adminUser.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: 'admin',
    action: 'admin.production_owner.designated',
    resourceType: 'AdminUser',
    resourceId: adminUser._id.toString(),
    severity: 'critical',
    after: { email, governanceClassification: 'production' },
  });

  return {
    userId,
    email,
    governanceClassification: 'production' as const,
    isProductionSuperAdmin: await isProductionSuperAdmin(userId),
  };
}

export const productionOwnerService = {
  createProductionOwner,
  designateSelfAsProductionOwner,
};
