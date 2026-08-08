import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  CustomerProfile,
  SavedOffer,
  SavedTechnician,
} from '../../models/customer/Customer.js';
import { TechnicianOffer, type ITechnicianOffer } from '../../models/growth/Offer.js';
import { TechnicianProfile } from '../../models/technician/Technician.js';
import { User } from '../../models/auth/User.js';
import { ACCOUNT_STATUS, OFFER_STATUS, OFFER_TYPE, type OfferType } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { publicMediaUrl } from '../../utils/mediaUrl.js';
import { createDbNotification } from '../../utils/notify.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import {
  applyDataEnvironment,
  assertDocumentVisibleToViewer,
  documentDataEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

export type OfferLifecycle =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'active'
  | 'expired'
  | 'archived';

type OfferInput = {
  type: OfferType;
  title: string;
  subtitle?: string;
  description: string;
  terms?: string;
  bannerImageUrl?: string;
  promotionColor?: string;
  badge?: string;
  categoryIds?: string[];
  serviceNames?: string[];
  serviceAreaDistricts?: string[];
  availabilityNote?: string;
  discountValue?: number;
  currency?: string;
  minimumBookingAmount?: number;
  maximumDiscountAmount?: number;
  maxRedemptions?: number;
  perCustomerLimit?: number;
  startsAt: string | Date;
  endsAt: string | Date;
  timeStart?: string;
  timeEnd?: string;
  weekdays?: string[];
  holidayNotes?: string;
};

function oid(id: string) {
  return new Types.ObjectId(id);
}

function asDate(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw AppError.badRequest('Invalid date');
  return d;
}

function normalizeList(values?: string[], max = 30): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, max);
}

/** Public visibility requires admin approval AND a live date window. */
export function isCustomerVisible(offer: Pick<ITechnicianOffer, 'status' | 'startsAt' | 'endsAt' | 'isDeleted'>, now = new Date()): boolean {
  if (offer.isDeleted) return false;
  // Never public until admin has approved (approved / scheduled / active lineage).
  const approvedLine = [OFFER_STATUS.APPROVED, OFFER_STATUS.ACTIVE, OFFER_STATUS.SCHEDULED].includes(
    offer.status as typeof OFFER_STATUS.APPROVED,
  );
  if (!approvedLine) return false;
  // Scheduled (before startsAt) is approved but not yet customer-live.
  if (now < offer.startsAt) return false;
  if (now > offer.endsAt) return false;
  return true;
}

export function deriveLifecycle(offer: Pick<ITechnicianOffer, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): OfferLifecycle {
  if (offer.status === OFFER_STATUS.DRAFT) return 'draft';
  if (offer.status === OFFER_STATUS.PENDING) return 'pending';
  if (offer.status === OFFER_STATUS.REJECTED) return 'rejected';
  if (offer.status === OFFER_STATUS.ARCHIVED) return 'archived';
  if (offer.status === OFFER_STATUS.EXPIRED || now > offer.endsAt) return 'expired';

  const approved =
    offer.status === OFFER_STATUS.APPROVED ||
    offer.status === OFFER_STATUS.SCHEDULED ||
    offer.status === OFFER_STATUS.ACTIVE;

  if (approved) {
    if (now < offer.startsAt) return 'scheduled';
    if (now >= offer.startsAt && now <= offer.endsAt) return 'active';
    return 'expired';
  }

  return offer.status as OfferLifecycle;
}

function validateOfferRules(input: OfferInput, opts: { requireServices: boolean }) {
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  if (!title) throw AppError.badRequest('Title is required');
  if (!description) throw AppError.badRequest('Description is required');
  if (!Object.values(OFFER_TYPE).includes(input.type)) throw AppError.badRequest('Invalid offer type');

  const startsAt = asDate(input.startsAt);
  const endsAt = asDate(input.endsAt);
  if (endsAt <= startsAt) throw AppError.badRequest('End date must be after start date');

  const serviceNames = normalizeList(input.serviceNames);
  const categoryIds = normalizeList(input.categoryIds);
  const districts = normalizeList(input.serviceAreaDistricts);

  if (opts.requireServices && !serviceNames.length && !categoryIds.length) {
    throw AppError.badRequest('Select at least one service or category');
  }

  const discountValue = input.discountValue == null ? undefined : Number(input.discountValue);
  if (discountValue != null && (Number.isNaN(discountValue) || discountValue < 0)) {
    throw AppError.badRequest('Discount value cannot be negative');
  }

  if (input.type === OFFER_TYPE.PERCENTAGE_DISCOUNT) {
    if (discountValue == null) throw AppError.badRequest('Percentage discount requires a value');
    if (discountValue <= 0 || discountValue > 100) {
      throw AppError.badRequest('Percentage discount must be between 1 and 100');
    }
  }

  if (input.type === OFFER_TYPE.FIXED_DISCOUNT) {
    if (discountValue == null || discountValue <= 0) {
      throw AppError.badRequest('Fixed discount requires a positive amount');
    }
  }

  if (
    (input.type === OFFER_TYPE.FREE_CALL_OUT || input.type === OFFER_TYPE.FREE_INSPECTION) &&
    discountValue != null &&
    discountValue < 0
  ) {
    throw AppError.badRequest('Invalid discount value');
  }

  for (const key of ['minimumBookingAmount', 'maximumDiscountAmount'] as const) {
    const v = input[key];
    if (v != null && (Number(v) < 0 || Number.isNaN(Number(v)))) {
      throw AppError.badRequest(`${key} cannot be negative`);
    }
  }

  if (input.maxRedemptions != null && Number(input.maxRedemptions) < 1) {
    throw AppError.badRequest('Maximum redemptions must be at least 1');
  }
  if (input.perCustomerLimit != null && Number(input.perCustomerLimit) < 1) {
    throw AppError.badRequest('Per-customer limit must be at least 1');
  }

  if (input.timeStart && input.timeEnd) {
    if (!/^\d{2}:\d{2}$/.test(input.timeStart) || !/^\d{2}:\d{2}$/.test(input.timeEnd)) {
      throw AppError.badRequest('Time restrictions must use HH:MM format');
    }
  }

  return {
    title,
    description,
    startsAt,
    endsAt,
    serviceNames,
    categoryIds,
    districts,
    discountValue,
  };
}

