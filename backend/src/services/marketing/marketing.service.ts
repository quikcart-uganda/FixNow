import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  PlatformPromotion,
  SponsoredContent,
  PLATFORM_PROMO_KIND,
  SPONSORED_CONTENT_TYPE,
  SPONSORED_PLACEMENT,
  SPONSORED_HERO_PLACEMENTS,
  type IPlatformPromotion,
  type ISponsoredContent,
  type PlatformPromoKind,
  type PlatformPromoStatus,
  type SponsoredContentType,
  type SponsoredPlacement,
  type SponsoredStatus,
} from '../../models/growth/Marketing.js';
import { TechnicianOffer } from '../../models/growth/Offer.js';
import { User } from '../../models/auth/User.js';
import { ACCOUNT_STATUS, OFFER_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import { isCustomerVisible } from './offer.service.js';
import { applyDataEnvironment, resolveUserDataEnvironment } from '../sandbox/dataEnvironment.js';

function oid(id: string) {
  return new Types.ObjectId(id);
}

function asDate(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw AppError.badRequest('Invalid date');
  return d;
}

function syncPlatformStatus(doc: IPlatformPromotion, now = new Date()): PlatformPromoStatus {
  if (['draft', 'paused', 'archived'].includes(doc.status)) return doc.status;
  if (now > doc.endsAt) return 'expired';
  if (now < doc.startsAt) return 'scheduled';
  return 'active';
}

function syncSponsoredStatus(doc: ISponsoredContent, now = new Date()): SponsoredStatus {
  if (['draft', 'paused', 'archived'].includes(doc.status)) return doc.status;
  if (now > doc.endsAt) return 'expired';
  if (now < doc.startsAt) return 'scheduled';
  return 'active';
}

function serializePlatform(doc: IPlatformPromotion) {
  const status = syncPlatformStatus(doc);
  const views = doc.analytics?.views || 0;
  const clicks = doc.analytics?.clicks || 0;
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    terms: doc.terms,
    bannerImageUrl: doc.bannerImageUrl,
    badge: doc.badge,
    promotionColor: doc.promotionColor,
    code: doc.code,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    currency: doc.currency,
    audience: doc.audience,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    maxRedemptions: doc.maxRedemptions,
    redemptionCount: doc.redemptionCount,
    status,
    featured: doc.featured,
    createdByAdminId: doc.createdByAdminId.toString(),
    analytics: {
      ...doc.analytics,
      ctr: views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0,
      conversion:
        clicks > 0 ? Number((((doc.analytics?.redemptions || 0) / clicks) * 100).toFixed(1)) : 0,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isHeroPlacement(placement: string) {
  return SPONSORED_HERO_PLACEMENTS.includes(placement as SponsoredPlacement);
}

function serializeSponsored(doc: ISponsoredContent) {
  const status = syncSponsoredStatus(doc);
  const impressions = doc.analytics?.impressions || 0;
  const clicks = doc.analytics?.clicks || 0;
  const dismissals = doc.analytics?.dismissals || 0;
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    subtitle: doc.subtitle,
    body: doc.body,
    bannerImageUrl: doc.bannerImageUrl,
    desktopImageUrl: doc.desktopImageUrl,
    mobileImageUrl: doc.mobileImageUrl,
    sponsorLogoUrl: doc.sponsorLogoUrl,
    badge: doc.badge,
    ctaLabel: doc.ctaLabel,
    ctaHref: doc.ctaHref,
    placement: doc.placement,
    audience: doc.audience || 'customer',
    sponsorName: doc.sponsorName,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    status,
    priority: doc.priority,
    displayOrder: doc.displayOrder ?? 0,
    createdByAdminId: doc.createdByAdminId.toString(),
    analytics: {
      impressions,
      clicks,
      dismissals,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(1)) : 0,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Public projection — no admin internals or raw analytics counters. */
function serializeSponsoredPublic(doc: ISponsoredContent) {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    subtitle: doc.subtitle,
    body: doc.body,
    bannerImageUrl: doc.bannerImageUrl,
    desktopImageUrl: doc.desktopImageUrl,
    mobileImageUrl: doc.mobileImageUrl,
    sponsorLogoUrl: doc.sponsorLogoUrl,
    badge: doc.badge,
    ctaLabel: doc.ctaLabel,
    ctaHref: doc.ctaHref,
    placement: doc.placement,
    sponsorName: doc.sponsorName,
    priority: doc.priority,
    displayOrder: doc.displayOrder ?? 0,
  };
}

const AD_TYPES = new Set(['partner_ad', 'sponsored_advertisement', 'partner_promotion']);
const EDU_TYPES = new Set([
  'educational_banner',
  'safety_campaign',
  'tip',
  'government_campaign',
  'emergency_awareness',
]);

function sortSponsored(a: ISponsoredContent, b: ISponsoredContent) {
  const p = (b.priority || 0) - (a.priority || 0);
  if (p !== 0) return p;
  return (a.displayOrder || 0) - (b.displayOrder || 0);
}

function serializePlatformPublic(doc: IPlatformPromotion) {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    bannerImageUrl: doc.bannerImageUrl,
    badge: doc.badge,
    promotionColor: doc.promotionColor,
    code: doc.code,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    currency: doc.currency,
    featured: doc.featured,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
  };
}

export const platformPromotionService = {
  async list(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || '').trim();
    const kind = String(req.query.kind || '').trim();
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');
    const [total, rows] = await Promise.all([
      PlatformPromotion.countDocuments(filter),
      PlatformPromotion.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);
    for (const row of rows) {
      const next = syncPlatformStatus(row);
      if (next !== row.status) {
        row.status = next;
        await row.save();
      }
    }
    return { items: rows.map(serializePlatform), meta: paginationMeta(total, page, limit) };
  },

  async create(adminId: string, body: Record<string, unknown>) {
    const kind = String(body.kind || 'custom') as PlatformPromoKind;
    if (!PLATFORM_PROMO_KIND.includes(kind)) throw AppError.badRequest('Invalid promotion kind');
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    if (!title || !description) throw AppError.badRequest('Title and description are required');
    const startsAt = asDate(String(body.startsAt));
    const endsAt = asDate(String(body.endsAt));
    if (endsAt <= startsAt) throw AppError.badRequest('End date must be after start date');
    let status: PlatformPromoStatus = 'draft';
    if (body.publish) {
      const now = new Date();
      if (now > endsAt) status = 'expired';
      else if (now < startsAt) status = 'scheduled';
      else status = 'active';
    }
    const doc = await PlatformPromotion.create({
      kind,
      title,
      subtitle: body.subtitle ? String(body.subtitle).trim() : undefined,
      description,
      terms: body.terms ? String(body.terms).trim() : undefined,
      bannerImageUrl: body.bannerImageUrl ? String(body.bannerImageUrl).trim() : undefined,
      badge: body.badge ? String(body.badge).trim() : undefined,
      promotionColor: body.promotionColor ? String(body.promotionColor) : '#3d27bc',
      code: body.code ? String(body.code).trim().toUpperCase() : undefined,
      discountType: body.discountType || 'percent',
      discountValue: Number(body.discountValue || 0),
      currency: String(body.currency || 'UGX').toUpperCase().slice(0, 3),
      audience: body.audience || 'customer',
      startsAt,
      endsAt,
      maxRedemptions: body.maxRedemptions != null ? Number(body.maxRedemptions) : undefined,
      status,
      featured: Boolean(body.featured),
      createdByAdminId: oid(adminId),
      analytics: { views: 0, clicks: 0, redemptions: 0, revenueGenerated: 0 },
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'platform_promotion.created',
      resourceType: 'PlatformPromotion',
      resourceId: doc._id.toString(),
    });
    if (doc.status === 'active' || doc.status === 'scheduled') {
      await notifyCustomersFeaturedCampaign(doc);
    }
    return { promotion: serializePlatform(doc) };
  },

  async update(adminId: string, id: string, body: Record<string, unknown>) {
    const doc = await PlatformPromotion.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Promotion not found');
    for (const key of [
      'title',
      'subtitle',
      'description',
      'terms',
      'bannerImageUrl',
      'badge',
      'promotionColor',
      'code',
      'discountType',
      'audience',
    ] as const) {
      if (body[key] != null) (doc as never as Record<string, unknown>)[key] = body[key];
    }
    if (body.kind != null) doc.kind = String(body.kind) as PlatformPromoKind;
    if (body.discountValue != null) doc.discountValue = Number(body.discountValue);
    if (body.maxRedemptions != null) doc.maxRedemptions = Number(body.maxRedemptions);
    if (body.startsAt) doc.startsAt = asDate(String(body.startsAt));
    if (body.endsAt) doc.endsAt = asDate(String(body.endsAt));
    if (body.featured != null) doc.featured = Boolean(body.featured);
    if (body.status) doc.status = String(body.status) as PlatformPromoStatus;
    else doc.status = syncPlatformStatus(doc);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'platform_promotion.updated',
      resourceType: 'PlatformPromotion',
      resourceId: doc._id.toString(),
    });
    return { promotion: serializePlatform(doc) };
  },

  async setStatus(adminId: string, id: string, status: PlatformPromoStatus) {
    const doc = await PlatformPromotion.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Promotion not found');
    doc.status = status;
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `platform_promotion.${status}`,
      resourceType: 'PlatformPromotion',
      resourceId: doc._id.toString(),
    });
    if (status === 'active') await notifyCustomersFeaturedCampaign(doc);
    return { promotion: serializePlatform(doc) };
  },

  async remove(adminId: string, id: string) {
    const doc = await PlatformPromotion.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Promotion not found');
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.status = 'archived';
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'platform_promotion.deleted',
      resourceType: 'PlatformPromotion',
      resourceId: doc._id.toString(),
    });
    return { ok: true };
  },
};

