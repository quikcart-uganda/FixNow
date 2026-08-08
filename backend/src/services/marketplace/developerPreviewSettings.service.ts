/**
 * Developer Preview platform settings — Admin-controlled launch switch.
 */

import { env } from '../../config/env.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { writeAuditLog } from '../../utils/audit.js';
import type { PreviewPlanCode } from '../../models/marketplace/DeveloperPreview.js';
import { DEVELOPER_TECHNICIAN } from '../sandbox/seed/constants.js';

export const DEVELOPER_PREVIEW_SETTINGS_KEY = 'developer_preview_platform';

export type DeveloperPreviewSettings = {
  /** Master switch — when false, nobody can activate preview. */
  enablePreview: boolean;
  /** Hard suspend without wiping authorised accounts. */
  suspendPreview: boolean;
  allowDevelopers: boolean;
  allowQa: boolean;
  /** Default authorised emails (developer technician included). */
  authorizedEmails: string[];
  authorizedUserIds: string[];
  enabledPlans: Record<PreviewPlanCode, boolean>;
  defaultDurationHours: number;
  /** Require sandbox content env / sandbox platform enabled. */
  requireSandbox: boolean;
};

const DEFAULTS: DeveloperPreviewSettings = {
  enablePreview: !env.isProductionEnv,
  suspendPreview: false,
  allowDevelopers: true,
  allowQa: true,
  authorizedEmails: [DEVELOPER_TECHNICIAN.email.toLowerCase()],
  authorizedUserIds: [],
  enabledPlans: {
    STARTER: true,
    PROFESSIONAL: true,
    BUSINESS: true,
    BUSINESS_BOOST: true,
  },
  defaultDurationHours: 8,
  requireSandbox: true,
};

const CACHE_TTL_MS = 15_000;
let cache: { value: DeveloperPreviewSettings; loadedAt: number } | null = null;

function pick(raw: unknown): Partial<DeveloperPreviewSettings> {
  const v = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<DeveloperPreviewSettings> = {};
  if (typeof v.enablePreview === 'boolean') out.enablePreview = v.enablePreview;
  if (typeof v.suspendPreview === 'boolean') out.suspendPreview = v.suspendPreview;
  if (typeof v.allowDevelopers === 'boolean') out.allowDevelopers = v.allowDevelopers;
  if (typeof v.allowQa === 'boolean') out.allowQa = v.allowQa;
  if (typeof v.requireSandbox === 'boolean') out.requireSandbox = v.requireSandbox;
  if (typeof v.defaultDurationHours === 'number' && Number.isFinite(v.defaultDurationHours)) {
    out.defaultDurationHours = Math.max(1, Math.min(168, Math.floor(v.defaultDurationHours)));
  }
  if (Array.isArray(v.authorizedEmails)) {
    out.authorizedEmails = v.authorizedEmails
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100);
  }
  if (Array.isArray(v.authorizedUserIds)) {
    out.authorizedUserIds = v.authorizedUserIds
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  if (v.enabledPlans && typeof v.enabledPlans === 'object') {
    const ep = v.enabledPlans as Record<string, unknown>;
    out.enabledPlans = {
      STARTER: ep.STARTER !== false,
      PROFESSIONAL: ep.PROFESSIONAL !== false,
      BUSINESS: ep.BUSINESS !== false,
      BUSINESS_BOOST: ep.BUSINESS_BOOST !== false,
    };
  }
  return out;
}

export async function getDeveloperPreviewSettings(): Promise<DeveloperPreviewSettings> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  try {
    const doc = await PlatformSetting.findOne({
      key: DEVELOPER_PREVIEW_SETTINGS_KEY,
      isDeleted: { $ne: true },
    })
      .select('value')
      .lean();
    const merged: DeveloperPreviewSettings = {
      ...DEFAULTS,
      ...pick(doc?.value),
      enabledPlans: {
        ...DEFAULTS.enabledPlans,
        ...(pick(doc?.value).enabledPlans || {}),
      },
      authorizedEmails: Array.from(
        new Set([
          ...DEFAULTS.authorizedEmails,
          ...(pick(doc?.value).authorizedEmails || []),
        ]),
      ),
    };
    if (env.isProductionEnv && pick(doc?.value).enablePreview !== true) {
      merged.enablePreview = false;
    }
    cache = { value: merged, loadedAt: Date.now() };
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateDeveloperPreviewSettings(
  patch: Partial<DeveloperPreviewSettings>,
  actorId?: string,
): Promise<DeveloperPreviewSettings> {
  const current = await getDeveloperPreviewSettings();
  const next: DeveloperPreviewSettings = {
    ...current,
    ...pick(patch),
    enabledPlans: {
      ...current.enabledPlans,
      ...(pick(patch).enabledPlans || {}),
    },
    authorizedEmails: pick(patch).authorizedEmails ?? current.authorizedEmails,
    authorizedUserIds: pick(patch).authorizedUserIds ?? current.authorizedUserIds,
  };
  // Always keep the official developer technician authorised unless explicitly removed and empty.
  if (!next.authorizedEmails.includes(DEVELOPER_TECHNICIAN.email.toLowerCase())) {
    next.authorizedEmails = [DEVELOPER_TECHNICIAN.email.toLowerCase(), ...next.authorizedEmails];
  }

  await PlatformSetting.findOneAndUpdate(
    { key: DEVELOPER_PREVIEW_SETTINGS_KEY },
    {
      $set: {
        key: DEVELOPER_PREVIEW_SETTINGS_KEY,
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
    action: 'developer_preview.settings.update',
    resourceType: 'PlatformSetting',
    resourceId: DEVELOPER_PREVIEW_SETTINGS_KEY,
    meta: { next },
  });
  return getDeveloperPreviewSettings();
}

export function invalidateDeveloperPreviewSettingsCache() {
  cache = null;
}