async function assertNoDuplicate(
  technicianId: string,
  title: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  const filter: Record<string, unknown> = {
    technicianId: oid(technicianId),
    title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
    status: { $nin: [OFFER_STATUS.ARCHIVED, OFFER_STATUS.REJECTED, OFFER_STATUS.EXPIRED] },
    startsAt: { $lte: endsAt },
    endsAt: { $gte: startsAt },
  };
  if (excludeId) filter._id = { $ne: oid(excludeId) };
  const existing = await TechnicianOffer.findOne(filter).select('_id title status').lean();
  if (existing) {
    throw AppError.conflict('A similar promotion already exists for this title and schedule window');
  }
}

function serializeOffer(offer: ITechnicianOffer, now = new Date()) {
  const lifecycle = deriveLifecycle(offer, now);
  const remainingMs = Math.max(0, offer.endsAt.getTime() - now.getTime());
  const analytics = offer.analytics || {
    views: 0,
    clicks: 0,
    bookings: 0,
    revenueGenerated: 0,
    redemptionCount: 0,
  };
  const remainingRedemptions =
    offer.maxRedemptions == null
      ? null
      : Math.max(0, offer.maxRedemptions - (analytics.redemptionCount || 0));

  const conversionRate =
    analytics.clicks > 0 ? Number(((analytics.bookings / analytics.clicks) * 100).toFixed(1)) : 0;

  return {
    id: offer._id.toString(),
    technicianId: offer.technicianId.toString(),
    type: offer.type,
    title: offer.title,
    subtitle: offer.subtitle,
    description: offer.description,
    terms: offer.terms,
    bannerImageUrl: publicMediaUrl(offer.bannerImageUrl) ?? offer.bannerImageUrl ?? undefined,
    promotionColor: offer.promotionColor,
    badge: offer.badge,
    categoryIds: (offer.categoryIds || []).map((id) => id.toString()),
    serviceNames: offer.serviceNames || [],
    serviceAreaDistricts: offer.serviceAreaDistricts || [],
    availabilityNote: offer.availabilityNote,
    discountValue: offer.discountValue,
    currency: offer.currency,
    minimumBookingAmount: offer.minimumBookingAmount,
    maximumDiscountAmount: offer.maximumDiscountAmount,
    maxRedemptions: offer.maxRedemptions,
    perCustomerLimit: offer.perCustomerLimit,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    timeStart: offer.timeStart,
    timeEnd: offer.timeEnd,
    weekdays: offer.weekdays || [],
    holidayNotes: offer.holidayNotes,
    status: offer.status,
    lifecycle,
    customerVisible: isCustomerVisible(offer, now),
    featured: Boolean(offer.featured),
    rejectionReason: offer.rejectionReason,
    reviewedByAdminId: offer.reviewedByAdminId?.toString(),
    reviewedAt: offer.reviewedAt,
    submittedAt: offer.submittedAt,
    publishedAt: offer.publishedAt,
    analytics: {
      ...analytics,
      conversionRate,
      remainingRedemptions,
      expiryCountdownMs: remainingMs,
      expiryCountdownHours: Math.ceil(remainingMs / (1000 * 60 * 60)),
    },
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

type SerializedOffer = ReturnType<typeof serializeOffer>;

type TechnicianPublicSnap = {
  name: string;
  photoUrl?: string;
  ratingAverage: number;
  trustScore: number;
  jobsCompleted: number;
  district?: string;
  trade?: string;
  subscriptionBadge?: {
    text: string;
    icon?: string;
    color?: string;
    borderColor?: string;
    glow?: boolean;
    size?: 'sm' | 'md' | 'lg';
  } | null;
};

async function loadTechnicianSnaps(technicianIds: string[]): Promise<Map<string, TechnicianPublicSnap>> {
  const unique = [...new Set(technicianIds.filter(Boolean))];
  const map = new Map<string, TechnicianPublicSnap>();
  if (!unique.length) return map;

  const oids = unique.map(oid);
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: oids } }).select('fullName').lean(),
    TechnicianProfile.find({ userId: { $in: oids } })
      .select(
        'userId photoUrl ratingAverage trustScore jobsCompleted location searchKeywords skills subscriptionPlanCode subscriptionStatus subscriptionPeriodEnd monetizationSuspended',
      )
      .lean(),
  ]);

  const { resolvePublicBadgesForProfiles } = await import('../marketplace/publicSubscriptionBadge.js');
  const badgeMap = await resolvePublicBadgesForProfiles(profiles as never[], 'card');

  const userName = new Map(users.map((u) => [u._id.toString(), String(u.fullName || 'Technician')]));
  for (const profile of profiles) {
    const id = profile.userId.toString();
    const keywords = Array.isArray(profile.searchKeywords) ? profile.searchKeywords : [];
    const skills = Array.isArray((profile as { skills?: string[] }).skills)
      ? (profile as { skills?: string[] }).skills!
      : [];
    map.set(id, {
      name: userName.get(id) || 'Technician',
      photoUrl: publicMediaUrl(profile.photoUrl),
      ratingAverage: Number(profile.ratingAverage || 0),
      trustScore: Number(profile.trustScore || 0),
      jobsCompleted: Number(profile.jobsCompleted || 0),
      district: profile.location?.district,
      trade: String(keywords[0] || skills[0] || '') || undefined,
      subscriptionBadge: badgeMap.get(id) || null,
    });
  }
  for (const id of unique) {
    if (!map.has(id)) {
      map.set(id, {
        name: userName.get(id) || 'Technician',
        ratingAverage: 0,
        trustScore: 0,
        jobsCompleted: 0,
        subscriptionBadge: null,
      });
    }
  }
  return map;
}

function enrichOffer(
  offer: SerializedOffer,
  tech?: TechnicianPublicSnap,
  opts?: { saved?: boolean; remindBeforeExpiry?: boolean; viewerDistrict?: string },
) {
  const districts = offer.serviceAreaDistricts || [];
  const viewerDistrict = opts?.viewerDistrict?.trim();
  const nearby =
    viewerDistrict && districts.some((d) => d.toLowerCase() === viewerDistrict.toLowerCase());

  return {
    ...offer,
    technician: tech
      ? {
          id: offer.technicianId,
          name: tech.name,
          photoUrl: tech.photoUrl,
          profileImageUrl: tech.photoUrl,
          rating: tech.ratingAverage,
          trustScore: tech.trustScore,
          jobsCompleted: tech.jobsCompleted,
          district: tech.district,
          trade: tech.trade,
          subscriptionBadge: tech.subscriptionBadge || null,
        }
      : {
          id: offer.technicianId,
          name: 'Technician',
          rating: 0,
          trustScore: 0,
          jobsCompleted: 0,
          subscriptionBadge: null,
        },
    distanceLabel: nearby ? 'Nearby' : tech?.district || districts[0] || undefined,
    saved: Boolean(opts?.saved),
    remindBeforeExpiry: Boolean(opts?.remindBeforeExpiry),
  };
}

