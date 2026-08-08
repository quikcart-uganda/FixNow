import type { Request } from 'express';
import mongoose from 'mongoose';
import {
  Assignment,
  Category,
  CustomerProfile,
  Job,
  JobApplication,
  Subcategory,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import {
  APPLICATION_STATUS,
  ASSIGNMENT_STATUS,
  JOB_STATUS,
  type JobStatus,
} from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { assertJobTransition } from '../../utils/jobTransitions.js';
import { createDbNotification } from '../../utils/notify.js';
import { escapeRegex, paginationMeta, parsePagination, parseSort } from '../../utils/pagination.js';
import { ensurePublicJobReference } from '../../utils/ensurePublicJobReference.js';
import { looksLikeJobReference } from '../../utils/jobReference.js';
import {
  assertCanApplyToJobs,
  canViewCustomerContact,
} from './freeJob.service.js';
import {
  emitApplicationRejected,
  emitApplicationSubmitted,
  emitApplicationWithdrawn,
  emitJobCreated,
  emitJobPublished,
  emitJobStatusChanged,
  emitJobUpdated,
  emitTechnicianAssigned,
} from '../../sockets/realtime.js';
import {
  ensureJobConversation,
  lockConversationForJob,
  postSystemMessage,
} from '../messaging/message.service.js';
import {
  applyDataEnvironment,
  assertDocumentVisibleToViewer,
  assertSameDataEnvironment,
  documentDataEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';
import { bumpResponseScore, recomputeTrustForTechnician } from './trust.service.js';
import {
  getRecommendationSettings,
  scoreJobForTechnician,
  scoreTechnician,
} from './recommendation.service.js';

type Meta = { ip?: string; userAgent?: string };

function pushStatus(job: InstanceType<typeof Job>, status: JobStatus, actorId?: string, note?: string) {
  job.status = status;
  job.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
    note,
  });
  job.timeline.push({
    type: `status:${status}`,
    at: new Date(),
    actorId: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
    payload: note ? { note } : undefined,
  });
}

