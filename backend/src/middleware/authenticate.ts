import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../constants/roles.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { AdminUser, User } from '../models/index.js';
import { ACCOUNT_STATUS } from '../models/shared/enums.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        next(AppError.unauthorized());
        return;
      }

      const token = header.slice('Bearer '.length).trim();
      if (!token) {
        next(AppError.unauthorized());
        return;
      }

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.isDeleted || user.accountStatus === ACCOUNT_STATUS.DELETED) {
        next(AppError.unauthorized('Account not found'));
        return;
      }
      if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
        next(AppError.accountSuspended());
        return;
      }
      if (
        user.accountStatus === ACCOUNT_STATUS.LOCKED ||
        (user.lockUntil && user.lockUntil.getTime() > Date.now())
      ) {
        next(AppError.accountLocked());
        return;
      }
      if (payload.rv !== user.refreshTokenVersion) {
        next(AppError.unauthorized('Session invalidated. Please log in again.'));
        return;
      }

      req.auth = {
        userId: user._id.toString(),
        role: user.role,
        tokenVersion: user.refreshTokenVersion,
        accountStatus: user.accountStatus,
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      tokenVersion: payload.rv,
    };
  } catch {
    // Optional auth ignores invalid tokens.
  }
  next();
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(AppError.unauthorized());
      return;
    }
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

/**
 * Fine-grained admin permission gate.
 * Requires an active AdminUser profile — no fail-open for missing profiles.
 */
export function requirePermission(...permissionKeys: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!req.auth) {
          next(AppError.unauthorized());
          return;
        }
        if (req.auth.role !== ROLES.ADMIN) {
          next(AppError.forbidden());
          return;
        }
        if (permissionKeys.length === 0) {
          next();
          return;
        }

        const profile = await AdminUser.findOne({
          userId: req.auth.userId,
          status: 'active',
          isActive: true,
          isDeleted: { $ne: true },
        })
          .select('permissionKeys adminRoleKey')
          .lean();

        if (!profile) {
          next(AppError.forbidden('Administrator profile required'));
          return;
        }

        const keys = profile.permissionKeys ?? [];
        if (keys.includes('*') || permissionKeys.some((k) => keys.includes(k))) {
          next();
          return;
        }
        try {
          const { writeAuditLog } = await import('../utils/audit.js');
          await writeAuditLog({
            actorId: req.auth.userId,
            actorRole: req.auth.role,
            action: 'admin.permission_denied',
            resourceType: 'Permission',
            resourceId: permissionKeys.join('|'),
            severity: 'warning',
            meta: { required: permissionKeys, owned: keys, path: req.path },
          });
        } catch {
          /* ignore */
        }
        next(AppError.forbidden('Missing required permission'));
      } catch (err) {
        next(err);
      }
    })();
  };
}

/**
 * Capability gate — uses the centralized role engine (CanManageFinance, etc.).
 */
export function requireCapability(...capabilities: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!req.auth) {
          next(AppError.unauthorized());
          return;
        }
        if (req.auth.role !== ROLES.ADMIN) {
          next(AppError.forbidden());
          return;
        }
        const profile = await AdminUser.findOne({
          userId: req.auth.userId,
          status: 'active',
          isActive: true,
          isDeleted: { $ne: true },
        })
          .select('permissionKeys adminRoleKey')
          .lean();

        if (!profile) {
          next(AppError.forbidden('Administrator profile required'));
          return;
        }

        const { can, ADMIN_CAPABILITIES } = await import(
          '../services/admin/adminCapabilities.js'
        );
        const allowed = capabilities.some((c) =>
          can(profile, c as (typeof ADMIN_CAPABILITIES)[keyof typeof ADMIN_CAPABILITIES]),
        );
        if (allowed) {
          next();
          return;
        }
        try {
          const { writeAuditLog } = await import('../utils/audit.js');
          await writeAuditLog({
            actorId: req.auth.userId,
            actorRole: req.auth.role,
            action: 'admin.permission_denied',
            resourceType: 'Capability',
            resourceId: capabilities.join('|'),
            severity: 'warning',
            meta: {
              required: capabilities,
              role: profile.adminRoleKey,
              path: req.path,
            },
          });
        } catch {
          /* ignore */
        }
        next(AppError.forbidden('Missing required capability'));
      } catch (err) {
        next(err);
      }
    })();
  };
}

/**
 * Super Admin gate for platform-wide switches (e.g. development controls).
 * Requires active AdminUser with super_admin role or wildcard permission.
 */
export function requireSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!req.auth) {
          next(AppError.unauthorized());
          return;
        }
        if (req.auth.role !== ROLES.ADMIN) {
          next(AppError.forbidden());
          return;
        }

        const profile = await AdminUser.findOne({
          userId: req.auth.userId,
          status: 'active',
          isActive: true,
          isDeleted: { $ne: true },
        })
          .select('permissionKeys adminRoleKey')
          .lean();

        if (!profile) {
          next(AppError.forbidden('Administrator profile required'));
          return;
        }
        if (
          profile.adminRoleKey === ADMIN_ROLES.SUPER_ADMIN ||
          profile.adminRoleKey === 'super_admin' ||
          profile.permissionKeys?.includes('*')
        ) {
          next();
          return;
        }
        next(AppError.forbidden('Super Admin access required'));
      } catch (err) {
        next(err);
      }
    })();
  };
}

/**
 * Production Super Admin — governanceClassification=production + Super Admin RBAC.
 * Required for Platform Mode transitions.
 */
export function requireProductionSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!req.auth) {
          next(AppError.unauthorized());
          return;
        }
        if (req.auth.role !== ROLES.ADMIN) {
          next(AppError.forbidden());
          return;
        }
        const { isProductionSuperAdmin } = await import('../services/platform/platformMode.service.js');
        if (!(await isProductionSuperAdmin(req.auth.userId))) {
          next(AppError.forbidden('Production Super Admin access required'));
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}

/** Require email verification for sensitive actions (optional use). */
export function requireVerifiedEmail() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!req.auth) {
          next(AppError.unauthorized());
          return;
        }
        const user = await User.findById(req.auth.userId);
        if (!user?.emailVerifiedAt) {
          next(AppError.forbidden('Email verification required'));
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}