export const sponsoredContentService = {
  async list(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || '').trim();
    const type = String(req.query.type || '').trim();
    const placement = String(req.query.placement || '').trim();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (placement) filter.placement = placement;
    const [total, rows] = await Promise.all([
      SponsoredContent.countDocuments(filter),
      SponsoredContent.find(filter).sort({ priority: -1, displayOrder: 1, updatedAt: -1 }).skip(skip).limit(limit),
    ]);
    for (const row of rows) {
      const next = syncSponsoredStatus(row);
      if (next !== row.status) {
        row.status = next;
        await row.save();
      }
    }
    return { items: rows.map(serializeSponsored), meta: paginationMeta(total, page, limit) };
  },

  async create(adminId: string, body: Record<string, unknown>) {
    const type = String(body.type || 'announcement') as SponsoredContentType;
    if (!SPONSORED_CONTENT_TYPE.includes(type)) throw AppError.badRequest('Invalid content type');
    const placement = String(body.placement || 'home') as SponsoredPlacement;
    if (!SPONSORED_PLACEMENT.includes(placement)) throw AppError.badRequest('Invalid placement');
    const startsAt = asDate(String(body.startsAt));
    const endsAt = asDate(String(body.endsAt));
    if (endsAt <= startsAt) throw AppError.badRequest('End date must be after start date');
    const doc = await SponsoredContent.create({
      type,
      title: String(body.title || '').trim(),
      subtitle: body.subtitle ? String(body.subtitle).trim() : undefined,
      body: String(body.body || '').trim(),
      bannerImageUrl: body.bannerImageUrl ? String(body.bannerImageUrl) : undefined,
      desktopImageUrl: body.desktopImageUrl ? String(body.desktopImageUrl) : undefined,
      mobileImageUrl: body.mobileImageUrl ? String(body.mobileImageUrl) : undefined,
      sponsorLogoUrl: body.sponsorLogoUrl ? String(body.sponsorLogoUrl) : undefined,
      badge: body.badge ? String(body.badge).trim() : undefined,
      ctaLabel: body.ctaLabel ? String(body.ctaLabel) : undefined,
      ctaHref: body.ctaHref ? String(body.ctaHref) : undefined,
      placement,
      audience: body.audience === 'technician' || body.audience === 'all' ? body.audience : 'customer',
      sponsorName: body.sponsorName ? String(body.sponsorName) : undefined,
      startsAt,
      endsAt,
      status: body.publish
        ? syncSponsoredStatus({ startsAt, endsAt, status: 'active' } as ISponsoredContent)
        : 'draft',
      priority: Number(body.priority || 0),
      displayOrder: Number(body.displayOrder || 0),
      createdByAdminId: oid(adminId),
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    });
    if (!doc.title || !doc.body) throw AppError.badRequest('Title and body are required');
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'sponsored_content.created',
      resourceType: 'SponsoredContent',
      resourceId: doc._id.toString(),
    });
    return { content: serializeSponsored(doc) };
  },

  async update(adminId: string, id: string, body: Record<string, unknown>) {
    const doc = await SponsoredContent.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content not found');
    for (const key of [
      'title',
      'subtitle',
      'body',
      'bannerImageUrl',
      'desktopImageUrl',
      'mobileImageUrl',
      'sponsorLogoUrl',
      'badge',
      'ctaLabel',
      'ctaHref',
      'sponsorName',
    ] as const) {
      if (body[key] != null) (doc as never as Record<string, unknown>)[key] = body[key];
    }
    if (body.type) doc.type = String(body.type) as SponsoredContentType;
    if (body.placement) doc.placement = String(body.placement) as SponsoredPlacement;
    if (body.audience === 'all' || body.audience === 'customer' || body.audience === 'technician') {
      doc.audience = body.audience;
    }
    if (body.priority != null) doc.priority = Number(body.priority);
    if (body.displayOrder != null) doc.displayOrder = Number(body.displayOrder);
    if (body.startsAt) doc.startsAt = asDate(String(body.startsAt));
    if (body.endsAt) doc.endsAt = asDate(String(body.endsAt));
    if (body.status) doc.status = String(body.status) as SponsoredStatus;
    else doc.status = syncSponsoredStatus(doc);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'sponsored_content.updated',
      resourceType: 'SponsoredContent',
      resourceId: doc._id.toString(),
    });
    return { content: serializeSponsored(doc) };
  },

  async setStatus(adminId: string, id: string, status: SponsoredStatus) {
    const doc = await SponsoredContent.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content not found');
    doc.status = status;
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `sponsored_content.${status}`,
      resourceType: 'SponsoredContent',
      resourceId: doc._id.toString(),
    });
    return { content: serializeSponsored(doc) };
  },

  async remove(_adminId: string, id: string) {
    const doc = await SponsoredContent.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content not found');
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.status = 'archived';
    await doc.save();
    return { ok: true };
  },
};

