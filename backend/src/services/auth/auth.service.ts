import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../constants/errorCodes.js';
import { ROLES, type Role } from '../../constants/roles.js';
export { setRefreshCookie, clearRefreshCookie } from '../../security/cookies.js';
import {
  CustomerProfile,
  RefreshToken,
  Session,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import {
  decodeRefreshExp,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import {
  issueOtp,
  OTP_CHANNEL,
  OTP_PURPOSE,
  verifyOtpCode,
  type OtpChannel,
  type OtpPurpose,
} from './otp.service.js';
import {
  consumeNativeHandoffCode,
  getGoogleAuthPublicConfig,
  issueNativeHandoffCode,
  verifyGoogleIdToken,
} from './googleAuth.service.js';

export { getGoogleAuthPublicConfig, issueNativeHandoffCode, consumeNativeHandoffCode };

export type AuthRequestMeta = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  platform?: 'web' | 'ios' | 'android' | 'unknown';
};

function publicUser(user: {
  _id: Types.ObjectId;
  email: string;
  phone?: string;
  role: Role;
  fullName: string;
  accountStatus: string;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  refreshTokenVersion: number;
}, availableRoles?: Array<'customer' | 'technician' | 'admin'>, adminProfile?: {
  adminRoleKey: string | null;
  permissionKeys: string[];
  capabilities: Record<string, boolean>;
  governanceClassification?: string | null;
  isProductionSuperAdmin?: boolean;
} | null) {
  const emailVerified = Boolean(user.emailVerifiedAt);
  const phoneVerified = Boolean(user.phoneVerifiedAt);
  const roles =
    availableRoles && availableRoles.length
      ? availableRoles
      : user.role === ROLES.ADMIN
        ? ([ROLES.ADMIN] as Array<'customer' | 'technician' | 'admin'>)
        : ([user.role] as Array<'customer' | 'technician' | 'admin'>);
  return {
    id: user._id.toString(),
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    availableRoles: roles,
    fullName: user.fullName,
    accountStatus: user.accountStatus,
    verificationStatus: emailVerified
      ? phoneVerified || !user.phone
        ? 'verified'
        : 'email_verified'
      : 'pending_verification',
    emailVerified,
    phoneVerified,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    adminRoleKey: adminProfile?.adminRoleKey ?? null,
    permissionKeys: adminProfile?.permissionKeys ?? [],
    capabilities: adminProfile?.capabilities ?? null,
    governanceClassification: adminProfile?.governanceClassification ?? null,
    isProductionSuperAdmin: Boolean(adminProfile?.isProductionSuperAdmin),
  };
}

/** Profiles owned by this identity — single User, multiple marketplace roles. */
async function resolveAvailableRoles(
  userId: string,
  activeRole: Role,
): Promise<Array<'customer' | 'technician' | 'admin'>> {
  if (activeRole === ROLES.ADMIN) return [ROLES.ADMIN];
  const [hasCustomer, hasTechnician] = await Promise.all([
    CustomerProfile.exists({ userId, isDeleted: { $ne: true } }),
    TechnicianProfile.exists({ userId, isDeleted: { $ne: true } }),
  ]);
  const roles: Array<'customer' | 'technician'> = [];
  if (hasCustomer) roles.push(ROLES.CUSTOMER);
  if (hasTechnician) roles.push(ROLES.TECHNICIAN);
  if (activeRole === ROLES.CUSTOMER && !roles.includes(ROLES.CUSTOMER)) roles.push(ROLES.CUSTOMER);
  if (activeRole === ROLES.TECHNICIAN && !roles.includes(ROLES.TECHNICIAN)) roles.push(ROLES.TECHNICIAN);
  return roles;
}

async function ensureMarketplaceProfile(
  userId: string,
  role: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN,
  extras: {
    referralCode?: string;
    photoUrl?: string;
    primaryCategoryId?: string;
    district?: string;
  } = {},
): Promise<void> {
  if (role === ROLES.CUSTOMER) {
    const exists = await CustomerProfile.exists({ userId, isDeleted: { $ne: true } });
    if (!exists) {
      await CustomerProfile.create({
        userId,
        ...(extras.referralCode ? { referralCode: extras.referralCode } : {}),
        ...(extras.photoUrl ? { photoUrl: extras.photoUrl } : {}),
      });
    }
  } else {
    const exists = await TechnicianProfile.exists({ userId, isDeleted: { $ne: true } });
    if (!exists) {
      await TechnicianProfile.create({
        userId,
        ...(extras.photoUrl ? { photoUrl: extras.photoUrl } : {}),
        ...(extras.primaryCategoryId ? { primaryCategoryId: extras.primaryCategoryId } : {}),
        ...(extras.district
          ? { location: { district: extras.district.trim(), country: 'UG' } }
          : {}),
      });
    } else if (extras.primaryCategoryId || extras.district) {
      const patch: Record<string, unknown> = {};
      if (extras.primaryCategoryId) patch.primaryCategoryId = extras.primaryCategoryId;
      if (extras.district) patch.location = { district: extras.district.trim(), country: 'UG' };
      await TechnicianProfile.updateOne({ userId }, { $set: patch });
    }
  }
}

async function toPublicUser(user: {
  _id: Types.ObjectId;
  email: string;
  phone?: string;
  role: Role;
  fullName: string;
  accountStatus: string;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  refreshTokenVersion: number;
}) {
  const availableRoles = await resolveAvailableRoles(user._id.toString(), user.role);
  let adminProfile: {
    adminRoleKey: string | null;
    permissionKeys: string[];
    capabilities: Record<string, boolean>;
    governanceClassification?: string | null;
    isProductionSuperAdmin?: boolean;
  } | null = null;
  if (user.role === ROLES.ADMIN) {
    try {
      const { AdminUser } = await import('../../models/index.js');
      const { resolveCapabilities } = await import('../admin/adminCapabilities.js');
      const profile = await AdminUser.findOne({
        userId: user._id,
        status: 'active',
        isActive: true,
        isDeleted: { $ne: true },
      })
        .select('adminRoleKey permissionKeys governanceClassification')
        .lean();
      if (profile) {
        // Resolve RBAC capabilities first — never let optional governance metadata
        // wipe the operator profile (that caused Development Admin lockout).
        adminProfile = {
          adminRoleKey: profile.adminRoleKey || null,
          permissionKeys: profile.permissionKeys || [],
          capabilities: resolveCapabilities(profile),
          governanceClassification: profile.governanceClassification || 'unclassified',
          isProductionSuperAdmin: false,
        };
        try {
          const { isProductionSuperAdmin } = await import('../platform/platformMode.service.js');
          adminProfile.isProductionSuperAdmin = await isProductionSuperAdmin(user._id.toString());
        } catch {
          adminProfile.isProductionSuperAdmin = false;
        }
      }
    } catch {
      adminProfile = null;
    }
  }
  return publicUser(user, availableRoles, adminProfile);
}

function assertAccountUsable(user: {
  accountStatus: string;
  lockUntil?: Date;
  isDeleted?: boolean;
}): void {
  if (user.isDeleted || user.accountStatus === ACCOUNT_STATUS.DELETED) {
    throw AppError.unauthorized('Account not found');
  }
  if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    throw AppError.accountSuspended();
  }
  if (
    user.accountStatus === ACCOUNT_STATUS.LOCKED ||
    (user.lockUntil && user.lockUntil.getTime() > Date.now())
  ) {
    throw AppError.accountLocked();
  }
}

