/**
 * Technician account approval policy engine.
 * Extends existing verificationStatus — does not replace identity document verification.
 * All timing is runtime-configurable (never hardcoded durations in business logic).
 */

import { Types } from 'mongoose';
import { PlatformSetting, TechnicianProfile, User } from '../../models/index.js';
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import {
  computeProfileCompletion,
  REQUIRED_APPROVAL_SECTION_IDS,
} from './profileCompletion.service.js';
import { DEVELOPER_TECHNICIAN } from '../sandbox/seed/constants.js';

export const TECHNICIAN_APPROVAL_SETTING_KEY = 'marketplace.technician_approval';

export type ApprovalDurationUnit = 'minutes' | 'hours' | 'days';

export type TechnicianApprovalPolicy = {
  /** When true, only APPROVED technicians appear in customer search. */
  enforceApprovalGate: boolean;
  automaticApprovalEnabled: boolean;
  approvalDelayValue: number;
  approvalDelayUnit: ApprovalDurationUnit;
  /** Minutes after submit when admin reminders fire (relative to submit). */
  adminReminderMinutes: number[];
  policyVersion: number;
  grandfatherCompleted: boolean;
};

const DEFAULT_POLICY: TechnicianApprovalPolicy = {
  enforceApprovalGate: true,
  automaticApprovalEnabled: true,
  approvalDelayValue: 120,
  approvalDelayUnit: 'minutes',
  adminReminderMinutes: [30, 60, 90],
  policyVersion: 1,
  grandfatherCompleted: false,
};

export function durationToMs(value: number, unit: ApprovalDurationUnit): number {
  const n = Math.max(1, Math.round(Number(value) || 1));
  if (unit === 'days') return n * 24 * 60 * 60 * 1000;
  if (unit === 'hours') return n * 60 * 60 * 1000;
  return n * 60 * 1000;
}

export function computeApprovalDeadline(submittedAt: Date, policy: TechnicianApprovalPolicy): Date {
  return new Date(
    submittedAt.getTime() + durationToMs(policy.approvalDelayValue, policy.approvalDelayUnit),
  );
}