async function notifyCustomersFeaturedCampaign(promo: IPlatformPromotion) {
  try {
    const customers = await User.find({ role: 'customer', accountStatus: ACCOUNT_STATUS.ACTIVE })
      .select('_id')
      .limit(200)
      .lean();
    await Promise.all(
      customers.map((u) =>
        createDbNotification({
          userId: u._id.toString(),
          type: 'marketing.featured_campaign',
          title: 'Featured campaign',
          body: `${promo.title} is live on FixNow.`,
          href: '/customer/offers',
          meta: { platformPromotionId: promo._id.toString() },
          data: { type: 'marketing.featured_campaign', id: promo._id.toString() },
        }),
      ),
    );
  } catch {
    /* non-blocking */
  }
}

export const marketingDeliveryService = {
  /**
   * Audience-filtered live promotions + sponsored content for an app channel.
   * Backend is the only place audience permissions are decided.
   */
  async deliver(
    channel: 'customer' | 'technician' | 'public',
    opts?: { placement?: string; viewerUserId?: string | null },
  ) {
    const now = new Date();
    const audienceFilter =
      channel === 'technician'
        ? { $in: ['all', 'technician'] }
        : channel === 'customer'
          ? { $in: ['all', 'customer'] }
          : { $in: ['all', 'customer'] }; // public guest surface defaults to customer-facing promos

    const windowFilter = {
      status: { $in: ['active', 'scheduled'] },
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    };

    const promoFilter: Record<string, unknown> = { ...windowFilter, audience: audienceFilter };
    const sponsoredFilter: Record<string, unknown> = { ...windowFilter, audience: audienceFilter };
    if (opts?.placement) {
      if (isHeroPlacement(opts.placement)) {
        sponsoredFilter.placement = { $in: [...SPONSORED_HERO_PLACEMENTS] };
      } else if (opts.placement === 'home') {
        // Home feed includes rail placements + premium hero campaigns in one response.
        sponsoredFilter.placement = {
          $in: ['home', 'global', ...SPONSORED_HERO_PLACEMENTS],
        };
      } else {
        sponsoredFilter.placement = { $in: [opts.placement, 'global'] };
      }
    } else {
      // Default channel feeds exclude hero banners (those ride with placement=home or explicit hero).
      sponsoredFilter.placement = { $nin: SPONSORED_HERO_PLACEMENTS };
    }

    const viewerEnv = opts?.viewerUserId
      ? await resolveUserDataEnvironment(opts.viewerUserId)
      : 'production';
    applyDataEnvironment(promoFilter, viewerEnv);
    applyDataEnvironment(sponsoredFilter, viewerEnv);

    const [promotions, sponsored] = await Promise.all([
      PlatformPromotion.find(promoFilter).sort({ featured: -1, updatedAt: -1 }).limit(20),
      SponsoredContent.find(sponsoredFilter).sort({ priority: -1, displayOrder: 1, updatedAt: -1 }).limit(30),
    ]);

    // Sync derived statuses without blocking the response.
    for (const row of [...promotions, ...sponsored]) {
      if ('kind' in row) {
        const next = syncPlatformStatus(row as IPlatformPromotion, now);
        if (next !== row.status) {
          row.status = next;
          void row.save();
        }
      } else {
        const next = syncSponsoredStatus(row as ISponsoredContent, now);
        if (next !== row.status) {
          row.status = next;
          void row.save();
        }
      }
    }

    const livePromos = promotions.filter((p) => syncPlatformStatus(p, now) === 'active');
    const liveSponsored = sponsored.filter((s) => syncSponsoredStatus(s, now) === 'active').sort(sortSponsored);
    const hero = liveSponsored.filter((s) => isHeroPlacement(s.placement));
    const railSponsored = liveSponsored.filter((s) => !isHeroPlacement(s.placement));

    return {
      channel,
      promotions: livePromos.map(serializePlatformPublic),
      sponsored: railSponsored.map(serializeSponsoredPublic),
      hero: hero.map(serializeSponsoredPublic),
      advertisements: railSponsored.filter((s) => AD_TYPES.has(s.type)).map(serializeSponsoredPublic),
      educational: railSponsored.filter((s) => EDU_TYPES.has(s.type)).map(serializeSponsoredPublic),
    };
  },

  async trackPromotion(id: string, event: 'view' | 'click') {
    const field = event === 'click' ? 'analytics.clicks' : 'analytics.views';
    await PlatformPromotion.updateOne({ _id: id, isDeleted: false }, { $inc: { [field]: 1 } });
    return { ok: true };
  },

  async trackSponsored(id: string, event: 'impression' | 'click' | 'dismissal') {
    const field =
      event === 'click'
        ? 'analytics.clicks'
        : event === 'dismissal'
          ? 'analytics.dismissals'
          : 'analytics.impressions';
    await SponsoredContent.updateOne({ _id: id, isDeleted: false }, { $inc: { [field]: 1 } });
    return { ok: true };
  },
};

