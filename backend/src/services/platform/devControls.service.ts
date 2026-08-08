import { DEV_FLAG_DEFAULTS, env, type DevFlagKey } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';

/**
 * Single source of truth for development behaviour (dev OTP display, dev login,
 * test accounts, mock providers, debug logs, development mode).
 *
 * Resolution order — later wins, except production which always wins:
 *   1. Environment flag defaults (ENABLE_DEV_* / AUTH_EXPOSE_OTP)
 *   2. Admin-managed overrides persisted in PlatformSetting('dev_controls')
 *   3. Production lockdown: every flag forced off
 */

export const DEV_CONTROLS_SETTING_KEY = 'dev_controls';

export type DevControls = Record<DevFlagKey, boolean>;

export const DEV_FLAG_KEYS = Object.keys(DEV_FLAG_DEFAULTS) as DevFlagKey[];

const PRODUCTION_LOCKED: DevControls = {
  enableDevOtp: false,
  enableDevLogin: false,
  enableTestAccounts: false,
  enableMockProviders: false,
  enableDebugLogs: false,
  enableDevelopmentMode: false,
};

const CACHE_TTL_MS = 15_000;

type StoredDevControls = {
  overrides: Partial<DevControls>;
  updatedAt?: Date;
  updatedBy?: string;
};

type CacheEntry = { stored: StoredDevControls; effective: DevControls; loadedAt: number };

let cache: CacheEntry | null = null;

function envDefaults(): DevControls {
  return { ...DEV_FLAG_DEFAULTS };
}

function applyProductionLockdown(controls: DevControls): DevControls {
  return env.isProductionEnv ? { ...PRODUCTION_LOCKED } : controls;
}

function pickBooleans(raw: unknown): Partial<DevControls> {
  const value = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<DevControls> = {};
  for (const key of DEV_FLAG_KEYS) {
    if (typeof value[key] === 'boolean') out[key] = value[key] as boolean;
  }
  return out;
}

function resolve(stored: StoredDevControls): DevControls {
  return applyProductionLockdown({ ...envDefaults(), ...stored.overrides });
}

async function loadStored(): Promise<StoredDevControls> {
  // Production ignores persisted overrides entirely — nothing can unlock dev behaviour.
  if (env.isProductionEnv) return { overrides: {} };
  try {
    const doc = await PlatformSetting.findOne({
      key: DEV_CONTROLS_SETTING_KEY,
      isDeleted: { $ne: true },
    })
      .select('value updatedBy updatedAt')
      .lean();
    if (!doc) return { overrides: {} };
    return {
      overrides: pickBooleans(doc.value),
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy ? String(doc.updatedBy) : undefined,
    };
  } catch (err) {
    logger.warn(`[devControls] falling back to environment defaults: ${(err as Error).message}`);
    return { overrides: {} };
  }
}

/** Effective flags with the DB layer applied (cached for a few seconds). */
export async function getDevControls(): Promise<DevControls> {
  if (env.isProductionEnv) return { ...PRODUCTION_LOCKED };
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return { ...cache.effective };
  const stored = await loadStored();
  cache = { stored, effective: resolve(stored), loadedAt: Date.now() };
  return { ...cache.effective };
}

/**
 * Last known effective flags without awaiting the database. Used by sync call
 * sites (logging, provider wiring); still production-safe because production
 * always resolves to the locked-down set.
 */
export function getCachedDevControls(): DevControls {
  if (env.isProductionEnv) return { ...PRODUCTION_LOCKED };
  return cache ? { ...cache.effective } : applyProductionLockdown(envDefaults());
}

export async function isDevFeatureEnabled(flag: DevFlagKey): Promise<boolean> {
  if (env.isProductionEnv) return false;
  const controls = await getDevControls();
  return controls[flag] === true;
}

/** True only when OTP codes may be returned to clients / rendered in the UI. */
export async function isOtpExposureAllowed(): Promise<boolean> {
  return isDevFeatureEnabled('enableDevOtp');
}

export function invalidateDevControlsCache(): void {
  cache = null;
}

export type DevControlsState = {
  environment: 'development' | 'staging' | 'production' | 'test';
  nodeEnv: string;
  productionLocked: boolean;
  effective: DevControls;
  overrides: Partial<DevControls>;
  envDefaults: DevControls;
  updatedAt?: Date;
  updatedBy?: string;
};

export const devControlsService = {
  /** Full state for the admin panel. */
  async getState(): Promise<DevControlsState> {
    const stored = await loadStored();
    if (!env.isProductionEnv) {
      cache = { stored, effective: resolve(stored), loadedAt: Date.now() };
    }
    return {
      environment: env.appEnv,
      nodeEnv: env.NODE_ENV,
      productionLocked: env.isProductionEnv,
      effective: applyProductionLockdown({ ...envDefaults(), ...stored.overrides }),
      overrides: stored.overrides,
      envDefaults: envDefaults(),
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  },

  /** Minimal, non-secret projection consumed by the auth screens. */
  async getPublicSettings(): Promise<{
    environment: DevControlsState['environment'];
    enableDevOtp: boolean;
    enableDevelopmentMode: boolean;
  }> {
    const controls = await getDevControls();
    return {
      environment: env.appEnv,
      enableDevOtp: controls.enableDevOtp,
      enableDevelopmentMode: controls.enableDevelopmentMode,
    };
  },

  async update(
    input: Partial<DevControls>,
    actor: { userId: string; role?: string; ip?: string; userAgent?: string },
  ): Promise<DevControlsState> {
    if (env.isProductionEnv) {
      throw AppError.forbidden('Development controls cannot be changed in production');
    }

    const before = await loadStored();
    const overrides: Partial<DevControls> = { ...before.overrides };
    for (const key of DEV_FLAG_KEYS) {
      if (typeof input[key] === 'boolean') overrides[key] = input[key] as boolean;
    }

    await PlatformSetting.findOneAndUpdate(
      { key: DEV_CONTROLS_SETTING_KEY },
      {
        $set: {
          value: overrides,
          scope: 'admin',
          description: 'Development controls (dev OTP, dev login, test accounts, mock providers, debug logs)',
          updatedBy: actor.userId,
          isSecret: false,
          isDeleted: false,
        },
      },
      { upsert: true, new: true },
    );

    invalidateDevControlsCache();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'settings.dev_controls.update',
      resourceType: 'PlatformSetting',
      resourceId: DEV_CONTROLS_SETTING_KEY,
      ip: actor.ip,
      userAgent: actor.userAgent,
      before: before.overrides as Record<string, unknown>,
      after: overrides as Record<string, unknown>,
      severity: 'warning',
      meta: { environment: env.appEnv },
    });

    return devControlsService.getState();
  },
};