/** Friendly duration copy derived from runtime policy (never a hardcoded phrase). */
export function formatDelayFriendly(value: number, unit: ApprovalDurationUnit): string {
  const n = Math.max(1, Math.round(Number(value) || 1));
  if (unit === 'days') return n === 1 ? '1 day' : `${n} days`;
  if (unit === 'hours') return n === 1 ? '1 hour' : `${n} hours`;
  if (n % 60 === 0) {
    const hours = n / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return n === 1 ? '1 minute' : `${n} minutes`;
}

function normalizeUnit(u: unknown): ApprovalDurationUnit {
  const s = String(u || 'minutes').toLowerCase();
  if (s === 'hours' || s === 'hour' || s === 'h') return 'hours';
  if (s === 'days' || s === 'day' || s === 'd') return 'days';
  return 'minutes';
}

function normalizePolicy(raw: Partial<TechnicianApprovalPolicy> | undefined): TechnicianApprovalPolicy {
  const value = raw || {};
  const reminders = Array.isArray(value.adminReminderMinutes)
    ? value.adminReminderMinutes
        .map((n) => Math.max(1, Math.round(Number(n) || 0)))
        .filter((n) => n > 0)
        .slice(0, 8)
    : DEFAULT_POLICY.adminReminderMinutes;
  return {
    enforceApprovalGate: value.enforceApprovalGate !== false,
    automaticApprovalEnabled: value.automaticApprovalEnabled !== false,
    approvalDelayValue: Math.max(
      1,
      Math.round(Number(value.approvalDelayValue) || DEFAULT_POLICY.approvalDelayValue),
    ),
    approvalDelayUnit: normalizeUnit(value.approvalDelayUnit),
    adminReminderMinutes: reminders.length ? reminders : DEFAULT_POLICY.adminReminderMinutes,
    policyVersion: Math.max(1, Math.round(Number(value.policyVersion) || 1)),
    grandfatherCompleted: value.grandfatherCompleted === true,
  };
}

export async function getTechnicianApprovalPolicy(): Promise<TechnicianApprovalPolicy> {
  const setting = await PlatformSetting.findOne({ key: TECHNICIAN_APPROVAL_SETTING_KEY }).lean();
  return normalizePolicy(setting?.value as Partial<TechnicianApprovalPolicy> | undefined);
}

/** One-time: keep already-live techs visible when the approval gate turns on. */
async function grandfatherDiscoverableTechnicians(actorId: string) {
  const res = await TechnicianProfile.updateMany(
    {
      verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
      accountStatus: { $in: [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.PENDING_VERIFICATION] },
      'metadata.hiddenFromCustomers': { $ne: true },
      approvalSubmittedAt: { $exists: false },
    },
    {
      $set: {
        verificationStatus: VERIFICATION_STATUS.APPROVED,
        approvalSource: 'grandfather',
        approvalReviewedAt: new Date(),
      },
    },
  );
  await PlatformSetting.findOneAndUpdate(
    { key: TECHNICIAN_APPROVAL_SETTING_KEY },
    { $set: { 'value.grandfatherCompleted': true } },
    { upsert: true },
  );
  await writeAuditLog({
    actorId,
    actorRole: 'admin',
    action: 'technician.approval.grandfather',
    resourceType: 'TechnicianApproval',
    meta: { matched: res.matchedCount, modified: res.modifiedCount },
  });
}

export async function ensureTechnicianApprovalPolicy(adminId?: string): Promise<TechnicianApprovalPolicy> {
  const existing = await PlatformSetting.findOne({ key: TECHNICIAN_APPROVAL_SETTING_KEY });
  if (existing) {
    const policy = await getTechnicianApprovalPolicy();
    if (!policy.grandfatherCompleted) {
      await grandfatherDiscoverableTechnicians(adminId || 'system');
    }
    return getTechnicianApprovalPolicy();
  }
  await PlatformSetting.create({
    key: TECHNICIAN_APPROVAL_SETTING_KEY,
    value: DEFAULT_POLICY,
    scope: 'platform',
    description: 'Technician account approval gate, auto-approval delay, and admin reminders',
    updatedBy: adminId,
  });
  await grandfatherDiscoverableTechnicians(adminId || 'system');
  return getTechnicianApprovalPolicy();
}

async function recalculatePendingDeadlines(adminId: string, policy: TechnicianApprovalPolicy) {
  const pending = await TechnicianProfile.find({
    verificationStatus: { $in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.UNDER_REVIEW] },
    approvalSubmittedAt: { $exists: true },
  });
  const now = new Date();
  for (const profile of pending) {
    const submittedAt = profile.approvalSubmittedAt || now;
    profile.approvalDeadlineAt = policy.automaticApprovalEnabled
      ? computeApprovalDeadline(submittedAt, policy)
      : undefined;
    profile.approvalMode = policy.automaticApprovalEnabled ? 'automatic' : 'manual';
    profile.approvalPolicyVersion = policy.policyVersion;
    profile.approvalRemindersSent = [];
    await profile.save();
  }
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'technician.approval.recalculate_pending',
    resourceType: 'TechnicianApproval',
    meta: { count: pending.length, policyVersion: policy.policyVersion },
  });
  return { recalculated: pending.length };
}

export async function updateTechnicianApprovalPolicy(
  adminId: string,
  patch: Partial<TechnicianApprovalPolicy> & { reason?: string; recalculatePending?: boolean },
): Promise<TechnicianApprovalPolicy> {
  await ensureTechnicianApprovalPolicy(adminId);
  const current = await getTechnicianApprovalPolicy();
  const next: TechnicianApprovalPolicy = {
    enforceApprovalGate:
      patch.enforceApprovalGate !== undefined ? Boolean(patch.enforceApprovalGate) : current.enforceApprovalGate,
    automaticApprovalEnabled:
      patch.automaticApprovalEnabled !== undefined
        ? Boolean(patch.automaticApprovalEnabled)
        : current.automaticApprovalEnabled,
    approvalDelayValue: Math.max(
      1,
      Math.round(Number(patch.approvalDelayValue ?? current.approvalDelayValue)),
    ),
    approvalDelayUnit: patch.approvalDelayUnit
      ? normalizeUnit(patch.approvalDelayUnit)
      : current.approvalDelayUnit,
    adminReminderMinutes: Array.isArray(patch.adminReminderMinutes)
      ? patch.adminReminderMinutes
          .map((n) => Math.max(1, Math.round(Number(n) || 0)))
          .filter(Boolean)
          .slice(0, 8)
      : current.adminReminderMinutes,
    policyVersion: current.policyVersion + 1,
    grandfatherCompleted: current.grandfatherCompleted,
  };

  await PlatformSetting.findOneAndUpdate(
    { key: TECHNICIAN_APPROVAL_SETTING_KEY },
    { $set: { value: next, updatedBy: adminId } },
    { upsert: true },
  );

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'technician.approval.policy_changed',
    resourceType: 'TechnicianApproval',
    severity: 'critical',
    meta: { reason: patch.reason || null, old: current, next },
  });

  if (patch.recalculatePending === true) {
    await recalculatePendingDeadlines(adminId, next);
  }

  return next;
}

