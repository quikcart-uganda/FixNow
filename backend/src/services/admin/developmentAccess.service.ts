import { env } from '../../config/env.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { AdminUser, User } from '../../models/index.js';
import { ADMIN_OPERATOR_STATUS, DEV_ADMIN } from '../../constants/adminIdentity.js';
import { ROLES } from '../../constants/roles.js';
import { writeAuditLog } from '../../utils/audit.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Development Administrator lifecycle — separate from generic Dev Controls flags.
 *
 * Restriction rule (Platform Mode aware):
 * - While Platform Mode === Development: Development Admin stays available (env permitting).
 * - Creating a real Super Admin / Production Owner must NOT lock out Development tooling.
 * - Only entering Platform Mode === Production suspends Development Access (see platformMode.service).
 * - The Dev Admin account is never deleted.
 */

export const DEVELOPMENT_ACCESS_SETTING_KEY = 'admin.development_access';

export type DevelopmentAccessHistoryEntry = {
  at: string;
  actorId: string | null;
  action: 'transition_completed' | 'enable' | 'disable' | 'auto_disable';
  reason?: string;
};

export type DevelopmentAccessConfig = {
  /** True after first real Super Admin exists / bootstrap. */
  transitionCompleted: boolean;
  /** When true (and env allows), Development Login is available. */
  allowDevLogin: boolean;
  transitionCompletedAt?: string | null;
  lastChangedAt?: string | null;
  lastChangedBy?: string | null;
  history: DevelopmentAccessHistoryEntry[];
};

const DEFAULT_CONFIG: DevelopmentAccessConfig = {
  transitionCompleted: false,
  allowDevLogin: true,
  transitionCompletedAt: null,
  lastChangedAt: null,
  lastChangedBy: null,
  history: [],
};

let cache: { value: DevelopmentAccessConfig; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

function normalize(raw: Partial<DevelopmentAccessConfig> | null | undefined): DevelopmentAccessConfig {
  const v = raw ?? {};
  return {
    transitionCompleted: Boolean(v.transitionCompleted),
    allowDevLogin: v.allowDevLogin !== false,
    transitionCompletedAt: v.transitionCompletedAt ?? null,
    lastChangedAt: v.lastChangedAt ?? null,
    lastChangedBy: v.lastChangedBy ?? null,
    history: Array.isArray(v.history) ? v.history.slice(-50) : [],
  };
}

async function loadConfig(): Promise<DevelopmentAccessConfig> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  const doc = await PlatformSetting.findOne({ key: DEVELOPMENT_ACCESS_SETTING_KEY }).lean();
  const value = normalize(doc?.value as Partial<DevelopmentAccessConfig> | undefined);
  cache = { value, loadedAt: Date.now() };
  return value;
}

async function saveConfig(next: DevelopmentAccessConfig, actorId?: string | null): Promise<DevelopmentAccessConfig> {
  await PlatformSetting.findOneAndUpdate(
    { key: DEVELOPMENT_ACCESS_SETTING_KEY },
    {
      $set: {
        value: next,
        scope: 'admin',
        description: 'Development Administrator access transition controls',
        updatedBy: actorId || undefined,
        isSecret: false,
        isDeleted: false,
      },
    },
    { upsert: true },
  );
  cache = { value: next, loadedAt: Date.now() };
  return next;
}

export function invalidateDevelopmentAccessCache() {
  cache = null;
}

/** Disable Dev Admin profile without deleting the User / AdminUser rows. */
export async function disableDevelopmentAdminAccount(reason: string) {
  const user = await User.findOne({ email: DEV_ADMIN.email.toLowerCase(), role: ROLES.ADMIN });
  if (!user) return null;
  const adminUser = await AdminUser.findOne({ userId: user._id, isDeleted: { $ne: true } });
  if (!adminUser) return null;
  adminUser.status = ADMIN_OPERATOR_STATUS.DISABLED;
  adminUser.isActive = false;
  adminUser.notes = `Development transition — disabled. ${reason}`.slice(0, 500);
  await adminUser.save();
  user.refreshTokenVersion += 1;
  await user.save();
  return { userId: user._id.toString(), adminUserId: adminUser._id.toString() };
}

