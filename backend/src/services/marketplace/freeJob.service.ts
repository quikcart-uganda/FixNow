import { Job, PlatformSetting, TechnicianProfile } from '../../models/index.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { emitFreeJobLimitUpdated, emitTechnicianLocked, emitTechnicianUnlocked } from '../../sockets/realtime.js';
import { hasActivePaidAccess } from './subscription.service.js';

export const FREE_JOB_SETTING_KEY = 'marketplace.free_jobs';

/**
 * Marketplace monetization settings (source of truth for free completed-job quota).
 * No hardcoded product limits — all values live in PlatformSetting.
 */
export interface FreeJobConfig {
  enabled: boolean;
  /** Default free customer-confirmed completed jobs for new technicians. */
  defaultLimit: number;
  lockAfterLimit: boolean;
  /** Customer must confirm before a job counts as completed (always true in product). */
  requireCustomerConfirmation: boolean;
  /** Hours after technician requests completion before admin may auto-complete (0 = disabled). */
  autoCompleteTimeoutHours: number;
  /** Subscription billing enabled (enforcement prepared; checkout not live). */
  subscriptionEnabled: boolean;
  /** Days of grace after free quota exhaustion before hard lock (0 = immediate). */
  gracePeriodDays: number;
  /** Free plan available for new technicians. */
  freePlanEnabled: boolean;
  /** When true, quota gates are suspended platform-wide (admin emergency). */
  monetizationSuspended: boolean;
}

const DEFAULT_CONFIG: FreeJobConfig = {
  enabled: true,
  defaultLimit: 20,
  lockAfterLimit: true,
  requireCustomerConfirmation: true,
  autoCompleteTimeoutHours: 72,
  subscriptionEnabled: true,
  gracePeriodDays: 0,
  freePlanEnabled: true,
  monetizationSuspended: false,
};

function normalizeConfig(value: Partial<FreeJobConfig> | undefined | null): FreeJobConfig {
  const v = value ?? {};
  return {
    enabled: v.enabled !== false,
    defaultLimit: typeof v.defaultLimit === 'number' && v.defaultLimit >= 0 ? v.defaultLimit : DEFAULT_CONFIG.defaultLimit,
    lockAfterLimit: v.lockAfterLimit !== false,
    requireCustomerConfirmation: v.requireCustomerConfirmation !== false,
    autoCompleteTimeoutHours:
      typeof v.autoCompleteTimeoutHours === 'number' && v.autoCompleteTimeoutHours >= 0
        ? v.autoCompleteTimeoutHours
        : DEFAULT_CONFIG.autoCompleteTimeoutHours,
    subscriptionEnabled: v.subscriptionEnabled === true,
    gracePeriodDays:
      typeof v.gracePeriodDays === 'number' && v.gracePeriodDays >= 0 ? v.gracePeriodDays : DEFAULT_CONFIG.gracePeriodDays,
    freePlanEnabled: v.freePlanEnabled !== false,
    monetizationSuspended: v.monetizationSuspended === true,
  };
}

export async function getFreeJobConfig(): Promise<FreeJobConfig> {
  const setting = await PlatformSetting.findOne({ key: FREE_JOB_SETTING_KEY });
  return normalizeConfig(setting?.value as Partial<FreeJobConfig> | undefined);
}

export async function ensureFreeJobSetting(adminId?: string): Promise<FreeJobConfig> {
  const existing = await PlatformSetting.findOne({ key: FREE_JOB_SETTING_KEY });
  if (existing) return getFreeJobConfig();
  await PlatformSetting.create({
    key: FREE_JOB_SETTING_KEY,
    value: DEFAULT_CONFIG,
    scope: 'platform',
    description: 'Technician free completed-job quota and marketplace monetization configuration',
    updatedBy: adminId,
  });
  return { ...DEFAULT_CONFIG };
}

export async function updateFreeJobConfigValue(
  adminId: string,
  patch: Partial<FreeJobConfig>,
): Promise<FreeJobConfig> {
  await ensureFreeJobSetting(adminId);
  const current = await getFreeJobConfig();
  const next = normalizeConfig({ ...current, ...patch });
  await PlatformSetting.findOneAndUpdate(
    { key: FREE_JOB_SETTING_KEY },
    { $set: { value: next, updatedBy: adminId } },
    { upsert: true },
  );
  return next;
}

