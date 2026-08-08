/**
 * Sandbox platform settings — enable/hide sandbox, avatar policy, defaults.
 */

import { env } from '../../config/env.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';

export const SANDBOX_SETTINGS_KEY = 'sandbox_data_platform';

export type SandboxPlatformSettings = {
  enableSandbox: boolean;
  hideSandboxFromReports: boolean;
  allowAvatars: boolean;
  requireRealPhotos: boolean;
  defaultAvatarId: string;
  availableAvatarCollections: string[];
};

const DEFAULTS: SandboxPlatformSettings = {
  enableSandbox: !env.isProductionEnv,
  hideSandboxFromReports: true,
  allowAvatars: true,
  requireRealPhotos: false,
  defaultAvatarId: 'avatar-uganda-pro-01',
  availableAvatarCollections: ['professional', 'friendly', 'casual', 'illustrated', 'modern-flat'],
};

const CACHE_TTL_MS = 15_000;
let cache: { value: SandboxPlatformSettings; loadedAt: number } | null = null;

function pick(raw: unknown): Partial<SandboxPlatformSettings> {
  const v = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<SandboxPlatformSettings> = {};
  if (typeof v.enableSandbox === 'boolean') out.enableSandbox = v.enableSandbox;
  if (typeof v.hideSandboxFromReports === 'boolean') out.hideSandboxFromReports = v.hideSandboxFromReports;
  if (typeof v.allowAvatars === 'boolean') out.allowAvatars = v.allowAvatars;
  if (typeof v.requireRealPhotos === 'boolean') out.requireRealPhotos = v.requireRealPhotos;
  if (typeof v.defaultAvatarId === 'string') out.defaultAvatarId = v.defaultAvatarId.slice(0, 64);
  if (Array.isArray(v.availableAvatarCollections)) {
    out.availableAvatarCollections = v.availableAvatarCollections
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.slice(0, 64))
      .slice(0, 20);
  }
  return out;
}

export async function getSandboxSettings(): Promise<SandboxPlatformSettings> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  try {
    const doc = await PlatformSetting.findOne({ key: SANDBOX_SETTINGS_KEY, isDeleted: { $ne: true } })
      .select('value')
      .lean();
    const merged = { ...DEFAULTS, ...pick(doc?.value) };
    if (env.isProductionEnv) {
      // Production may still hold launch-promoted content; sandbox tooling stays off unless explicitly enabled.
      merged.enableSandbox = Boolean(pick(doc?.value).enableSandbox);
    }
    cache = { value: merged, loadedAt: Date.now() };
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateSandboxSettings(
  patch: Partial<SandboxPlatformSettings>,
  actorId?: string,
): Promise<SandboxPlatformSettings> {
  if (env.isProductionEnv && patch.enableSandbox === true) {
    // Allow explicit enable for launch transition tooling, but require intentional patch.
  }
  const current = await getSandboxSettings();
  const next = { ...current, ...pick(patch) };
  if (next.requireRealPhotos) next.allowAvatars = false;

  await PlatformSetting.findOneAndUpdate(
    { key: SANDBOX_SETTINGS_KEY },
    {
      $set: {
        key: SANDBOX_SETTINGS_KEY,
        value: next,
        updatedBy: actorId,
        isDeleted: false,
        deletedAt: null,
      },
    },
    { upsert: true, new: true },
  );
  cache = null;
  await writeAuditLog({
    actorId,
    actorRole: 'admin',
    action: 'sandbox.settings.update',
    resourceType: 'PlatformSetting',
    resourceId: SANDBOX_SETTINGS_KEY,
    meta: { next },
  });
  return getSandboxSettings();
}

export async function assertSandboxEnabled(): Promise<void> {
  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    if ((await getCurrentPlatformMode()) === 'production') {
      throw AppError.forbidden(
        'Sandbox tooling is suspended while Platform Mode is Production. Data is preserved.',
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
  }
  const settings = await getSandboxSettings();
  if (!settings.enableSandbox) {
    throw AppError.forbidden('Sandbox data platform is disabled.');
  }
}
