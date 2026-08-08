import type { Request } from 'express';
import {
  CoverageArea,
  Portfolio,
  TechnicianAvailability,
  TechnicianProfile,
  TechnicianService,
  TrustScore,
  User,
  WorkingHours,
} from '../../models/index.js';
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { publicMediaUrl } from '../../utils/mediaUrl.js';
import { escapeRegex, paginationMeta, parsePagination, parseSort } from '../../utils/pagination.js';
import { emitAvailabilityChanged } from '../../sockets/realtime.js';
import { canViewCustomerContact, getFreeJobConfig } from './freeJob.service.js';
import { applyDataEnvironment, assertDocumentVisibleToViewer, documentDataEnvironment, resolveUserDataEnvironment } from '../sandbox/dataEnvironment.js';
import {
  getRecommendationSettings,
  scoreTechnician,
} from './recommendation.service.js';
import {
  ensureTechnicianApprovalPolicy,
  getTechnicianApprovalPolicy,
} from './technicianApproval.service.js';

async function getOrCreateTechnicianProfile(userId: string) {
  let profile = await TechnicianProfile.findOne({ userId });
  if (!profile) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    const config = await getFreeJobConfig();
    profile = await TechnicianProfile.create({
      userId,
      freeJobLimit: config.defaultLimit,
      remainingFreeJobs: config.defaultLimit,
      languages: ['en'],
    });
    await TechnicianAvailability.create({
      technicianProfileId: profile._id,
      technicianUserId: userId,
      status: 'offline',
    });
    await Portfolio.create({
      technicianUserId: userId,
      technicianProfileId: profile._id,
      title: `${user.fullName}'s Portfolio`,
    });
  }
  return profile;
}

function publicTechnician(profile: InstanceType<typeof TechnicianProfile>, user: InstanceType<typeof User>, opts: { includeContact: boolean }) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: opts.includeContact ? user.email : undefined,
    phone: opts.includeContact ? user.phone ?? null : undefined,
    headline: profile.headline,
    bio: profile.bio,
    photoUrl: publicMediaUrl(profile.photoUrl),
    profileImageUrl: publicMediaUrl(profile.photoUrl),
    coverUrl: publicMediaUrl(profile.coverUrl),
    skills: profile.skills,
    languages: profile.languages,
    experienceYears: profile.experienceYears,
    experienceLevel: profile.experienceLevel,
    currentRank: profile.currentRank,
    trustScore: profile.trustScore,
    reliabilityScore: profile.reliabilityScore,
    completionScore: profile.completionScore,
    responseScore: profile.responseScore,
    punctualityScore: profile.punctualityScore,
    ratingAverage: profile.ratingAverage,
    reviewCount: profile.reviewCount,
    jobsCompleted: profile.jobsCompleted,
    verificationStatus: profile.verificationStatus,
    identityVerified: profile.identityVerified,
    skillVerified: profile.skillVerified,
    isAvailableNow: profile.isAvailableNow,
    location: profile.location,
    badgeIds: profile.badgeIds,
    primaryCategoryId: profile.primaryCategoryId,
    subscriptionPlanCode: profile.subscriptionPlanCode,
    companyName: profile.companyName,
    businessLogoUrl: publicMediaUrl(profile.businessLogoUrl),
    businessSlogan: profile.businessSlogan,
    brandPrimaryColor: profile.brandPrimaryColor,
    brandSecondaryColor: profile.brandSecondaryColor,
    companyMission: profile.companyMission,
    companyVision: profile.companyVision,
    businessVerificationStatus: profile.businessVerificationStatus,
  };
}