async function enrichOffers(
  offers: SerializedOffer[],
  opts?: { customerUserId?: string; viewerDistrict?: string },
) {
  const snaps = await loadTechnicianSnaps(offers.map((o) => o.technicianId));
  let savedMap = new Map<string, { remindBeforeExpiry: boolean }>();
  if (opts?.customerUserId && offers.length) {
    const saved = await SavedOffer.find({
      customerUserId: oid(opts.customerUserId),
      offerId: { $in: offers.map((o) => oid(o.id)) },
    })
      .select('offerId remindBeforeExpiry')
      .lean();
    savedMap = new Map(
      saved.map((s) => [s.offerId.toString(), { remindBeforeExpiry: Boolean(s.remindBeforeExpiry) }]),
    );
  }

  return offers.map((o) => {
    const fav = savedMap.get(o.id);
    return enrichOffer(o, snaps.get(o.technicianId), {
      saved: Boolean(fav),
      remindBeforeExpiry: fav?.remindBeforeExpiry,
      viewerDistrict: opts?.viewerDistrict,
    });
  });
}

async function notifyTechnicianOfferEvent(
  offer: ITechnicianOffer,
  type: string,
  title: string,
  body: string,
) {
  try {
    await createDbNotification({
      userId: offer.technicianId.toString(),
      type,
      title,
      body,
      href: '/technician/marketing/offers',
      meta: { offerId: offer._id.toString() },
      data: { offerId: offer._id.toString(), type },
    });
  } catch {
    /* non-blocking */
  }
}

async function notifyNearbyCustomersOfOffer(offer: ITechnicianOffer) {
  try {
    const districts = offer.serviceAreaDistricts || [];
    if (!districts.length) return;
    const customers = await User.find({ role: 'customer', accountStatus: ACCOUNT_STATUS.ACTIVE })
      .select('_id')
      .limit(80)
      .lean();
    await Promise.all(
      customers.map((u) =>
        createDbNotification({
          userId: u._id.toString(),
          type: 'offer.nearby',
          title: 'New nearby promotion',
          body: `“${offer.title}” is available near you.`,
          href: `/customer/offers/${offer._id.toString()}`,
          meta: { offerId: offer._id.toString() },
          data: { offerId: offer._id.toString(), type: 'offer.nearby' },
        }),
      ),
    );
  } catch {
    /* non-blocking */
  }
}

async function notifyFavouriteCustomersOfNewOffer(offer: ITechnicianOffer) {
  try {
    const savers = await SavedTechnician.find({ technicianUserId: offer.technicianId })
      .select('customerUserId')
      .lean();
    if (!savers.length) return;

    const customerIds = savers.map((s) => s.customerUserId.toString());
    const profiles = await CustomerProfile.find({
      userId: { $in: customerIds.map(oid) },
      'preferences.notifyFavouriteTechnicianOffers': { $ne: false },
    })
      .select('userId')
      .lean();

    const techUser = await User.findById(offer.technicianId).select('fullName').lean();
    const techName = techUser?.fullName || 'A technician you saved';

    await Promise.all(
      profiles.map((p) =>
        createDbNotification({
          userId: p.userId.toString(),
          type: 'offer.favourite_technician',
          title: 'New promotion from a favourite',
          body: `${techName} published “${offer.title}”. Tap to view the offer.`,
          href: `/customer/offers/${offer._id.toString()}`,
          meta: { offerId: offer._id.toString(), technicianId: offer.technicianId.toString() },
          data: {
            offerId: offer._id.toString(),
            type: 'offer.favourite_technician',
          },
        }),
      ),
    );
  } catch {
    /* non-blocking */
  }
}

function lifecycleFilter(lifecycle: string, now = new Date()): Record<string, unknown> {
  switch (lifecycle) {
    case 'draft':
      return { status: OFFER_STATUS.DRAFT };
    case 'pending':
      return { status: OFFER_STATUS.PENDING };
    case 'rejected':
      return { status: OFFER_STATUS.REJECTED };
    case 'archived':
      return { status: OFFER_STATUS.ARCHIVED };
    case 'approved':
      return { status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.SCHEDULED, OFFER_STATUS.ACTIVE] } };
    case 'scheduled':
      return {
        status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.SCHEDULED, OFFER_STATUS.ACTIVE] },
        startsAt: { $gt: now },
        endsAt: { $gte: now },
      };
    case 'active':
      return {
        status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.ACTIVE] },
        startsAt: { $lte: now },
        endsAt: { $gte: now },
      };
    case 'expired':
      return {
        $or: [
          { status: OFFER_STATUS.EXPIRED },
          {
            status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.ACTIVE, OFFER_STATUS.SCHEDULED] },
            endsAt: { $lt: now },
          },
        ],
      };
    default:
      return {};
  }
}

async function getOwned(technicianId: string, offerId: string) {
  const offer = await TechnicianOffer.findById(offerId);
  if (!offer || offer.isDeleted) throw AppError.notFound('Offer not found');
  if (offer.technicianId.toString() !== technicianId) throw AppError.forbidden();
  return offer;
}

/** Refresh derived status fields for approved offers past/future windows. */
async function syncLifecycleStatus(offer: InstanceType<typeof TechnicianOffer>, now = new Date()) {
  if (![OFFER_STATUS.APPROVED, OFFER_STATUS.SCHEDULED, OFFER_STATUS.ACTIVE, OFFER_STATUS.EXPIRED].includes(offer.status as never)) {
    return offer;
  }
  let next = offer.status;
  if (now > offer.endsAt) next = OFFER_STATUS.EXPIRED;
  else if (now < offer.startsAt) next = OFFER_STATUS.SCHEDULED;
  else next = OFFER_STATUS.ACTIVE;

  if (next !== offer.status) {
    offer.status = next;
    await offer.save();
  }
  return offer;
}