export async function getApprovalStatusForTechnician(userId: string) {
  await ensureTechnicianApprovalPolicy();
  const [policy, profile, user, completion] = await Promise.all([
    getTechnicianApprovalPolicy(),
    TechnicianProfile.findOne({ userId }),
    User.findById(userId).select('fullName email phone dataEnvironment metadata'),
    computeProfileCompletion(userId).catch(() => null),
  ]);
  if (!profile || !user) throw AppError.notFound('Technician profile not found');

  const isPermanentDev =
    String(user.email || '').toLowerCase() === DEVELOPER_TECHNICIAN.email.toLowerCase() ||
    Boolean(
      (user.metadata as { permanentDevelopmentTechnician?: boolean } | undefined)
        ?.permanentDevelopmentTechnician,
    );

  const requiredMissing =
    completion?.requiredMissing ||
    completion?.sections
      .filter((s) => REQUIRED_APPROVAL_SECTION_IDS.has(s.id) && !s.complete)
      .map((s) => ({ id: s.id, label: s.label, hint: s.hint, href: s.href })) ||
    [];

  const canSubmit =
    Boolean(completion?.canSubmitForApproval) &&
    (profile.verificationStatus === VERIFICATION_STATUS.UNVERIFIED ||
      profile.verificationStatus === VERIFICATION_STATUS.REJECTED ||
      profile.verificationStatus === VERIFICATION_STATUS.EXPIRED);

  const now = Date.now();
  const deadlineMs = profile.approvalDeadlineAt ? new Date(profile.approvalDeadlineAt).getTime() : null;
  const delayFriendly = formatDelayFriendly(policy.approvalDelayValue, policy.approvalDelayUnit);
  const pendingFriendly =
    profile.verificationStatus === VERIFICATION_STATUS.PENDING ||
    profile.verificationStatus === VERIFICATION_STATUS.UNDER_REVIEW
      ? policy.automaticApprovalEnabled
        ? `Thank you for completing your profile. Your application has been submitted for review. Most approvals are completed within about ${delayFriendly}. We'll notify you as soon as your account is approved.`
        : 'Thank you for completing your profile. Your application has been submitted for review. An administrator will review your account soon. We will notify you as soon as your account is approved.'
      : null;

  return {
    policy: {
      automaticApprovalEnabled: policy.automaticApprovalEnabled,
      approvalDelayValue: policy.approvalDelayValue,
      approvalDelayUnit: policy.approvalDelayUnit,
      enforceApprovalGate: policy.enforceApprovalGate,
      policyVersion: policy.policyVersion,
      adminReminderMinutes: policy.adminReminderMinutes,
    },
    verificationStatus: profile.verificationStatus,
    accountStatus: profile.accountStatus,
    isPermanentDevelopmentTechnician: isPermanentDev,
    canSubmitForApproval: canSubmit && !isPermanentDev,
    pendingMessage: pendingFriendly,
    approval: {
      submittedAt: profile.approvalSubmittedAt || null,
      deadlineAt: profile.approvalDeadlineAt || null,
      mode: profile.approvalMode || null,
      source: profile.approvalSource || null,
      policyVersion: profile.approvalPolicyVersion || null,
      reviewedAt: profile.approvalReviewedAt || null,
      adminNote: profile.approvalAdminNote || null,
      timeRemainingMs:
        deadlineMs && profile.verificationStatus === VERIFICATION_STATUS.PENDING
          ? Math.max(0, deadlineMs - now)
          : null,
    },
    completion,
    requiredMissing,
  };
}

