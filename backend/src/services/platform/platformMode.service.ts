/**
 * Platform Mode — operating state (Development | Production).
 * NEVER conflate with Content Environment (dataEnvironment).
 * Switching modes never deletes Sandbox / Seed / Preview / demo assets.
 */

import { env } from '../../config/env.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import {
  PlatformModeTransition,
  PLATFORM_MODES,
  type PlatformMode,
} from '../../models/platform/PlatformModeTransition.js';
import { AdminUser, User } from '../../models/index.js';
import {
  ADMIN_OPERATOR_ROLES,
  ADMIN_OPERATOR_STATUS,
  ADMIN_PERMISSIONS,
  DEV_ADMIN,
  isDevAdminEmail,
} from '../../constants/adminIdentity.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { getSandboxSettings, updateSandboxSettings } from '../sandbox/sandboxSettings.service.js';
import {
  getDeveloperPreviewSettings,
  updateDeveloperPreviewSettings,
} from '../marketplace/developerPreviewSettings.service.js';
import {
  applyDevelopmentAccessFlagForPlatformMode,
  getDevelopmentAccessState,
} from '../admin/developmentAccess.service.js';

export const PLATFORM_MODE_SETTINGS_KEY = 'platform_operating_mode';
export const MODE_LOCK_MS = 2 * 60 * 1000;

export type PlatformModeSnapshot = {
  enableSandbox: boolean;
  enablePreview: boolean;
  suspendPreview: boolean;
  allowDevLogin: boolean;
};

export type PlatformModeState = {
  mode: PlatformMode;
  updatedAt: string | null;
  updatedBy: string | null;
  snapshot: PlatformModeSnapshot | null;
  lockUntil: string | null;
  lastReason: string | null;
};

let cache: { value: PlatformModeState; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

function normalize(raw: Partial<PlatformModeState> | null | undefined): PlatformModeState {
  const v = raw ?? {};
  const mode = v.mode === 'production' ? 'production' : 'development';
  return {
    mode,
    updatedAt: v.updatedAt ?? null,
    updatedBy: v.updatedBy ?? null,
    snapshot: v.snapshot && typeof v.snapshot === 'object' ? (v.snapshot as PlatformModeSnapshot) : null,
    lockUntil: v.lockUntil ?? null,
    lastReason: v.lastReason ?? null,
  };
}

async function loadState(): Promise<PlatformModeState> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  const doc = await PlatformSetting.findOne({ key: PLATFORM_MODE_SETTINGS_KEY }).lean();
  const value = normalize(doc?.value as Partial<PlatformModeState> | undefined);
  cache = { value, loadedAt: Date.now() };
  return value;
}