/** Re-activate Dev Admin when Super Admin re-enables Development Access. */
export async function enableDevelopmentAdminAccount() {
  const { ADMIN_OPERATOR_ROLES, ADMIN_PERMISSIONS } = await import('../../constants/adminIdentity.js');
  const user = await User.findOne({ email: DEV_ADMIN.email.toLowerCase(), role: ROLES.ADMIN });
  if (!user) return null;
  const adminUser = await AdminUser.findOne({ userId: user._id, isDeleted: { $ne: true } });
  if (!adminUser) return null;
  const { AdminRole } = await import('../../models/index.js');
  const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.SUPER_ADMIN });
  adminUser.status = ADMIN_OPERATOR_STATUS.ACTIVE;
  adminUser.isActive = true;
  if (role) {
    adminUser.adminRoleId = role._id;
    adminUser.adminRoleKey = role.key;
  } else {
    adminUser.adminRoleKey = ADMIN_OPERATOR_ROLES.SUPER_ADMIN;
  }
  adminUser.permissionKeys = [ADMIN_PERMISSIONS.WILDCARD];
  adminUser.governanceClassification = 'development';
  adminUser.notes = 'Development Administrator — re-enabled (full development capabilities restored)';
  await adminUser.save();
  return { userId: user._id.toString(), adminUserId: adminUser._id.toString() };
}

/**
 * Hard gates: production env off, ALLOW_DEV_ADMIN_LOGIN off.
 * Soft gate: while Platform Mode is Production, require explicit allowDevLogin.
 * While Platform Mode is Development, Dev Admin stays available unless explicitly disabled.
 */
export async function isDevLoginEnabled(): Promise<boolean> {
  if (env.isProductionEnv) return false;
  if (!env.allowDevAdminLogin) return false;

  let mode: 'development' | 'production' = 'development';
  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    mode = await getCurrentPlatformMode();
  } catch {
    mode = 'development';
  }

  // Heal premature lockouts before evaluating the soft flag.
  const config = await ensureTransitionSelfHeal();

  if (mode === 'production') {
    // Production Mode: development tooling restricted unless explicitly re-enabled.
    return config.allowDevLogin === true;
  }

  // Development Mode: available by default. Explicit allowDevLogin=false still honored
  // for operators who soft-disable the button without entering Production Mode.
  return config.allowDevLogin !== false;
}

/** Sync-safe env-only check used when async is unavailable (prefer isDevLoginEnabled). */
export function envAllowsDevAdminLogin(): boolean {
  return Boolean(env.allowDevAdminLogin && !env.isProductionEnv);
}