export const marketingAnalyticsService = {
  async platformOverview() {
    const now = new Date();

    const [offers, pending, platformPromos, sponsored] = await Promise.all([
      TechnicianOffer.find({}),
      TechnicianOffer.countDocuments({ status: OFFER_STATUS.PENDING }),
      PlatformPromotion.find({}),
      SponsoredContent.find({}),
    ]);

    const live = offers.filter((o) => isCustomerVisible(o, now));
    let views = 0;
    let clicks = 0;
    let bookings = 0;
    let revenue = 0;
    const byTech = new Map<string, { views: number; bookings: number; revenue: number; offers: number }>();

    for (const o of offers) {
      views += o.analytics?.views || 0;
      clicks += o.analytics?.clicks || 0;
      bookings += o.analytics?.bookings || 0;
      revenue += o.analytics?.revenueGenerated || 0;
      const tid = o.technicianId.toString();
      const row = byTech.get(tid) || { views: 0, bookings: 0, revenue: 0, offers: 0 };
      row.views += o.analytics?.views || 0;
      row.bookings += o.analytics?.bookings || 0;
      row.revenue += o.analytics?.revenueGenerated || 0;
      row.offers += 1;
      byTech.set(tid, row);
    }

    for (const p of platformPromos) {
      views += p.analytics?.views || 0;
      clicks += p.analytics?.clicks || 0;
      bookings += p.analytics?.redemptions || 0;
      revenue += p.analytics?.revenueGenerated || 0;
    }

    const mostViewed = [...offers]
      .sort((a, b) => (b.analytics?.views || 0) - (a.analytics?.views || 0))
      .slice(0, 8)
      .map((o) => ({
        id: o._id.toString(),
        title: o.title,
        technicianId: o.technicianId.toString(),
        views: o.analytics?.views || 0,
        clicks: o.analytics?.clicks || 0,
        bookings: o.analytics?.bookings || 0,
      }));

    const mostRedeemed = [...offers]
      .sort((a, b) => (b.analytics?.bookings || 0) - (a.analytics?.bookings || 0))
      .slice(0, 8)
      .map((o) => ({
        id: o._id.toString(),
        title: o.title,
        technicianId: o.technicianId.toString(),
        bookings: o.analytics?.bookings || 0,
        revenue: o.analytics?.revenueGenerated || 0,
      }));

    const topTechIds = [...byTech.entries()]
      .sort((a, b) => b[1].bookings - a[1].bookings || b[1].revenue - a[1].revenue)
      .slice(0, 8);
    const users = await User.find({ _id: { $in: topTechIds.map(([id]) => oid(id)) } })
      .select('fullName')
      .lean();
    const nameById = new Map(users.map((u) => [u._id.toString(), u.fullName || 'Technician']));

    const topTechnicians = topTechIds.map(([id, stats]) => ({
      technicianId: id,
      name: nameById.get(id) || 'Technician',
      ...stats,
    }));

    return {
      totals: {
        liveOffers: live.length,
        pendingOffers: pending,
        platformPromotions: platformPromos.filter((p) => ['active', 'scheduled'].includes(syncPlatformStatus(p)))
          .length,
        sponsoredActive: sponsored.filter((s) => ['active', 'scheduled'].includes(syncSponsoredStatus(s))).length,
        views,
        clicks,
        redemptions: bookings,
        revenueGenerated: revenue,
        ctr: views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0,
        conversion: clicks > 0 ? Number(((bookings / clicks) * 100).toFixed(1)) : 0,
        customerEngagement: views + clicks + bookings,
      },
      mostViewed,
      mostRedeemed,
      topTechnicians,
    };
  },
};