/** O(1) lifecycle writes for a technician — avoids N sequential `.save()` on list/dashboard. */
async function bulkSyncLifecycleForTechnician(technicianId: string | ReturnType<typeof oid>, now = new Date()) {
  const tid = typeof technicianId === 'string' ? oid(technicianId) : technicianId;
  const live = [OFFER_STATUS.APPROVED, OFFER_STATUS.SCHEDULED, OFFER_STATUS.ACTIVE];
  await Promise.all([
    TechnicianOffer.updateMany(
      { technicianId: tid, status: { $in: live }, endsAt: { $lt: now } },
      { $set: { status: OFFER_STATUS.EXPIRED } },
    ),
    TechnicianOffer.updateMany(
      { technicianId: tid, status: { $in: live }, startsAt: { $gt: now }, endsAt: { $gte: now } },
      { $set: { status: OFFER_STATUS.SCHEDULED } },
    ),
    TechnicianOffer.updateMany(
      { technicianId: tid, status: { $in: live }, startsAt: { $lte: now }, endsAt: { $gte: now } },
      { $set: { status: OFFER_STATUS.ACTIVE } },
    ),
  ]);
}

export const offerService = {
  serialize: serializeOffer,
  isCustomerVisible,
  deriveLifecycle,

  async createDraft(technicianId: string, input: OfferInput) {
    const { assertOfferAllowed } = await import('../marketplace/entitlements.service.js');
    const ent = await assertOfferAllowed(technicianId);
    const activeCount = await TechnicianOffer.countDocuments({
      technicianId: oid(technicianId),
      status: {
        $in: [
          OFFER_STATUS.DRAFT,
          OFFER_STATUS.PENDING,
          OFFER_STATUS.APPROVED,
          OFFER_STATUS.SCHEDULED,
          OFFER_STATUS.ACTIVE,
        ],
      },
    });
    if (activeCount >= ent.limits.maxActiveOffers) {
      throw AppError.badRequest(
        `Active offer limit reached (${ent.limits.maxActiveOffers}). Archive an offer or upgrade your plan.`,
      );
    }

    const v = validateOfferRules(input, { requireServices: false });
    await assertNoDuplicate(technicianId, v.title, v.startsAt, v.endsAt);

    const offer = await TechnicianOffer.create({
      technicianId: oid(technicianId),
      type: input.type,
      title: v.title,
      titleKey: v.title.toLowerCase(),
      subtitle: input.subtitle?.trim(),
      description: v.description,
      terms: input.terms?.trim(),
      bannerImageUrl: input.bannerImageUrl?.trim(),
      promotionColor: input.promotionColor?.trim() || '#0F766E',
      badge: input.badge?.trim(),
      categoryIds: v.categoryIds.map(oid),
      serviceNames: v.serviceNames,
      serviceAreaDistricts: v.districts,
      availabilityNote: input.availabilityNote?.trim(),
      discountValue: v.discountValue,
      currency: (input.currency || 'UGX').toUpperCase().slice(0, 3),
      minimumBookingAmount: input.minimumBookingAmount,
      maximumDiscountAmount: input.maximumDiscountAmount,
      maxRedemptions: input.maxRedemptions,
      perCustomerLimit: input.perCustomerLimit ?? 1,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      timeStart: input.timeStart,
      timeEnd: input.timeEnd,
      weekdays: input.weekdays || [],
      holidayNotes: input.holidayNotes?.trim(),
      status: OFFER_STATUS.DRAFT,
      analytics: { views: 0, clicks: 0, bookings: 0, revenueGenerated: 0, redemptionCount: 0 },
    });

    await writeAuditLog({
      actorId: technicianId,
      actorRole: 'technician',
      action: 'offer.draft_created',
      resourceType: 'TechnicianOffer',
      resourceId: offer._id.toString(),
    });

    return { offer: serializeOffer(offer) };
  },

  async update(technicianId: string, offerId: string, input: Partial<OfferInput>) {
    const offer = await getOwned(technicianId, offerId);
    if (![OFFER_STATUS.DRAFT, OFFER_STATUS.REJECTED].includes(offer.status as never)) {
      throw AppError.badRequest('Only draft or rejected offers can be edited');
    }

    const merged: OfferInput = {
      type: (input.type as OfferType) || offer.type,
      title: input.title ?? offer.title,
      subtitle: input.subtitle ?? offer.subtitle,
      description: input.description ?? offer.description,
      terms: input.terms ?? offer.terms,
      bannerImageUrl: input.bannerImageUrl ?? offer.bannerImageUrl,
      promotionColor: input.promotionColor ?? offer.promotionColor,
      badge: input.badge ?? offer.badge,
      categoryIds: input.categoryIds ?? offer.categoryIds.map((id) => id.toString()),
      serviceNames: input.serviceNames ?? offer.serviceNames,
      serviceAreaDistricts: input.serviceAreaDistricts ?? offer.serviceAreaDistricts,
      availabilityNote: input.availabilityNote ?? offer.availabilityNote,
      discountValue: input.discountValue ?? offer.discountValue,
      currency: input.currency ?? offer.currency,
      minimumBookingAmount: input.minimumBookingAmount ?? offer.minimumBookingAmount,
      maximumDiscountAmount: input.maximumDiscountAmount ?? offer.maximumDiscountAmount,
      maxRedemptions: input.maxRedemptions ?? offer.maxRedemptions,
      perCustomerLimit: input.perCustomerLimit ?? offer.perCustomerLimit,
      startsAt: input.startsAt ?? offer.startsAt,
      endsAt: input.endsAt ?? offer.endsAt,
      timeStart: input.timeStart ?? offer.timeStart,
      timeEnd: input.timeEnd ?? offer.timeEnd,
      weekdays: input.weekdays ?? offer.weekdays,
      holidayNotes: input.holidayNotes ?? offer.holidayNotes,
    };

    const v = validateOfferRules(merged, { requireServices: false });
    await assertNoDuplicate(technicianId, v.title, v.startsAt, v.endsAt, offerId);

    offer.type = merged.type;
    offer.title = v.title;
    offer.titleKey = v.title.toLowerCase();
    offer.subtitle = merged.subtitle?.trim();
    offer.description = v.description;
    offer.terms = merged.terms?.trim();
    offer.bannerImageUrl = merged.bannerImageUrl?.trim();
    offer.promotionColor = merged.promotionColor?.trim() || '#0F766E';
    offer.badge = merged.badge?.trim();
    offer.categoryIds = v.categoryIds.map(oid) as Types.ObjectId[];
    offer.serviceNames = v.serviceNames;
    offer.serviceAreaDistricts = v.districts;
    offer.availabilityNote = merged.availabilityNote?.trim();
    offer.discountValue = v.discountValue;
    offer.currency = (merged.currency || 'UGX').toUpperCase().slice(0, 3);
    offer.minimumBookingAmount = merged.minimumBookingAmount;
    offer.maximumDiscountAmount = merged.maximumDiscountAmount;
    offer.maxRedemptions = merged.maxRedemptions;
    offer.perCustomerLimit = merged.perCustomerLimit ?? 1;
    offer.startsAt = v.startsAt;
    offer.endsAt = v.endsAt;
    offer.timeStart = merged.timeStart;
    offer.timeEnd = merged.timeEnd;
    offer.weekdays = merged.weekdays || [];
    offer.holidayNotes = merged.holidayNotes?.trim();
    if (offer.status === OFFER_STATUS.REJECTED) {
      offer.status = OFFER_STATUS.DRAFT;
      offer.rejectionReason = undefined;
    }
    await offer.save();

    return { offer: serializeOffer(offer) };
  },

  async submitForApproval(technicianId: string, offerId: string) {
    const offer = await getOwned(technicianId, offerId);
    if (![OFFER_STATUS.DRAFT, OFFER_STATUS.REJECTED].includes(offer.status as never)) {
      throw AppError.badRequest('Only draft or rejected offers can be submitted');
    }

    validateOfferRules(
      {
        type: offer.type,
        title: offer.title,
        description: offer.description,
        discountValue: offer.discountValue,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        serviceNames: offer.serviceNames,
        categoryIds: offer.categoryIds.map((id) => id.toString()),
        serviceAreaDistricts: offer.serviceAreaDistricts,
        maxRedemptions: offer.maxRedemptions,
        perCustomerLimit: offer.perCustomerLimit,
        minimumBookingAmount: offer.minimumBookingAmount,
        maximumDiscountAmount: offer.maximumDiscountAmount,
        timeStart: offer.timeStart,
        timeEnd: offer.timeEnd,
      },
      { requireServices: true },
    );

    if (offer.endsAt <= new Date()) {
      throw AppError.badRequest('Cannot submit an offer that already expired');
    }

    offer.status = OFFER_STATUS.PENDING;
    offer.submittedAt = new Date();
    offer.rejectionReason = undefined;
    await offer.save();

    await writeAuditLog({
      actorId: technicianId,
      actorRole: 'technician',
      action: 'offer.submitted',
      resourceType: 'TechnicianOffer',
      resourceId: offer._id.toString(),
    });

    return { offer: serializeOffer(offer) };
  },

  async withdrawToDraft(technicianId: string, offerId: string) {
    const offer = await getOwned(technicianId, offerId);
    if (offer.status !== OFFER_STATUS.PENDING) {
      throw AppError.badRequest('Only pending offers can be withdrawn');
    }
    offer.status = OFFER_STATUS.DRAFT;
    await offer.save();
    return { offer: serializeOffer(offer) };
  },

  async archive(technicianId: string, offerId: string) {
    const offer = await getOwned(technicianId, offerId);
    offer.status = OFFER_STATUS.ARCHIVED;
    await offer.save();
    return { offer: serializeOffer(offer) };
  },

  async remove(technicianId: string, offerId: string) {
    const offer = await getOwned(technicianId, offerId);
    if (![OFFER_STATUS.DRAFT, OFFER_STATUS.REJECTED, OFFER_STATUS.ARCHIVED].includes(offer.status as never)) {
      throw AppError.badRequest('Archive or reject before deleting an offer that was submitted');
    }
    offer.isDeleted = true;
    offer.deletedAt = new Date();
    await offer.save();
    return { ok: true };
  },

  async getMine(technicianId: string, offerId: string) {
    const offer = await getOwned(technicianId, offerId);
    await syncLifecycleStatus(offer);
    return { offer: serializeOffer(offer) };
  },

  async listMine(technicianId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const lifecycle = String(req.query.lifecycle || req.query.status || '');
    const q = String(req.query.q || '').trim();
    const now = new Date();
    const filter: Record<string, unknown> = { technicianId: oid(technicianId) };
    Object.assign(filter, lifecycleFilter(lifecycle, now));
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');

    await bulkSyncLifecycleForTechnician(technicianId, now);

    const [total, rows] = await Promise.all([
      TechnicianOffer.countDocuments(filter),
      TechnicianOffer.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return {
      items: rows.map((r) => serializeOffer(r as never, now)),
      meta: paginationMeta(total, page, limit),
    };
  },

  async dashboard(technicianId: string) {
    const now = new Date();
    const tid = oid(technicianId);
    await bulkSyncLifecycleForTechnician(tid, now);

    const [agg, recent] = await Promise.all([
      TechnicianOffer.aggregate<{
        _id: null;
        offers: number;
        views: number;
        clicks: number;
        bookings: number;
        revenueGenerated: number;
        draft: number;
        pending: number;
        approved: number;
        rejected: number;
        scheduled: number;
        active: number;
        expired: number;
        archived: number;
      }>([
        { $match: { technicianId: tid, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            offers: { $sum: 1 },
            views: { $sum: { $ifNull: ['$analytics.views', 0] } },
            clicks: { $sum: { $ifNull: ['$analytics.clicks', 0] } },
            bookings: { $sum: { $ifNull: ['$analytics.bookings', 0] } },
            revenueGenerated: { $sum: { $ifNull: ['$analytics.revenueGenerated', 0] } },
            draft: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.DRAFT] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.PENDING] }, 1, 0] } },
            approved: {
              $sum: {
                $cond: [
                  {
                    $in: ['$status', [OFFER_STATUS.APPROVED, OFFER_STATUS.SCHEDULED, OFFER_STATUS.ACTIVE]],
                  },
                  1,
                  0,
                ],
              },
            },
            rejected: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.REJECTED] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.SCHEDULED] }, 1, 0] } },
            active: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.ACTIVE] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.EXPIRED] }, 1, 0] } },
            archived: { $sum: { $cond: [{ $eq: ['$status', OFFER_STATUS.ARCHIVED] }, 1, 0] } },
          },
        },
      ]),
      TechnicianOffer.find({ technicianId: tid }).sort({ updatedAt: -1 }).limit(5).lean(),
    ]);

    const row = agg[0];
    const clicks = row?.clicks || 0;
    const bookings = row?.bookings || 0;

    return {
      counts: {
        draft: row?.draft || 0,
        pending: row?.pending || 0,
        approved: row?.approved || 0,
        rejected: row?.rejected || 0,
        scheduled: row?.scheduled || 0,
        active: row?.active || 0,
        expired: row?.expired || 0,
        archived: row?.archived || 0,
      } satisfies Record<OfferLifecycle, number>,
      totals: {
        offers: row?.offers || 0,
        views: row?.views || 0,
        clicks,
        bookings,
        revenueGenerated: row?.revenueGenerated || 0,
        conversionRate: clicks > 0 ? Number(((bookings / clicks) * 100).toFixed(1)) : 0,
      },
      recent: recent.map((o) => serializeOffer(o as never, now)),
    };
  },

  async analytics(technicianId: string, offerId?: string) {
    const now = new Date();
    if (offerId) {
      const offer = await getOwned(technicianId, offerId);
      await syncLifecycleStatus(offer, now);
      return { offer: serializeOffer(offer, now) };
    }
    return this.dashboard(technicianId);
  },

  async trackEvent(
    offerId: string,
    event: 'view' | 'click' | 'booking',
    opts: { amount?: number; requirePublic?: boolean } = {},
  ) {
    const offer = await TechnicianOffer.findById(offerId);
    if (!offer || offer.isDeleted) throw AppError.notFound('Offer not found');
    if (opts.requirePublic && !isCustomerVisible(offer)) {
      throw AppError.badRequest('Offer is not publicly available');
    }

    if (event === 'view') offer.analytics.views += 1;
    if (event === 'click') offer.analytics.clicks += 1;
    if (event === 'booking') {
      offer.analytics.bookings += 1;
      offer.analytics.redemptionCount += 1;
      if (opts.amount && opts.amount > 0) offer.analytics.revenueGenerated += opts.amount;
      if (offer.maxRedemptions && offer.analytics.redemptionCount >= offer.maxRedemptions) {
        // Cap reached — expire early for public visibility
        offer.status = OFFER_STATUS.EXPIRED;
      }
    }
    await offer.save();
    return { offer: serializeOffer(offer) };
  },

  /** Customer-facing: only admin-approved offers inside their live window. */
  async listPublic(req: Request) {
    const { page, limit, skip } = parsePagination(req, { limit: 24 });
    const now = new Date();
    const technicianId = String(req.query.technicianId || '');
    const district = String(req.query.district || '').trim();
    const categoryId = String(req.query.categoryId || '').trim();
    const sort = String(req.query.sort || 'newest').trim();
    const section = String(req.query.section || '').trim();
    const customerUserId =
      typeof (req as Request & { auth?: { userId?: string } }).auth?.userId === 'string'
        ? (req as Request & { auth?: { userId?: string } }).auth!.userId
        : undefined;

    const filter: Record<string, unknown> = {
      status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.ACTIVE, OFFER_STATUS.SCHEDULED] },
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    };
    if (technicianId) filter.technicianId = oid(technicianId);
    if (district) filter.serviceAreaDistricts = new RegExp(`^${escapeRegex(district)}$`, 'i');
    if (categoryId) filter.categoryIds = oid(categoryId);
    if (section === 'featured') filter.featured = true;

    const viewerEnv = customerUserId ? await resolveUserDataEnvironment(customerUserId) : 'production';
    applyDataEnvironment(filter, viewerEnv);

    let sortSpec: Record<string, 1 | -1> = { publishedAt: -1, createdAt: -1 };
    if (sort === 'discount' || sort === 'highest_discount') sortSpec = { discountValue: -1, publishedAt: -1 };
    if (sort === 'expiring' || sort === 'expiring_soon') sortSpec = { endsAt: 1 };
    if (sort === 'popular' || sort === 'most_popular') sortSpec = { 'analytics.clicks': -1, 'analytics.views': -1 };
    if (sort === 'newest') sortSpec = { publishedAt: -1, createdAt: -1 };
    if (section === 'featured') sortSpec = { featured: -1, publishedAt: -1 };

    // Fetch a wider window for client-side section buckets / nearby soft ranking
    const fetchLimit = Math.min(100, Math.max(limit, section ? limit : limit));
    const [total, rows] = await Promise.all([
      TechnicianOffer.countDocuments(filter),
      TechnicianOffer.find(filter).sort(sortSpec).skip(skip).limit(fetchLimit),
    ]);

    let visible = rows.filter((r) => isCustomerVisible(r, now));
    if (section === 'expiring') {
      visible = [...visible].sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
    }
    if (section === 'popular') {
      visible = [...visible].sort(
        (a, b) => (b.analytics?.clicks || 0) - (a.analytics?.clicks || 0) || (b.analytics?.views || 0) - (a.analytics?.views || 0),
      );
    }
    if (section === 'recommended') {
      visible = [...visible].sort(
        (a, b) => Number(b.featured) - Number(a.featured) || (b.analytics?.bookings || 0) - (a.analytics?.bookings || 0),
      );
    }

    const sliced = visible.slice(0, limit);
    const items = await enrichOffers(
      sliced.map((r) => serializeOffer(r, now)),
      { customerUserId, viewerDistrict: district },
    );

    return {
      items,
      meta: paginationMeta(total, page, limit),
    };
  },

  async getPublic(offerId: string, opts?: { customerUserId?: string; district?: string }) {
    const offer = await TechnicianOffer.findById(offerId);
    if (!offer || offer.isDeleted) throw AppError.notFound('Offer not found');
    const viewerEnv = opts?.customerUserId
      ? await resolveUserDataEnvironment(opts.customerUserId)
      : 'production';
    assertDocumentVisibleToViewer(viewerEnv, documentDataEnvironment(offer), 'Offer not found');
    if (!isCustomerVisible(offer)) throw AppError.notFound('Offer is not available');
    const [enriched] = await enrichOffers([serializeOffer(offer)], {
      customerUserId: opts?.customerUserId,
      viewerDistrict: opts?.district,
    });
    return { offer: enriched };
  },

  async homeFeed(req: Request) {
    const district = String(req.query.district || '').trim();
    const customerUserId =
      typeof (req as Request & { auth?: { userId?: string } }).auth?.userId === 'string'
        ? (req as Request & { auth?: { userId?: string } }).auth!.userId
        : undefined;
    const now = new Date();
    const filter: Record<string, unknown> = {
      status: { $in: [OFFER_STATUS.APPROVED, OFFER_STATUS.ACTIVE, OFFER_STATUS.SCHEDULED] },
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    };
    const viewerEnv = customerUserId ? await resolveUserDataEnvironment(customerUserId) : 'production';
    applyDataEnvironment(filter, viewerEnv);

    const rows = await TechnicianOffer.find(filter).sort({ publishedAt: -1 }).limit(60);
    const visible = rows.filter((r) => isCustomerVisible(r, now));
    const serialized = visible.map((r) => serializeOffer(r, now));
    const all = await enrichOffers(serialized, { customerUserId, viewerDistrict: district });

    const nearby = district
      ? all.filter((o) =>
          (o.serviceAreaDistricts || []).some((d) => d.toLowerCase() === district.toLowerCase()),
        )
      : all.slice(0, 8);

    const featured = all.filter((o) => o.featured).slice(0, 8);
    const { resolveBoostContributions } = await import('../marketplace/boost.service.js');
    const techIds = [...new Set(all.map((o) => o.technicianId).filter(Boolean))] as string[];
    const boostMap = await resolveBoostContributions(techIds, {
      placement: 'offers',
      district,
      viewerUserId: customerUserId,
    });
    const recommended = [...all]
      .sort((a, b) => {
        const aBoost = boostMap.get(String(a.technicianId))?.promotionBoost ? 1 : 0;
        const bBoost = boostMap.get(String(b.technicianId))?.promotionBoost ? 1 : 0;
        return (
          bBoost - aBoost ||
          Number(b.featured) - Number(a.featured) ||
          (b.analytics.bookings || 0) - (a.analytics.bookings || 0) ||
          (b.technician?.trustScore || 0) - (a.technician?.trustScore || 0)
        );
      })
      .slice(0, 8);
    const expiringSoon = [...all]
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
      .slice(0, 8);
    const popular = [...all]
      .sort(
        (a, b) =>
          (b.analytics.clicks || 0) - (a.analytics.clicks || 0) ||
          (b.analytics.views || 0) - (a.analytics.views || 0),
      )
      .slice(0, 8);

    return {
      featured: featured.length ? featured : all.slice(0, 4),
      nearby: nearby.length ? nearby : all.slice(0, 8),
      recommended,
      expiringSoon,
      popular,
    };
  },

  async saveOffer(customerUserId: string, offerId: string) {
    const offer = await TechnicianOffer.findById(offerId);
    if (!offer || offer.isDeleted || !isCustomerVisible(offer)) {
      throw AppError.notFound('Offer not found');
    }
    const existing = await SavedOffer.findOne({ customerUserId: oid(customerUserId), offerId: oid(offerId) });
    if (existing) {
      const [enriched] = await enrichOffers([serializeOffer(offer)], {
        customerUserId,
      });
      return { offer: { ...enriched, saved: true, remindBeforeExpiry: existing.remindBeforeExpiry } };
    }
    await SavedOffer.create({
      customerUserId: oid(customerUserId),
      offerId: oid(offerId),
      technicianId: offer.technicianId,
      remindBeforeExpiry: true,
      savedAt: new Date(),
    });
    const [enriched] = await enrichOffers([serializeOffer(offer)], { customerUserId });
    return { offer: { ...enriched, saved: true, remindBeforeExpiry: true } };
  },

  async unsaveOffer(customerUserId: string, offerId: string) {
    await SavedOffer.deleteOne({ customerUserId: oid(customerUserId), offerId: oid(offerId) });
    return { ok: true };
  },

  async listSavedOffers(customerUserId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter = { customerUserId: oid(customerUserId) };
    const [total, rows] = await Promise.all([
      SavedOffer.countDocuments(filter),
      SavedOffer.find(filter).sort({ savedAt: -1 }).skip(skip).limit(limit),
    ]);
    const offerIds = rows.map((r) => r.offerId);
    const offers = await TechnicianOffer.find({ _id: { $in: offerIds } });
    const byId = new Map(offers.map((o) => [o._id.toString(), o]));
    const ordered = rows
      .map((r) => byId.get(r.offerId.toString()))
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
    const items = await enrichOffers(
      ordered.map((o) => serializeOffer(o)),
      { customerUserId },
    );
    return { items, meta: paginationMeta(total, page, limit) };
  },

  async setOfferReminder(customerUserId: string, offerId: string, remindBeforeExpiry: boolean) {
    let saved = await SavedOffer.findOne({ customerUserId: oid(customerUserId), offerId: oid(offerId) });
    if (!saved) {
      const offer = await TechnicianOffer.findById(offerId);
      if (!offer || !isCustomerVisible(offer)) throw AppError.notFound('Offer not found');
      saved = await SavedOffer.create({
        customerUserId: oid(customerUserId),
        offerId: oid(offerId),
        technicianId: offer.technicianId,
        remindBeforeExpiry,
        savedAt: new Date(),
      });
    } else {
      saved.remindBeforeExpiry = remindBeforeExpiry;
      if (!remindBeforeExpiry) saved.reminderSentAt = undefined;
      await saved.save();
    }
    return { remindBeforeExpiry: saved.remindBeforeExpiry, saved: true };
  },

  /** Send expiry reminders for saved offers ending within 24h (idempotent per save). */
  async sendDueExpiryReminders() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const saves = await SavedOffer.find({
      remindBeforeExpiry: true,
      $or: [{ reminderSentAt: { $exists: false } }, { reminderSentAt: null }],
    }).limit(200);

    let sent = 0;
    for (const save of saves) {
      const offer = await TechnicianOffer.findById(save.offerId);
      if (!offer || !isCustomerVisible(offer, now)) continue;
      if (offer.endsAt > horizon || offer.endsAt < now) continue;
      await createDbNotification({
        userId: save.customerUserId.toString(),
        type: 'offer.expiry_reminder',
        title: 'Offer expiring soon',
        body: `“${offer.title}” ends soon. Book now before it expires.`,
        href: `/customer/offers/${offer._id.toString()}`,
        meta: { offerId: offer._id.toString() },
        data: { offerId: offer._id.toString(), type: 'offer.expiry_reminder' },
      });
      save.reminderSentAt = now;
      await save.save();
      sent += 1;
    }
    return { sent };
  },

  async adminList(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const lifecycle = String(req.query.lifecycle || req.query.status || 'pending');
    const q = String(req.query.q || '').trim();
    const now = new Date();
    const filter: Record<string, unknown> = {};
    Object.assign(filter, lifecycleFilter(lifecycle || 'pending', now));
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');

    const [total, rows] = await Promise.all([
      TechnicianOffer.countDocuments(filter),
      TechnicianOffer.find(filter).sort({ submittedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return {
      items: rows.map((r) => serializeOffer(r, now)),
      meta: paginationMeta(total, page, limit),
    };
  },

  async adminModerate(
    adminId: string,
    offerId: string,
    action:
      | 'approve'
      | 'reject'
      | 'archive'
      | 'suspend'
      | 'feature'
      | 'unfeature'
      | 'expire'
      | 'delete',
    reason?: string,
  ) {
    const offer = await TechnicianOffer.findById(offerId);
    if (!offer || offer.isDeleted) throw AppError.notFound('Offer not found');
    const now = new Date();
    let auditAction = `offer.${action}`;

    if (action === 'approve') {
      if (offer.status !== OFFER_STATUS.PENDING) throw AppError.badRequest('Only pending offers can be approved');
      if (offer.endsAt <= now) throw AppError.badRequest('Cannot approve an already expired offer');
      offer.status = now < offer.startsAt ? OFFER_STATUS.SCHEDULED : OFFER_STATUS.ACTIVE;
      offer.publishedAt = now;
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      offer.rejectionReason = undefined;
      auditAction = 'offer.approved';
    } else if (action === 'reject') {
      if (offer.status !== OFFER_STATUS.PENDING) throw AppError.badRequest('Only pending offers can be rejected');
      offer.status = OFFER_STATUS.REJECTED;
      offer.rejectionReason = String(reason || 'Does not meet FixNow marketing guidelines').slice(0, 500);
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      offer.featured = false;
      auditAction = 'offer.rejected';
    } else if (action === 'archive' || action === 'suspend') {
      if (offer.status === OFFER_STATUS.DRAFT || offer.status === OFFER_STATUS.ARCHIVED) {
        throw AppError.badRequest('Offer cannot be archived from its current status');
      }
      offer.status = OFFER_STATUS.ARCHIVED;
      offer.featured = false;
      offer.rejectionReason = String(
        reason || (action === 'suspend' ? 'Suspended by admin' : 'Archived by admin'),
      ).slice(0, 500);
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      auditAction = action === 'suspend' ? 'offer.suspended' : 'offer.archived';
    } else if (action === 'feature') {
      if (!isCustomerVisible(offer, now) && offer.status !== OFFER_STATUS.PENDING) {
        throw AppError.badRequest('Only live or pending offers can be featured');
      }
      offer.featured = true;
      if (!offer.badge?.trim()) offer.badge = 'Featured';
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      auditAction = 'offer.featured';
    } else if (action === 'unfeature') {
      offer.featured = false;
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      auditAction = 'offer.unfeatured';
    } else if (action === 'expire') {
      offer.status = OFFER_STATUS.EXPIRED;
      offer.featured = false;
      offer.endsAt = now;
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      auditAction = 'offer.expired';
    } else if (action === 'delete') {
      offer.isDeleted = true;
      offer.deletedAt = now;
      offer.status = OFFER_STATUS.ARCHIVED;
      offer.featured = false;
      offer.reviewedAt = now;
      offer.reviewedByAdminId = oid(adminId);
      auditAction = 'offer.deleted';
    } else {
      throw AppError.badRequest('Unsupported moderation action');
    }

    await offer.save();

    if (action === 'approve') {
      await notifyFavouriteCustomersOfNewOffer(offer);
      await notifyNearbyCustomersOfOffer(offer);
      await notifyTechnicianOfferEvent(
        offer,
        'offer.approved',
        'Offer approved',
        `“${offer.title}” was approved and can go live in its schedule window.`,
      );
    } else if (action === 'reject') {
      await notifyTechnicianOfferEvent(
        offer,
        'offer.rejected',
        'Offer rejected',
        `“${offer.title}” was rejected. ${offer.rejectionReason || ''}`.trim(),
      );
    } else if (action === 'expire') {
      await notifyTechnicianOfferEvent(
        offer,
        'offer.expired',
        'Offer expired',
        `“${offer.title}” has been marked expired by admin.`,
      );
    } else if (action === 'suspend' || action === 'archive') {
      await notifyTechnicianOfferEvent(
        offer,
        action === 'suspend' ? 'offer.suspended' : 'offer.archived',
        action === 'suspend' ? 'Offer suspended' : 'Offer archived',
        `“${offer.title}” was ${action === 'suspend' ? 'suspended' : 'archived'} by admin.`,
      );
    } else if (action === 'feature') {
      await notifyTechnicianOfferEvent(
        offer,
        'offer.featured',
        'Offer featured',
        `“${offer.title}” is now featured for customers.`,
      );
    }

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: auditAction,
      resourceType: 'TechnicianOffer',
      resourceId: offer._id.toString(),
      meta: { reason: offer.rejectionReason, featured: offer.featured },
    });

    return { offer: serializeOffer(offer) };
  },

  async adminDuplicate(adminId: string, offerId: string) {
    const source = await TechnicianOffer.findById(offerId);
    if (!source || source.isDeleted) throw AppError.notFound('Offer not found');
    const copy = await TechnicianOffer.create({
      technicianId: source.technicianId,
      type: source.type,
      title: `${source.title} (copy)`,
      subtitle: source.subtitle,
      description: source.description,
      terms: source.terms,
      bannerImageUrl: source.bannerImageUrl,
      promotionColor: source.promotionColor,
      badge: source.badge,
      categoryIds: source.categoryIds,
      serviceNames: source.serviceNames,
      serviceAreaDistricts: source.serviceAreaDistricts,
      availabilityNote: source.availabilityNote,
      discountValue: source.discountValue,
      currency: source.currency,
      minimumBookingAmount: source.minimumBookingAmount,
      maximumDiscountAmount: source.maximumDiscountAmount,
      maxRedemptions: source.maxRedemptions,
      perCustomerLimit: source.perCustomerLimit,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      timeStart: source.timeStart,
      timeEnd: source.timeEnd,
      weekdays: source.weekdays,
      holidayNotes: source.holidayNotes,
      status: OFFER_STATUS.DRAFT,
      featured: false,
      analytics: { views: 0, clicks: 0, bookings: 0, revenueGenerated: 0, redemptionCount: 0 },
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'offer.duplicated',
      resourceType: 'TechnicianOffer',
      resourceId: copy._id.toString(),
      meta: { sourceId: source._id.toString() },
    });
    return { offer: serializeOffer(copy) };
  },
};