async function saveState(next: PlatformModeState, actorId?: string | null): Promise<PlatformModeState> {
  await PlatformSetting.findOneAndUpdate(
    { key: PLATFORM_MODE_SETTINGS_KEY },
    {
      $set: {
        value: next,
        scope: 'platform',
        description: 'Platform operating mode (development | production) — not dataEnvironment',
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

export function invalidatePlatformModeCache() {
  cache = null;
}

export async function getPlatformModeState(): Promise<PlatformModeState> {
  return loadState();
}

export async function getCurrentPlatformMode(): Promise<PlatformMode> {
  return (await loadState()).mode;
}

/**
 * Authoritative governance view — single source for Platform Mode decisions.
 *
 * RULE 1: No Production Super Admin → Development behaviour (Dev Admin unrestricted).
 * RULE 2: PSA exists AND mode === development → Dev Admin still unrestricted.
 * RULE 3: PSA exists AND mode === production → development tooling restricted.
 */
export async function getAuthoritativeGovernanceState() {
  const mode = await getCurrentPlatformMode();
  const hasPsa = await hasProductionSuperAdmin();
  const developmentToolingRestricted = mode === 'production' && hasPsa;
  return {
    mode,
    hasProductionSuperAdmin: hasPsa,
    /** True only under Rule 3. */
    developmentToolingRestricted,
    /** Inverse of Rule 3 — Development Mode always keeps developer UX (Rules 1–2). */
    developerUxVisible: mode === 'development',
    phase:
      mode === 'production' && hasPsa
        ? ('production' as const)
        : hasPsa
          ? ('production_ready' as const)
          : mode === 'development'
            ? ('development' as const)
            : ('bootstrap' as const),
  };
}

/** Developer UX (Sandbox menus, Preview, Seed, Dev Controls) visible only in Development Mode. */
export async function isDeveloperUxVisible(): Promise<boolean> {
  return (await getAuthoritativeGovernanceState()).developerUxVisible;
}

export async function hasProductionSuperAdmin(): Promise<boolean> {
  const profiles = await AdminUser.find({
    status: ADMIN_OPERATOR_STATUS.ACTIVE,
    isActive: true,
    isDeleted: { $ne: true },
    governanceClassification: 'production',
    $or: [
      { adminRoleKey: ADMIN_OPERATOR_ROLES.SUPER_ADMIN },
      { permissionKeys: ADMIN_PERMISSIONS.WILDCARD },
    ],
  })
    .select('userId')
    .lean();

  if (!profiles.length) return false;

  const users = await User.find({
    _id: { $in: profiles.map((p) => p.userId) },
    isDeleted: { $ne: true },
  })
    .select('email')
    .lean();

  return users.some((u) => {
    const email = String(u.email || '').toLowerCase();
    return email && email !== DEV_ADMIN.email.toLowerCase() && !isDevAdminEmail(email);
  });
}

export async function isProductionSuperAdmin(userId: string): Promise<boolean> {
  const profile = await AdminUser.findOne({
    userId,
    status: ADMIN_OPERATOR_STATUS.ACTIVE,
    isActive: true,
    isDeleted: { $ne: true },
  })
    .select('adminRoleKey permissionKeys governanceClassification')
    .lean();
  if (!profile) return false;
  if (profile.governanceClassification !== 'production') return false;
  const isSuper =
    profile.adminRoleKey === ADMIN_OPERATOR_ROLES.SUPER_ADMIN ||
    Boolean(profile.permissionKeys?.includes(ADMIN_PERMISSIONS.WILDCARD));
  if (!isSuper) return false;

  const user = await User.findById(userId).select('email').lean();
  const email = String(user?.email || '').toLowerCase();
  if (!email || email === DEV_ADMIN.email.toLowerCase() || isDevAdminEmail(email)) return false;
  return true;
}

export type PlatformModePublicView = {
  mode: PlatformMode;
  developerUxVisible: boolean;
  hasProductionSuperAdmin: boolean;
  productionOwnerSetupRequired: boolean;
  canEnterProduction: boolean;
  canReturnToDevelopment: boolean;
  lockUntil: string | null;
  locked: boolean;
  modes: typeof PLATFORM_MODES;
};

export async function getPlatformModePublicView(actorUserId?: string | null): Promise<PlatformModePublicView> {
  const governance = await getAuthoritativeGovernanceState();
  const state = await loadState();
  const actorIsPsa = actorUserId ? await isProductionSuperAdmin(actorUserId) : false;
  const locked = Boolean(state.lockUntil && new Date(state.lockUntil).getTime() > Date.now());

  return {
    mode: governance.mode,
    developerUxVisible: governance.developerUxVisible,
    hasProductionSuperAdmin: governance.hasProductionSuperAdmin,
    productionOwnerSetupRequired: !governance.hasProductionSuperAdmin,
    canEnterProduction:
      governance.hasProductionSuperAdmin && actorIsPsa && governance.mode === 'development' && !locked,
    canReturnToDevelopment:
      governance.hasProductionSuperAdmin && actorIsPsa && governance.mode === 'production' && !locked,
    lockUntil: state.lockUntil,
    locked,
    modes: PLATFORM_MODES,
  };
}

async function captureSnapshot(): Promise<PlatformModeSnapshot> {
  const [sandbox, preview, devAccess] = await Promise.all([
    getSandboxSettings(),
    getDeveloperPreviewSettings(),
    getDevelopmentAccessState(),
  ]);
  return {
    enableSandbox: Boolean(sandbox.enableSandbox),
    enablePreview: Boolean(preview.enablePreview),
    suspendPreview: Boolean(preview.suspendPreview),
    allowDevLogin: Boolean(devAccess.allowDevLogin),
  };
}

async function applyProductionVisibility(actorId: string) {
  await updateSandboxSettings({ enableSandbox: false }, actorId);
  await updateDeveloperPreviewSettings(
    { enablePreview: false, suspendPreview: true },
    actorId,
  );
  await applyDevelopmentAccessFlagForPlatformMode(false, {
    userId: actorId,
    reason: 'Platform Mode entered Production — Development Access suspended (account preserved)',
  });

  try {
    const { developerPreviewService } = await import('../marketplace/developerPreview.service.js');
    await developerPreviewService.adminTerminateAllActive(actorId);
  } catch {
    /* no active sessions */
  }
}

async function restoreSnapshot(snapshot: PlatformModeSnapshot, actorId: string) {
  await updateSandboxSettings({ enableSandbox: snapshot.enableSandbox }, actorId);
  await updateDeveloperPreviewSettings(
    {
      enablePreview: snapshot.enablePreview,
      suspendPreview: snapshot.suspendPreview,
    },
    actorId,
  );
  await applyDevelopmentAccessFlagForPlatformMode(snapshot.allowDevLogin, {
    userId: actorId,
    reason: 'Platform Mode returned to Development — restored Development Access flag from snapshot',
  });
}

function assertConfirmations(input: {
  confirmPhrase?: string;
  confirmAgain?: boolean;
  expected: 'PRODUCTION' | 'DEVELOPMENT';
}) {
  if (!input.confirmAgain) {
    throw AppError.badRequest('Second confirmation is required');
  }
  const phrase = String(input.confirmPhrase || '')
    .trim()
    .toUpperCase();
  if (phrase !== input.expected) {
    throw AppError.badRequest(`Type ${input.expected} to confirm`);
  }
}

export async function enterProductionMode(
  actorUserId: string,
  input: {
    reason?: string;
    confirmPhrase?: string;
    confirmAgain?: boolean;
    mfaToken?: string;
    /** Escape hatch for emergency/tests — Launch Centre never sets this. */
    skipReadinessGate?: boolean;
  },
  meta: { ip?: string; userAgent?: string; device?: string } = {},
) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Only a Production Super Admin may enter Production Mode');
  }
  if (!(await hasProductionSuperAdmin())) {
    throw AppError.badRequest('Create a Production Super Admin before entering Production Mode', {
      code: 'PRODUCTION_OWNER_REQUIRED',
    });
  }

  // Launch readiness — critical blockers must be clear (Launch Centre is the guided path).
  if (!input.skipReadinessGate) {
    const { evaluateProductionReadiness } = await import('./productionReadiness.service.js');
    const readiness = await evaluateProductionReadiness();
    if (!readiness.canLaunch || readiness.blockers.length) {
      throw AppError.badRequest('Resolve production readiness blockers before entering Production Mode', {
        code: 'LAUNCH_BLOCKED',
        blockers: readiness.blockers.map((b) => ({ id: b.id, label: b.label, message: b.message })),
        overallPercent: readiness.overallPercent,
      });
    }
  }

  assertConfirmations({
    confirmPhrase: input.confirmPhrase,
    confirmAgain: input.confirmAgain,
    expected: 'PRODUCTION',
  });

  // MFA — when ADMIN_REQUIRE_MFA is on, Production Super Admin must be enrolled and present a valid token.
  if (env.adminRequireMfa) {
    const profile = await AdminUser.findOne({ userId: actorUserId }).select('mfaEnabled').lean();
    if (!profile?.mfaEnabled) {
      throw AppError.badRequest('MFA enrollment is required before entering Production Mode. Enroll under Admin → Security.');
    }
    const { adminIdentityService } = await import('../admin/adminIdentity.service.js');
    const ok = await adminIdentityService.verifyMfaToken(actorUserId, String(input.mfaToken || ''));
    if (!ok) throw AppError.badRequest('Invalid MFA token');
  } else if (String(input.mfaToken || '').trim()) {
    const profile = await AdminUser.findOne({ userId: actorUserId }).select('mfaEnabled').lean();
    if (profile?.mfaEnabled) {
      const { adminIdentityService } = await import('../admin/adminIdentity.service.js');
      const ok = await adminIdentityService.verifyMfaToken(actorUserId, String(input.mfaToken || ''));
      if (!ok) throw AppError.badRequest('Invalid MFA token');
    }
  }

  const state = await loadState();
  if (state.mode === 'production') {
    return { mode: 'production' as const, alreadyActive: true };
  }
  if (state.lockUntil && new Date(state.lockUntil).getTime() > Date.now()) {
    throw AppError.badRequest('Platform Mode is temporarily locked after a recent change');
  }

  const snapshot = await captureSnapshot();
  await applyProductionVisibility(actorUserId);

  const actor = await User.findById(actorUserId).select('email fullName').lean();
  const affectedVisibility = {
    developerUxVisible: false,
    sandboxManagement: false,
    seedPlatform: false,
    developerPreview: false,
    developmentControls: false,
    developmentAccess: false,
    publicContent: true,
    categories: true,
    legalCms: true,
    dataPreserved: true,
    snapshot,
  };

  const next: PlatformModeState = {
    mode: 'production',
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
    snapshot,
    lockUntil: new Date(Date.now() + MODE_LOCK_MS).toISOString(),
    lastReason: String(input.reason || 'Enter Production Mode').slice(0, 1000),
  };
  await saveState(next, actorUserId);

  await PlatformModeTransition.create({
    previousMode: 'development',
    newMode: 'production',
    administratorUserId: actorUserId,
    administratorEmail: String(actor?.email || '').toLowerCase(),
    administratorName: String(actor?.fullName || 'Administrator'),
    reason: next.lastReason || undefined,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    device: meta.device,
    affectedVisibility,
    snapshotRestored: false,
    confirmationPhrase: 'PRODUCTION',
  });

  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'platform.mode.enter_production',
    resourceType: 'PlatformMode',
    resourceId: PLATFORM_MODE_SETTINGS_KEY,
    severity: 'critical',
    meta: { affectedVisibility, ip: meta.ip },
  });

  return { mode: 'production' as const, alreadyActive: false, affectedVisibility };
}