export const jobMarketplaceService = {
  async create(
    customerId: string,
    input: {
      title: string;
      description: string;
      categoryId?: string;
      subcategoryId?: string;
      budgetMin?: number;
      budgetMax?: number;
      currency?: string;
      preferredDate?: string;
      location?: Record<string, unknown>;
      photoUrls?: string[];
      videoUrls?: string[];
      publish?: boolean;
    },
    meta: Meta = {},
  ) {
    const profile = await CustomerProfile.findOne({ userId: customerId });
    let categoryName: string | undefined;
    let subcategoryName: string | undefined;
    if (input.categoryId) {
      const cat = await Category.findById(input.categoryId);
      if (!cat) throw AppError.badRequest('Invalid categoryId');
      categoryName = cat.name;
    }
    if (input.subcategoryId) {
      const sub = await Subcategory.findById(input.subcategoryId);
      if (!sub) throw AppError.badRequest('Invalid subcategoryId');
      subcategoryName = sub.name;
    }

    const initial = input.publish ? JOB_STATUS.POSTED : JOB_STATUS.DRAFT;
    const dataEnvironment = await resolveUserDataEnvironment(customerId);
    const job = await Job.create({
      customerId,
      customerProfileId: profile?._id,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      categoryName,
      subcategoryName,
      status: initial,
      statusHistory: [{ status: initial, changedAt: new Date(), changedBy: customerId }],
      timeline: [{ type: `status:${initial}`, at: new Date(), actorId: customerId }],
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      currency: input.currency ?? 'UGX',
      preferredDate: input.preferredDate ? new Date(input.preferredDate) : undefined,
      location: input.location,
      geo: (() => {
        const loc = input.location as
          | { geo?: { type?: string; coordinates?: number[] }; coordinates?: { type?: string; coordinates?: number[] } }
          | undefined;
        if (loc?.geo?.coordinates) return loc.geo;
        if (loc?.coordinates?.coordinates) return loc.coordinates;
        return undefined;
      })(),
      photoUrls: input.photoUrls ?? [],
      videoUrls: input.videoUrls ?? [],
      postedAt: input.publish ? new Date() : undefined,
      searchText: `${input.title} ${input.description} ${categoryName ?? ''} ${subcategoryName ?? ''}`,
      dataEnvironment,
    });

    await ensurePublicJobReference(job);

    if (profile) {
      profile.jobStats.posted += 1;
      await profile.save();
    }

    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: input.publish ? 'job.publish' : 'job.create_draft',
      resourceType: 'Job',
      resourceId: job._id.toString(),
      ip: meta.ip,
    });

    emitJobCreated(job);
    if (input.publish) {
      try {
        const { notifyAdmins } = await import('../push/push.service.js');
        await notifyAdmins({
          type: 'job.published',
          title: 'Job published',
          body: `"${job.title}" is now live on the marketplace.`,
          jobId: job._id.toString(),
        });
      } catch {
        // Push side-effect must not fail job create.
      }
    }
    return { job };
  },

  async publish(customerId: string, jobId: string, meta: Meta = {}) {
    const job = await Job.findOne({ _id: jobId, customerId });
    if (!job) throw AppError.notFound('Job not found');
    assertJobTransition(job.status as JobStatus, JOB_STATUS.POSTED);
    pushStatus(job, JOB_STATUS.POSTED, customerId, 'Published');
    job.postedAt = new Date();
    await job.save();
    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: 'job.publish',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
    });
    emitJobPublished(job);
    try {
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: 'job.published',
        title: 'Job published',
        body: `"${job.title}" is now live on the marketplace.`,
        jobId: job._id.toString(),
      });
    } catch {
      // Push side-effect must not fail publish.
    }
    return { job };
  },

  async update(
    customerId: string,
    jobId: string,
    input: Partial<{
      title: string;
      description: string;
      categoryId: string;
      subcategoryId: string;
      budgetMin: number;
      budgetMax: number;
      preferredDate: string;
      location: Record<string, unknown>;
      photoUrls: string[];
      videoUrls: string[];
    }>,
  ) {
    const job = await Job.findOne({ _id: jobId, customerId });
    if (!job) throw AppError.notFound('Job not found');
    if (![JOB_STATUS.DRAFT as string, JOB_STATUS.POSTED as string].includes(job.status)) {
      throw AppError.badRequest('Only draft or posted jobs can be edited');
    }
    if (input.title !== undefined) job.title = input.title;
    if (input.description !== undefined) job.description = input.description;
    if (input.budgetMin !== undefined) job.budgetMin = input.budgetMin;
    if (input.budgetMax !== undefined) job.budgetMax = input.budgetMax;
    if (input.preferredDate !== undefined) job.preferredDate = new Date(input.preferredDate);
    if (input.location !== undefined) job.location = input.location as never;
    if (input.photoUrls !== undefined) job.photoUrls = input.photoUrls;
    if (input.videoUrls !== undefined) job.videoUrls = input.videoUrls;
    if (input.categoryId) {
      const cat = await Category.findById(input.categoryId);
      if (!cat) throw AppError.badRequest('Invalid categoryId');
      job.categoryId = cat._id;
      job.categoryName = cat.name;
    }
    if (input.subcategoryId) {
      const sub = await Subcategory.findById(input.subcategoryId);
      if (!sub) throw AppError.badRequest('Invalid subcategoryId');
      job.subcategoryId = sub._id;
      job.subcategoryName = sub.name;
    }
    // Keep public reference in searchText after title/description edits.
    const ref = job.publicJobReference ? ` ${job.publicJobReference}` : '';
    job.searchText = `${job.title} ${job.description} ${job.categoryName ?? ''} ${job.subcategoryName ?? ''}${ref}`;
    await job.save();
    emitJobUpdated(job);
    return { job };
  },

  async getById(jobId: string, viewer: { userId: string; role: string }) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');

    const viewerEnv = await resolveUserDataEnvironment(viewer.userId);
    // Admins may inspect any environment; marketplace actors stay isolated.
    if (viewer.role !== 'admin') {
      assertDocumentVisibleToViewer(viewerEnv, documentDataEnvironment(job), 'Job not found');
    }

    const isOwner = job.customerId.toString() === viewer.userId;
    const isAssignee = job.assignedTechnicianId?.toString() === viewer.userId;
    const isAdmin = viewer.role === 'admin';

    if (!isOwner && !isAssignee && !isAdmin && job.status === JOB_STATUS.DRAFT) {
      throw AppError.forbidden('Draft job is private');
    }

    let customerContact: { fullName: string; email?: string; phone?: string | null } | null = null;
    const customer = await User.findById(job.customerId).select('fullName email phone');
    if (customer) {
      if (isOwner || isAdmin) {
        customerContact = { fullName: customer.fullName, email: customer.email, phone: customer.phone ?? null };
      } else if (isAssignee) {
        const tech = await TechnicianProfile.findOne({ userId: viewer.userId });
        if (tech && canViewCustomerContact(tech)) {
          customerContact = { fullName: customer.fullName, email: customer.email, phone: customer.phone ?? null };
        } else {
          customerContact = { fullName: customer.fullName };
        }
      } else {
        customerContact = { fullName: customer.fullName };
      }
    }

    return { job, customer: customerContact };
  },

  async listForActor(viewer: { userId: string; role: string }, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const filter: Record<string, unknown> = {};

    if (viewer.role === 'customer') {
      filter.customerId = viewer.userId;
    } else if (viewer.role === 'technician') {
      if (req.query.mine === 'true') {
        filter.assignedTechnicianId = viewer.userId;
      } else {
        filter.status = JOB_STATUS.POSTED;
      }
    }
    if (status) filter.status = status;
    if (q) {
      const or: Record<string, unknown>[] = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } },
        { searchText: { $regex: escapeRegex(q), $options: 'i' } },
        { publicJobReference: { $regex: escapeRegex(q), $options: 'i' } },
      ];
      if (/^[a-f0-9]{24}$/i.test(q)) or.push({ _id: q });
      if (looksLikeJobReference(q)) or.push({ publicJobReference: q.toUpperCase() });
      filter.$or = or;
    }
    if (typeof req.query.district === 'string') {
      filter['location.district'] = req.query.district;
    }
    if (typeof req.query.categoryId === 'string') {
      filter.categoryId = req.query.categoryId;
    }

    if (viewer.role !== 'admin') {
      const actorEnv = await resolveUserDataEnvironment(viewer.userId);
      applyDataEnvironment(filter, actorEnv);
    }

    const sort = parseSort(typeof req.query.sort === 'string' ? req.query.sort : undefined, [
      'createdAt',
      'updatedAt',
      'preferredDate',
      'status',
    ]);

    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(
          'title description status categoryId categoryName subcategoryName location geo budgetMin budgetMax preferredDate photos customerId assignedTechnicianId publicJobReference createdAt updatedAt',
        )
        .lean(),
    ]);
    return { items: jobs, meta: paginationMeta(total, page, limit) };
  },

  async nearby(technicianUserId: string, req: Request) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId })
      .select(
        'location primaryCategoryId skills freeJobsUsed freeJobsLimit remainingFreeJobs accountLocked verificationStatus isAvailableNow',
      )
      .lean();
    if (!profile) throw AppError.notFound('Technician profile not found');

    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = { status: JOB_STATUS.POSTED };

    if (typeof req.query.district === 'string') {
      filter['location.district'] = req.query.district;
    } else if (profile.location?.district) {
      filter['location.district'] = profile.location.district;
    }
    if (typeof req.query.categoryId === 'string') {
      filter.categoryId = req.query.categoryId;
    } else if (profile.primaryCategoryId) {
      filter.categoryId = profile.primaryCategoryId;
    }

    const actorEnv = await resolveUserDataEnvironment(technicianUserId);
    applyDataEnvironment(filter, actorEnv);
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      filter.$text = { $search: req.query.q.trim() };
    }

    const recommendationSettings = await getRecommendationSettings();
    const lng = req.query.lng ? Number(req.query.lng) : profile.location?.geo?.coordinates?.[0];
    const lat = req.query.lat ? Number(req.query.lat) : profile.location?.geo?.coordinates?.[1];
    const maxDistanceKm =
      req.query.radiusKm != null
        ? Number(req.query.radiusKm)
        : recommendationSettings.maxSearchRadiusKm;
    const maxDistance = (Number.isFinite(maxDistanceKm) ? maxDistanceKm : 50) * 1000;

    const listSelect =
      'title description status categoryId categoryName subcategoryName location geo budgetMin budgetMax preferredDate photos customerId createdAt urgent applicationCount';

    // Fetch a wider candidate pool then rank in-memory (distance alone must not dominate).
    const candidateLimit = Math.min(200, Math.max(limit * 4, 40));
    let candidates: Array<Record<string, unknown>> = [];
    if (typeof lng === 'number' && typeof lat === 'number' && !Number.isNaN(lng) && !Number.isNaN(lat)) {
      candidates = (await Job.find({
        ...filter,
        geo: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: maxDistance,
          },
        },
      })
        .select(listSelect)
        .limit(candidateLimit)
        .lean()) as unknown as Array<Record<string, unknown>>;
    } else {
      candidates = (await Job.find(filter)
        .select(listSelect)
        .sort({ createdAt: -1 })
        .limit(candidateLimit)
        .lean()) as unknown as Array<Record<string, unknown>>;
    }

    const activeWorkload = await Job.countDocuments({
      assignedTechnicianId: technicianUserId,
      status: {
        $in: [
          JOB_STATUS.ASSIGNED,
          JOB_STATUS.TECHNICIAN_EN_ROUTE,
          JOB_STATUS.IN_PROGRESS,
          JOB_STATUS.AWAITING_CONFIRMATION,
        ],
      },
    });

    const origin =
      typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? { lat, lng }
        : null;

    const scored = candidates.map((job) => {
      const ranked = recommendationSettings.enabled
        ? scoreJobForTechnician(
            {
              categoryId: job.categoryId ? String(job.categoryId) : null,
              location: job.location,
              geo: job.geo,
              budgetMin: Number(job.budgetMin) || undefined,
              budgetMax: Number(job.budgetMax) || undefined,
              urgent: Boolean(job.urgent),
              createdAt: job.createdAt as string | Date | undefined,
              preferredDate: job.preferredDate as string | Date | undefined,
              title: String(job.title || ''),
            },
            {
              primaryCategoryId: profile.primaryCategoryId
                ? String(profile.primaryCategoryId)
                : null,
              skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
              location: profile.location,
              isAvailableNow: Boolean(profile.isAvailableNow),
              activeWorkload,
              preferredRadiusKm: maxDistanceKm,
            },
            { settings: recommendationSettings, origin },
          )
        : null;

      return {
        job,
        matchScore: ranked?.score ?? 50,
        distanceKm: ranked?.distanceKm ?? null,
        etaMinutes: ranked?.etaMinutes ?? null,
        etaLabel: ranked?.etaLabel ?? null,
        matchReasons: ranked?.matchReasons ?? ['Nearby job'],
        bestMatch: false,
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);
    if (scored[0]) scored[0].bestMatch = true;

    const total = scored.length;
    const pageSlice = scored.slice(skip, skip + limit);

    return {
      items: pageSlice.map(({ job, matchScore, distanceKm, etaMinutes, etaLabel, matchReasons, bestMatch }) => ({
        ...job,
        matchScore,
        successScore: Math.round(matchScore),
        distanceKm,
        etaMinutes,
        etaLabel,
        matchReasons,
        bestMatch,
      })),
      meta: {
        ...paginationMeta(total, page, limit),
        recommendationEngine: recommendationSettings.enabled,
        originUsed: Boolean(origin),
        maxSearchRadiusKm: maxDistanceKm,
      },
      canApply: canViewCustomerContact({
        accountLocked: Boolean(profile.accountLocked),
        remainingFreeJobs: Number(profile.remainingFreeJobs ?? 0),
      }),
    };
  },

  async transitionStatus(
    actor: { userId: string; role: string },
    jobId: string,
    toStatus: JobStatus,
    note?: string,
    meta: Meta = {},
  ) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');

    const from = job.status as JobStatus;
    assertJobTransition(from, toStatus);

    const isCustomer = job.customerId.toString() === actor.userId;
    const isTech = job.assignedTechnicianId?.toString() === actor.userId;
    const isAdmin = actor.role === 'admin';

    if (toStatus === JOB_STATUS.CANCELLED && !isCustomer && !isAdmin && !isTech) {
      throw AppError.forbidden();
    }
    if (
      (
        [
          JOB_STATUS.TECHNICIAN_EN_ROUTE,
          JOB_STATUS.IN_PROGRESS,
          JOB_STATUS.AWAITING_CONFIRMATION,
        ] as string[]
      ).includes(toStatus) &&
      !isTech &&
      !isAdmin
    ) {
      throw AppError.forbidden('Only the assigned technician can update this status');
    }
    if (toStatus === JOB_STATUS.COMPLETED && !isCustomer && !isAdmin) {
      throw AppError.forbidden('Only the customer can confirm completion');
    }

    pushStatus(job, toStatus, actor.userId, note);

    if (toStatus === JOB_STATUS.TECHNICIAN_EN_ROUTE) job.assignedAt = job.assignedAt ?? new Date();
    if (toStatus === JOB_STATUS.IN_PROGRESS) job.startedAt = new Date();
    if (toStatus === JOB_STATUS.COMPLETED) {
      job.completedAt = new Date();
      if (job.assignedTechnicianId) {
        const { consumeFreeJobSlotForCompletion } = await import('./freeJob.service.js');
        await consumeFreeJobSlotForCompletion({
          jobId: job._id.toString(),
          technicianUserId: job.assignedTechnicianId.toString(),
          actorId: actor.userId,
        });
        await recomputeTrustForTechnician(job.assignedTechnicianId.toString());
        await Assignment.updateOne(
          { jobId: job._id },
          { $set: { status: ASSIGNMENT_STATUS.COMPLETED, completedAt: new Date() } },
        );
        await CustomerProfile.updateOne(
          { userId: job.customerId },
          { $inc: { 'jobStats.completed': 1 } },
        );
        await createDbNotification({
          userId: job.assignedTechnicianId.toString(),
          type: 'job.completed',
          title: 'Job completed',
          body: `Job "${job.title}" was marked completed.`,
          jobId: job._id.toString(),
        });
        await createDbNotification({
          userId: job.customerId.toString(),
          type: 'job.completed',
          title: 'Job completed',
          body: `Your job "${job.title}" was marked completed.`,
          jobId: job._id.toString(),
        });
        try {
          await lockConversationForJob(job._id.toString(), 'Job completed. This conversation is now read-only.');
        } catch {
          // Messaging side-effect must not fail job completion.
        }
        try {
          const { referralService } = await import('../referral/referral.service.js');
          await referralService.recordMilestone(job.assignedTechnicianId.toString(), 'first_paid_job');
          const techProfile = await TechnicianProfile.findOne({ userId: job.assignedTechnicianId }).select(
            'jobsCompleted freeJobsUsed',
          );
          const completedJobs = Number(techProfile?.jobsCompleted ?? techProfile?.freeJobsUsed ?? 0);
          if (completedJobs >= 5) {
            await referralService.recordMilestone(job.assignedTechnicianId.toString(), 'first_five_jobs');
          }
          await referralService.recordMilestone(job.customerId.toString(), 'first_booking');
          await referralService.recordMilestone(job.customerId.toString(), 'first_payment');
        } catch {
          // Referral rewards must not fail job completion.
        }
        try {
          const { escrowService } = await import('../payments/payment.service.js');
          await escrowService.releaseForJob(
            job._id.toString(),
            { userId: actor.userId, role: actor.role },
            meta,
          );
        } catch {
          // Escrow release side-effect must not fail job completion.
        }
      }
    }
    if (toStatus === JOB_STATUS.CANCELLED) {
      job.cancelledAt = new Date();
      job.cancelReason = note;
      await Assignment.updateOne(
        { jobId: job._id, status: ASSIGNMENT_STATUS.ACTIVE },
        { $set: { status: ASSIGNMENT_STATUS.CANCELLED, cancelledAt: new Date() } },
      );
      await CustomerProfile.updateOne(
        { userId: job.customerId },
        { $inc: { 'jobStats.cancelled': 1 } },
      );
      await createDbNotification({
        userId: job.customerId.toString(),
        type: 'job.cancelled',
        title: 'Job cancelled',
        body: `Job "${job.title}" was cancelled.`,
        jobId: job._id.toString(),
      });
      if (job.assignedTechnicianId) {
        await createDbNotification({
          userId: job.assignedTechnicianId.toString(),
          type: 'job.cancelled',
          title: 'Job cancelled',
          body: `Job "${job.title}" was cancelled.`,
          jobId: job._id.toString(),
        });
      }
    }
    if (toStatus === JOB_STATUS.ARCHIVED) job.archivedAt = new Date();
    if (toStatus === JOB_STATUS.DISPUTED) job.disputeReason = note;

    await job.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'job.status_change',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: { from, to: toStatus, note },
    });

    if (job.assignedTechnicianId && toStatus !== JOB_STATUS.COMPLETED && toStatus !== JOB_STATUS.CANCELLED) {
      const statusType =
        toStatus === JOB_STATUS.TECHNICIAN_EN_ROUTE
          ? 'job.technician_en_route'
          : toStatus === JOB_STATUS.IN_PROGRESS
            ? 'job.in_progress'
            : 'job.status';
      await createDbNotification({
        userId: job.assignedTechnicianId.toString(),
        type: statusType,
        title: 'Job status updated',
        body: `Job "${job.title}" is now ${toStatus}.`,
        jobId: job._id.toString(),
      });
    }
    if (!isCustomer && toStatus !== JOB_STATUS.COMPLETED && toStatus !== JOB_STATUS.CANCELLED) {
      const statusType =
        toStatus === JOB_STATUS.TECHNICIAN_EN_ROUTE
          ? 'job.technician_en_route'
          : toStatus === JOB_STATUS.IN_PROGRESS
            ? 'job.in_progress'
            : 'job.status';
      await createDbNotification({
        userId: job.customerId.toString(),
        type: statusType,
        title: 'Job status updated',
        body: `Your job "${job.title}" is now ${toStatus}.`,
        jobId: job._id.toString(),
      });
    }

    emitJobStatusChanged(job, from, toStatus);

    // Live tracking lifecycle hooks (reuse LiveTrackingSession; non-fatal).
    try {
      const { trackingService } = await import('../tracking/tracking.service.js');
      if (toStatus === JOB_STATUS.TECHNICIAN_EN_ROUTE && job.assignedTechnicianId) {
        await trackingService.startForJob(jobId, actor, meta);
      }
      if (toStatus === JOB_STATUS.IN_PROGRESS) {
        await trackingService.markArrived(jobId, actor).catch(async () => {
          await trackingService.stopForJob(jobId, actor, 'work_started');
        });
      }
      if (toStatus === JOB_STATUS.COMPLETED) {
        await trackingService.stopForJob(jobId, actor, 'completed');
      }
      if (toStatus === JOB_STATUS.CANCELLED) {
        await trackingService.stopForJob(jobId, actor, 'cancelled');
      }
    } catch {
      // Tracking side-effect must not fail status transitions.
    }

    return { job };
  },

  async cancel(customerId: string, jobId: string, reason?: string, meta: Meta = {}) {
    return this.transitionStatus(
      { userId: customerId, role: 'customer' },
      jobId,
      JOB_STATUS.CANCELLED,
      reason,
      meta,
    );
  },

  async archive(customerId: string, jobId: string, meta: Meta = {}) {
    return this.transitionStatus(
      { userId: customerId, role: 'customer' },
      jobId,
      JOB_STATUS.ARCHIVED,
      'Archived by customer',
      meta,
    );
  },
};