export async function submitForApproval(actor: { userId: string; role: string }) {
  if (actor.role !== ROLES.TECHNICIAN) throw AppError.forbidden();
  const policy = await ensureTechnicianApprovalPolicy();
  const user = await User.findById(actor.userId);
  const profile = await TechnicianProfile.findOne({ userId: actor.userId });
  if (!user || !profile) throw AppError.notFound('Technician profile not found');

  if (
    String(user.email || '').toLowerCase() === DEVELOPER_TECHNICIAN.email.toLowerCase() ||
    Boolean(
      (user.metadata as { permanentDevelopmentTechnician?: boolean } | undefined)
        ?.permanentDevelopmentTechnician,
    )
  ) {
    throw AppError.badRequest(
      'The permanent Development Technician is already approved for development testing.',
    );
  }

  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw AppError.badRequest('Your account is already approved.');
  }
  if (
    profile.verificationStatus === VERIFICATION_STATUS.PENDING ||
    profile.verificationStatus === VERIFICATION_STATUS.UNDER_REVIEW
  ) {
    throw AppError.badRequest('Your application is already under review.');
  }

  const completion = await computeProfileCompletion(actor.userId);
  if (!completion.canSubmitForApproval) {
    throw AppError.badRequest(
      'Please complete all required profile fields before submitting for approval.',
    );
  }

  const submittedAt = new Date();
  const automatic = policy.automaticApprovalEnabled;
  profile.verificationStatus = VERIFICATION_STATUS.PENDING;
  profile.approvalSubmittedAt = submittedAt;
  profile.approvalMode = automatic ? 'automatic' : 'manual';
  profile.approvalPolicyVersion = policy.policyVersion;
  profile.approvalSource = automatic ? 'automatic' : 'manual';
  profile.approvalDeadlineAt = automatic ? computeApprovalDeadline(submittedAt, policy) : undefined;
  profile.approvalReviewedAt = undefined;
  profile.approvalReviewedBy = undefined;
  profile.approvalAdminNote = undefined;
  profile.approvalRemindersSent = [];
  await profile.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: 'technician',
    action: 'technician.approval.submitted',
    resourceType: 'TechnicianProfile',
    resourceId: profile._id.toString(),
    meta: {
      mode: profile.approvalMode,
      deadlineAt: profile.approvalDeadlineAt,
      policyVersion: policy.policyVersion,
    },
  });

  await createDbNotification({
    userId: actor.userId,
    type: 'technician.approval.submitted',
    title: 'Application received',
    body: 'Thank you for completing your profile. Your application has been submitted for review.',
    href: '/technician/profile-setup',
  }).catch(() => undefined);

  const admins = await User.find({ role: ROLES.ADMIN, isDeleted: { $ne: true } })
    .select('_id')
    .limit(40)
    .lean();
  await Promise.all(
    admins.map((a) =>
      createDbNotification({
        userId: String(a._id),
        type: 'technician.approval.admin_queue',
        title: 'New technician application',
        body: `${user.fullName || 'A technician'} submitted a profile for approval.`,
        href: '/admin/verification',
        data: { technicianId: actor.userId },
      }).catch(() => undefined),
    ),
  );

  return getApprovalStatusForTechnician(actor.userId);
}