async function countRealSuperAdmins(): Promise<number> {
  const { DEV_ADMIN_EMAIL_SUFFIXES } = await import('../../constants/adminIdentity.js');
  const { ADMIN_OPERATOR_ROLES } = await import('../../constants/adminIdentity.js');
  const devIds = (
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

  return AdminUser.countDocuments({
    adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN,
    status: ADMIN_OPERATOR_STATUS.ACTIVE,
    isDeleted: { $ne: true },
    ...(devIds.length ? { userId: { $nin: devIds } } : {}),
  });
}

/**
 * Record that a real Super Admin exists — does NOT disable Development Admin.
 * Also heals premature lockouts from older builds that auto-disabled Dev Admin
 * when a Super Admin was created while Platform Mode was still Development.
 */
export async function ensureTransitionSelfHeal(): Promise<DevelopmentAccessConfig> {
  const config = await loadConfig();

  let mode: 'development' | 'production' = 'development';
  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    mode = await getCurrentPlatformMode();
  } catch {
    mode = 'development';
  }

  // Heal premature lockouts from older builds that auto-disabled Dev Admin when a
  // Super Admin was created while Platform Mode was still Development.
  // Do not override an intentional Super Admin soft-disable (history action=disable with actor).
  if (mode === 'development' && config.allowDevLogin === false) {
    const intentionalDisable = config.history.some((h) => h.action === 'disable' && Boolean(h.actorId));
    if (!intentionalDisable) {
      const now = new Date().toISOString();
      const next: DevelopmentAccessConfig = {
        ...config,
        allowDevLogin: true,
        lastChangedAt: now,
        history: [
          ...config.history,
          {
            at: now,
            actorId: null,
            action: 'enable',
            reason:
              'Healed premature Development Admin lockout — Platform Mode is still Development',
          },
        ].slice(-50),
      };
      await saveConfig(next, null);
      try {
        await enableDevelopmentAdminAccount();
      } catch {
        /* account may not exist yet */
      }
      return next;
    }
  }

  if (config.transitionCompleted) return config;

  const superCount = await countRealSuperAdmins();
  if (superCount <= 0) return config;

  // Mark transition awareness only — keep allowDevLogin so Development Mode retains Dev Admin.
  const now = new Date().toISOString();
  const next: DevelopmentAccessConfig = {
    ...config,
    transitionCompleted: true,
    allowDevLogin: true,
    transitionCompletedAt: config.transitionCompletedAt || now,
    lastChangedAt: now,
    history: [
      ...config.history,
      {
        at: now,
        actorId: null,
        action: 'transition_completed',
        reason:
          'Real Super Admin detected — Development Admin remains available until Platform Mode is Production',
      },
    ].slice(-50),
  };
  await saveConfig(next, null);
  return next;
}

export async function completeDevelopmentTransition(input: {
  actorId: string | null;
  reason: string;
  action?: DevelopmentAccessHistoryEntry['action'];
}): Promise<DevelopmentAccessConfig> {
  const before = await loadConfig();

  // Only suspend Development Admin when Platform Mode is already Production.
  // Creating a Super Admin / PSA while still in Development Mode must not lock tooling out.
  let mode: 'development' | 'production' = 'development';
  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    mode = await getCurrentPlatformMode();
  } catch {
    mode = 'development';
  }

  const shouldSuspendDevAdmin = mode === 'production';
  if (shouldSuspendDevAdmin) {
    await disableDevelopmentAdminAccount(input.reason);
  }

  if (before.transitionCompleted && before.allowDevLogin === false && shouldSuspendDevAdmin) {
    return before;
  }

  const now = new Date().toISOString();
  const entry: DevelopmentAccessHistoryEntry = {
    at: now,
    actorId: input.actorId,
    action: input.action || 'transition_completed',
    reason: input.reason,
  };
  const next: DevelopmentAccessConfig = {
    transitionCompleted: true,
    // Keep Dev Admin available while Platform Mode remains Development.
    allowDevLogin: shouldSuspendDevAdmin ? false : before.allowDevLogin !== false,
    transitionCompletedAt: before.transitionCompletedAt || now,
    lastChangedAt: now,
    lastChangedBy: input.actorId,
    history: [...before.history, entry].slice(-50),
  };
  await saveConfig(next, input.actorId);

  await writeAuditLog({
    actorId: input.actorId || 'system',
    actorRole: ROLES.ADMIN,
    action: 'admin.development_access.transition_completed',
    resourceType: 'PlatformSetting',
    resourceId: DEVELOPMENT_ACCESS_SETTING_KEY,
    severity: 'critical',
    after: next as unknown as Record<string, unknown>,
    meta: { reason: input.reason, platformMode: mode, suspendedDevAdmin: shouldSuspendDevAdmin },
  });

  return next;
}