export const applicationMarketplaceService = {
  async apply(
    technicianUserId: string,
    jobId: string,
    input: { message?: string; proposedAmount?: number; estimatedHours?: number; availableFrom?: string },
    meta: Meta = {},
  ) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) throw AppError.notFound('Technician profile not found');
    assertCanApplyToJobs(profile);
    const { assertProfileCompleteEnoughToApply } = await import('./profileCompletion.service.js');
    await assertProfileCompleteEnoughToApply(technicianUserId);

    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    const [techEnv, jobEnv] = await Promise.all([
      resolveUserDataEnvironment(technicianUserId),
      resolveUserDataEnvironment(job.customerId.toString()),
    ]);
    assertSameDataEnvironment(
      techEnv,
      documentDataEnvironment(job) !== 'production' ? documentDataEnvironment(job) : jobEnv,
      'Sandbox technicians cannot apply to production jobs (and vice versa).',
    );
    if (job.status !== JOB_STATUS.POSTED) {
      throw AppError.badRequest('Applications are only accepted for posted jobs');
    }

    const existing = await JobApplication.findOne({ jobId, technicianId: technicianUserId });
    if (existing && existing.status !== APPLICATION_STATUS.WITHDRAWN) {
      throw AppError.conflict('You already applied to this job');
    }

    const recommendationSettings = await getRecommendationSettings();
    const jobOrigin = job.geo?.coordinates
      ? { lng: job.geo.coordinates[0], lat: job.geo.coordinates[1] }
      : null;
    const ranked = recommendationSettings.enabled
      ? scoreTechnician(
          {
            userId: technicianUserId,
            trustScore: profile.trustScore,
            ratingAverage: profile.ratingAverage,
            reviewCount: profile.reviewCount,
            jobsCompleted: profile.jobsCompleted,
            jobsCancelled: profile.jobsCancelled,
            responseScore: profile.responseScore,
            punctualityScore: profile.punctualityScore,
            isAvailableNow: profile.isAvailableNow,
            verificationStatus: profile.verificationStatus,
            identityVerified: profile.identityVerified,
            skillVerified: profile.skillVerified,
            primaryCategoryId: profile.primaryCategoryId?.toString?.() || null,
            location: profile.location,
          },
          {
            origin: jobOrigin,
            categoryId: job.categoryId?.toString?.() || null,
            settings: recommendationSettings,
          },
        )
      : null;
    const matchScore = ranked
      ? Math.min(100, Math.round(ranked.score))
      : Math.min(
          100,
          Math.round(
            profile.trustScore * 0.5 +
              (profile.primaryCategoryId && job.categoryId?.equals(profile.primaryCategoryId) ? 30 : 10) +
              Math.min(profile.jobsCompleted, 20),
          ),
        );

    const application = existing
      ? Object.assign(existing, {
          message: input.message,
          proposedAmount: input.proposedAmount,
          estimatedHours: input.estimatedHours,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
          status: APPLICATION_STATUS.PENDING,
          matchScore,
          trustSnapshot: {
            trust: profile.trustScore,
            ratingAverage: profile.ratingAverage,
            jobsCompleted: profile.jobsCompleted,
          },
          withdrawnAt: undefined,
        })
      : await JobApplication.create({
          jobId,
          technicianId: technicianUserId,
          technicianProfileId: profile._id,
          message: input.message,
          proposedAmount: input.proposedAmount,
          estimatedHours: input.estimatedHours,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
          status: APPLICATION_STATUS.PENDING,
          source: 'open_apply',
          matchScore,
          trustSnapshot: {
            trust: profile.trustScore,
            ratingAverage: profile.ratingAverage,
            jobsCompleted: profile.jobsCompleted,
          },
        });

    if (existing) await application.save();

    job.applicationCount = await JobApplication.countDocuments({
      jobId,
      status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.SHORTLISTED, APPLICATION_STATUS.ACCEPTED] },
    });
    await job.save();
    await bumpResponseScore(technicianUserId, 2);

    await createDbNotification({
      userId: job.customerId.toString(),
      type: 'application.received',
      title: 'New job application',
      body: `A technician applied to "${job.title}".`,
      jobId: job._id.toString(),
    });

    await writeAuditLog({
      actorId: technicianUserId,
      actorRole: 'technician',
      action: 'application.apply',
      resourceType: 'JobApplication',
      resourceId: application._id.toString(),
      ip: meta.ip,
      meta: { jobId },
    });

    emitApplicationSubmitted(application, job);
    return { application };
  },

  async listForJob(jobId: string, viewer: { userId: string; role: string }, req: Request) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (viewer.role !== 'admin' && job.customerId.toString() !== viewer.userId) {
      throw AppError.forbidden();
    }

    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = {
      jobId,
      status: { $ne: APPLICATION_STATUS.WITHDRAWN },
    };
    const sort = parseSort(
      typeof req.query.sort === 'string' ? req.query.sort : '-matchScore',
      ['matchScore', 'createdAt', 'proposedAmount'],
      { matchScore: -1, createdAt: -1 },
    );

    const [total, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    const techIds = applications.map((a) => a.technicianId);
    const [users, profiles] = await Promise.all([
      User.find({ _id: { $in: techIds } }).select('fullName').lean(),
      TechnicianProfile.find({ userId: { $in: techIds } })
        .select(
          'photoUrl trustScore ratingAverage jobsCompleted headline verificationStatus currentRank experienceLevel subscriptionPlanCode subscriptionStatus subscriptionPeriodEnd monetizationSuspended',
        )
        .lean(),
    ]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));
    const { resolvePublicBadgesForProfiles } = await import('./publicSubscriptionBadge.js');
    const badgeMap = await resolvePublicBadgesForProfiles(profiles as never[], 'card');

    return {
      items: applications.map((a) => {
        const tid = a.technicianId.toString();
        const profile = profileMap.get(tid);
        return {
          application: a,
          technician: {
            id: tid,
            fullName: userMap.get(tid)?.fullName,
            trustScore: profile?.trustScore,
            ratingAverage: profile?.ratingAverage,
            jobsCompleted: profile?.jobsCompleted,
            experienceLevel: profile?.experienceLevel,
            currentRank: profile?.currentRank,
            verificationStatus: profile?.verificationStatus,
            subscriptionBadge: badgeMap.get(tid) || null,
          },
        };
      }),
      meta: paginationMeta(total, page, limit),
      comparison: applications
        .map((a) => ({
          applicationId: a._id.toString(),
          technicianId: a.technicianId.toString(),
          matchScore: a.matchScore ?? 0,
          proposedAmount: a.proposedAmount ?? null,
          trust: a.trustSnapshot?.trust ?? 0,
          ratingAverage: a.trustSnapshot?.ratingAverage ?? 0,
          jobsCompleted: a.trustSnapshot?.jobsCompleted ?? 0,
          createdAt: a.createdAt,
        }))
        .sort((x, y) => (y.matchScore ?? 0) - (x.matchScore ?? 0)),
    };
  },

  async listMine(technicianUserId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = { technicianId: technicianUserId };
    if (typeof req.query.status === 'string') filter.status = req.query.status;
    const [total, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    const jobs = await Job.find({ _id: { $in: applications.map((a) => a.jobId) } })
      .select(
        'title description status categoryName location budgetMin budgetMax preferredDate photos customerId assignedTechnicianId createdAt',
      )
      .lean();
    const jobMap = new Map(jobs.map((j) => [j._id.toString(), j]));
    return {
      items: applications.map((a) => ({ application: a, job: jobMap.get(a.jobId.toString()) ?? null })),
      meta: paginationMeta(total, page, limit),
    };
  },

  async withdraw(technicianUserId: string, applicationId: string, meta: Meta = {}) {
    const application = await JobApplication.findOne({ _id: applicationId, technicianId: technicianUserId });
    if (!application) throw AppError.notFound('Application not found');
    if (application.status === APPLICATION_STATUS.ACCEPTED) {
      throw AppError.badRequest('Cannot withdraw an accepted application');
    }
    application.status = APPLICATION_STATUS.WITHDRAWN;
    application.withdrawnAt = new Date();
    await application.save();
    await Job.updateOne({ _id: application.jobId }, { $inc: { applicationCount: -1 } });
    await writeAuditLog({
      actorId: technicianUserId,
      actorRole: 'technician',
      action: 'application.withdraw',
      resourceType: 'JobApplication',
      resourceId: applicationId,
      ip: meta.ip,
    });
    const jobForEmit = await Job.findById(application.jobId).select('customerId');
    emitApplicationWithdrawn(
      application,
      application.jobId.toString(),
      jobForEmit?.customerId?.toString(),
    );
    return { application };
  },

  async accept(customerId: string, applicationId: string, meta: Meta = {}) {
    const application = await JobApplication.findById(applicationId);
    if (!application) throw AppError.notFound('Application not found');

    const job = await Job.findById(application.jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (job.customerId.toString() !== customerId) throw AppError.forbidden();
    if (job.status !== JOB_STATUS.POSTED) throw AppError.badRequest('Job is not open for assignment');

    const techProfile = await TechnicianProfile.findOne({ userId: application.technicianId });
    if (!techProfile) throw AppError.notFound('Technician profile not found');
    assertCanApplyToJobs(techProfile);

    application.status = APPLICATION_STATUS.ACCEPTED;
    application.respondedAt = new Date();
    await application.save();

    await JobApplication.updateMany(
      {
        jobId: job._id,
        _id: { $ne: application._id },
        status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.SHORTLISTED] },
      },
      { $set: { status: APPLICATION_STATUS.REJECTED, respondedAt: new Date() } },
    );

    assertJobTransition(job.status as JobStatus, JOB_STATUS.ASSIGNED);
    pushStatus(job, JOB_STATUS.ASSIGNED, customerId, 'Technician selected');
    job.assignedTechnicianId = application.technicianId;
    job.assignedTechnicianProfileId = techProfile._id;
    job.assignedAt = new Date();

    const assignment = await Assignment.create({
      jobId: job._id,
      customerId: job.customerId,
      technicianId: application.technicianId,
      applicationId: application._id,
      status: ASSIGNMENT_STATUS.ACTIVE,
      agreedAmount: application.proposedAmount,
      currency: application.currency,
      assignedAt: new Date(),
    });
    job.assignmentId = assignment._id;
    await job.save();

    await createDbNotification({
      userId: application.technicianId.toString(),
      type: 'application.accepted',
      title: 'You were assigned a job',
      body: `You were selected for "${job.title}".`,
      jobId: job._id.toString(),
    });

    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: 'application.accept',
      resourceType: 'Assignment',
      resourceId: assignment._id.toString(),
      ip: meta.ip,
      meta: { jobId: job._id.toString(), technicianId: application.technicianId.toString() },
    });

    emitTechnicianAssigned(job, application, assignment);
    try {
      await ensureJobConversation(job._id.toString());
      await postSystemMessage(job._id.toString(), 'Technician assigned. You can message each other here.');
    } catch {
      // Messaging side-effect must not fail assignment.
    }
    return { job, application, assignment };
  },

  async reject(customerId: string, applicationId: string, meta: Meta = {}) {
    const application = await JobApplication.findById(applicationId);
    if (!application) throw AppError.notFound('Application not found');
    const job = await Job.findById(application.jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (job.customerId.toString() !== customerId) throw AppError.forbidden();
    application.status = APPLICATION_STATUS.REJECTED;
    application.respondedAt = new Date();
    await application.save();
    await createDbNotification({
      userId: application.technicianId.toString(),
      type: 'application.rejected',
      title: 'Application update',
      body: `Your application for "${job.title}" was not selected.`,
      jobId: job._id.toString(),
    });
    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: 'application.reject',
      resourceType: 'JobApplication',
      resourceId: applicationId,
      ip: meta.ip,
    });
    emitApplicationRejected(application, job);
    return { application };
  },

  /**
   * Customer invites one or more technicians to a posted job (direct-hire / Book Now).
   * Seeds PENDING applications with source=invite and updates recommendedTechnicianIds.
   * Accept path reuses applicationMarketplaceService.accept.
   */
  async invite(
    customerId: string,
    jobId: string,
    input: { technicianIds: string[]; message?: string },
    meta: Meta = {},
  ) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (job.customerId.toString() !== customerId) throw AppError.forbidden();
    if (job.status !== JOB_STATUS.POSTED && job.status !== JOB_STATUS.DRAFT) {
      throw AppError.badRequest('Invites are only allowed for draft or posted jobs');
    }

    const uniqueIds = [...new Set((input.technicianIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!uniqueIds.length) throw AppError.badRequest('At least one technicianId is required');
    if (uniqueIds.length > 20) throw AppError.badRequest('Invite at most 20 technicians at a time');

    const techs = await TechnicianProfile.find({ userId: { $in: uniqueIds } }).select(
      'userId trustScore ratingAverage jobsCompleted accountStatus',
    );
    if (techs.length !== uniqueIds.length) {
      throw AppError.badRequest('One or more technicians were not found');
    }

    const jobEnv = documentDataEnvironment(job) !== 'production'
      ? documentDataEnvironment(job)
      : await resolveUserDataEnvironment(customerId);

    const inviteMessage =
      input.message?.trim() ||
      `You've been invited to "${job.title}". Respond from your applications list.`;
    const invited: string[] = [];
    const skipped: Array<{ technicianId: string; reason: string }> = [];

    for (const profile of techs) {
      const technicianUserId = profile.userId.toString();
      try {
        const techEnv = await resolveUserDataEnvironment(technicianUserId);
        assertSameDataEnvironment(
          techEnv,
          jobEnv,
          'Sandbox technicians cannot be invited to production jobs (and vice versa).',
        );
        assertCanApplyToJobs(profile);

        const existing = await JobApplication.findOne({ jobId, technicianId: technicianUserId });
        if (existing && existing.status === APPLICATION_STATUS.ACCEPTED) {
          skipped.push({ technicianId: technicianUserId, reason: 'already_accepted' });
          continue;
        }
        if (
          existing &&
          existing.status !== APPLICATION_STATUS.WITHDRAWN &&
          existing.status !== APPLICATION_STATUS.REJECTED &&
          existing.status !== APPLICATION_STATUS.EXPIRED
        ) {
          // Refresh invite metadata on an existing pending/shortlisted application
          existing.source = 'invite';
          existing.invitedAt = new Date();
          if (input.message?.trim()) existing.message = inviteMessage;
          await existing.save();
          invited.push(technicianUserId);
        } else if (existing) {
          Object.assign(existing, {
            message: inviteMessage,
            status: APPLICATION_STATUS.PENDING,
            source: 'invite',
            invitedAt: new Date(),
            withdrawnAt: undefined,
            respondedAt: undefined,
            trustSnapshot: {
              trust: profile.trustScore,
              ratingAverage: profile.ratingAverage,
              jobsCompleted: profile.jobsCompleted,
            },
          });
          await existing.save();
          invited.push(technicianUserId);
        } else {
          await JobApplication.create({
            jobId,
            technicianId: technicianUserId,
            technicianProfileId: profile._id,
            message: inviteMessage,
            status: APPLICATION_STATUS.PENDING,
            source: 'invite',
            invitedAt: new Date(),
            trustSnapshot: {
              trust: profile.trustScore,
              ratingAverage: profile.ratingAverage,
              jobsCompleted: profile.jobsCompleted,
            },
          });
          invited.push(technicianUserId);
        }

        await Job.updateOne(
          { _id: jobId },
          { $addToSet: { recommendedTechnicianIds: profile.userId } },
        );

        await createDbNotification({
          userId: technicianUserId,
          type: 'job.invite',
          title: 'Job invitation',
          body: inviteMessage,
          jobId: job._id.toString(),
          href: `/technician/jobs/${job._id.toString()}`,
          meta: { source: 'invite' },
        });
      } catch (err) {
        skipped.push({
          technicianId: technicianUserId,
          reason: err instanceof AppError ? err.message : 'invite_failed',
        });
      }
    }

    job.applicationCount = await JobApplication.countDocuments({
      jobId,
      status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.SHORTLISTED, APPLICATION_STATUS.ACCEPTED] },
    });
    await job.save();

    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: 'job.invite',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: { invited, skipped },
    });

    return {
      jobId,
      invited,
      skipped,
      applicationCount: job.applicationCount,
    };
  },
};