/**
 * Sync paid-access check for free-job gates.
 * Grace is represented by subscriptionStatus === 'past_due' (set by expiry worker using plan/admin grace days).
 * Does not hardcode grace day counts.
 */
function paidAccessOpen(profile: {
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: Date | null;
  monetizationSuspended?: boolean;
}): boolean {
  if (profile.subscriptionStatus === 'past_due') return true;
  return hasActivePaidAccess(profile, 0);
}

/**
 * Quota snapshot used by APIs and UI. remainingFreeCompletedJobs is the
 * free-plan meter; canApply also opens for active paid subscriptions.
 */
export function quotaSnapshot(profile: {
  freeJobLimit?: number;
  freeJobsUsed?: number;
  remainingFreeJobs?: number;
  completedJobsUnderFreePlan?: number;
  promotionalFreeJobs?: number;
  jobsCompleted?: number;
  accountLocked?: boolean;
  lockReason?: string;
  subscriptionStatus?: string;
  subscriptionPlanCode?: string;
  subscriptionPeriodEnd?: Date | null;
  trialFinished?: boolean;
  monetizationSuspended?: boolean;
  lastCompletedJobAt?: Date;
  lastCompletedJobId?: { toString(): string };
}) {
  const freeCompletedJobLimit = Number(profile.freeJobLimit ?? 0);
  const completedJobsUnderFreePlan = Number(
    profile.completedJobsUnderFreePlan ?? profile.freeJobsUsed ?? 0,
  );
  const promotionalFreeJobs = Number(profile.promotionalFreeJobs ?? 0);
  const remaining = Math.max(0, Number(profile.remainingFreeJobs ?? 0));
  const hasPaid = paidAccessOpen(profile);

  return {
    freeCompletedJobLimit,
    remainingFreeCompletedJobs: remaining,
    completedJobsUnderFreePlan,
    totalCompletedJobs: Number(profile.jobsCompleted ?? 0),
    promotionalFreeJobs,
    freeJobsUsed: Number(profile.freeJobsUsed ?? completedJobsUnderFreePlan),
    freeJobLimit: freeCompletedJobLimit,
    remainingFreeJobs: remaining,
    accountLocked: Boolean(profile.accountLocked),
    lockReason: profile.lockReason,
    subscriptionStatus: profile.subscriptionStatus ?? 'none',
    subscriptionPlan: profile.subscriptionPlanCode ?? null,
    subscriptionPeriodEnd: profile.subscriptionPeriodEnd ?? null,
    trialFinished: Boolean(profile.trialFinished),
    monetizationSuspended: Boolean(profile.monetizationSuspended),
    lastCompletedJobAt: profile.lastCompletedJobAt ?? null,
    lastCompletedJobId: profile.lastCompletedJobId?.toString?.() ?? null,
    hasActiveSubscription: hasPaid,
    canApply:
      profile.monetizationSuspended === true ||
      hasPaid ||
      (!profile.accountLocked && remaining > 0),
  };
}

/**
 * Technicians who exhausted free completed jobs may browse but cannot apply —
 * unless they have an active paid subscription (Starter+).
 * Deduction happens ONLY on customer-confirmed completion — never on apply.
 */
export function assertCanApplyToJobs(profile: {
  accountLocked: boolean;
  remainingFreeJobs: number;
  freeJobLimit: number;
  accountStatus: string;
  monetizationSuspended?: boolean;
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: Date | null;
}): void {
  if (profile.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    throw AppError.forbidden('Technician account is suspended');
  }
  if (profile.monetizationSuspended) {
    // Platform-wide suspend: treat as open apply (admin emergency bypass).
    return;
  }
  if (paidAccessOpen(profile)) {
    return;
  }
  if (profile.accountLocked || profile.remainingFreeJobs <= 0) {
    throw AppError.forbidden(
      'Free completed jobs exhausted. Upgrade your plan to continue applying for jobs. You can still browse jobs, view history, and manage your account.',
    );
  }
}

export function canViewCustomerContact(profile: {
  accountLocked: boolean;
  remainingFreeJobs: number;
  monetizationSuspended?: boolean;
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: Date | null;
}): boolean {
  if (profile.monetizationSuspended) return true;
  if (paidAccessOpen(profile)) return true;
  return !profile.accountLocked && profile.remainingFreeJobs > 0;
}

