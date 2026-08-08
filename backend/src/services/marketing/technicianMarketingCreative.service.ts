/**
 * Technician marketing creatives — slides, banners, announcements, campaigns.
 * Reuses admin approval pattern from offers. Never auto-publishes.
 */
import {
  TechnicianMarketingCreative,
  TechnicianOffer,
  User,
  type MarketingCreativeKind,
  type MarketingCreativeStatus,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { assertCreativeAllowed, resolveEntitlements, slideLimitFor } from '../marketplace/entitlements.service.js';
import { OFFER_STATUS } from '../../models/shared/enums.js';
import { applyDataEnvironment, resolveUserDataEnvironment } from '../sandbox/dataEnvironment.js';

function serialize(doc: {
  _id: { toString(): string };
  technicianUserId: { toString(): string };
  kind: string;
  title: string;
  headline?: string;
  description?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  promotionText?: string;
  sortOrder: number;
  startsAt?: Date;
  endsAt?: Date;
  status: string;
  rejectionReason?: string;
  adminNote?: string;
  submittedAt?: Date;
  publishedAt?: Date;
  reviewedAt?: Date;
  analytics?: { views: number; clicks: number };
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: doc._id.toString(),
    technicianUserId: doc.technicianUserId.toString(),
    kind: doc.kind,
    title: doc.title,
    headline: doc.headline,
    description: doc.description,
    imageUrl: doc.imageUrl,
    ctaLabel: doc.ctaLabel,
    ctaHref: doc.ctaHref,
    promotionText: doc.promotionText,
    sortOrder: doc.sortOrder,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    status: doc.status,
    rejectionReason: doc.rejectionReason,
    adminNote: doc.adminNote,
    submittedAt: doc.submittedAt,
    publishedAt: doc.publishedAt,
    reviewedAt: doc.reviewedAt,
    analytics: doc.analytics || { views: 0, clicks: 0 },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isLive(status: string, startsAt?: Date | null, endsAt?: Date | null): boolean {
  if (status !== 'approved') return false;
  const now = Date.now();
  if (startsAt && startsAt.getTime() > now) return false;
  if (endsAt && endsAt.getTime() < now) return false;
  return true;
}

async function countActiveKind(userId: string, kind: MarketingCreativeKind): Promise<number> {
  return TechnicianMarketingCreative.countDocuments({
    technicianUserId: userId,
    kind,
    status: { $in: ['pending', 'approved', 'draft', 'changes_requested'] },
  });
}

export const technicianMarketingCreativeService = {
  serialize,

  async listMine(userId: string, kind?: MarketingCreativeKind) {
    const filter: Record<string, unknown> = { technicianUserId: userId };
    if (kind) filter.kind = kind;
    const items = await TechnicianMarketingCreative.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    const entitlements = await resolveEntitlements(userId);
    return {
      items: items.map(serialize),
      entitlements: {
        planCode: entitlements.planCode,
        limits: entitlements.limits,
        featureFlags: {
          advertisingSlides: entitlements.featureFlags.advertisingSlides,
          promotionalBanner: entitlements.featureFlags.promotionalBanner,
          advertisingBanner: entitlements.featureFlags.advertisingBanner,
          promotionalAnnouncements: entitlements.featureFlags.promotionalAnnouncements,
          portfolioCampaigns: entitlements.featureFlags.portfolioCampaigns,
          basicOffers: entitlements.featureFlags.basicOffers,
        },
      },
    };
  },

  async create(
    userId: string,
    input: {
      kind: MarketingCreativeKind;
      title: string;
      headline?: string;
      description?: string;
      imageUrl?: string;
      ctaLabel?: string;
      ctaHref?: string;
      promotionText?: string;
      sortOrder?: number;
      startsAt?: string;
      endsAt?: string;
    },
  ) {
    const ent = await assertCreativeAllowed(userId, input.kind);
    const count = await countActiveKind(userId, input.kind);
    const limit =
      input.kind === 'slide'
        ? slideLimitFor(ent)
        : input.kind === 'banner'
          ? ent.limits.maxPromotionalBanners
          : input.kind === 'announcement'
            ? ent.limits.maxAnnouncements
            : Math.max(ent.limits.maxCampaigns || 0, ent.limits.maxPromotionalBanners, 3);

    if (count >= limit) {
      throw AppError.badRequest(
        `Plan limit reached for ${input.kind} (${limit}). Pause or archive existing creatives, or upgrade.`,
      );
    }

    if (!input.title?.trim()) throw AppError.badRequest('Title is required');

    const doc = await TechnicianMarketingCreative.create({
      technicianUserId: userId,
      kind: input.kind,
      title: input.title.trim().slice(0, 120),
      headline: input.headline?.trim().slice(0, 160),
      description: input.description?.trim().slice(0, 2000),
      imageUrl: input.imageUrl?.trim().slice(0, 1024),
      ctaLabel: input.ctaLabel?.trim().slice(0, 60),
      ctaHref: input.ctaHref?.trim().slice(0, 500),
      promotionText: input.promotionText?.trim().slice(0, 240),
      sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : count,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      status: 'draft',
      analytics: { views: 0, clicks: 0 },
    });

    await writeAuditLog({
      actorId: userId,
      actorRole: 'technician',
      action: 'marketing_creative.created',
      resourceType: 'TechnicianMarketingCreative',
      resourceId: doc._id.toString(),
      meta: { kind: input.kind },
    });

    return { creative: serialize(doc) };
  },

  async update(
    userId: string,
    id: string,
    patch: Partial<{
      title: string;
      headline: string;
      description: string;
      imageUrl: string;
      ctaLabel: string;
      ctaHref: string;
      promotionText: string;
      sortOrder: number;
      startsAt: string;
      endsAt: string;
    }>,
  ) {
    const doc = await TechnicianMarketingCreative.findOne({ _id: id, technicianUserId: userId });
    if (!doc) throw AppError.notFound('Creative not found');
    if (!['draft', 'rejected', 'changes_requested'].includes(doc.status)) {
      throw AppError.badRequest('Only draft, rejected, or changes-requested creatives can be edited');
    }

    if (typeof patch.title === 'string') doc.title = patch.title.trim().slice(0, 120);
    if (typeof patch.headline === 'string') doc.headline = patch.headline.trim().slice(0, 160);
    if (typeof patch.description === 'string') doc.description = patch.description.trim().slice(0, 2000);
    if (typeof patch.imageUrl === 'string') doc.imageUrl = patch.imageUrl.trim().slice(0, 1024);
    if (typeof patch.ctaLabel === 'string') doc.ctaLabel = patch.ctaLabel.trim().slice(0, 60);
    if (typeof patch.ctaHref === 'string') doc.ctaHref = patch.ctaHref.trim().slice(0, 500);
    if (typeof patch.promotionText === 'string') doc.promotionText = patch.promotionText.trim().slice(0, 240);
    if (typeof patch.sortOrder === 'number') doc.sortOrder = patch.sortOrder;
    if (patch.startsAt) doc.startsAt = new Date(patch.startsAt);
    if (patch.endsAt) doc.endsAt = new Date(patch.endsAt);
    if (doc.status === 'rejected' || doc.status === 'changes_requested') {
      doc.status = 'draft';
      doc.rejectionReason = undefined;
    }
    await doc.save();
    return { creative: serialize(doc) };
  },

  async submit(userId: string, id: string) {
    const doc = await TechnicianMarketingCreative.findOne({ _id: id, technicianUserId: userId });
    if (!doc) throw AppError.notFound('Creative not found');
    if (!['draft', 'rejected', 'changes_requested'].includes(doc.status)) {
      throw AppError.badRequest('Only draft creatives can be submitted');
    }
    if (!doc.imageUrl && doc.kind !== 'announcement') {
      throw AppError.badRequest('Add an image before submitting');
    }
    await assertCreativeAllowed(userId, doc.kind);

    doc.status = 'pending';
    doc.submittedAt = new Date();
    await doc.save();

    try {
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: 'marketing_creative.pending',
        title: 'Marketing creative pending',
        body: `A technician submitted a ${doc.kind} for approval.`,
        data: { creativeId: doc._id.toString(), userId },
        bypassQuietHours: true,
      });
    } catch {
      /* best-effort */
    }

    await writeAuditLog({
      actorId: userId,
      actorRole: 'technician',
      action: 'marketing_creative.submitted',
      resourceType: 'TechnicianMarketingCreative',
      resourceId: id,
    });

    return { creative: serialize(doc) };
  },

  async pause(userId: string, id: string) {
    const doc = await TechnicianMarketingCreative.findOne({ _id: id, technicianUserId: userId });
    if (!doc) throw AppError.notFound('Creative not found');
    if (doc.status !== 'approved') throw AppError.badRequest('Only approved creatives can be paused');
    doc.status = 'paused';
    await doc.save();
    return { creative: serialize(doc) };
  },

  async remove(userId: string, id: string) {
    const doc = await TechnicianMarketingCreative.findOne({ _id: id, technicianUserId: userId });
    if (!doc) throw AppError.notFound('Creative not found');
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    return { ok: true };
  },

  async adminList(query: { status?: string; kind?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    else filter.status = { $in: ['pending', 'changes_requested'] };
    if (query.kind) filter.kind = query.kind;

    const [items, total] = await Promise.all([
      TechnicianMarketingCreative.find(filter)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      TechnicianMarketingCreative.countDocuments(filter),
    ]);

    const userIds = [...new Set(items.map((i) => i.technicianUserId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select('fullName phone email').lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    return {
      items: items.map((doc) => ({
        ...serialize(doc),
        technician: userMap[doc.technicianUserId.toString()]
          ? {
              name: userMap[doc.technicianUserId.toString()].fullName,
              phone: userMap[doc.technicianUserId.toString()].phone,
              email: userMap[doc.technicianUserId.toString()].email,
            }
          : null,
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  },

  async adminModerate(
    adminId: string,
    id: string,
    action: 'approve' | 'reject' | 'request_changes',
    note?: string,
  ) {
    const doc = await TechnicianMarketingCreative.findById(id);
    if (!doc) throw AppError.notFound('Creative not found');
    if (!['pending', 'changes_requested', 'approved'].includes(doc.status) && action === 'approve') {
      // allow approve from pending primarily
    }
    if (doc.status !== 'pending' && doc.status !== 'changes_requested' && action !== 'approve') {
      if (doc.status !== 'approved') {
        throw AppError.badRequest('Creative is not awaiting review');
      }
    }

    const statusMap: Record<string, MarketingCreativeStatus> = {
      approve: 'approved',
      reject: 'rejected',
      request_changes: 'changes_requested',
    };
    doc.status = statusMap[action];
    doc.reviewedByAdminId = adminId as unknown as typeof doc.reviewedByAdminId;
    doc.reviewedAt = new Date();
    doc.adminNote = note?.slice(0, 1000);
    if (action === 'reject') doc.rejectionReason = note?.slice(0, 500) || 'Rejected by admin';
    if (action === 'approve') {
      doc.publishedAt = new Date();
      doc.rejectionReason = undefined;
    }
    await doc.save();

    try {
      const { createDbNotification } = await import('../../utils/notify.js');
      const titles = {
        approve: 'Promotion approved',
        reject: 'Promotion rejected',
        request_changes: 'Changes requested on promotion',
      };
      await createDbNotification({
        userId: doc.technicianUserId.toString(),
        type: `technician.marketing_${action}`,
        title: titles[action],
        body:
          note?.slice(0, 200) ||
          (action === 'approve'
            ? `Your ${doc.kind} is now live for customers.`
            : `Your ${doc.kind} needs attention before it can go live.`),
        bypassQuietHours: true,
      });
    } catch {
      /* ignore */
    }

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `marketing_creative.${action}`,
      resourceType: 'TechnicianMarketingCreative',
      resourceId: id,
      meta: { kind: doc.kind, note },
    });

    return { creative: serialize(doc) };
  },

  /** Customer-facing approved slides + banners (and optional offers with banners). */
  async deliverCustomer(params?: { district?: string; limit?: number; viewerUserId?: string | null }) {
    const limit = Math.min(20, Math.max(1, params?.limit || 8));
    const now = new Date();
    const filter: Record<string, unknown> = {
      status: 'approved',
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
      ],
    };
    const viewerEnv = params?.viewerUserId
      ? await resolveUserDataEnvironment(params.viewerUserId)
      : 'production';
    applyDataEnvironment(filter, viewerEnv);

    const approved = await TechnicianMarketingCreative.find(filter)
      .sort({ sortOrder: 1, publishedAt: -1 })
      .limit(40)
      .lean();

    const slides = approved.filter((c) => c.kind === 'slide').slice(0, limit);
    const banners = approved.filter((c) => c.kind === 'banner').slice(0, limit);
    const announcements = approved.filter((c) => c.kind === 'announcement').slice(0, 6);

    // Expire any past-end creatives opportunistically and notify once
    const expiredDocs = await TechnicianMarketingCreative.find({
      status: 'approved',
      endsAt: { $lt: now },
    })
      .select('technicianUserId kind title')
      .lean();
    if (expiredDocs.length) {
      await TechnicianMarketingCreative.updateMany(
        { _id: { $in: expiredDocs.map((d) => d._id) } },
        { $set: { status: 'expired' } },
      );
      try {
        const { createDbNotification } = await import('../../utils/notify.js');
        await Promise.all(
          expiredDocs.map((doc) =>
            createDbNotification({
              userId: doc.technicianUserId.toString(),
              type: 'technician.marketing_expired',
              title: `${doc.kind === 'banner' ? 'Banner' : 'Promotion'} expired`,
              body: `“${doc.title}” has ended and is no longer shown to customers.`,
              bypassQuietHours: false,
            }),
          ),
        );
      } catch {
        /* ignore */
      }
    }

    const userIds = [
      ...new Set(
        [...slides, ...banners, ...announcements].map((c) => c.technicianUserId.toString()),
      ),
    ];
    const users = await User.find({ _id: { $in: userIds } }).select('fullName').lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.fullName]));

    const mapCreative = (c: (typeof approved)[0]) => ({
      id: c._id.toString(),
      kind: c.kind,
      title: c.title,
      headline: c.headline,
      description: c.description,
      imageUrl: c.imageUrl,
      ctaLabel: c.ctaLabel,
      ctaHref: c.ctaHref || `/technicians/${c.technicianUserId.toString()}`,
      promotionText: c.promotionText,
      technicianUserId: c.technicianUserId.toString(),
      technicianName: userMap[c.technicianUserId.toString()] || 'Professional',
    });

    return {
      slides: slides.map(mapCreative),
      banners: banners.map(mapCreative),
      announcements: announcements.map(mapCreative),
    };
  },

  async track(id: string, event: 'view' | 'click') {
    const field = event === 'click' ? 'analytics.clicks' : 'analytics.views';
    await TechnicianMarketingCreative.updateOne({ _id: id, status: 'approved' }, { $inc: { [field]: 1 } });
    return { ok: true };
  },

  async professionalDashboard(userId: string) {
    const entitlements = await resolveEntitlements(userId);
    const [creatives, offers] = await Promise.all([
      TechnicianMarketingCreative.find({ technicianUserId: userId }).lean(),
      TechnicianOffer.find({ technicianId: userId }).lean(),
    ]);

    const activeOffers = offers.filter((o) =>
      [OFFER_STATUS.ACTIVE, OFFER_STATUS.SCHEDULED, OFFER_STATUS.APPROVED].includes(o.status as never),
    );
    const offerViews = offers.reduce((s, o) => s + (o.analytics?.views || 0), 0);
    const offerClicks = offers.reduce((s, o) => s + (o.analytics?.clicks || 0), 0);
    const creativeViews = creatives.reduce((s, c) => s + (c.analytics?.views || 0), 0);
    const creativeClicks = creatives.reduce((s, c) => s + (c.analytics?.clicks || 0), 0);

    const pendingCreatives = creatives.filter((c) => c.status === 'pending').length;
    const liveSlides = creatives.filter((c) => c.kind === 'slide' && isLive(c.status, c.startsAt, c.endsAt)).length;
    const liveBanners = creatives.filter((c) => c.kind === 'banner' && isLive(c.status, c.startsAt, c.endsAt)).length;
    const liveAnnouncements = creatives.filter(
      (c) => c.kind === 'announcement' && isLive(c.status, c.startsAt, c.endsAt),
    ).length;
    const liveCampaigns = creatives.filter(
      (c) => c.kind === 'portfolio_campaign' && isLive(c.status, c.startsAt, c.endsAt),
    ).length;

    const daysRemaining =
      entitlements.subscriptionPeriodEnd && entitlements.hasPaidAccess
        ? Math.max(
            0,
            Math.ceil(
              (entitlements.subscriptionPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
            ),
          )
        : null;

    const homepageSlideCap = Math.max(
      Number(entitlements.limits.maxHomepageSlides || 0),
      Number(entitlements.limits.maxAdvertisingSlides || 0),
    );

    return {
      entitlements,
      subscription: {
        planCode: entitlements.planCode,
        planName: entitlements.planName,
        status: entitlements.subscriptionStatus,
        periodEnd: entitlements.subscriptionPeriodEnd,
        daysRemaining,
        showPremiumBadge: entitlements.showPremiumBadge,
        verifiedBusinessBadge: entitlements.verifiedBusinessBadge,
        featuredPlacement: entitlements.featuredPlacement,
        searchPriorityWeight: entitlements.searchPriorityWeight,
        marketingCentre: entitlements.marketingCentre,
        isBusiness: entitlements.isBusiness,
      },
      performance: {
        offerViews,
        offerClicks,
        offerBookings: offers.reduce((s, o) => s + (o.analytics?.bookings || 0), 0),
        creativeViews,
        creativeClicks,
        activeOffers: activeOffers.length,
        liveSlides,
        liveBanners,
        liveAnnouncements,
        liveCampaigns,
        pendingApprovals: pendingCreatives + offers.filter((o) => o.status === OFFER_STATUS.PENDING).length,
      },
      limits: {
        ...entitlements.limits,
        homepageSlideCap,
      },
      tips: entitlements.isBusiness
        ? [
            'Plan seasonal homepage campaigns before busy periods.',
            'Keep company verification documents ready — verified businesses earn more trust.',
            'Rotate homepage slides weekly so customers see fresh promotions.',
            'Invite technicians from Team activity to start assigning jobs across your company.',
          ]
        : [
            'Keep at least one approved slide with a clear call to action.',
            'Feature a weekend or emergency offer — they convert well in Kampala.',
            'Upload before/after portfolio shots to improve trust and repeat bookings.',
            entitlements.featuredPlacement
              ? 'Keeping your profile active helps customers find you.'
              : 'Featured placement and advertising slides are available on higher plans.',
          ],
    };
  },
};