export async function returnToDevelopmentMode(
  actorUserId: string,
  input: {
    reason?: string;
    confirmPhrase?: string;
    confirmAgain?: boolean;
    mfaToken?: string;
  },
  meta: { ip?: string; userAgent?: string; device?: string } = {},
) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Only a Production Super Admin may return to Development Mode');
  }

  assertConfirmations({
    confirmPhrase: input.confirmPhrase,
    confirmAgain: input.confirmAgain,
    expected: 'DEVELOPMENT',
  });

  if (env.adminRequireMfa) {
    const profile = await AdminUser.findOne({ userId: actorUserId }).select('mfaEnabled').lean();
    if (!profile?.mfaEnabled) {
      throw AppError.badRequest('MFA enrollment is required for Production Mode changes');
    }
    const { adminIdentityService } = await import('../admin/adminIdentity.service.js');
    const ok = await adminIdentityService.verifyMfaToken(actorUserId, String(input.mfaToken || ''));
    if (!ok) throw AppError.badRequest('Invalid MFA token');
  } else {
    const profile = await AdminUser.findOne({ userId: actorUserId }).select('mfaEnabled').lean();
    if (profile?.mfaEnabled) {
      const { adminIdentityService } = await import('../admin/adminIdentity.service.js');
      const ok = await adminIdentityService.verifyMfaToken(actorUserId, String(input.mfaToken || ''));
      if (!ok) throw AppError.badRequest('Invalid MFA token');
    }
  }

  const state = await loadState();
  if (state.mode === 'development') {
    return { mode: 'development' as const, alreadyActive: true };
  }
  if (state.lockUntil && new Date(state.lockUntil).getTime() > Date.now()) {
    throw AppError.badRequest('Platform Mode is temporarily locked after a recent change');
  }

  const snapshot = state.snapshot || (await captureSnapshot());
  await restoreSnapshot(snapshot, actorUserId);

  // Authoritative Rule 2: while Platform Mode is Development, Development Administrator
  // retains unrestricted development access (env permitting). Do not leave tooling
  // permanently disabled after a Production round-trip.
  const { envAllowsDevAdminLogin } = await import('../admin/developmentAccess.service.js');
  let developmentAccessRestored = Boolean(snapshot.allowDevLogin);
  if (envAllowsDevAdminLogin()) {
    await applyDevelopmentAccessFlagForPlatformMode(true, {
      userId: actorUserId,
      reason:
        'Platform Mode returned to Development — Development Administrator capabilities fully restored',
    });
    developmentAccessRestored = true;
  }

  const actor = await User.findById(actorUserId).select('email fullName').lean();
  const affectedVisibility = {
    developerUxVisible: true,
    sandboxManagement: snapshot.enableSandbox,
    seedPlatform: snapshot.enableSandbox,
    developerPreview: snapshot.enablePreview && !snapshot.suspendPreview,
    developmentControls: true,
    developmentAccess: developmentAccessRestored,
    publicContent: true,
    dataPreserved: true,
    snapshotRestored: true,
    snapshot,
  };

  const next: PlatformModeState = {
    mode: 'development',
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
    snapshot: null,
    lockUntil: new Date(Date.now() + MODE_LOCK_MS).toISOString(),
    lastReason: String(input.reason || 'Return to Development Mode').slice(0, 1000),
  };
  await saveState(next, actorUserId);

  await PlatformModeTransition.create({
    previousMode: 'production',
    newMode: 'development',
    administratorUserId: actorUserId,
    administratorEmail: String(actor?.email || '').toLowerCase(),
    administratorName: String(actor?.fullName || 'Administrator'),
    reason: next.lastReason || undefined,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    device: meta.device,
    affectedVisibility,
    snapshotRestored: true,
    confirmationPhrase: 'DEVELOPMENT',
  });

  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'platform.mode.return_development',
    resourceType: 'PlatformMode',
    resourceId: PLATFORM_MODE_SETTINGS_KEY,
    severity: 'critical',
    meta: { affectedVisibility, ip: meta.ip },
  });

  return { mode: 'development' as const, alreadyActive: false, affectedVisibility };
}

export async function listModeTransitions(limit = 50) {
  const items = await PlatformModeTransition.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();
  return items.map((t) => ({
    id: t._id.toString(),
    previousMode: t.previousMode,
    newMode: t.newMode,
    administratorEmail: t.administratorEmail,
    administratorName: t.administratorName,
    reason: t.reason || null,
    ipAddress: t.ipAddress || null,
    device: t.device || null,
    affectedVisibility: t.affectedVisibility,
    snapshotRestored: Boolean(t.snapshotRestored),
    createdAt: t.createdAt,
  }));
}

export const platformModeService = {
  getState: getPlatformModeState,
  getCurrentMode: getCurrentPlatformMode,
  getAuthoritativeGovernanceState,
  isDeveloperUxVisible,
  hasProductionSuperAdmin,
  isProductionSuperAdmin,
  getPublicView: getPlatformModePublicView,
  enterProductionMode,
  returnToDevelopmentMode,
  listTransitions: listModeTransitions,
  /** Alias used by admin controllers */
  listModeTransitions,
  invalidateCache: invalidatePlatformModeCache,
};