export type ConsumeFreeJobResult = {
  deducted: boolean;
  remaining: number;
  locked: boolean;
  exhausted: boolean;
  lastRemaining: boolean;
};

/**
 * Deduct ONE free completed-job slot after customer confirmation.
 * Idempotent per job via Job.freeJobSlotConsumed — no double deductions.
 */
export async function consumeFreeJobSlotForCompletion(input: {
  jobId: string;
  technicianUserId: string;
  actorId: string;
}): Promise<ConsumeFreeJobResult> {
  const config = await getFreeJobConfig();

  // Claim the job slot first (atomic). If already claimed, skip profile mutation.
  const claimed = await Job.findOneAndUpdate(
    {
      _id: input.jobId,
      freeJobSlotConsumed: { $ne: true },
      assignedTechnicianId: input.technicianUserId,
    },
    {
      $set: {
        freeJobSlotConsumed: true,
        freeJobConsumedAt: new Date(),
        confirmedCompletedBy: input.actorId,
      },
    },
    { new: true },
  );

  if (!claimed) {
    const profile = await TechnicianProfile.findOne({ userId: input.technicianUserId });
    return {
      deducted: false,
      remaining: Number(profile?.remainingFreeJobs ?? 0),
      locked: Boolean(profile?.accountLocked),
      exhausted: Number(profile?.remainingFreeJobs ?? 0) <= 0,
      lastRemaining: false,
    };
  }

  // Always record career completion + last job, even if free plan disabled.
  const now = new Date();
  const profileBefore = await TechnicianProfile.findOne({ userId: input.technicianUserId });
  if (!profileBefore) {
    return { deducted: false, remaining: 0, locked: false, exhausted: false, lastRemaining: false };
  }

  const hasPaid = paidAccessOpen(profileBefore);
  // Free quota is for unpaid technicians only. Active Starter+ with unlimited
  // completed jobs does not burn free slots (accounting path unchanged for free plan).
  const shouldDeductQuota =
    config.enabled &&
    !config.monetizationSuspended &&
    config.freePlanEnabled &&
    !hasPaid;

  const nextUsed = shouldDeductQuota ? profileBefore.freeJobsUsed + 1 : profileBefore.freeJobsUsed;
  const nextRemaining = shouldDeductQuota
    ? Math.max(0, profileBefore.remainingFreeJobs - 1)
    : profileBefore.remainingFreeJobs;

  const shouldLock =
    shouldDeductQuota &&
    config.lockAfterLimit &&
    nextRemaining <= 0 &&
    !config.subscriptionEnabled &&
    !hasPaid;

  const setFields: Record<string, unknown> = {
    lastCompletedJobAt: now,
    lastCompletedJobId: input.jobId,
    jobsCompleted: (profileBefore.jobsCompleted || 0) + 1,
  };
  if (shouldDeductQuota) {
    setFields.freeJobsUsed = nextUsed;
    setFields.completedJobsUnderFreePlan = nextUsed;
    setFields.remainingFreeJobs = nextRemaining;
  }
  if (shouldLock) {
    setFields.accountLocked = true;
    setFields.lockReason = 'Free completed jobs exhausted';
    setFields.trialFinished = true;
    if (profileBefore.accountStatus === ACCOUNT_STATUS.ACTIVE) {
      setFields.accountStatus = ACCOUNT_STATUS.LOCKED;
    }
  } else if (shouldDeductQuota && nextRemaining <= 0 && config.subscriptionEnabled) {
    setFields.trialFinished = true;
    setFields.subscriptionStatus = 'required';
  }

  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: input.technicianUserId },
    { $set: setFields },
    { new: true },
  );

  if (!profile) {
    return { deducted: false, remaining: 0, locked: false, exhausted: false, lastRemaining: false };
  }

  emitFreeJobLimitUpdated(input.technicianUserId, profile);

  const remaining = Number(profile.remainingFreeJobs ?? 0);
  const lastRemaining = shouldDeductQuota && remaining === 1;
  const exhausted = shouldDeductQuota && remaining <= 0;

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    if (shouldDeductQuota) {
      await createDbNotification({
        userId: input.technicianUserId,
        type: 'technician.quota_decreased',
        title: 'Free completed job used',
        body: exhausted
          ? 'Your free completed jobs are exhausted. Upgrade your plan to keep applying for jobs.'
          : lastRemaining
            ? 'You have 1 free completed job remaining.'
            : `You have ${remaining} free completed jobs remaining.`,
        jobId: input.jobId,
        bypassQuietHours: exhausted || lastRemaining,
      });
    }
    if (exhausted && shouldLock) {
      emitTechnicianLocked(input.technicianUserId, profile);
      await createDbNotification({
        userId: input.technicianUserId,
        type: 'technician.locked',
        title: 'Free completed jobs exhausted',
        body: 'Upgrade your plan to continue applying for jobs. You can still browse and manage your account.',
        bypassQuietHours: true,
      });
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: 'technician.locked',
        title: 'Technician free quota exhausted',
        body: 'A technician used their last free completed job and was locked from applying.',
        data: { technicianUserId: input.technicianUserId, jobId: input.jobId },
        bypassQuietHours: true,
      });
    } else if (exhausted && config.subscriptionEnabled) {
      await createDbNotification({
        userId: input.technicianUserId,
        type: 'technician.subscription_required',
        title: 'Subscription required',
        body: 'Free completed jobs exhausted. Upgrade your plan to continue applying for jobs.',
        bypassQuietHours: true,
      });
    }
  } catch {
    /* notifications are best-effort */
  }

  await writeAuditLog({
    actorId: input.actorId,
    actorRole: 'system',
    action: 'quota.deducted',
    resourceType: 'Job',
    resourceId: input.jobId,
    meta: {
      technicianUserId: input.technicianUserId,
      remaining,
      deducted: shouldDeductQuota,
    },
  });

  return {
    deducted: shouldDeductQuota,
    remaining,
    locked: Boolean(profile.accountLocked),
    exhausted,
    lastRemaining,
  };
}