export async function reviewApproval(
  admin: { userId: string },
  technicianUserId: string,
  input: {
    action: 'approve' | 'reject' | 'request_info' | 'suspend' | 'extend_deadline' | 'force_manual' | 'reset';
    note?: string;
    extendMinutes?: number;
  },
) {
  const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
  const user = await User.findById(technicianUserId).select('fullName email');
  if (!profile || !user) throw AppError.notFound('Technician not found');

  const note = typeof input.note === 'string' ? input.note.slice(0, 2000) : undefined;
  const now = new Date();

  if (input.action === 'approve') {
    profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
    profile.approvalReviewedAt = now;
    profile.approvalReviewedBy = new Types.ObjectId(admin.userId);
    profile.approvalAdminNote = note;
    profile.approvalSource = 'admin';
    profile.approvalDeadlineAt = undefined;
    profile.accountStatus = ACCOUNT_STATUS.ACTIVE;
    profile.isDeleted = false;
    await profile.save();
    await createDbNotification({
      userId: technicianUserId,
      type: 'technician.approval.approved',
      title: 'You are approved',
      body: 'Your FixNow technician account is approved. Customers can now find you and you can receive jobs.',
      href: '/technician/dashboard',
    }).catch(() => undefined);
  } else if (input.action === 'reject') {
    profile.verificationStatus = VERIFICATION_STATUS.REJECTED;
    profile.approvalReviewedAt = now;
    profile.approvalReviewedBy = new Types.ObjectId(admin.userId);
    profile.approvalAdminNote = note || 'More information is required before approval.';
    profile.approvalDeadlineAt = undefined;
    await profile.save();
    await createDbNotification({
      userId: technicianUserId,
      type: 'technician.approval.rejected',
      title: 'Application not approved',
      body:
        profile.approvalAdminNote ||
        'Your application was not approved. Please update your profile and submit again.',
      href: '/technician/profile-setup',
    }).catch(() => undefined);
  } else if (input.action === 'request_info') {
    profile.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
    profile.approvalAdminNote = note || 'Please update your profile with the requested information.';
    profile.approvalReviewedAt = now;
    profile.approvalReviewedBy = new Types.ObjectId(admin.userId);
    await profile.save();
    await createDbNotification({
      userId: technicianUserId,
      type: 'technician.approval.request_info',
      title: 'More information needed',
      body: profile.approvalAdminNote,
      href: '/technician/profile-setup',
    }).catch(() => undefined);
  } else if (input.action === 'suspend') {
    profile.accountStatus = ACCOUNT_STATUS.SUSPENDED;
    profile.approvalAdminNote = note;
    await profile.save();
  } else if (input.action === 'extend_deadline') {
    const mins = Math.max(1, Math.round(Number(input.extendMinutes) || 60));
    const base = profile.approvalDeadlineAt
      ? new Date(profile.approvalDeadlineAt).getTime()
      : now.getTime();
    profile.approvalDeadlineAt = new Date(base + mins * 60_000);
    profile.approvalMode = 'automatic';
    profile.approvalSource = 'escalated';
    await profile.save();
  } else if (input.action === 'force_manual') {
    profile.approvalMode = 'manual';
    profile.approvalDeadlineAt = undefined;
    profile.approvalSource = 'manual';
    await profile.save();
  } else if (input.action === 'reset') {
    profile.verificationStatus = VERIFICATION_STATUS.UNVERIFIED;
    profile.approvalSubmittedAt = undefined;
    profile.approvalDeadlineAt = undefined;
    profile.approvalMode = undefined;
    profile.approvalSource = undefined;
    profile.approvalPolicyVersion = undefined;
    profile.approvalReviewedAt = undefined;
    profile.approvalReviewedBy = undefined;
    profile.approvalAdminNote = undefined;
    profile.approvalRemindersSent = [];
    await profile.save();
  } else {
    throw AppError.badRequest('Invalid approval action');
  }

  await writeAuditLog({
    actorId: admin.userId,
    actorRole: 'admin',
    action: `technician.approval.${input.action}`,
    resourceType: 'TechnicianProfile',
    resourceId: profile._id.toString(),
    meta: { technicianUserId, note: note || null },
  });

  return {
    technicianUserId,
    verificationStatus: profile.verificationStatus,
    accountStatus: profile.accountStatus,
    approvalDeadlineAt: profile.approvalDeadlineAt || null,
    approvalMode: profile.approvalMode || null,
  };
}