async function issueTokenPair(
  user: {
    _id: Types.ObjectId;
    role: Role;
    refreshTokenVersion: number;
  },
  meta: AuthRequestMeta,
  options: { rememberMe?: boolean } = {},
) {
  const familyId = randomToken(16);
  const jti = randomToken(16);
  const refreshExpiresIn = options.rememberMe
    ? env.JWT_REFRESH_REMEMBER_EXPIRES_IN
    : env.JWT_REFRESH_EXPIRES_IN;

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    role: user.role,
    rv: user.refreshTokenVersion,
  });

  const refreshToken = signRefreshToken(
    {
      sub: user._id.toString(),
      role: user.role,
      rv: user.refreshTokenVersion,
      familyId,
      jti,
    },
    refreshExpiresIn,
  );

  const expiresAt = decodeRefreshExp(refreshToken);

  const stored = await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt,
    rememberMe: Boolean(options.rememberMe),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const session = await Session.create({
    userId: user._id,
    refreshTokenId: stored._id,
    deviceId: meta.deviceId,
    platform: meta.platform ?? 'unknown',
    ip: meta.ip,
    userAgent: meta.userAgent,
    lastSeenAt: new Date(),
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: 'Bearer' as const,
    sessionId: session._id.toString(),
  };
}

async function revokeRefreshFamily(familyId: string): Promise<void> {
  await RefreshToken.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export const authService = {
  /**
   * Passwordless Development Administrator entry.
   * Gated entirely by ALLOW_DEV_ADMIN_LOGIN + non-production (enforced in ensureDevAdmin).
   * Reuses the standard token/session issuance — JWT shape is unchanged.
   */
  async devAdminLogin(meta: AuthRequestMeta) {
    const { ensureDevAdmin, isDevLoginEnabled, recordAdminLoginEvent } = await import(
      '../admin/adminIdentity.service.js'
    );
    if (!(await isDevLoginEnabled())) {
      throw AppError.forbidden('Development administrator access is disabled.');
    }

    const { user, adminUser } = await ensureDevAdmin();

    user.lastLoginAt = new Date();
    user.lastLoginIp = meta.ip;
    await user.save();
    adminUser.lastLoginAt = new Date();
    adminUser.lastActiveAt = new Date();
    await adminUser.save();

    const tokens = await issueTokenPair(user, meta);

    await recordAdminLoginEvent({
      userId: user._id.toString(),
      adminUserId: adminUser._id.toString(),
      email: user.email,
      success: true,
      reason: 'dev_passwordless_login',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: ROLES.ADMIN,
      action: 'auth.dev_admin_login',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
      severity: 'warning',
    });

    return {
      user: await toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        sessionId: tokens.sessionId,
      },
    };
  },

  async register(
    input: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      role: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN;
      referralCode?: string;
      acceptedTerms?: boolean;
      primaryCategoryId?: string;
      district?: string;
    },
    meta: AuthRequestMeta,
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await User.findOne({ email }).select('+passwordHash');

    // Same identity, second marketplace role — do not create a duplicate account.
    if (existing) {
      if (existing.role === ROLES.ADMIN) {
        throw AppError.conflict('Email is already registered');
      }
      if (!existing.passwordHash) {
        throw AppError.conflict('Email is already registered. Continue with Google Sign-In.');
      }
      const passwordOk = await comparePassword(input.password, existing.passwordHash);
      if (!passwordOk) {
        throw AppError.conflict('Email is already registered');
      }

      const alreadyHasRole = (
        await resolveAvailableRoles(existing._id.toString(), existing.role)
      ).includes(input.role);
      if (alreadyHasRole) {
        throw AppError.conflict('Email is already registered');
      }

      await ensureMarketplaceProfile(existing._id.toString(), input.role, {
        referralCode: existing.referralCode,
        primaryCategoryId: input.primaryCategoryId,
        district: input.district,
      });
      if (existing.role !== input.role) {
        existing.role = input.role;
      }
      if (input.fullName.trim().length >= 2) {
        existing.fullName = input.fullName.trim();
      }
      if (input.phone && !existing.phone) {
        existing.phone = input.phone;
      }
      if (input.acceptedTerms === true) {
        existing.metadata = {
          ...(existing.metadata || {}),
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: 'mvp-2026',
        };
      }
      await existing.save();

      await writeAuditLog({
        actorId: existing._id.toString(),
        actorRole: existing.role,
        action: 'auth.role.enable',
        resourceType: 'User',
        resourceId: existing._id.toString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { role: input.role, via: 'register' },
      });

      if (!existing.emailVerifiedAt) {
        const otp = await issueOtp({
          userId: existing._id.toString(),
          purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
          channel: OTP_CHANNEL.EMAIL,
          destination: email,
          fullName: existing.fullName,
        });
        return {
          user: await toPublicUser(existing),
          verification: {
            required: true,
            channel: OTP_CHANNEL.EMAIL,
            expiresAt: otp.expiresAt,
            ...(otp.debugOtp ? { debugOtp: otp.debugOtp } : {}),
          },
          message: 'Role added. Verify your email with the OTP sent.',
        };
      }

      return {
        user: await toPublicUser(existing),
        verification: { required: false },
        message: 'Role added to your existing FixNow account. You can sign in now.',
      };
    }

    if (input.phone) {
      const phoneTaken = await User.findOne({ phone: input.phone });
      if (phoneTaken) throw AppError.conflict('Phone number is already registered');
    }

    const passwordHash = await hashPassword(input.password);
    const referralCode = randomToken(4).slice(0, 8).toUpperCase();

    const user = await User.create({
      email,
      phone: input.phone,
      passwordHash,
      authProviders: ['password'],
      role: input.role,
      fullName: input.fullName.trim(),
      accountStatus: ACCOUNT_STATUS.PENDING_VERIFICATION,
      referralCode,
      metadata:
        input.acceptedTerms === true
          ? { termsAcceptedAt: new Date().toISOString(), termsVersion: 'mvp-2026' }
          : undefined,
    });

    if (input.role === ROLES.CUSTOMER) {
      await CustomerProfile.create({ userId: user._id, referralCode });
    } else {
      await TechnicianProfile.create({
        userId: user._id,
        ...(input.primaryCategoryId ? { primaryCategoryId: input.primaryCategoryId } : {}),
        ...(input.district
          ? { location: { district: input.district.trim(), country: 'UG' } }
          : {}),
      });
    }

    const otp = await issueOtp({
      userId: user._id.toString(),
      purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
      channel: OTP_CHANNEL.EMAIL,
      destination: email,
      fullName: user.fullName,
    });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.register',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    if (input.referralCode) {
      try {
        const { referralService } = await import('../referral/referral.service.js');
        await referralService.onUserRegistered(user._id.toString(), user.role, {
          referralCode: String(input.referralCode),
          deviceFingerprint: meta.deviceId,
          phone: user.phone || undefined,
          email: user.email,
        });
      } catch {
        /* non-blocking — registration must succeed even if referral fails */
      }
    }

    return {
      user: await toPublicUser(user),
      verification: {
        required: true,
        channel: OTP_CHANNEL.EMAIL,
        expiresAt: otp.expiresAt,
        ...(otp.debugOtp ? { debugOtp: otp.debugOtp } : {}),
      },
      message: 'Registration successful. Verify your email with the OTP sent.',
    };
  },

  async login(
    input: {
      email: string;
      password: string;
      rememberMe?: boolean;
      preferredRole?: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN;
    },
    meta: AuthRequestMeta,
  ) {
    const email = input.email.toLowerCase().trim();
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) throw AppError.unauthorized('Invalid email or password');

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw AppError.accountLocked(
        `Account locked until ${user.lockUntil.toISOString()}. Too many failed login attempts.`,
      );
    }

    if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
      throw AppError.accountSuspended();
    }
    if (user.accountStatus === ACCOUNT_STATUS.DELETED || user.isDeleted) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw AppError.unauthorized('This account uses Google Sign-In. Continue with Google.');
    }

    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= env.AUTH_MAX_FAILED_LOGINS) {
        user.accountStatus = ACCOUNT_STATUS.LOCKED;
        user.lockUntil = new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60 * 1000);
        await user.save();
        await writeAuditLog({
          actorId: user._id.toString(),
          actorRole: user.role,
          action: 'auth.lockout',
          resourceType: 'User',
          resourceId: user._id.toString(),
          ip: meta.ip,
          severity: 'warning',
        });
        try {
          const { createDbNotification } = await import('../../utils/notify.js');
          await createDbNotification({
            userId: user._id.toString(),
            type: 'auth.account_locked',
            title: 'Account locked',
            body: 'Too many failed login attempts. Your account is temporarily locked.',
            bypassQuietHours: true,
          });
        } catch {
          // Push side-effect must not fail lockout path.
        }
        throw AppError.accountLocked();
      }
      await user.save();
      throw AppError.unauthorized('Invalid email or password');
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    if (user.accountStatus === ACCOUNT_STATUS.LOCKED) {
      user.accountStatus = user.emailVerifiedAt
        ? ACCOUNT_STATUS.ACTIVE
        : ACCOUNT_STATUS.PENDING_VERIFICATION;
    }

    if (input.preferredRole && input.preferredRole !== user.role && user.role !== ROLES.ADMIN) {
      const available = await resolveAvailableRoles(user._id.toString(), user.role);
      if (available.includes(input.preferredRole)) {
        user.role = input.preferredRole;
      }
    }

    // Admin portal gate — Active AdminUser required; demo emails blocked in production.
    if (user.role === ROLES.ADMIN) {
      try {
        const {
          assertAdminMayLogin,
          recordAdminLoginEvent,
        } = await import('../admin/adminIdentity.service.js');
        const profile = await assertAdminMayLogin(user);
        if (profile) {
          profile.lastLoginAt = new Date();
          profile.lastActiveAt = new Date();
          await profile.save();
          await recordAdminLoginEvent({
            userId: user._id.toString(),
            adminUserId: profile._id.toString(),
            email: user.email,
            success: true,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
        }
      } catch (err) {
        try {
          const { recordAdminLoginEvent } = await import('../admin/adminIdentity.service.js');
          await recordAdminLoginEvent({
            userId: user._id.toString(),
            email: user.email,
            success: false,
            reason: err instanceof Error ? err.message : 'admin_login_blocked',
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
        } catch {
          /* ignore */
        }
        throw err;
      }
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = meta.ip;
    await user.save();

    const tokens = await issueTokenPair(user, meta, { rememberMe: input.rememberMe });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.login',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: await toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        sessionId: tokens.sessionId,
      },
    };
  },

  async loginWithGoogle(
    input: {
      credential: string;
      role: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN;
      rememberMe?: boolean;
    },
    meta: AuthRequestMeta,
  ) {
    const identity = await verifyGoogleIdToken(input.credential);
    const role = input.role;

    const byGoogle = await User.findOne({ googleId: identity.googleId });
    if (byGoogle && byGoogle.email !== identity.email) {
      throw AppError.conflict(
        'This Google account is already linked to a different FixNow email.',
        { code: 'GOOGLE_IDENTITY_CONFLICT' },
      );
    }

    let user = byGoogle ?? (await User.findOne({ email: identity.email }));
    let isNewUser = false;

    if (user) {
      assertAccountUsable(user);
      if (user.role === ROLES.ADMIN) {
        throw AppError.conflict(
          'This email is already registered under a different account type.',
          { code: 'ROLE_MISMATCH', existingRole: user.role },
        );
      }
      if (user.googleId && user.googleId !== identity.googleId) {
        throw AppError.conflict(
          'This email is linked to a different Google account.',
          { code: 'GOOGLE_IDENTITY_CONFLICT' },
        );
      }

      // Enable the requested marketplace profile on the same identity (no duplicate User).
      if (user.role === ROLES.CUSTOMER || user.role === ROLES.TECHNICIAN) {
        await ensureMarketplaceProfile(user._id.toString(), user.role, {
          referralCode: user.referralCode,
        });
      }
      await ensureMarketplaceProfile(user._id.toString(), role, {
        referralCode: user.referralCode,
        photoUrl: identity.picture,
      });
      if (user.role !== role && (role === ROLES.CUSTOMER || role === ROLES.TECHNICIAN)) {
        user.role = role;
      }

      user.googleId = user.googleId || identity.googleId;
      const providers = new Set(user.authProviders?.length ? user.authProviders : ['password']);
      if (user.passwordHash) providers.add('password');
      providers.add('google');
      user.authProviders = [...providers] as Array<'password' | 'google'>;

      if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
      if (user.accountStatus === ACCOUNT_STATUS.PENDING_VERIFICATION) {
        user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      }
      if (identity.fullName && (!user.fullName || user.fullName.length < 2)) {
        user.fullName = identity.fullName;
      }
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLoginAt = new Date();
      user.lastLoginIp = meta.ip;
      await user.save();
    } else {
      isNewUser = true;
      const referralCode = randomToken(4).slice(0, 8).toUpperCase();
      user = await User.create({
        email: identity.email,
        googleId: identity.googleId,
        authProviders: ['google'],
        role,
        fullName: identity.fullName,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        emailVerifiedAt: new Date(),
        referralCode,
        lastLoginAt: new Date(),
        lastLoginIp: meta.ip,
      });

      if (role === ROLES.CUSTOMER) {
        await CustomerProfile.create({
          userId: user._id,
          referralCode,
          ...(identity.picture ? { photoUrl: identity.picture } : {}),
        });
      } else {
        await TechnicianProfile.create({
          userId: user._id,
          ...(identity.picture ? { photoUrl: identity.picture } : {}),
        });
      }
    }

    if (identity.picture && !isNewUser) {
      if (role === ROLES.CUSTOMER) {
        await CustomerProfile.updateOne(
          { userId: user._id, $or: [{ photoUrl: { $exists: false } }, { photoUrl: null }, { photoUrl: '' }] },
          { $set: { photoUrl: identity.picture } },
        );
      } else {
        await TechnicianProfile.updateOne(
          { userId: user._id, $or: [{ photoUrl: { $exists: false } }, { photoUrl: null }, { photoUrl: '' }] },
          { $set: { photoUrl: identity.picture } },
        );
      }
    }

    const tokens = await issueTokenPair(user, meta, { rememberMe: input.rememberMe });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: isNewUser ? 'auth.google.register' : 'auth.google.login',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { provider: 'google', isNewUser },
    });

    return {
      user: await toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        sessionId: tokens.sessionId,
      },
      isNewUser,
    };
  },

  async googleConfig() {
    return getGoogleAuthPublicConfig();
  },

  async googleNativeHandoffIssue(input: {
    credential: string;
    role: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN;
  }) {
    return issueNativeHandoffCode(input);
  },

  googleNativeHandoffConsume(code: string) {
    return consumeNativeHandoffCode(code);
  },

  async refresh(refreshTokenRaw: string | undefined, meta: AuthRequestMeta) {
    if (!refreshTokenRaw) throw AppError.unauthorized('Refresh token required');

    const payload = verifyRefreshToken(refreshTokenRaw);
    const tokenHash = sha256(refreshTokenRaw);

    const stored = await RefreshToken.findOne({ tokenHash }).select('+tokenHash');
    if (!stored || stored.revokedAt) {
      if (payload.familyId) await revokeRefreshFamily(payload.familyId);
      throw AppError.unauthorized('Refresh token revoked. Please log in again.');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw AppError.unauthorized('User not found');
    assertAccountUsable(user);

    if (payload.rv !== user.refreshTokenVersion) {
      await revokeRefreshFamily(payload.familyId);
      throw AppError.unauthorized('Session invalidated. Please log in again.');
    }

    stored.revokedAt = new Date();
    const jti = randomToken(16);
    const rememberMe = Boolean(stored.rememberMe);
    const refreshExpiresIn = rememberMe
      ? env.JWT_REFRESH_REMEMBER_EXPIRES_IN
      : env.JWT_REFRESH_EXPIRES_IN;
    const newRefresh = signRefreshToken(
      {
        sub: user._id.toString(),
        role: user.role,
        rv: user.refreshTokenVersion,
        familyId: payload.familyId,
        jti,
      },
      refreshExpiresIn,
    );
    const expiresAt = decodeRefreshExp(newRefresh);
    stored.replacedByTokenHash = sha256(newRefresh);
    await stored.save();

    const newStored = await RefreshToken.create({
      userId: user._id,
      tokenHash: sha256(newRefresh),
      familyId: payload.familyId,
      expiresAt,
      rememberMe,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    await Session.updateOne(
      { refreshTokenId: stored._id },
      {
        $set: {
          refreshTokenId: newStored._id,
          lastSeenAt: new Date(),
          expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      },
    );

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      role: user.role,
      rv: user.refreshTokenVersion,
    });

    return {
      tokens: {
        accessToken,
        refreshToken: newRefresh,
        tokenType: 'Bearer' as const,
        expiresAt,
      },
      user: await toPublicUser(user),
    };
  },

  async logout(userId: string, refreshTokenRaw?: string, meta: AuthRequestMeta = {}) {
    if (refreshTokenRaw) {
      const hash = sha256(refreshTokenRaw);
      const stored = await RefreshToken.findOne({ tokenHash: hash });
      if (stored) {
        stored.revokedAt = new Date();
        await stored.save();
        await Session.updateMany(
          { refreshTokenId: stored._id },
          { $set: { revokedAt: new Date() } },
        );
      }
    } else {
      await RefreshToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
      await Session.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    }

    await writeAuditLog({
      actorId: userId,
      action: 'auth.logout',
      resourceType: 'User',
      resourceId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { loggedOut: true };
  },

  async me(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    assertAccountUsable(user);
    return { user: await toPublicUser(user) };
  },

  /**
   * Switch active marketplace role on the same authenticated identity.
   * Re-issues tokens with the new role claim; does not create another User.
   */
  async switchRole(
    userId: string,
    role: typeof ROLES.CUSTOMER | typeof ROLES.TECHNICIAN,
    refreshTokenRaw: string | undefined,
    meta: AuthRequestMeta,
  ) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    assertAccountUsable(user);

    if (user.role === ROLES.ADMIN) {
      throw AppError.forbidden('Admin accounts cannot switch marketplace roles');
    }

    const available = await resolveAvailableRoles(user._id.toString(), user.role);
    if (!available.includes(role)) {
      throw new AppError(
        'That account type is not available for this login.',
        403,
        ERROR_CODES.FORBIDDEN,
        { reason: 'ROLE_NOT_AVAILABLE', availableRoles: available },
      );
    }

    if (user.role !== role) {
      user.role = role;
      await user.save();
    }

    if (refreshTokenRaw) {
      const hash = sha256(refreshTokenRaw);
      const stored = await RefreshToken.findOne({ tokenHash: hash });
      if (stored && !stored.revokedAt) {
        stored.revokedAt = new Date();
        await stored.save();
        await Session.updateMany(
          { refreshTokenId: stored._id },
          { $set: { revokedAt: new Date() } },
        );
      }
    }

    const tokens = await issueTokenPair(user, meta, { rememberMe: true });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.role.switch',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { role, availableRoles: available },
    });

    return {
      user: await toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        sessionId: tokens.sessionId,
      },
    };
  },

  async forgotPassword(emailRaw: string, meta: AuthRequestMeta) {
    const email = emailRaw.toLowerCase().trim();
    const user = await User.findOne({ email });
    // Always succeed to avoid account enumeration
    if (!user) {
      return {
        sent: true,
        message: 'If an account exists, a reset code has been sent.',
      };
    }

    const otp = await issueOtp({
      userId: user._id.toString(),
      purpose: OTP_PURPOSE.PASSWORD_RESET,
      channel: OTP_CHANNEL.EMAIL,
      destination: email,
      fullName: user.fullName,
    });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.forgot_password',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
    });

    try {
      const { createDbNotification } = await import('../../utils/notify.js');
      await createDbNotification({
        userId: user._id.toString(),
        type: 'auth.password_reset',
        title: 'Password reset requested',
        body: 'A password reset code was requested for your FixNow account.',
        bypassQuietHours: true,
      });
    } catch {
      // Push side-effect must not fail forgot-password.
    }

    return {
      sent: true,
      message: 'If an account exists, a reset code has been sent.',
      expiresAt: otp.expiresAt,
      ...(otp.debugOtp ? { debugOtp: otp.debugOtp } : {}),
    };
  },

  async resetPassword(
    input: { email: string; code: string; newPassword: string },
    meta: AuthRequestMeta,
  ) {
    const email = input.email.toLowerCase().trim();
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) throw AppError.badRequest('Invalid reset request');

    await verifyOtpCode({
      userId: user._id.toString(),
      purpose: OTP_PURPOSE.PASSWORD_RESET,
      code: input.code,
    });

    user.passwordHash = await hashPassword(input.newPassword);
    user.passwordChangedAt = new Date();
    user.refreshTokenVersion += 1;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    if (user.accountStatus === ACCOUNT_STATUS.LOCKED) {
      user.accountStatus = user.emailVerifiedAt
        ? ACCOUNT_STATUS.ACTIVE
        : ACCOUNT_STATUS.PENDING_VERIFICATION;
    }
    await user.save();

    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.reset_password',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      severity: 'warning',
    });

    return { reset: true, message: 'Password updated. Please log in.' };
  },

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    meta: AuthRequestMeta,
  ) {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw AppError.notFound('User not found');

    if (!user.passwordHash) {
      user.passwordHash = await hashPassword(input.newPassword);
      const providers = new Set(user.authProviders?.length ? user.authProviders : []);
      providers.add('password');
      providers.add('google');
      user.authProviders = [...providers] as Array<'password' | 'google'>;
    } else {
      const ok = await comparePassword(input.currentPassword, user.passwordHash);
      if (!ok) throw AppError.unauthorized('Current password is incorrect');
      user.passwordHash = await hashPassword(input.newPassword);
    }

    user.passwordChangedAt = new Date();
    user.refreshTokenVersion += 1;
    await user.save();

    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );

    await writeAuditLog({
      actorId: userId,
      actorRole: user.role,
      action: 'auth.change_password',
      resourceType: 'User',
      resourceId: userId,
      ip: meta.ip,
      severity: 'warning',
    });

    return { changed: true, message: 'Password changed. Please log in again.' };
  },

  async verifyOtp(
    input: {
      email?: string;
      phone?: string;
      code: string;
      purpose: OtpPurpose;
    },
    meta: AuthRequestMeta,
  ) {
    const user = input.email
      ? await User.findOne({ email: input.email.toLowerCase().trim() })
      : input.phone
        ? await User.findOne({ phone: input.phone })
        : null;

    if (!user) throw AppError.badRequest('User not found for verification');

    await verifyOtpCode({
      userId: user._id.toString(),
      purpose: input.purpose,
      code: input.code,
    });

    if (input.purpose === OTP_PURPOSE.EMAIL_VERIFICATION) {
      user.emailVerifiedAt = new Date();
      if (user.accountStatus === ACCOUNT_STATUS.PENDING_VERIFICATION) {
        user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      }
    }
    if (input.purpose === OTP_PURPOSE.PHONE_VERIFICATION) {
      user.phoneVerifiedAt = new Date();
    }
    await user.save();

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.verify_otp',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      meta: { purpose: input.purpose },
    });

    return { verified: true, user: publicUser(user) };
  },

  async resendOtp(
    input: {
      email?: string;
      phone?: string;
      purpose: OtpPurpose;
      channel?: OtpChannel;
    },
    meta: AuthRequestMeta,
  ) {
    const user = input.email
      ? await User.findOne({ email: input.email.toLowerCase().trim() })
      : input.phone
        ? await User.findOne({ phone: input.phone })
        : null;

    if (!user) {
      return { sent: true, message: 'If an account exists, a new code has been sent.' };
    }

    let channel: OtpChannel = input.channel ?? OTP_CHANNEL.EMAIL;
    let destination = user.email;

    if (
      input.purpose === OTP_PURPOSE.PHONE_VERIFICATION ||
      channel === OTP_CHANNEL.SMS
    ) {
      if (!user.phone) throw AppError.badRequest('No phone number on account');
      channel = OTP_CHANNEL.SMS;
      destination = user.phone;
    }

    const otp = await issueOtp({
      userId: user._id.toString(),
      purpose: input.purpose,
      channel,
      destination,
      fullName: user.fullName,
    });

    await writeAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.resend_otp',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: meta.ip,
      meta: { purpose: input.purpose, channel },
    });

    return {
      sent: true,
      channel,
      expiresAt: otp.expiresAt,
      ...(otp.debugOtp ? { debugOtp: otp.debugOtp } : {}),
    };
  },

  async listSessions(userId: string) {
    const sessions = await Session.find({
      userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastSeenAt: -1 })
      .limit(50)
      .lean();

    return {
      sessions: sessions.map((s) => ({
        id: s._id.toString(),
        deviceId: s.deviceId ?? null,
        platform: s.platform,
        ip: s.ip ?? null,
        userAgent: s.userAgent ?? null,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
      })),
    };
  },

  async revokeSession(userId: string, sessionId: string) {
    const session = await Session.findOne({ _id: sessionId, userId });
    if (!session) throw AppError.notFound('Session not found');
    session.revokedAt = new Date();
    await session.save();
    if (session.refreshTokenId) {
      await RefreshToken.updateOne(
        { _id: session.refreshTokenId },
        { $set: { revokedAt: new Date() } },
      );
    }
    return { revoked: true };
  },

  async revokeAllSessions(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    user.refreshTokenVersion += 1;
    await user.save();
    await RefreshToken.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await Session.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    return { revokedAll: true };
  },
};