/** @deprecated Prefer consumeFreeJobSlotForCompletion — kept for transitionStatus compat. */
export async function consumeFreeJobSlot(technicianUserId: string, jobId?: string): Promise<void> {
  if (!jobId) {
    // Legacy path without job id — still increment but cannot be idempotent per job.
    const config = await getFreeJobConfig();
    if (!config.enabled || config.monetizationSuspended) {
      await TechnicianProfile.updateOne({ userId: technicianUserId }, { $inc: { jobsCompleted: 1 } });
      return;
    }
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) return;
    profile.freeJobsUsed += 1;
    profile.completedJobsUnderFreePlan = profile.freeJobsUsed;
    profile.jobsCompleted += 1;
    profile.remainingFreeJobs = Math.max(0, profile.freeJobLimit - profile.freeJobsUsed);
    if (config.lockAfterLimit && profile.remainingFreeJobs <= 0) {
      profile.accountLocked = true;
      profile.lockReason = 'Free completed jobs exhausted';
      profile.trialFinished = true;
      if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
        profile.accountStatus = ACCOUNT_STATUS.LOCKED;
      }
    }
    await profile.save();
    emitFreeJobLimitUpdated(technicianUserId, profile);
    return;
  }
  await consumeFreeJobSlotForCompletion({
    jobId,
    technicianUserId,
    actorId: technicianUserId,
  });
}

