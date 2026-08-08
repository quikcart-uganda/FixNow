import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  Job,
  PeerReview,
  Rating,
  Reputation,
  Review,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import { JOB_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { createDbNotification } from '../../utils/notify.js';
import { paginationMeta, parsePagination } from '../../utils/pagination.js';
import { recomputeTrustForTechnician } from '../marketplace/trust.service.js';
import {
  emitReputationUpdated,
  emitReviewEdited,
  emitReviewSubmitted,
} from '../../sockets/realtime.js';
import {
  assertDocumentVisibleToViewer,
  documentDataEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';
import {
  ensureBadgeCatalog,
  grantBadgeByKey,
  notifyBadgeEarned,
  syncAchievementsForTechnician,
} from './badges.js';
import {
  REVIEW_EDIT_WINDOW_MS,
  average,
  clampScore,
  distribution,
  rateFromCounts,
  ratingPoints,
  reputationLevel,
} from './reputation.math.js';

type ReviewInput = {
  jobId: string;
  rating: number;
  comment?: string;
  categories?: {
    quality?: number;
    professionalism?: number;
    communication?: number;
    timeliness?: number;
    valueForMoney?: number;
  };
};

async function assertCompletedJob(jobId: string) {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== JOB_STATUS.COMPLETED) {
    throw AppError.badRequest('Only completed jobs can be reviewed');
  }
  if (!job.assignedTechnicianId) {
    throw AppError.badRequest('Job has no assigned technician');
  }
  return job;
}

async function upsertReputation(
  userId: string,
  role: 'customer' | 'technician',
  overall: number,
): Promise<InstanceType<typeof Reputation>> {
  const existing = await Reputation.findOne({ userId, role });
  const nextScore = clampScore((existing?.score ?? 100) + ratingPoints(overall));
  const positive = (existing?.positiveEvents ?? 0) + (overall >= 4 ? 1 : 0);
  const negative = (existing?.negativeEvents ?? 0) + (overall <= 2 ? 1 : 0);
  const doc = await Reputation.findOneAndUpdate(
    { userId, role },
    {
      $set: {
        score: nextScore,
        level: reputationLevel(nextScore),
        positiveEvents: positive,
        negativeEvents: negative,
        lastEventAt: new Date(),
      },
      $setOnInsert: { userId, role },
    },
    { upsert: true, new: true },
  );
  emitReputationUpdated(userId, role, {
    score: doc!.score,
    level: doc!.level,
    positiveEvents: doc!.positiveEvents,
    negativeEvents: doc!.negativeEvents,
  });
  return doc!;
}

async function recomputeTechnicianRatings(technicianId: string) {
  const reviews = await Review.find({
    technicianId,
    isPublic: true,
    isDeleted: { $ne: true },
  }).select('overallRating');
  const ratings = reviews.map((r) => r.overallRating);
  const ratingAverage = average(ratings);
  const reviewCount = ratings.length;
  const dist = distribution(ratings);

  const profile = await TechnicianProfile.findOne({ userId: technicianId });
  if (profile) {
    profile.ratingAverage = ratingAverage;
    profile.reviewCount = reviewCount;
    await ensureBadgeCatalog();

    const newlyGranted: string[] = [];
    if (ratings.some((r) => r >= 5)) {
      const g = await grantBadgeByKey(technicianId, 'five_star', profile.badgeIds);
      if (g.granted && g.badge) {
        profile.badgeIds.push(g.badge._id);
        newlyGranted.push(g.badge.key);
        await notifyBadgeEarned(technicianId, g.badge);
      }
    }
    if (ratingAverage >= 4.5 && reviewCount >= 5) {
      const g = await grantBadgeByKey(technicianId, 'top_rated', profile.badgeIds);
      if (g.granted && g.badge) {
        profile.badgeIds.push(g.badge._id);
        newlyGranted.push(g.badge.key);
        await notifyBadgeEarned(technicianId, g.badge);
      }
    }
    if (reviewCount >= 25) {
      const g = await grantBadgeByKey(technicianId, 'community_favorite', profile.badgeIds);
      if (g.granted && g.badge) {
        profile.badgeIds.push(g.badge._id);
        newlyGranted.push(g.badge.key);
        await notifyBadgeEarned(technicianId, g.badge);
      }
    }

    await profile.save();
    await syncAchievementsForTechnician(technicianId, {
      jobsCompleted: profile.jobsCompleted,
      reviewCount,
    });
    // Existing trust algorithm unchanged — refresh badges/rank side-effects only.
    await recomputeTrustForTechnician(technicianId);
  }

  return { ratingAverage, reviewCount, distribution: dist };
}

function dim(value: number | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export const reviewService = {
  editWindowMs: REVIEW_EDIT_WINDOW_MS,

  async create(actor: { userId: string; role: string }, input: ReviewInput) {
    const job = await assertCompletedJob(input.jobId);
    const overall = Math.round(input.rating);
    if (overall < 1 || overall > 5) throw AppError.badRequest('Rating must be 1–5');

    const isCustomer = actor.role === ROLES.CUSTOMER && job.customerId.toString() === actor.userId;
    const isTech =
      actor.role === ROLES.TECHNICIAN && job.assignedTechnicianId!.toString() === actor.userId;

    if (!isCustomer && !isTech) throw AppError.forbidden('Not a participant on this job');

    if (isCustomer) {
      const existing = await Review.findOne({ jobId: job._id });
      if (existing) throw AppError.conflict('You already reviewed this job');

      const cats = input.categories ?? {};
      const rating = await Rating.create({
        jobId: job._id,
        customerId: job.customerId,
        technicianId: job.assignedTechnicianId,
        quality: dim(cats.quality, overall),
        professionalism: dim(cats.professionalism, overall),
        communication: dim(cats.communication, overall),
        timeliness: dim(cats.timeliness, overall),
        valueForMoney: cats.valueForMoney,
        overall,
      });

      const profile = await TechnicianProfile.findOne({ userId: job.assignedTechnicianId });
      const review = await Review.create({
        jobId: job._id,
        customerId: job.customerId,
        technicianId: job.assignedTechnicianId,
        technicianProfileId: profile?._id,
        ratingId: rating._id,
        overallRating: overall,
        comment: input.comment,
        isPublic: true,
        isFlagged: false,
      });
      rating.reviewId = review._id;
      await rating.save();

      const summary = await recomputeTechnicianRatings(job.assignedTechnicianId!.toString());
      await upsertReputation(job.assignedTechnicianId!.toString(), 'technician', overall);

      await createDbNotification({
        userId: job.assignedTechnicianId!.toString(),
        type: 'review.received',
        title: 'New review received',
        body: `You received a ${overall}-star review.`,
        jobId: job._id.toString(),
        data: { reviewId: review._id.toString() },
      });

      emitReviewSubmitted({
        reviewId: review._id.toString(),
        jobId: job._id.toString(),
        direction: 'customer_to_technician',
        revieweeId: job.assignedTechnicianId!.toString(),
        reviewerId: actor.userId,
        overallRating: overall,
      });

      return {
        review,
        rating,
        direction: 'customer_to_technician' as const,
        summary,
        editWindowMs: REVIEW_EDIT_WINDOW_MS,
      };
    }

    // Technician → customer
    const existingPeer = await PeerReview.findOne({ jobId: job._id, reviewerId: actor.userId });
    if (existingPeer) throw AppError.conflict('You already reviewed this customer for this job');

    const cats = input.categories ?? {};
    const peer = await PeerReview.create({
      jobId: job._id,
      reviewerId: actor.userId,
      revieweeId: job.customerId,
      direction: 'technician_to_customer',
      overallRating: overall,
      professionalism: cats.professionalism,
      communication: cats.communication,
      punctuality: cats.timeliness,
      comment: input.comment,
      isPublic: true,
      isFlagged: false,
    });

    await upsertReputation(job.customerId.toString(), 'customer', overall);

    await createDbNotification({
      userId: job.customerId.toString(),
      type: 'review.received',
      title: 'New review received',
      body: `A technician rated you ${overall} stars.`,
      jobId: job._id.toString(),
      data: { peerReviewId: peer._id.toString() },
    });

    emitReviewSubmitted({
      reviewId: peer._id.toString(),
      jobId: job._id.toString(),
      direction: 'technician_to_customer',
      revieweeId: job.customerId.toString(),
      reviewerId: actor.userId,
      overallRating: overall,
    });

    return {
      peerReview: peer,
      direction: 'technician_to_customer' as const,
      editWindowMs: REVIEW_EDIT_WINDOW_MS,
    };
  },

  async edit(
    actor: { userId: string; role: string },
    reviewId: string,
    input: { rating?: number; comment?: string; categories?: ReviewInput['categories'] },
  ) {
    const review = await Review.findById(reviewId);
    if (review && !review.isDeleted) {
      if (review.customerId.toString() !== actor.userId && actor.role !== ROLES.ADMIN) {
        throw AppError.forbidden();
      }
      if (actor.role !== ROLES.ADMIN) {
        const age = Date.now() - new Date(review.createdAt).getTime();
        if (age > REVIEW_EDIT_WINDOW_MS) throw AppError.forbidden('Edit window expired');
      }
      if (typeof input.rating === 'number') review.overallRating = Math.round(input.rating);
      if (input.comment !== undefined) review.comment = input.comment;
      await review.save();

      if (review.ratingId) {
        const rating = await Rating.findById(review.ratingId);
        if (rating) {
          if (typeof input.rating === 'number') rating.overall = Math.round(input.rating);
          const cats = input.categories ?? {};
          if (cats.quality) rating.quality = cats.quality;
          if (cats.professionalism) rating.professionalism = cats.professionalism;
          if (cats.communication) rating.communication = cats.communication;
          if (cats.timeliness) rating.timeliness = cats.timeliness;
          if (cats.valueForMoney) rating.valueForMoney = cats.valueForMoney;
          await rating.save();
        }
      }

      const summary = await recomputeTechnicianRatings(review.technicianId.toString());
      await createDbNotification({
        userId: review.technicianId.toString(),
        type: 'review.edited',
        title: 'Review updated',
        body: 'A customer updated their review of you.',
        jobId: review.jobId.toString(),
      });
      emitReviewEdited({
        reviewId: review._id.toString(),
        jobId: review.jobId.toString(),
        direction: 'customer_to_technician',
        revieweeId: review.technicianId.toString(),
      });
      return { review, summary, editWindowMs: REVIEW_EDIT_WINDOW_MS };
    }

    const peer = await PeerReview.findById(reviewId);
    if (!peer || peer.isDeleted) throw AppError.notFound('Review not found');
    if (peer.reviewerId.toString() !== actor.userId && actor.role !== ROLES.ADMIN) {
      throw AppError.forbidden();
    }
    if (actor.role !== ROLES.ADMIN) {
      const age = Date.now() - new Date(peer.createdAt).getTime();
      if (age > REVIEW_EDIT_WINDOW_MS) throw AppError.forbidden('Edit window expired');
    }
    if (typeof input.rating === 'number') peer.overallRating = Math.round(input.rating);
    if (input.comment !== undefined) peer.comment = input.comment;
    const cats = input.categories ?? {};
    if (cats.professionalism) peer.professionalism = cats.professionalism;
    if (cats.communication) peer.communication = cats.communication;
    if (cats.timeliness) peer.punctuality = cats.timeliness;
    peer.editedAt = new Date();
    await peer.save();

    await createDbNotification({
      userId: peer.revieweeId.toString(),
      type: 'review.edited',
      title: 'Review updated',
      body: 'A technician updated their review of you.',
      jobId: peer.jobId.toString(),
    });
    emitReviewEdited({
      reviewId: peer._id.toString(),
      jobId: peer.jobId.toString(),
      direction: 'technician_to_customer',
      revieweeId: peer.revieweeId.toString(),
    });
    return { peerReview: peer, editWindowMs: REVIEW_EDIT_WINDOW_MS };
  },

  async listForTechnician(technicianId: string, req: Request) {
    const viewerEnv = await resolveUserDataEnvironment(
      (req as { auth?: { userId?: string } }).auth?.userId,
    );
    const techUser = await User.findById(technicianId).select('dataEnvironment').lean();
    const techProfile = await TechnicianProfile.findOne({ userId: technicianId })
      .select('dataEnvironment')
      .lean();
    if (!techUser && !techProfile) throw AppError.notFound('Technician not found');
    const techEnv =
      documentDataEnvironment(techUser as { dataEnvironment?: unknown } | null) !== 'production'
        ? documentDataEnvironment(techUser as { dataEnvironment?: unknown } | null)
        : documentDataEnvironment(techProfile as { dataEnvironment?: unknown } | null);
    assertDocumentVisibleToViewer(viewerEnv, techEnv, 'Technician not found');

    const { page, limit, skip } = parsePagination(req);
    const filter = {
      technicianId,
      isPublic: true,
      isDeleted: { $ne: true },
    };
    const [total, reviews] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);
    const ratingIds = reviews.map((r) => r.ratingId).filter(Boolean);
    const ratings = ratingIds.length
      ? await Rating.find({ _id: { $in: ratingIds } })
      : [];
    const ratingMap = new Map(ratings.map((r) => [r._id.toString(), r]));
    const customerIds = reviews.map((r) => r.customerId);
    const users = await User.find({ _id: { $in: customerIds } }).select('fullName');
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const allPublic = await Review.find(filter).select('overallRating');
    const summary = {
      ratingAverage: average(allPublic.map((r) => r.overallRating)),
      reviewCount: allPublic.length,
      distribution: distribution(allPublic.map((r) => r.overallRating)),
    };

    return {
      items: reviews.map((r) => ({
        review: r,
        rating: r.ratingId ? ratingMap.get(r.ratingId.toString()) : undefined,
        customer: userMap.get(r.customerId.toString()),
      })),
      summary,
      meta: paginationMeta(total, page, limit),
    };
  },

  async listForJob(actor: { userId: string; role: string }, jobId: string) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    const isParty =
      actor.role === ROLES.ADMIN ||
      job.customerId.toString() === actor.userId ||
      job.assignedTechnicianId?.toString() === actor.userId;
    if (!isParty) throw AppError.forbidden();

    const [customerReview, peerReview] = await Promise.all([
      Review.findOne({ jobId, isDeleted: { $ne: true } }),
      PeerReview.findOne({ jobId, reviewerId: job.assignedTechnicianId, isDeleted: { $ne: true } }),
    ]);
    const rating = customerReview?.ratingId
      ? await Rating.findById(customerReview.ratingId)
      : null;

    return {
      jobId,
      customerToTechnician: customerReview
        ? { review: customerReview, rating, canEdit: customerReview.customerId.toString() === actor.userId }
        : null,
      technicianToCustomer: peerReview
        ? { review: peerReview, canEdit: peerReview.reviewerId.toString() === actor.userId }
        : null,
      editWindowMs: REVIEW_EDIT_WINDOW_MS,
      canCustomerReview:
        job.status === JOB_STATUS.COMPLETED &&
        job.customerId.toString() === actor.userId &&
        !customerReview,
      canTechnicianReview:
        job.status === JOB_STATUS.COMPLETED &&
        job.assignedTechnicianId?.toString() === actor.userId &&
        !peerReview,
    };
  },

  async flag(_actor: { userId: string }, reviewId: string, reason?: string) {
    const review = await Review.findById(reviewId);
    if (review) {
      review.isFlagged = true;
      await review.save();
      return { review, reason };
    }
    const peer = await PeerReview.findById(reviewId);
    if (!peer) throw AppError.notFound('Review not found');
    peer.isFlagged = true;
    await peer.save();
    return { peerReview: peer, reason };
  },

  async moderate(
    adminId: string,
    reviewId: string,
    action: 'approve' | 'hide' | 'remove',
  ) {
    const review = await Review.findById(reviewId);
    if (review) {
      if (action === 'approve') {
        review.isFlagged = false;
        review.isPublic = true;
        review.moderatedBy = new Types.ObjectId(adminId);
      } else if (action === 'hide') {
        review.isPublic = false;
        review.isFlagged = false;
        review.moderatedBy = new Types.ObjectId(adminId);
      } else {
        review.isDeleted = true;
        review.deletedAt = new Date();
        review.isPublic = false;
        review.moderatedBy = new Types.ObjectId(adminId);
      }
      await review.save();
      await recomputeTechnicianRatings(review.technicianId.toString());
      return { review, action };
    }

    const peer = await PeerReview.findById(reviewId);
    if (!peer) throw AppError.notFound('Review not found');
    if (action === 'approve') {
      peer.isFlagged = false;
      peer.isPublic = true;
      peer.moderatedBy = new Types.ObjectId(adminId);
    } else if (action === 'hide') {
      peer.isPublic = false;
      peer.isFlagged = false;
      peer.moderatedBy = new Types.ObjectId(adminId);
    } else {
      peer.isDeleted = true;
      peer.deletedAt = new Date();
      peer.isPublic = false;
      peer.moderatedBy = new Types.ObjectId(adminId);
    }
    await peer.save();
    return { peerReview: peer, action };
  },

  async adminList(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const flagged = req.query.flagged === 'true';
    const filter: Record<string, unknown> = {};
    if (flagged) filter.isFlagged = true;

    const [reviews, peers, totalReviews, totalPeers] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PeerReview.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Math.max(5, Math.floor(limit / 2))),
      Review.countDocuments(filter),
      PeerReview.countDocuments(filter),
    ]);

    return {
      items: [
        ...reviews.map((r) => ({ kind: 'customer_to_technician' as const, review: r })),
        ...peers.map((r) => ({ kind: 'technician_to_customer' as const, review: r })),
      ],
      meta: paginationMeta(totalReviews + totalPeers, page, limit),
      counts: { reviews: totalReviews, peerReviews: totalPeers, flagged: flagged ? totalReviews + totalPeers : undefined },
    };
  },

  async reputationSummary(userId: string, role: 'customer' | 'technician') {
    const reputation = await Reputation.findOne({ userId, role });
    if (role === 'technician') {
      const profile = await TechnicianProfile.findOne({ userId });
      const reviews = await Review.find({
        technicianId: userId,
        isPublic: true,
        isDeleted: { $ne: true },
      }).select('overallRating');
      const ratings = reviews.map((r) => r.overallRating);
      const completed = profile?.jobsCompleted ?? 0;
      const cancelled = profile?.jobsCancelled ?? 0;
      const badges = profile?.badgeIds?.length
        ? await import('../../models/index.js').then(({ Badge }) =>
            Badge.find({ _id: { $in: profile.badgeIds }, isActive: true }),
          )
        : [];

      return {
        reputation: reputation ?? { score: 100, level: 'new', positiveEvents: 0, negativeEvents: 0 },
        ratings: {
          average: average(ratings),
          total: ratings.length,
          distribution: distribution(ratings),
        },
        rates: {
          completionRate: rateFromCounts(completed, cancelled),
          cancellationRate: rateFromCounts(cancelled, completed),
          responseScore: profile?.responseScore ?? 0,
        },
        trust: {
          trust: profile?.trustScore ?? 0,
          reliability: profile?.reliabilityScore ?? 0,
          completion: profile?.completionScore ?? 0,
          response: profile?.responseScore ?? 0,
          punctuality: profile?.punctualityScore ?? 0,
          currentRank: profile?.currentRank,
        },
        badges,
      };
    }

    const peers = await PeerReview.find({
      revieweeId: userId,
      isPublic: true,
      isDeleted: { $ne: true },
    }).select('overallRating');
    const ratings = peers.map((r) => r.overallRating);
    return {
      reputation: reputation ?? { score: 100, level: 'new', positiveEvents: 0, negativeEvents: 0 },
      ratings: {
        average: average(ratings),
        total: ratings.length,
        distribution: distribution(ratings),
      },
    };
  },

  async analytics() {
    const [totalReviews, flagged, avgAgg, peerCount] = await Promise.all([
      Review.countDocuments({ isDeleted: { $ne: true } }),
      Review.countDocuments({ isFlagged: true, isDeleted: { $ne: true } }),
      Review.aggregate([
        { $match: { isDeleted: { $ne: true }, isPublic: true } },
        { $group: { _id: null, avg: { $avg: '$overallRating' }, count: { $sum: 1 } } },
      ]),
      PeerReview.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return {
      totalReviews,
      peerReviews: peerCount,
      flaggedReviews: flagged,
      averageRating: avgAgg[0]?.avg ? Math.round(avgAgg[0].avg * 10) / 10 : 0,
      publicReviews: avgAgg[0]?.count ?? 0,
    };
  },
};

export const achievementService = {
  async listCatalog() {
    await ensureBadgeCatalog();
    const [achievements, badges] = await Promise.all([
      import('../../models/index.js').then(({ Achievement }) => Achievement.find({ isActive: true })),
      import('../../models/index.js').then(({ Badge }) => Badge.find({ isActive: true })),
    ]);
    return { achievements, badges };
  },

  async listMine(userId: string) {
    await ensureBadgeCatalog();
    const { Achievement, UserAchievement, Badge, TechnicianProfile } = await import(
      '../../models/index.js'
    );
    const [mine, catalog, profile] = await Promise.all([
      UserAchievement.find({ userId }),
      Achievement.find({ isActive: true }),
      TechnicianProfile.findOne({ userId }),
    ]);
    const achMap = new Map(catalog.map((a) => [a._id.toString(), a]));
    const badges = profile?.badgeIds?.length
      ? await Badge.find({ _id: { $in: profile.badgeIds } })
      : [];
    return {
      items: mine.map((ua) => ({
        userAchievement: ua,
        achievement: achMap.get(ua.achievementId.toString()),
      })),
      badges,
    };
  },
};