export const technicianMarketplaceService = {
  async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    const profile = await getOrCreateTechnicianProfile(userId);
    const [availability, workingHours, coverageAreas, services, trust, portfolio] = await Promise.all([
      TechnicianAvailability.findOne({ technicianUserId: userId }),
      WorkingHours.find({ technicianUserId: userId }).sort({ dayOfWeek: 1 }),
      CoverageArea.find({ technicianUserId: userId }),
      TechnicianService.find({ technicianUserId: userId, isActive: true }),
      TrustScore.findOne({ technicianUserId: userId }),
      Portfolio.findOne({ technicianUserId: userId }),
    ]);

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        phone: user.phone ?? null,
        fullName: user.fullName,
        accountStatus: user.accountStatus,
      },
      profile: {
        ...profile.toObject(),
        freeJobs: {
          used: profile.freeJobsUsed,
          limit: profile.freeJobLimit,
          remaining: profile.remainingFreeJobs,
          locked: profile.accountLocked,
          lockReason: profile.lockReason ?? null,
        },
      },
      availability,
      workingHours,
      coverageAreas,
      services,
      trust,
      portfolio,
    };
  },

  async updateProfile(
    userId: string,
    input: Partial<{
      fullName: string;
      phone: string;
      headline: string;
      bio: string;
      photoUrl: string;
      avatarId: string | null;
      uploadedPhotoUrl: string | null;
      clearUploadedPhoto: boolean;
      coverUrl: string;
      primaryCategoryId: string;
      subcategoryIds: string[];
      skills: string[];
      languages: string[];
      experienceYears: number;
      location: Record<string, unknown>;
      searchKeywords: string[];
      companyName: string;
      businessLogoUrl: string;
      businessSlogan: string;
      brandPrimaryColor: string;
      brandSecondaryColor: string;
      companyMission: string;
      companyVision: string;
      businessRegistrationNumber: string;
      taxIdentificationNumber: string;
      requestBusinessVerification: boolean;
    }>,
    meta: { ip?: string } = {},
  ) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (input.fullName) user.fullName = input.fullName;
    if (input.phone !== undefined) user.phone = input.phone;
    if ((input as { acceptedTerms?: boolean }).acceptedTerms === true) {
      user.metadata = {
        ...(user.metadata || {}),
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: 'mvp-2026',
      };
    }
    await user.save();

    const profile = await getOrCreateTechnicianProfile(userId);
    const { resolveEntitlements } = await import('./entitlements.service.js');
    const ent = await resolveEntitlements(userId);

    const fields = [
      'headline',
      'bio',
      'photoUrl',
      'avatarId',
      'uploadedPhotoUrl',
      'coverUrl',
      'primaryCategoryId',
      'subcategoryIds',
      'skills',
      'languages',
      'experienceYears',
      'location',
      'searchKeywords',
    ] as const;
    for (const key of fields) {
      if (input[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profile as any)[key] = input[key];
      }
    }
    if (input.photoUrl && !String(input.photoUrl).includes('dicebear.com')) {
      profile.uploadedPhotoUrl = input.photoUrl;
    }
    if (input.clearUploadedPhoto) {
      const { getAvatarById } = await import('../sandbox/avatarLibrary.js');
      profile.uploadedPhotoUrl = undefined;
      const avatar = getAvatarById(profile.avatarId);
      if (avatar) profile.photoUrl = avatar.url;
    }

    if (input.companyName !== undefined && ent.featureFlags.companyName) {
      profile.companyName = String(input.companyName).slice(0, 120);
    }
    if (input.businessLogoUrl !== undefined && ent.featureFlags.businessLogo) {
      profile.businessLogoUrl = String(input.businessLogoUrl).slice(0, 1024);
    }
    if (input.businessSlogan !== undefined && ent.featureFlags.businessSlogan) {
      profile.businessSlogan = String(input.businessSlogan).slice(0, 160);
    }
    if (input.brandPrimaryColor !== undefined && ent.featureFlags.customProfileColours) {
      profile.brandPrimaryColor = String(input.brandPrimaryColor).slice(0, 32);
    }
    if (input.brandSecondaryColor !== undefined && ent.featureFlags.customProfileColours) {
      profile.brandSecondaryColor = String(input.brandSecondaryColor).slice(0, 32);
    }
    if (input.coverUrl !== undefined && (ent.featureFlags.customCoverImage || ent.featureFlags.advancedProfileBanner)) {
      profile.coverUrl = String(input.coverUrl).slice(0, 1024);
    }
    if (input.companyMission !== undefined) {
      profile.companyMission = String(input.companyMission).slice(0, 2000);
    }
    if (input.companyVision !== undefined) {
      profile.companyVision = String(input.companyVision).slice(0, 2000);
    }
    if (input.businessRegistrationNumber !== undefined && ent.featureFlags.businessRegistration) {
      profile.businessRegistrationNumber = String(input.businessRegistrationNumber).slice(0, 80);
    }
    if (input.taxIdentificationNumber !== undefined && ent.featureFlags.taxInformation) {
      profile.taxIdentificationNumber = String(input.taxIdentificationNumber).slice(0, 80);
    }
    if (
      input.requestBusinessVerification === true &&
      ent.featureFlags.companyVerification &&
      profile.businessVerificationStatus !== 'verified' &&
      profile.businessVerificationStatus !== 'pending'
    ) {
      profile.businessVerificationStatus = 'pending';
      profile.businessVerificationNote = undefined;
    }

    await profile.save();

    await writeAuditLog({
      actorId: userId,
      actorRole: 'technician',
      action: 'technician.update_profile',
      resourceType: 'TechnicianProfile',
      resourceId: profile._id.toString(),
      ip: meta.ip,
    });

    return this.getProfile(userId);
  },

  async getPublicProfile(technicianUserId: string, viewer?: { userId: string; role: string }) {
    const user = await User.findById(technicianUserId);
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!user || !profile) throw AppError.notFound('Technician not found');

    const viewerEnv = viewer?.userId
      ? await resolveUserDataEnvironment(viewer.userId)
      : 'production';
    if (viewer?.role !== 'admin') {
      assertDocumentVisibleToViewer(
        viewerEnv,
        documentDataEnvironment(user) !== 'production'
          ? documentDataEnvironment(user)
          : documentDataEnvironment(profile),
        'Technician not found',
      );
      // Customer-facing profiles require account approval when the gate is on.
      if (viewer?.role !== 'technician' || viewer.userId !== technicianUserId) {
        const policy = await getTechnicianApprovalPolicy();
        if (
          policy.enforceApprovalGate &&
          profile.verificationStatus !== VERIFICATION_STATUS.APPROVED
        ) {
          throw AppError.notFound('Technician not found');
        }
        if (
          profile.accountStatus === ACCOUNT_STATUS.SUSPENDED ||
          (profile.metadata as { hiddenFromCustomers?: boolean } | undefined)?.hiddenFromCustomers
        ) {
          throw AppError.notFound('Technician not found');
        }
      }
    }

    let includeContact = false;
    if (viewer?.role === 'admin') includeContact = true;
    if (viewer?.role === 'technician' && viewer.userId === technicianUserId) includeContact = true;
    if (viewer?.role === 'customer') includeContact = false;

    const [trust, portfolio, services, subscriptionBadge] = await Promise.all([
      TrustScore.findOne({ technicianUserId }),
      Portfolio.findOne({ technicianUserId, isPublic: true }),
      TechnicianService.find({ technicianUserId, isActive: true }),
      (async () => {
        const { resolvePublicSubscriptionBadge } = await import('./publicSubscriptionBadge.js');
        return resolvePublicSubscriptionBadge(profile, 'profile');
      })(),
    ]);

    return {
      technician: {
        ...publicTechnician(profile, user, { includeContact }),
        subscriptionBadge,
      },
      trust,
      portfolio,
      services,
      verification: {
        status: profile.verificationStatus,
        identityVerified: profile.identityVerified,
        skillVerified: profile.skillVerified,
      },
    };
  },

  async search(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const district = typeof req.query.district === 'string' ? req.query.district : undefined;
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
    const minTrust = req.query.minTrust ? Number(req.query.minTrust) : undefined;
    const available = req.query.available === 'true';

    await ensureTechnicianApprovalPolicy();
    const approvalPolicy = await getTechnicianApprovalPolicy();

    const filter: Record<string, unknown> = {
      accountStatus: { $in: [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.PENDING_VERIFICATION] },
      'metadata.hiddenFromCustomers': { $ne: true },
    };
    // Pending / rejected must never appear in customer discovery when gate is on.
    if (approvalPolicy.enforceApprovalGate) {
      filter.verificationStatus = VERIFICATION_STATUS.APPROVED;
    }
    if (district) filter['location.district'] = district;
    if (categoryId) filter.primaryCategoryId = categoryId;
    if (typeof minTrust === 'number' && !Number.isNaN(minTrust)) filter.trustScore = { $gte: minTrust };
    if (available) filter.isAvailableNow = true;
    if (q) {
      // Name/company matching uses User.fullName + profile company fields so discovery
      // is not limited to headline/skills alone (seed + real techs).
      const nameMatches = await User.find({
        role: ROLES.TECHNICIAN,
        fullName: { $regex: escapeRegex(q), $options: 'i' },
        isDeleted: { $ne: true },
      })
        .select('_id')
        .limit(80)
        .lean();
      const nameIds = nameMatches.map((u) => u._id);
      filter.$or = [
        { headline: { $regex: escapeRegex(q), $options: 'i' } },
        { skills: { $regex: escapeRegex(q), $options: 'i' } },
        { searchKeywords: { $regex: escapeRegex(q), $options: 'i' } },
        { companyName: { $regex: escapeRegex(q), $options: 'i' } },
        ...(nameIds.length ? [{ userId: { $in: nameIds } }] : []),
      ];
    }

    const viewerId = (req as { auth?: { userId?: string } }).auth?.userId;
    const viewerEnv = viewerId ? await resolveUserDataEnvironment(viewerId) : 'production';
    applyDataEnvironment(filter, viewerEnv);

    const sort = parseSort(
      typeof req.query.sort === 'string' ? req.query.sort : '-trustScore',
      ['trustScore', 'ratingAverage', 'jobsCompleted', 'createdAt'],
      { trustScore: -1 },
    );

    // Fair ranking: trust / reviews / availability first; subscription weight is a soft boost only.
    const profiles = await TechnicianProfile.find(filter)
      .select(
        'userId headline bio photoUrl coverUrl skills languages experienceYears experienceLevel currentRank trustScore reliabilityScore completionScore responseScore responseTimeMinutesAvg punctualityScore ratingAverage reviewCount jobsCompleted jobsCancelled verificationStatus identityVerified skillVerified isAvailableNow location badgeIds primaryCategoryId subscriptionPlanCode subscriptionStatus subscriptionPeriodEnd companyName businessLogoUrl businessSlogan brandPrimaryColor updatedAt',
      )
      .lean();

    const { hasActivePaidAccess } = await import('./subscription.service.js');
    const { SubscriptionPlan } = await import('../../models/index.js');
    const { resolveBoostContributions } = await import('./boost.service.js');
    const recommendationSettings = await getRecommendationSettings();
    const planCodes = [
      ...new Set(
        profiles
          .filter((p) => hasActivePaidAccess(p) && p.subscriptionPlanCode)
          .map((p) => String(p.subscriptionPlanCode).toUpperCase()),
      ),
    ];
    const plans = await SubscriptionPlan.find({ code: { $in: planCodes }, isActive: true }).lean();
    const planMap = Object.fromEntries(plans.map((pl) => [pl.code, pl]));

    const emergency = req.query.emergency === 'true' || req.query.urgent === 'true';
    const weekend = req.query.weekend === 'true';
    const newCustomer = req.query.newCustomer === 'true';
    const placement = typeof req.query.placement === 'string' ? req.query.placement : null;

    const boostMap = await resolveBoostContributions(
      profiles.map((p) => p.userId.toString()),
      {
        categoryId: categoryId || null,
        district: district || null,
        emergency,
        weekend,
        newCustomer,
        placement,
      },
    );

    const { DEFAULT_PLAN_BADGES } = await import('../../models/index.js');
    const { sanitizePublicBadge } = await import('./publicSubscriptionBadge.js');

    const originLat = req.query.lat != null ? Number(req.query.lat) : NaN;
    const originLng = req.query.lng != null ? Number(req.query.lng) : NaN;
    const origin =
      Number.isFinite(originLat) && Number.isFinite(originLng)
        ? { lat: originLat, lng: originLng }
        : null;

    const scored = profiles.map((p) => {
      let weight = 0;
      let premiumBadge = false;
      let featured = false;
      let subscriptionBadge: Record<string, unknown> | null = null;
      if (hasActivePaidAccess(p) && p.subscriptionPlanCode) {
        const plan = planMap[String(p.subscriptionPlanCode).toUpperCase()];
        const grace = Number(plan?.gracePeriodDays ?? 0);
        if (!hasActivePaidAccess(p, grace)) {
          /* unpaid after grace */
        } else {
          weight = Number(
            plan?.limits?.searchPriorityWeight ?? plan?.limits?.recommendationWeighting ?? 0,
          );
          premiumBadge = Boolean(plan?.featureFlags?.premiumBadge);
          featured = Boolean(plan?.featureFlags?.featuredPlacement);
          const code = String(p.subscriptionPlanCode).toUpperCase() as keyof typeof DEFAULT_PLAN_BADGES;
          const fallback = DEFAULT_PLAN_BADGES[code] || null;
          const badge = { ...(fallback || {}), ...(plan?.badge || {}) };
          if (badge && badge.enabled !== false && badge.visibleOnSearch !== false && (badge.text || badge.name)) {
            subscriptionBadge = sanitizePublicBadge(badge);
          }
        }
      }
      const boost = boostMap.get(p.userId.toString());
      const boostWeight = Number(boost?.weight || 0);
      if (boost?.homepageFeatured || boost?.businessSpotlight) featured = true;

      const ranked = recommendationSettings.enabled
        ? scoreTechnician(
            {
              userId: p.userId.toString(),
              trustScore: p.trustScore,
              ratingAverage: p.ratingAverage,
              reviewCount: p.reviewCount,
              jobsCompleted: p.jobsCompleted,
              jobsCancelled: (p as { jobsCancelled?: number }).jobsCancelled,
              responseScore: p.responseScore,
              responseTimeMinutesAvg: (p as { responseTimeMinutesAvg?: number }).responseTimeMinutesAvg,
              punctualityScore: p.punctualityScore,
              isAvailableNow: p.isAvailableNow,
              verificationStatus: p.verificationStatus,
              identityVerified: p.identityVerified,
              skillVerified: p.skillVerified,
              primaryCategoryId: p.primaryCategoryId?.toString(),
              subscriptionPlanCode: p.subscriptionPlanCode,
              subscriptionWeight: weight,
              boostWeight,
              featured,
              location: p.location,
              updatedAt: (p as { updatedAt?: Date }).updatedAt,
              emergencyCapable: emergency,
            },
            {
              origin,
              categoryId: categoryId || null,
              settings: recommendationSettings,
            },
          )
        : null;

      // Legacy fallback if engine disabled — still soft-weight only
      const legacyScore =
        Number(p.trustScore || 0) +
        Number(p.ratingAverage || 0) * 4 +
        Math.min(20, Number(p.jobsCompleted || 0) / 5) +
        (p.isAvailableNow ? 8 : 0) +
        weight +
        boostWeight +
        (featured ? 6 : 0);

      return {
        p,
        rankingScore: ranked?.score ?? legacyScore,
        distanceKm: ranked?.distanceKm ?? null,
        etaMinutes: ranked?.etaMinutes ?? null,
        etaLabel: ranked?.etaLabel ?? null,
        indicators: ranked?.indicators ?? [],
        matchFactors: ranked?.factors ?? null,
        premiumBadge,
        featured,
        weight,
        boostWeight,
        boostTypes: boost?.types || [],
        businessSpotlight: Boolean(boost?.businessSpotlight),
        subscriptionBadge,
      };
    });

    // Drop candidates outside max radius when origin provided and engine enabled
    const radiusKm =
      req.query.radiusKm != null
        ? Number(req.query.radiusKm)
        : recommendationSettings.maxSearchRadiusKm;
    const withinRadius =
      origin && recommendationSettings.enabled && Number.isFinite(radiusKm)
        ? scored.filter((s) => s.distanceKm == null || s.distanceKm <= radiusKm)
        : scored;

    const sortKey = Object.keys(sort)[0] || 'trustScore';
    const sortDir = (sort as Record<string, 1 | -1>)[sortKey] === 1 ? 1 : -1;
    withinRadius.sort((a, b) => {
      if (sortKey === 'trustScore' || !['ratingAverage', 'jobsCompleted', 'createdAt'].includes(sortKey)) {
        return (b.rankingScore - a.rankingScore) * (sortDir === 1 ? -1 : 1);
      }
      const av = Number((a.p as Record<string, unknown>)[sortKey] ?? 0);
      const bv = Number((b.p as Record<string, unknown>)[sortKey] ?? 0);
      return (bv - av) * (sortDir === 1 ? -1 : 1);
    });
    const scoredFinal = withinRadius;

    const total = scoredFinal.length;
    const pageSlice = scoredFinal.slice(skip, skip + limit);

    // Enrich visible page with Location Platform ETA (Google-first). Ranking stays sync/haversine-based.
    if (origin && recommendationSettings.showEstimatedArrival) {
      try {
        const { computeEtaViaLocationPlatform } = await import('./recommendation.service.js');
        await Promise.all(
          pageSlice.slice(0, 12).map(async (row) => {
            const target = row.p.location
              ? (() => {
                  const geo = (row.p.location as { geo?: { coordinates?: number[] } }).geo;
                  if (geo?.coordinates && geo.coordinates.length >= 2) {
                    return { lat: geo.coordinates[1], lng: geo.coordinates[0] };
                  }
                  return null;
                })()
              : null;
            if (!target) return;
            const eta = await computeEtaViaLocationPlatform(origin, target, recommendationSettings);
            if (!eta) return;
            row.etaMinutes = eta.minutes;
            row.etaLabel = eta.label;
            row.distanceKm = Math.round((eta.distanceMeters / 1000) * 10) / 10;
          }),
        );
      } catch {
        /* keep haversine ETA from scorer */
      }
    }

    // Soft analytics for active boosts shown in this page (non-blocking).
    void (async () => {
      try {
        const { trackBoostImpressionForTechnician } = await import('./boost.service.js');
        await Promise.all(
          pageSlice
            .filter((s) => s.boostWeight > 0)
            .slice(0, 12)
            .map((s) => trackBoostImpressionForTechnician(s.p.userId.toString(), 'view')),
        );
      } catch {
        /* ignore */
      }
    })();

    const users = await User.find({ _id: { $in: pageSlice.map((s) => s.p.userId) } })
      .select('fullName email phone role')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return {
      items: pageSlice
        .map(
          ({
            p,
            premiumBadge,
            featured,
            rankingScore,
            boostWeight,
            boostTypes,
            businessSpotlight,
            subscriptionBadge,
            distanceKm,
            etaMinutes,
            etaLabel,
            indicators,
          }) => {
          const u = userMap.get(p.userId.toString());
          if (!u) return null;
          const base = publicTechnician(p as never, u as never, { includeContact: false }) as Record<
            string,
            unknown
          >;
          const responseMins = (p as { responseTimeMinutesAvg?: number }).responseTimeMinutesAvg;
          return {
            ...base,
            premiumBadge,
            featuredPlacement: featured,
            businessSpotlight,
            boostActive: boostWeight > 0,
            boostWeight,
            boostTypes,
            subscriptionBadge,
            rankingScore,
            distanceKm,
            etaMinutes,
            etaLabel,
            indicators,
            responseTimeMinutesAvg: responseMins ?? null,
            responseTimeLabel:
              responseMins != null && Number.isFinite(responseMins)
                ? `Usually responds in ${Math.max(1, Math.round(responseMins))} minutes`
                : null,
            companyName: p.companyName,
            businessLogoUrl: p.businessLogoUrl,
            businessSlogan: p.businessSlogan,
            brandPrimaryColor: p.brandPrimaryColor,
            coverUrl: p.coverUrl,
          };
        })
        .filter(Boolean),
      meta: {
        ...paginationMeta(total, page, limit),
        recommendationEngine: recommendationSettings.enabled,
        originUsed: Boolean(origin),
        maxSearchRadiusKm: recommendationSettings.maxSearchRadiusKm,
      },
    };
  },

  async updateAvailability(
    userId: string,
    input: { status: 'available' | 'busy' | 'offline' | 'on_job'; availableFrom?: string; availableUntil?: string; notes?: string },
  ) {
    const profile = await getOrCreateTechnicianProfile(userId);
    const availability = await TechnicianAvailability.findOneAndUpdate(
      { technicianUserId: userId },
      {
        $set: {
          technicianProfileId: profile._id,
          status: input.status,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
          availableUntil: input.availableUntil ? new Date(input.availableUntil) : undefined,
          notes: input.notes,
          lastStatusChangeAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    profile.isAvailableNow = input.status === 'available';
    await profile.save();
    emitAvailabilityChanged(userId, availability);
    return { availability };
  },

  async setWorkingHours(
    userId: string,
    hours: Array<{ dayOfWeek: string; openTime: string; closeTime: string; isClosed?: boolean }>,
  ) {
    const profile = await getOrCreateTechnicianProfile(userId);
    const results = [];
    for (const h of hours) {
      const doc = await WorkingHours.findOneAndUpdate(
        { technicianUserId: userId, dayOfWeek: h.dayOfWeek },
        {
          $set: {
            technicianProfileId: profile._id,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isClosed: Boolean(h.isClosed),
            timezone: 'Africa/Kampala',
          },
        },
        { upsert: true, new: true },
      );
      results.push(doc);
    }
    return { workingHours: results };
  },

  async listCoverage(userId: string) {
    const areas = await CoverageArea.find({ technicianUserId: userId });
    return { coverageAreas: areas };
  },

  async upsertCoverage(
    userId: string,
    input: {
      district: string;
      city?: string;
      division?: string;
      subcounty?: string;
      parish?: string;
      village?: string;
      radiusKm?: number;
      isPrimary?: boolean;
      coordinates?: [number, number];
    },
  ) {
    const profile = await getOrCreateTechnicianProfile(userId);
    if (input.isPrimary) {
      await CoverageArea.updateMany({ technicianUserId: userId }, { $set: { isPrimary: false } });
    }
    const area = await CoverageArea.create({
      technicianProfileId: profile._id,
      technicianUserId: userId,
      district: input.district,
      city: input.city,
      division: input.division,
      subcounty: input.subcounty,
      parish: input.parish,
      village: input.village,
      radiusKm: input.radiusKm,
      isPrimary: Boolean(input.isPrimary),
      center: input.coordinates
        ? { type: 'Point', coordinates: input.coordinates }
        : undefined,
    });
    return { coverageArea: area };
  },

  async deleteCoverage(userId: string, areaId: string) {
    const area = await CoverageArea.findOne({ _id: areaId, technicianUserId: userId });
    if (!area) throw AppError.notFound('Coverage area not found');
    area.isDeleted = true;
    area.deletedAt = new Date();
    await area.save();
    return { deleted: true };
  },

  async upsertService(
    userId: string,
    input: {
      categoryId: string;
      subcategoryId?: string;
      title: string;
      description?: string;
      basePrice?: number;
      currency?: string;
      isActive?: boolean;
    },
  ) {
    const profile = await getOrCreateTechnicianProfile(userId);
    const service = await TechnicianService.create({
      technicianProfileId: profile._id,
      technicianUserId: userId,
      ...input,
      currency: input.currency ?? 'UGX',
      isActive: input.isActive !== false,
    });
    return { service };
  },

  async dashboard(userId: string) {
    const profile = await getOrCreateTechnicianProfile(userId);
    return {
      summary: {
        trustScore: profile.trustScore,
        jobsCompleted: profile.jobsCompleted,
        ratingAverage: profile.ratingAverage,
        reviewCount: profile.reviewCount,
        isAvailableNow: profile.isAvailableNow,
        verificationStatus: profile.verificationStatus,
        freeJobs: {
          used: profile.freeJobsUsed,
          limit: profile.freeJobLimit,
          remaining: profile.remainingFreeJobs,
          locked: profile.accountLocked,
          canApply: canViewCustomerContact(profile),
        },
        experienceLevel: profile.experienceLevel,
        currentRank: profile.currentRank,
      },
    };
  },
};