export async function adminOverrideFreeJobs(input: {
  technicianUserId: string;
  freeJobLimit?: number;
  remainingFreeJobs?: number;
  promotionalFreeJobs?: number;
  grantBonusJobs?: number;
  unlock: boolean;
  suspendMonetization?: boolean;
  subscriptionPlanCode?: string | null;
  subscriptionStatus?: string;
}): Promise<typeof TechnicianProfile.prototype> {
  const profile = await TechnicianProfile.findOne({ userId: input.technicianUserId });
  if (!profile) throw AppError.notFound('Technician profile not found');

  if (typeof input.freeJobLimit === 'number') {
    profile.freeJobLimit = Math.max(0, input.freeJobLimit);
  }
  if (typeof input.grantBonusJobs === 'number' && input.grantBonusJobs > 0) {
    profile.promotionalFreeJobs = Math.max(0, (profile.promotionalFreeJobs || 0) + input.grantBonusJobs);
    profile.remainingFreeJobs = Math.max(0, profile.remainingFreeJobs + input.grantBonusJobs);
  }
  if (typeof input.promotionalFreeJobs === 'number') {
    profile.promotionalFreeJobs = Math.max(0, input.promotionalFreeJobs);
  }
  if (typeof input.remainingFreeJobs === 'number') {
    profile.remainingFreeJobs = Math.max(0, input.remainingFreeJobs);
    profile.freeJobsUsed = Math.max(0, profile.freeJobLimit - profile.remainingFreeJobs);
    profile.completedJobsUnderFreePlan = profile.freeJobsUsed;
  } else if (typeof input.freeJobLimit === 'number') {
    profile.remainingFreeJobs = Math.max(0, profile.freeJobLimit - profile.freeJobsUsed);
  }

  if (typeof input.suspendMonetization === 'boolean') {
    profile.monetizationSuspended = input.suspendMonetization;
  }
  if (input.subscriptionPlanCode !== undefined) {
    profile.subscriptionPlanCode = input.subscriptionPlanCode || undefined;
  }
  if (input.subscriptionStatus) {
    profile.subscriptionStatus = input.subscriptionStatus as typeof profile.subscriptionStatus;
  }

  if (input.unlock) {
    profile.accountLocked = false;
    profile.lockReason = undefined;
    profile.unlockRequestedAt = undefined;
    profile.unlockRequestNote = undefined;
    if (profile.accountStatus === ACCOUNT_STATUS.LOCKED) {
      profile.accountStatus = ACCOUNT_STATUS.ACTIVE;
    }
    if (profile.remainingFreeJobs <= 0 && profile.freeJobLimit > 0) {
      profile.remainingFreeJobs = Math.max(1, Math.ceil(profile.freeJobLimit * 0.25));
      profile.freeJobsUsed = Math.max(0, profile.freeJobLimit - profile.remainingFreeJobs);
      profile.completedJobsUnderFreePlan = profile.freeJobsUsed;
    }
  } else if (profile.remainingFreeJobs <= 0 && !profile.monetizationSuspended) {
    profile.accountLocked = true;
    profile.lockReason = profile.lockReason || 'Free completed jobs exhausted';
    if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
      profile.accountStatus = ACCOUNT_STATUS.LOCKED;
    }
  }

  await profile.save();
  emitFreeJobLimitUpdated(input.technicianUserId, profile);
  if (input.unlock && !profile.accountLocked) {
    emitTechnicianUnlocked(input.technicianUserId, profile);
    try {
      const { createDbNotification } = await import('../../utils/notify.js');
      await createDbNotification({
        userId: input.technicianUserId,
        type: 'auth.account_unlocked',
        title: 'Account unlocked',
        body: 'Your technician account has been unlocked. You can apply for jobs again.',
        bypassQuietHours: true,
      });
    } catch {
      /* ignore */
    }
  } else if (profile.accountLocked) {
    emitTechnicianLocked(input.technicianUserId, profile);
  }
  return profile;
}

/** Reset free quota to platform default limit (admin). */
export async function resetTechnicianQuota(technicianUserId: string): Promise<typeof TechnicianProfile.prototype> {
  const config = await getFreeJobConfig();
  return adminOverrideFreeJobs({
    technicianUserId,
    freeJobLimit: config.defaultLimit,
    remainingFreeJobs: config.defaultLimit,
    promotionalFreeJobs: 0,
    unlock: true,
  });
}

/** Technician requests admin review while locked (free-job or manual). */
export async function requestTechnicianUnlock(
  technicianUserId: string,
  note?: string,
): Promise<typeof TechnicianProfile.prototype> {
  const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
  if (!profile) throw AppError.notFound('Technician profile not found');
  if (!profile.accountLocked) {
    throw AppError.badRequest('Account is not locked');
  }
  profile.unlockRequestedAt = new Date();
  profile.unlockRequestNote = note?.slice(0, 1000) || 'Unlock requested by technician';
  await profile.save();
  try {
    const { notifyAdmins } = await import('../push/push.service.js');
    await notifyAdmins({
      type: 'technician.unlock_requested',
      title: 'Unlock request',
      body: 'A locked technician requested account unlock.',
      data: { technicianUserId },
      bypassQuietHours: true,
    });
  } catch {
    /* Notify is best-effort. */
  }
  return profile;
}