export async function getDevelopmentAccessState() {
  const config = await ensureTransitionSelfHeal();
  const loginEnabled = await isDevLoginEnabled();
  let platformMode: 'development' | 'production' = 'development';
  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    platformMode = await getCurrentPlatformMode();
  } catch {
    platformMode = 'development';
  }
  return {
    ...config,
    envAllowsDevAdminLogin: envAllowsDevAdminLogin(),
    productionLocked: env.isProductionEnv,
    platformMode,
    /** Effective: button should render only when this is true. */
    loginEnabled,
    statusLabel: !envAllowsDevAdminLogin()
      ? 'Unavailable (environment)'
      : platformMode === 'production'
        ? config.allowDevLogin
          ? 'Enabled (Production Mode override)'
          : 'Disabled — Platform Mode is Production'
        : config.allowDevLogin !== false
          ? 'Active (Development Mode)'
          : 'Disabled by Super Admin',
  };
}

export async function updateDevelopmentAccess(
  patch: { allowDevLogin?: boolean; reason?: string },
  actor: { userId: string; role?: string },
): Promise<ReturnType<typeof getDevelopmentAccessState>> {
  if (env.isProductionEnv) {
    throw AppError.forbidden('Development Access cannot be changed in production');
  }
  if (!env.allowDevAdminLogin) {
    throw AppError.forbidden(
      'ALLOW_DEV_ADMIN_LOGIN is off. Enable it in the environment before unlocking Development Access.',
    );
  }

  const before = await ensureTransitionSelfHeal();
  if (!before.transitionCompleted && patch.allowDevLogin === false) {
    // Explicit disable before transition still allowed
  }

  const allow = patch.allowDevLogin === true;
  if (allow) {
    await enableDevelopmentAdminAccount();
  } else {
    await disableDevelopmentAdminAccount(patch.reason || 'Disabled by Super Admin');
  }

  const now = new Date().toISOString();
  const entry: DevelopmentAccessHistoryEntry = {
    at: now,
    actorId: actor.userId,
    action: allow ? 'enable' : 'disable',
    reason: patch.reason || (allow ? 'Super Admin enabled Development Access' : 'Super Admin disabled Development Access'),
  };
  const next: DevelopmentAccessConfig = {
    ...before,
    transitionCompleted: true,
    allowDevLogin: allow,
    transitionCompletedAt: before.transitionCompletedAt || now,
    lastChangedAt: now,
    lastChangedBy: actor.userId,
    history: [...before.history, entry].slice(-50),
  };
  await saveConfig(next, actor.userId);

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.role || ROLES.ADMIN,
    action: allow ? 'admin.development_access.enable' : 'admin.development_access.disable',
    resourceType: 'PlatformSetting',
    resourceId: DEVELOPMENT_ACCESS_SETTING_KEY,
    severity: 'critical',
    before: before as unknown as Record<string, unknown>,
    after: next as unknown as Record<string, unknown>,
    meta: { reason: entry.reason },
  });

  return getDevelopmentAccessState();
}

/**
 * Platform Mode orchestration — set allowDevLogin without env production throw.
 * Never deletes the Dev Admin account; disable path only flips status.
 */
export async function applyDevelopmentAccessFlagForPlatformMode(
  allowDevLogin: boolean,
  actor: { userId: string; reason: string },
): Promise<void> {
  const before = await loadConfig();
  if (allowDevLogin && envAllowsDevAdminLogin()) {
    await enableDevelopmentAdminAccount();
  } else {
    await disableDevelopmentAdminAccount(actor.reason);
  }
  const now = new Date().toISOString();
  const next: DevelopmentAccessConfig = {
    ...before,
    allowDevLogin: allowDevLogin && envAllowsDevAdminLogin(),
    lastChangedAt: now,
    lastChangedBy: actor.userId,
    history: [
      ...before.history,
      {
        at: now,
        actorId: actor.userId,
        action: allowDevLogin ? 'enable' : 'disable',
        reason: actor.reason,
      },
    ].slice(-50),
  };
  await saveConfig(next, actor.userId);
}

export const developmentAccessService = {
  getState: getDevelopmentAccessState,
  update: updateDevelopmentAccess,
  completeTransition: completeDevelopmentTransition,
  isDevLoginEnabled,
  envAllowsDevAdminLogin,
};
