import type { Request } from 'express';
import type { Types } from 'mongoose';
import {
  Category,
  Job,
  JobApplication,
  TechnicianProfile,
  TrustScore,
  User,
} from '../../models/index.js';
import { ACCOUNT_STATUS, JOB_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { publicMediaUrl } from '../../utils/mediaUrl.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import { ensurePublicJobReference } from '../../utils/ensurePublicJobReference.js';
import { looksLikeJobReference } from '../../utils/jobReference.js';
import {
  adminOverrideFreeJobs,
  ensureFreeJobSetting,
  FREE_JOB_SETTING_KEY,
} from './freeJob.service.js';
import { recomputeTrustForTechnician } from './trust.service.js';
import {
  applyDataEnvironment,
  parseAdminEnvironmentQuery,
} from '../sandbox/dataEnvironment.js';

function serializeAdminTechnicianProfile(profile: {
  userId: { toString(): string } | string;
  headline?: string | null;
  photoUrl?: string | null;
  trustScore?: number;
  reliabilityScore?: number;
  completionScore?: number;
  responseScore?: number;
  punctualityScore?: number;
  ratingAverage?: number;
  reviewCount?: number;
  jobsCompleted?: number;
  jobsCancelled?: number;
  verificationStatus?: string;
  accountLocked?: boolean;
  freeJobsUsed?: number;
  freeJobsLimit?: number;
  freeJobLimit?: number;
  remainingFreeJobs?: number;
  location?: unknown;
  primaryCategoryId?: unknown;
  primaryCategoryName?: string | null;
  currentRank?: string;
  isAvailableNow?: boolean;
  responseTimeMinutesAvg?: number | null;
  subscriptionPlanCode?: string | null;
  leadCredits?: number;
  openJobs?: number;
  accountStatus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const photo = publicMediaUrl(profile.photoUrl);
  const completed = Number(profile.jobsCompleted) || 0;
  const cancelled = Number(profile.jobsCancelled) || 0;
  const decided = completed + cancelled;
  const successRate = decided > 0 ? Math.round((completed / decided) * 100) : null;
  return {
    ...profile,
    photoUrl: photo,
    profileImageUrl: photo,
    primaryCategoryName: profile.primaryCategoryName ?? null,
    openJobs: Number(profile.openJobs) || 0,
    successRate,
    responseTimeMinutesAvg:
      profile.responseTimeMinutesAvg == null ? null : Number(profile.responseTimeMinutesAvg),
    subscriptionPlanCode: profile.subscriptionPlanCode ?? null,
    leadCredits: Number(profile.leadCredits) || 0,
    remainingFreeJobs: Number(profile.remainingFreeJobs ?? profile.freeJobLimit ?? 0),
  };
}

const OPEN_JOB_STATUSES = [
  JOB_STATUS.ASSIGNED,
  JOB_STATUS.TECHNICIAN_EN_ROUTE,
  JOB_STATUS.IN_PROGRESS,
  JOB_STATUS.AWAITING_CONFIRMATION,
];
export const adminMarketplaceService = {
  async dashboard() {
    const [
      customers,
      technicians,
      jobs,
      posted,
      assigned,
      completed,
      applications,
      lockedTechs,
      freeJobConfig,
    ] = await Promise.all([
      User.countDocuments({ role: ROLES.CUSTOMER }),
      User.countDocuments({ role: ROLES.TECHNICIAN }),
      Job.countDocuments({}),
      Job.countDocuments({ status: JOB_STATUS.POSTED }),
      Job.countDocuments({ status: JOB_STATUS.ASSIGNED }),
      Job.countDocuments({ status: JOB_STATUS.COMPLETED }),
      JobApplication.countDocuments({}),
      TechnicianProfile.countDocuments({ accountLocked: true }),
      ensureFreeJobSetting(),
    ]);

    const avgTrust = await TechnicianProfile.aggregate([
      { $group: { _id: null, avg: { $avg: '$trustScore' } } },
    ]);

    return {
      customers,
      technicians,
      jobs: { total: jobs, posted, assigned, completed },
      applications,
      lockedTechnicians: lockedTechs,
      trust: { average: avgTrust[0]?.avg ?? 0 },
      freeJobs: freeJobConfig,
    };
  },

  async marketplaceMetrics(req: Request) {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      jobsCreated,
      jobsCompleted,
      applicationsCreated,
      newTechnicians,
      newCustomers,
      cancelledInWindow,
      byStatus,
      byDistrict,
      topTechnicians,
    ] = await Promise.all([
      Job.countDocuments({ createdAt: { $gte: since } }),
      Job.countDocuments({ status: JOB_STATUS.COMPLETED, completedAt: { $gte: since } }),
      JobApplication.countDocuments({ createdAt: { $gte: since } }),
      User.countDocuments({ role: ROLES.TECHNICIAN, createdAt: { $gte: since } }),
      User.countDocuments({ role: ROLES.CUSTOMER, createdAt: { $gte: since } }),
      Job.countDocuments({
        status: JOB_STATUS.CANCELLED,
        updatedAt: { $gte: since },
      }),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Job.aggregate([
        { $match: { 'location.district': { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$location.district', jobs: { $sum: 1 } } },
        { $sort: { jobs: -1 } },
        { $limit: 12 },
      ]),
      TechnicianProfile.find({})
        .sort({ trustScore: -1, jobsCompleted: -1 })
        .limit(8)
        .populate('userId', 'fullName email')
        .select('trustScore jobsCompleted verificationStatus accountLocked responseScore completionScore ratingAverage')
        .lean(),
    ]);

    return {
      windowDays: days,
      jobsCreated,
      jobsCompleted,
      applicationsCreated,
      newTechnicians,
      newCustomers,
      cancelledInWindow,
      jobsByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
      jobsByDistrict: byDistrict.map((r) => ({
        district: String(r._id),
        jobs: Number(r.jobs) || 0,
      })),
      topTechnicians: topTechnicians.map((p) => {
        const user = p.userId as { fullName?: string; email?: string } | null;
        return {
          id: String((p as { _id?: unknown })._id ?? ''),
          userId: String(
            typeof p.userId === 'object' && p.userId && '_id' in p.userId
              ? (p.userId as { _id: unknown })._id
              : p.userId,
          ),
          name: user?.fullName || user?.email || 'Technician',
          trustScore: Number(p.trustScore) || 0,
          jobsCompleted: Number(p.jobsCompleted) || 0,
          verificationStatus: p.verificationStatus || 'unverified',
          locked: Boolean(p.accountLocked),
          responseScore: Number(p.responseScore) || 0,
          completionScore: Number(p.completionScore) || 0,
          ratingAverage: Number(p.ratingAverage) || 0,
        };
      }),
    };
  },

  async listCustomers(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const filter: Record<string, unknown> = { role: ROLES.CUSTOMER };
    if (q) {
      filter.$or = [
        { email: { $regex: escapeRegex(q), $options: 'i' } },
        { fullName: { $regex: escapeRegex(q), $options: 'i' } },
        { phone: { $regex: escapeRegex(q), $options: 'i' } },
      ];
    }
    // Default: production-only workforce. Pass ?dataEnvironment=sandbox|combined for sandbox QA.
    const env = parseAdminEnvironmentQuery(req.query as Record<string, unknown>) ?? 'production';
    applyDataEnvironment(filter, env);

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('fullName email phone role accountStatus createdAt lastLoginAt emailVerifiedAt dataEnvironment')
        .lean(),
    ]);
    return { items: users, meta: paginationMeta(total, page, limit) };
  },

  async getCustomer(userId: string) {
    const user = await User.findOne({ _id: userId, role: ROLES.CUSTOMER })
      .select('fullName email phone role accountStatus createdAt lastLoginAt emailVerifiedAt phoneVerifiedAt')
      .lean();
    if (!user) throw AppError.notFound('Customer not found');
    const jobs = await Job.find({ customerId: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('title status categoryName location createdAt budgetMin budgetMax')
      .lean();
    return { user, recentJobs: jobs };
  },

  async listTechnicians(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const locked = req.query.locked === 'true';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

    const profileFilter: Record<string, unknown> = {};
    if (locked) profileFilter.accountLocked = true;
    if (req.query.unlockRequested === 'true') {
      profileFilter.unlockRequestedAt = { $ne: null };
      profileFilter.accountLocked = true;
    }

    // Default: production-only. Sandbox Management owns demo operators.
    const env = parseAdminEnvironmentQuery(req.query as Record<string, unknown>) ?? 'production';
    applyDataEnvironment(profileFilter, env);

    if (q) {
      const users = await User.find({
        role: ROLES.TECHNICIAN,
        $or: [
          { email: { $regex: escapeRegex(q), $options: 'i' } },
          { fullName: { $regex: escapeRegex(q), $options: 'i' } },
        ],
      })
        .select('_id')
        .lean();
      profileFilter.userId = { $in: users.map((u) => u._id) };
    }

    const [total, profiles] = await Promise.all([
      TechnicianProfile.countDocuments(profileFilter),
      TechnicianProfile.find(profileFilter)
        .sort({ trustScore: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'userId headline photoUrl trustScore reliabilityScore completionScore responseScore punctualityScore ratingAverage reviewCount jobsCompleted jobsCancelled verificationStatus accountLocked lockReason unlockRequestedAt unlockRequestNote freeJobsUsed freeJobLimit remainingFreeJobs location primaryCategoryId currentRank isAvailableNow responseTimeMinutesAvg subscriptionPlanCode leadCredits accountStatus createdAt updatedAt dataEnvironment',
        )
        .lean(),
    ]);

    const technicianIds = profiles.map((p) => p.userId);
    const categoryIds = [
      ...new Set(
        profiles
          .map((p) => p.primaryCategoryId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [users, categories, openJobRows] = await Promise.all([
      User.find({ _id: { $in: technicianIds } })
        .select('fullName email phone accountStatus createdAt lastLoginAt')
        .lean(),
      categoryIds.length
        ? Category.find({ _id: { $in: categoryIds } }).select('name').lean()
        : Promise.resolve([]),
      technicianIds.length
        ? Job.aggregate<{ _id: Types.ObjectId; count: number }>([
            {
              $match: {
                assignedTechnicianId: { $in: technicianIds },
                status: { $in: OPEN_JOB_STATUSES },
              },
            },
            { $group: { _id: '$assignedTechnicianId', count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c.name]));
    const openJobsMap = new Map(openJobRows.map((row) => [row._id.toString(), row.count]));

    return {
      items: profiles.map((p) => {
        const userId = p.userId.toString();
        const categoryId = p.primaryCategoryId?.toString();
        return {
          user: userMap.get(userId) ?? null,
          profile: serializeAdminTechnicianProfile({
            ...p,
            primaryCategoryName: categoryId ? categoryMap.get(categoryId) ?? null : null,
            openJobs: openJobsMap.get(userId) ?? 0,
          }),
        };
      }),
      meta: paginationMeta(total, page, limit),
    };
  },

  async getTechnician(userId: string) {
    const user = await User.findOne({ _id: userId, role: ROLES.TECHNICIAN });
    if (!user) throw AppError.notFound('Technician not found');
    const profile = await TechnicianProfile.findOne({ userId });
    const trust = await TrustScore.findOne({ technicianUserId: userId });
    return {
      user,
      profile: profile ? serializeAdminTechnicianProfile(profile.toObject()) : null,
      trust,
    };
  },

  async updateTechnician(
    adminId: string,
    technicianUserId: string,
    input: Partial<{
      experienceYears: number;
      verificationStatus: string;
      identityVerified: boolean;
      skillVerified: boolean;
      headline: string;
      bio: string;
      businessVerificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
      businessVerificationNote: string;
    }>,
  ) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) throw AppError.notFound('Technician profile not found');
    if (input.experienceYears !== undefined) profile.experienceYears = input.experienceYears;
    if (input.verificationStatus !== undefined) profile.verificationStatus = input.verificationStatus as never;
    if (input.identityVerified !== undefined) profile.identityVerified = input.identityVerified;
    if (input.skillVerified !== undefined) profile.skillVerified = input.skillVerified;
    if (input.headline !== undefined) profile.headline = input.headline;
    if (input.bio !== undefined) profile.bio = input.bio;

    const prevBusinessStatus = profile.businessVerificationStatus;
    if (input.businessVerificationStatus !== undefined) {
      profile.businessVerificationStatus = input.businessVerificationStatus;
    }
    if (input.businessVerificationNote !== undefined) {
      profile.businessVerificationNote = String(input.businessVerificationNote).slice(0, 500);
    }

    await profile.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.update_technician',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      meta: {
        businessVerificationStatus: profile.businessVerificationStatus,
      },
    });

    if (
      input.businessVerificationStatus &&
      input.businessVerificationStatus !== prevBusinessStatus &&
      (input.businessVerificationStatus === 'verified' || input.businessVerificationStatus === 'rejected')
    ) {
      try {
        const { createDbNotification } = await import('../../utils/notify.js');
        const approved = input.businessVerificationStatus === 'verified';
        await createDbNotification({
          userId: technicianUserId,
          type: approved
            ? 'technician.business_verification_approved'
            : 'technician.business_verification_rejected',
          title: approved ? 'Business verification approved' : 'Business verification rejected',
          body:
            profile.businessVerificationNote?.slice(0, 200) ||
            (approved
              ? 'Your company is now verified on FixNow.'
              : 'Your business verification was not approved. Update your company details and try again.'),
          bypassQuietHours: true,
        });
      } catch {
        /* ignore notify failures */
      }
    }

    return { profile };
  },

  async suspendTechnician(adminId: string, technicianUserId: string, reason?: string) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) throw AppError.notFound('Technician profile not found');
    profile.accountStatus = ACCOUNT_STATUS.SUSPENDED;
    profile.accountLocked = true;
    profile.lockReason = reason ?? 'Suspended by admin';
    await profile.save();
    await User.updateOne({ _id: technicianUserId }, { $set: { accountStatus: ACCOUNT_STATUS.SUSPENDED } });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.suspend_technician',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      meta: { reason },
      severity: 'critical',
    });
    return { profile };
  },

  /** Temporary marketplace lock (does not permanently ban the user account). */
  async lockTechnician(adminId: string, technicianUserId: string, reason?: string) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) throw AppError.notFound('Technician profile not found');
    profile.accountLocked = true;
    profile.lockReason = reason ?? 'Locked by admin';
    if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
      profile.accountStatus = ACCOUNT_STATUS.LOCKED;
    }
    await profile.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.lock_technician',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      meta: { reason },
      severity: 'warning',
    });
    return { profile };
  },

  async requestUnlock(technicianUserId: string, note?: string) {
    const { requestTechnicianUnlock } = await import('./freeJob.service.js');
    const profile = await requestTechnicianUnlock(technicianUserId, note);
    return { profile };
  },

  async unlockTechnician(adminId: string, technicianUserId: string) {
    const profile = await adminOverrideFreeJobs({
      technicianUserId,
      unlock: true,
    });
    await User.updateOne(
      { _id: technicianUserId },
      { $set: { accountStatus: ACCOUNT_STATUS.ACTIVE, lockUntil: null, failedLoginAttempts: 0 } },
    );
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.unlock_technician',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      severity: 'warning',
    });
    return { profile };
  },

  async overrideFreeJobs(
    adminId: string,
    technicianUserId: string,
    input: {
      freeJobLimit?: number;
      remainingFreeJobs?: number;
      promotionalFreeJobs?: number;
      grantBonusJobs?: number;
      unlock?: boolean;
      suspendMonetization?: boolean;
      subscriptionPlanCode?: string | null;
      subscriptionStatus?: string;
    },
  ) {
    const profile = await adminOverrideFreeJobs({
      technicianUserId,
      freeJobLimit: input.freeJobLimit,
      remainingFreeJobs: input.remainingFreeJobs,
      promotionalFreeJobs: input.promotionalFreeJobs,
      grantBonusJobs: input.grantBonusJobs,
      unlock: input.unlock !== false,
      suspendMonetization: input.suspendMonetization,
      subscriptionPlanCode: input.subscriptionPlanCode,
      subscriptionStatus: input.subscriptionStatus,
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.override_free_jobs',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      meta: input,
      severity: 'warning',
    });
    return {
      freeJobs: {
        used: profile.freeJobsUsed,
        limit: profile.freeJobLimit,
        remaining: profile.remainingFreeJobs,
        locked: profile.accountLocked,
        promotionalFreeJobs: profile.promotionalFreeJobs,
        completedJobsUnderFreePlan: profile.completedJobsUnderFreePlan,
        subscriptionStatus: profile.subscriptionStatus,
        trialFinished: profile.trialFinished,
      },
      profile,
    };
  },

  async updateFreeJobConfig(
    adminId: string,
    input: {
      enabled?: boolean;
      defaultLimit?: number;
      lockAfterLimit?: boolean;
      requireCustomerConfirmation?: boolean;
      autoCompleteTimeoutHours?: number;
      subscriptionEnabled?: boolean;
      gracePeriodDays?: number;
      freePlanEnabled?: boolean;
      monetizationSuspended?: boolean;
    },
  ) {
    const { updateFreeJobConfigValue } = await import('./freeJob.service.js');
    const next = await updateFreeJobConfigValue(adminId, input);
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.update_free_job_config',
      resourceType: 'PlatformSetting',
      resourceId: FREE_JOB_SETTING_KEY,
      meta: { ...next } as Record<string, unknown>,
    });
    return { freeJobs: next };
  },

  async resetTechnicianQuota(adminId: string, technicianUserId: string) {
    const { resetTechnicianQuota } = await import('./freeJob.service.js');
    const profile = await resetTechnicianQuota(technicianUserId);
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.reset_quota',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
    });
    return {
      profile,
      freeJobs: {
        used: profile.freeJobsUsed,
        limit: profile.freeJobLimit,
        remaining: profile.remainingFreeJobs,
        locked: profile.accountLocked,
      },
    };
  },

  async grantBonusJobs(adminId: string, technicianUserId: string, count: number) {
    const profile = await adminOverrideFreeJobs({
      technicianUserId,
      grantBonusJobs: Math.max(1, Math.floor(count)),
      unlock: true,
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.grant_bonus_jobs',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      meta: { count },
    });
    return { profile };
  },

  async listJobs(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string') filter.status = req.query.status;
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const q = req.query.q.trim();
      const or: Record<string, unknown>[] = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { publicJobReference: { $regex: escapeRegex(q), $options: 'i' } },
        { searchText: { $regex: escapeRegex(q), $options: 'i' } },
      ];
      if (/^[a-f0-9]{24}$/i.test(q)) {
        or.push({ _id: q });
      }
      if (looksLikeJobReference(q)) {
        or.push({ publicJobReference: q.toUpperCase() });
      }
      filter.$or = or;
    }

    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const customerIds = [...new Set(jobs.map((j) => String(j.customerId)).filter(Boolean))];
    const techIds = [
      ...new Set(jobs.map((j) => (j.assignedTechnicianId ? String(j.assignedTechnicianId) : '')).filter(Boolean)),
    ];
    const users = await User.find({ _id: { $in: [...customerIds, ...techIds] } })
      .select('fullName email phone')
      .lean();
    const nameById = new Map(users.map((u) => [String(u._id), u.fullName || u.email || 'User']));

    // Lazily backfill missing public references for older jobs (best-effort).
    const items = await Promise.all(
      jobs.map(async (j) => {
        let publicJobReference = j.publicJobReference;
        if (!publicJobReference) {
          try {
            const doc = await Job.findById(j._id);
            if (doc) publicJobReference = await ensurePublicJobReference(doc);
          } catch {
            publicJobReference = undefined;
          }
        }
        return {
          ...j,
          publicJobReference,
          customer: { fullName: nameById.get(String(j.customerId)) || 'Customer' },
          technician: j.assignedTechnicianId
            ? { fullName: nameById.get(String(j.assignedTechnicianId)) || 'Technician' }
            : undefined,
        };
      }),
    );

    return { items, meta: paginationMeta(total, page, limit) };
  },

  async listApplications(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string') filter.status = req.query.status;
    const [total, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);
    return { items: applications, meta: paginationMeta(total, page, limit) };
  },

  async recomputeTrust(adminId: string, technicianUserId: string) {
    await recomputeTrustForTechnician(technicianUserId);
    const trust = await TrustScore.findOne({ technicianUserId });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'admin.recompute_trust',
      resourceType: 'TrustScore',
      resourceId: technicianUserId,
    });
    return { trust };
  },
};