export const adminAuthService = {
  async suspendUser(adminId: string, targetUserId: string, reason?: string, meta: AuthRequestMeta = {}) {
    const user = await User.findById(targetUserId);
    if (!user) throw AppError.notFound('User not found');
    user.accountStatus = ACCOUNT_STATUS.SUSPENDED;
    user.refreshTokenVersion += 1;
    await user.save();
    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await writeAuditLog({
      actorId: adminId,
      actorRole: ROLES.ADMIN,
      action: 'admin.suspend_user',
      resourceType: 'User',
      resourceId: targetUserId,
      ip: meta.ip,
      meta: { reason },
      severity: 'critical',
    });
    return { user: publicUser(user) };
  },

  async unlockUser(adminId: string, targetUserId: string, meta: AuthRequestMeta = {}) {
    const user = await User.findById(targetUserId);
    if (!user) throw AppError.notFound('User not found');
    user.accountStatus = user.emailVerifiedAt
      ? ACCOUNT_STATUS.ACTIVE
      : ACCOUNT_STATUS.PENDING_VERIFICATION;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: ROLES.ADMIN,
      action: 'admin.unlock_user',
      resourceType: 'User',
      resourceId: targetUserId,
      ip: meta.ip,
      severity: 'warning',
    });
    return { user: publicUser(user) };
  },

  async forceLogout(adminId: string, targetUserId: string, meta: AuthRequestMeta = {}) {
    return authService.revokeAllSessions(targetUserId).then(async (result) => {
      await writeAuditLog({
        actorId: adminId,
        actorRole: ROLES.ADMIN,
        action: 'admin.force_logout',
        resourceType: 'User',
        resourceId: targetUserId,
        ip: meta.ip,
        severity: 'warning',
      });
      return result;
    });
  },

  async resetPassword(
    adminId: string,
    targetUserId: string,
    newPassword: string,
    meta: AuthRequestMeta = {},
  ) {
    const user = await User.findById(targetUserId).select('+passwordHash');
    if (!user) throw AppError.notFound('User not found');
    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    user.refreshTokenVersion += 1;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await writeAuditLog({
      actorId: adminId,
      actorRole: ROLES.ADMIN,
      action: 'admin.reset_password',
      resourceType: 'User',
      resourceId: targetUserId,
      ip: meta.ip,
      severity: 'critical',
    });
    return { reset: true, user: publicUser(user) };
  },
};