export async function listPendingApprovals(opts: { q?: string; limit?: number } = {}) {
  await ensureTechnicianApprovalPolicy();
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const profiles = await TechnicianProfile.find({
    verificationStatus: { $in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.UNDER_REVIEW] },
  })
    .sort({ approvalSubmittedAt: 1, createdAt: 1 })
    .limit(limit)
    .lean();

  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } })
    .select('fullName email phone')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const now = Date.now();
  const q = (opts.q || '').trim().toLowerCase();

  let items = profiles.map((p) => {
    const u = userMap.get(String(p.userId));
    const deadlineMs = p.approvalDeadlineAt ? new Date(p.approvalDeadlineAt).getTime() : null;
    return {
      technicianUserId: String(p.userId),
      fullName: u?.fullName || '',
      email: u?.email || '',
      phone: u?.phone || '',
      verificationStatus: p.verificationStatus,
      submittedAt: p.approvalSubmittedAt || null,
      deadlineAt: p.approvalDeadlineAt || null,
      timeRemainingMs: deadlineMs ? Math.max(0, deadlineMs - now) : null,
      mode: p.approvalMode || 'manual',
      source: p.approvalSource || 'manual',
      policyVersion: p.approvalPolicyVersion || null,
      adminNote: p.approvalAdminNote || null,
      trustScore: p.trustScore,
      photoUrl: p.photoUrl,
      district: p.location?.district,
    };
  });

  if (q) {
    items = items.filter(
      (i) =>
        i.fullName.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        i.technicianUserId.toLowerCase().includes(q),
    );
  }

  return { items, generatedAt: new Date().toISOString() };
}

/** Background worker: auto-approve due applications + admin reminders. */
export async function processTechnicianApprovalQueue(): Promise<{ approved: number; reminded: number }> {
  const policy = await ensureTechnicianApprovalPolicy();
  const now = new Date();
  let approved = 0;
  let reminded = 0;

  if (policy.automaticApprovalEnabled) {
    const due = await TechnicianProfile.find({
      verificationStatus: VERIFICATION_STATUS.PENDING,
      approvalMode: 'automatic',
      approvalDeadlineAt: { $lte: now },
    }).limit(50);

    for (const profile of due) {
      profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
      profile.approvalReviewedAt = now;
      profile.approvalSource = 'automatic';
      profile.approvalDeadlineAt = undefined;
      profile.accountStatus = ACCOUNT_STATUS.ACTIVE;
      await profile.save();
      approved += 1;
      await createDbNotification({
        userId: String(profile.userId),
        type: 'technician.approval.auto_approved',
        title: 'You are approved',
        body: 'Your FixNow technician account is approved. Customers can now find you and you can receive jobs.',
        href: '/technician/dashboard',
      }).catch(() => undefined);
      await writeAuditLog({
        actorId: String(profile.userId),
        actorRole: 'system',
        action: 'technician.approval.auto_approved',
        resourceType: 'TechnicianProfile',
        resourceId: profile._id.toString(),
        meta: { policyVersion: profile.approvalPolicyVersion },
      });
    }
  }

  const pending = await TechnicianProfile.find({
    verificationStatus: VERIFICATION_STATUS.PENDING,
    approvalSubmittedAt: { $exists: true },
  }).limit(80);

  const admins = await User.find({ role: ROLES.ADMIN, isDeleted: { $ne: true } })
    .select('_id')
    .limit(20)
    .lean();

  for (const profile of pending) {
    const submittedAt = profile.approvalSubmittedAt ? new Date(profile.approvalSubmittedAt).getTime() : 0;
    if (!submittedAt) continue;
    const elapsedMin = Math.floor((now.getTime() - submittedAt) / 60_000);
    const sent = new Set(profile.approvalRemindersSent || []);
    let changed = false;
    for (const mark of policy.adminReminderMinutes) {
      const key = `admin:${mark}`;
      if (elapsedMin >= mark && !sent.has(key)) {
        sent.add(key);
        changed = true;
        reminded += 1;
        await Promise.all(
          admins.map((a) =>
            createDbNotification({
              userId: String(a._id),
              type: 'technician.approval.admin_reminder',
              title: 'Technician approval reminder',
              body: `A technician application has been pending for ${mark} minutes.`,
              href: '/admin/verification',
              data: { technicianId: String(profile.userId) },
            }).catch(() => undefined),
          ),
        );
      }
    }
    if (changed) {
      profile.approvalRemindersSent = [...sent];
      await profile.save();
    }
  }

  return { approved, reminded };
}

export { DEFAULT_POLICY };
