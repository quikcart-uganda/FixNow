/**
 * Seed Platform generator — idempotent fixtures in Content Environment `sandbox`.
 * Does NOT create Developer Preview subscriptions (Phase 3).
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  AiConversation,
  AiMessage,
  CaseStudy,
  Category,
  Certificate,
  Conversation,
  ConversationParticipant,
  CustomerProfile,
  Job,
  JobApplication,
  Message,
  PlatformPromotion,
  Portfolio,
  PortfolioMedia,
  Rating,
  Review,
  SponsoredContent,
  TechnicianOffer,
  TechnicianProfile,
  User,
} from '../../../models/index.js';
import {
  ACCOUNT_STATUS,
  APPLICATION_STATUS,
  JOB_STATUS,
  MEDIA_TYPE,
  MESSAGE_TYPE,
  OFFER_STATUS,
  VERIFICATION_STATUS,
} from '../../../models/shared/enums.js';
import { ROLES } from '../../../constants/roles.js';
import { getAvatarById } from '../avatarLibrary.js';
import { assertSandboxEnabled } from '../sandboxSettings.service.js';
import {
  buildSeedMeta,
  DEVELOPER_CUSTOMER,
  DEVELOPER_TECHNICIAN,
  SEED_CONTENT_ENVIRONMENT,
  SEED_PLATFORM_VERSION,
  SEED_TAG,
  SEED_USER_PASSWORD,
  seedUserFilter,
} from './constants.js';
import {
  developerTechnicianDef,
  HISTORY_JOBS,
  mediaUrl,
  SEED_CUSTOMERS,
  SEED_OFFERS,
  SEED_REVIEWS,
  SEED_SUPPORT_TECHNICIANS,
  WORKFLOW_FIXTURES,
  type SeedCustomerDef,
  type SeedTechnicianDef,
  type WorkflowFixtureDef,
} from './fixtures.catalog.js';

export type SeedGenerateModule =
  | 'all'
  | 'customers'
  | 'technicians'
  | 'jobs'
  | 'reviews'
  | 'offers'
  | 'portfolios'
  | 'companies'
  | 'advertisements'
  | 'ai';

export type SeedGenerateResult = {
  version: string;
  environment: typeof SEED_CONTENT_ENVIRONMENT;
  modules: SeedGenerateModule[];
  counts: Record<string, number>;
  developerTechnician: { email: string; password: string; seedKey: string };
  loginHints: {
    customers: Array<{ email: string; password: string; name: string }>;
    technicians: Array<{ email: string; password: string; name: string; developer?: boolean }>;
  };
  fixtures: Array<{ fixtureId: string; purpose: string; title: string }>;
};

const dataEnvironment = SEED_CONTENT_ENVIRONMENT;

async function findCategoryId(name: string): Promise<mongoose.Types.ObjectId | undefined> {
  const exact = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).select('_id');
  if (exact) return exact._id;
  const fuzzy = await Category.findOne({ name: new RegExp(name.split(/\s+/)[0] || name, 'i') }).select('_id');
  return fuzzy?._id;
}

async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

function mergeMeta(
  existing: Record<string, unknown> | undefined,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing || {}), ...buildSeedMeta(extra) };
}

async function upsertCustomer(c: SeedCustomerDef, passwordHash: string): Promise<string> {
  const avatar = getAvatarById(c.avatarId);
  let user = await User.findOne({ email: c.email.toLowerCase() });
  const isPermanentSeedCustomer =
    c.email.toLowerCase() === DEVELOPER_CUSTOMER.email.toLowerCase() ||
    c.seedKey === DEVELOPER_CUSTOMER.seedKey;
  if (!user) {
    user = await User.create({
      email: c.email.toLowerCase(),
      phone: c.phone,
      passwordHash,
      authProviders: ['password'],
      role: ROLES.CUSTOMER,
      fullName: c.fullName,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      dataEnvironment,
      metadata: buildSeedMeta({ seedKey: c.seedKey }),
    });
  } else {
    // Never overwrite password for an existing customer — especially the Permanent Seed Customer.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          fullName: c.fullName,
          phone: c.phone,
          role: ROLES.CUSTOMER,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          dataEnvironment,
          ...(isPermanentSeedCustomer ? {} : { passwordHash }),
          metadata: mergeMeta(user.metadata as Record<string, unknown>, {
            seedKey: c.seedKey,
            ...(isPermanentSeedCustomer
              ? {
                  developer: true,
                  seed: true,
                  sandbox: true,
                  permanentDevelopmentCustomer: true,
                  developmentTestingEnabled: true,
                  scenarioPermissions: true,
                  governanceRole: 'permanent_development_customer',
                  platformRole: 'development_customer',
                }
              : {}),
          }),
          isDeleted: false,
          deletedAt: null,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
      },
    );
  }

  await CustomerProfile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        photoUrl: avatar?.url,
        avatarId: c.avatarId,
        bio: c.bio,
        languages: ['en', 'lg'],
        location: {
          country: 'UG',
          district: c.district,
          city: c.city,
          landmark: c.landmark,
          geo: { type: 'Point', coordinates: [c.lng, c.lat] },
        },
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: c.seedKey }),
        isDeleted: false,
        deletedAt: null,
      },
      $setOnInsert: { jobStats: { posted: 0, completed: 0, cancelled: 0 } },
    },
    { upsert: true },
  );

  return user._id.toString();
}

async function upsertTechnician(
  t: SeedTechnicianDef,
  passwordHash: string,
): Promise<{ userId: string; profileId: string }> {
  const avatar = getAvatarById(t.avatarId);
  const categoryId = await findCategoryId(t.categoryName);
  let user = await User.findOne({ email: t.email.toLowerCase() });
  const metaExtra = {
    seedKey: t.seedKey,
    developer: Boolean(t.isDeveloper),
  };

  if (!user) {
    user = await User.create({
      email: t.email.toLowerCase(),
      phone: t.phone,
      passwordHash,
      authProviders: ['password'],
      role: ROLES.TECHNICIAN,
      fullName: t.fullName,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      subscriptionPlanCode: t.plan,
      // Profile stamps only — not Preview subscriptions (Phase 3).
      subscriptionStatus: 'active',
      dataEnvironment,
      metadata: buildSeedMeta(metaExtra),
    });
  } else {
    // Permanent Development Technician: never silently overwrite the registration password.
    // Metadata / profile fields still refresh; passwordHash is preserved for this email.
    const preservePassword = Boolean(t.isDeveloper)
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          fullName: t.fullName,
          phone: t.phone,
          role: ROLES.TECHNICIAN,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          subscriptionPlanCode: t.plan,
          subscriptionStatus: 'active',
          dataEnvironment,
          ...(preservePassword ? {} : { passwordHash }),
          metadata: mergeMeta(user.metadata as Record<string, unknown>, {
            ...metaExtra,
            seed: true,
            sandbox: true,
            permanentDevelopmentTechnician: Boolean(t.isDeveloper),
            developmentTestingEnabled: Boolean(t.isDeveloper),
            environment: 'sandbox',
            governanceRole: t.isDeveloper ? 'permanent_development_technician' : undefined,
            platformRole: t.isDeveloper ? 'development_technician' : undefined,
          }),
          isDeleted: false,
          deletedAt: null,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
      },
    );
  }

  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        headline: t.headline,
        bio: t.bio,
        photoUrl: avatar?.url,
        avatarId: t.avatarId,
        skills: t.skills,
        searchKeywords: [
          t.fullName,
          t.headline,
          t.companyName,
          t.district,
          ...t.skills,
          ...(t.isDeveloper
            ? [DEVELOPER_TECHNICIAN.email, 'development technician', 'seed', 'jordan mutebi']
            : []),
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .slice(0, 40),
        languages: ['en', 'lg'],
        experienceYears: t.isDeveloper ? 15 : Math.max(3, Math.round(t.jobsCompleted / 15)),
        experienceLevel: t.isDeveloper ? 'expert' : 'intermediate',
        primaryCategoryId: categoryId,
        verificationStatus: VERIFICATION_STATUS.APPROVED,
        identityVerified: true,
        skillVerified: true,
        isAvailableNow: true,
        ratingAverage: t.ratingAverage,
        reviewCount: t.reviewCount,
        jobsCompleted: t.jobsCompleted,
        trustScore: 86,
        reliabilityScore: 88,
        completionScore: 90,
        responseScore: 84,
        punctualityScore: 87,
        subscriptionPlanCode: t.plan,
        subscriptionStatus: 'active',
        companyName: t.companyName,
        companyMission: t.isDeveloper ? DEVELOPER_TECHNICIAN.companyMission : undefined,
        companyVision: t.isDeveloper ? DEVELOPER_TECHNICIAN.companyVision : undefined,
        businessSlogan: t.businessSlogan,
        brandPrimaryColor: t.brandPrimaryColor,
        location: {
          country: 'UG',
          district: t.district,
          city: t.district,
          landmark: t.isDeveloper ? DEVELOPER_TECHNICIAN.landmark : `${t.district} service area`,
          geo: { type: 'Point', coordinates: [t.lng, t.lat] },
        },
        dataEnvironment,
        metadata: {
          ...buildSeedMeta(metaExtra),
          hiddenFromCustomers: false,
        },
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        isDeleted: false,
        deletedAt: null,
      },
    },
    { upsert: true, new: true },
  );

  return { userId: user._id.toString(), profileId: profile!._id.toString() };
}

async function upsertJobFixture(
  fixture: WorkflowFixtureDef,
  customerIds: Map<string, string>,
  techIds: Map<string, { userId: string; profileId: string }>,
): Promise<string> {
  const customerId = customerIds.get(fixture.customerKey);
  if (!customerId) throw new Error(`Missing customer ${fixture.customerKey} for ${fixture.fixtureId}`);
  const tech = techIds.get(fixture.technicianKey);
  const categoryId = await findCategoryId(fixture.categoryName);
  const customerProfile = await CustomerProfile.findOne({ userId: customerId }).select('_id');

  const assignedStatuses: Set<string> = new Set([
    JOB_STATUS.ASSIGNED,
    JOB_STATUS.TECHNICIAN_EN_ROUTE,
    JOB_STATUS.IN_PROGRESS,
    JOB_STATUS.AWAITING_CONFIRMATION,
    JOB_STATUS.COMPLETED,
    JOB_STATUS.DISPUTED,
  ]);

  const now = new Date();
  const statusHistory = [
    { status: JOB_STATUS.POSTED, changedAt: new Date(now.getTime() - 86_400_000), note: 'Seed posted' },
  ];
  if (fixture.status !== JOB_STATUS.POSTED) {
    statusHistory.push({
      status: fixture.status as typeof JOB_STATUS.POSTED,
      changedAt: now,
      note: fixture.timelineNote || fixture.purpose,
    });
  }

  const timeline: Array<{ type: string; at: Date; payload?: Record<string, unknown> }> = [
    { type: 'seed.created', at: new Date(now.getTime() - 86_400_000), payload: { fixtureId: fixture.fixtureId } },
  ];
  if (fixture.timelineNote) {
    timeline.push({ type: 'seed.timeline', at: now, payload: { note: fixture.timelineNote } });
  }

  const photoUrls = fixture.withPhotos
    ? [mediaUrl(`${fixture.fixtureId}-a`), mediaUrl(`${fixture.fixtureId}-b`), mediaUrl(`${fixture.fixtureId}-c`)]
    : [];

  const recommendedTechnicianIds =
    fixture.inviteDeveloper && tech ? [new mongoose.Types.ObjectId(tech.userId)] : [];

  const completionRequest = fixture.withCompletionRequest
    ? {
        requestedAt: now,
        requestedBy: new mongoose.Types.ObjectId(tech?.userId || customerId),
        notes: 'Seed completion package — materials used as quoted.',
        photoUrls: [mediaUrl(`${fixture.fixtureId}-done`)],
        materialsUsed: 'Consumables per quote',
        completedAtEstimate: now,
        confirmedByTechnician: true,
      }
    : undefined;

  const setDoc: Record<string, unknown> = {
    customerId: new mongoose.Types.ObjectId(customerId),
    customerProfileId: customerProfile?._id,
    title: fixture.title,
    description: fixture.description,
    categoryId,
    categoryName: fixture.categoryName,
    status: fixture.status,
    statusHistory,
    timeline,
    location: {
      country: 'UG',
      district: fixture.district,
      city: fixture.district,
      landmark: fixture.landmark,
      geo: { type: 'Point', coordinates: [fixture.lng, fixture.lat] },
    },
    geo: { type: 'Point', coordinates: [fixture.lng, fixture.lat] },
    budgetMin: fixture.budgetMin,
    budgetMax: fixture.budgetMax,
    currency: 'UGX',
    photoUrls,
    recommendedTechnicianIds,
    postedAt: new Date(now.getTime() - 86_400_000),
    applicationCount: fixture.applications?.length || 0,
    searchText: `${fixture.title} ${fixture.description} ${fixture.categoryName} ${fixture.fixtureId}`,
    publicJobReference: `SEED-${fixture.fixtureId}`,
    dataEnvironment,
    metadata: buildSeedMeta({
      seedKey: `job-${fixture.fixtureId}`,
      fixtureId: fixture.fixtureId,
      purpose: fixture.purpose,
      urgency: fixture.urgency,
    }),
    isDeleted: false,
    deletedAt: null,
    cancelReason: fixture.cancelReason,
    disputeReason: fixture.disputeReason,
    completionRequest,
  };

  if (assignedStatuses.has(fixture.status) && tech) {
    setDoc.assignedTechnicianId = new mongoose.Types.ObjectId(tech.userId);
    setDoc.assignedTechnicianProfileId = new mongoose.Types.ObjectId(tech.profileId);
    setDoc.assignedAt = new Date(now.getTime() - 3_600_000);
  } else {
    setDoc.assignedTechnicianId = null;
    setDoc.assignedTechnicianProfileId = null;
  }

  if (fixture.status === JOB_STATUS.IN_PROGRESS || fixture.status === JOB_STATUS.AWAITING_CONFIRMATION) {
    setDoc.startedAt = new Date(now.getTime() - 2_000_000);
  }
  if (fixture.status === JOB_STATUS.COMPLETED) {
    setDoc.startedAt = new Date(now.getTime() - 7_200_000);
    setDoc.completedAt = new Date(now.getTime() - 600_000);
  }
  if (fixture.status === JOB_STATUS.CANCELLED) {
    setDoc.cancelledAt = now;
  }

  const job = await Job.findOneAndUpdate(
    { 'metadata.fixtureId': fixture.fixtureId, 'metadata.seedTag': SEED_TAG },
    { $set: setDoc },
    { upsert: true, new: true, withDeleted: true },
  );

  // Replace applications for this fixture
  await JobApplication.deleteMany({ jobId: job!._id });
  for (const app of fixture.applications || []) {
    const applicant = techIds.get(app.technicianKey);
    if (!applicant) continue;
    await JobApplication.create({
      jobId: job!._id,
      technicianId: new mongoose.Types.ObjectId(applicant.userId),
      technicianProfileId: new mongoose.Types.ObjectId(applicant.profileId),
      status: app.status,
      message: app.message,
      proposedAmount: app.proposedAmount,
      currency: 'UGX',
      withdrawnAt: app.status === APPLICATION_STATUS.WITHDRAWN ? new Date() : undefined,
      respondedAt:
        app.status === APPLICATION_STATUS.ACCEPTED || app.status === APPLICATION_STATUS.REJECTED
          ? new Date()
          : undefined,
      dataEnvironment,
      metadata: buildSeedMeta({
        seedKey: `app-${fixture.fixtureId}-${app.technicianKey}`,
        fixtureId: fixture.fixtureId,
      }),
    });
  }

  if (fixture.withChat && tech) {
    await seedJobChat(job!._id.toString(), customerId, tech.userId, fixture.fixtureId);
  }

  return job!._id.toString();
}

async function seedJobChat(jobId: string, customerId: string, technicianId: string, fixtureId: string) {
  // Prefer production messaging SoT so unread, sockets, and notifications stay accurate.
  const { messagingService, ensureJobConversation } = await import('../../messaging/message.service.js');

  let conversation;
  try {
    conversation = await ensureJobConversation(jobId);
  } catch {
    conversation = await Conversation.findOne({ jobId, type: 'job' });
    if (!conversation) {
      conversation = await Conversation.create({
        jobId,
        type: 'job',
        title: `Seed chat ${fixtureId}`,
        participantUserIds: [customerId, technicianId],
        messageCount: 0,
        isLocked: false,
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: `chat-${fixtureId}`, fixtureId }),
      });
    }
  }

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: `chat-${fixtureId}`, fixtureId }),
        isLocked: false,
        participantUserIds: [customerId, technicianId],
      },
    },
  );

  for (const p of [
    { userId: customerId, role: 'customer' as const },
    { userId: technicianId, role: 'technician' as const },
  ]) {
    await ConversationParticipant.findOneAndUpdate(
      { conversationId: conversation._id, userId: p.userId },
      {
        $set: {
          conversationId: conversation._id,
          userId: p.userId,
          role: p.role,
          unreadCount: 0,
          dataEnvironment,
          metadata: buildSeedMeta({ fixtureId }),
        },
        $unset: { leftAt: 1 },
      },
      { upsert: true },
    );
  }

  await Message.deleteMany({
    conversationId: conversation._id,
    $or: [{ 'meta.seedTag': SEED_TAG }, { clientMessageId: new RegExp(`^seed-${fixtureId}-`) }],
  });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { messageCount: 0 } });

  const lines = [
    { senderId: customerId, role: ROLES.CUSTOMER, body: 'Hi — I am locked out of the shop. How soon can you reach Bugolobi?' },
    { senderId: technicianId, role: ROLES.TECHNICIAN, body: 'I can be there in about 25 minutes. Please confirm the shopfront colour.' },
    { senderId: customerId, role: ROLES.CUSTOMER, body: 'Green door next to the bakery. I will wait outside.' },
    { senderId: technicianId, role: ROLES.TECHNICIAN, body: 'On my way. Bringing a spare euro cylinder just in case.' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    try {
      await messagingService.send(
        { userId: line.senderId, role: line.role },
        {
          conversationId: conversation._id.toString(),
          body: line.body,
          type: MESSAGE_TYPE.TEXT,
          clientMessageId: `seed-${fixtureId}-${i}`,
        },
      );
    } catch {
      await Message.create({
        conversationId: conversation._id,
        senderId: line.senderId,
        body: line.body,
        type: MESSAGE_TYPE.TEXT,
        clientMessageId: `seed-${fixtureId}-${i}`,
        dataEnvironment,
        meta: buildSeedMeta({ seedKey: `msg-${fixtureId}-${i}`, fixtureId }),
        metadata: buildSeedMeta({ seedKey: `msg-${fixtureId}-${i}`, fixtureId }),
      });
    }
  }

  // Leave unread on the customer after technician's last reply (realistic unread scenario).
  await ConversationParticipant.updateOne(
    { conversationId: conversation._id, userId: customerId },
    { $set: { unreadCount: 1 } },
  );
  await ConversationParticipant.updateOne(
    { conversationId: conversation._id, userId: technicianId },
    { $set: { unreadCount: 0 } },
  );
}

async function seedOffers(techIds: Map<string, { userId: string; profileId: string }>) {
  let count = 0;
  const startsAt = new Date(Date.now() - 86_400_000);
  const endsAt = new Date(Date.now() + 30 * 86_400_000);
  for (const offer of SEED_OFFERS) {
    const tech = techIds.get(offer.technicianKey);
    if (!tech) continue;
    const titleKey = offer.title.trim().toLowerCase();
    await TechnicianOffer.findOneAndUpdate(
      { technicianId: tech.userId, titleKey, dataEnvironment },
      {
        $set: {
          technicianId: new mongoose.Types.ObjectId(tech.userId),
          title: offer.title,
          titleKey,
          description: offer.description,
          type: offer.type,
          discountValue: offer.discountPercent ?? offer.discountAmount ?? 0,
          currency: 'UGX',
          status: OFFER_STATUS.APPROVED,
          startsAt,
          endsAt,
          publishedAt: startsAt,
          submittedAt: startsAt,
          badge: 'Seed',
          featured: offer.technicianKey === DEVELOPER_TECHNICIAN.seedKey,
          serviceAreaDistricts: ['Kampala', 'Wakiso'],
          weekdays: [],
          analytics: { views: 12, clicks: 3, bookings: 1, revenueGenerated: 0, redemptionCount: 0 },
          dataEnvironment,
          metadata: buildSeedMeta({ seedKey: offer.seedKey }),
          isDeleted: false,
          deletedAt: null,
        },
      },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function seedAdvertisements(adminActorId?: string) {
  let count = 0;
  const actorId = adminActorId || (await User.findOne({ role: ROLES.ADMIN }).select('_id'))?._id?.toString();
  const fallbackActor =
    actorId ||
    (
      await User.findOne({ 'metadata.seedKey': DEVELOPER_TECHNICIAN.seedKey }).select('_id')
    )?._id?.toString();
  if (!fallbackActor) return 0;
  const createdByAdminId = new mongoose.Types.ObjectId(fallbackActor);

  const ads = [
    {
      seedKey: 'ad-weekend',
      title: 'Weekend home checks — Sandbox',
      body: 'Seed Platform sponsored rail for QA. Not a production campaign.',
      code: 'SEEDWEEKEND',
    },
    {
      seedKey: 'ad-safety',
      title: 'Electrical safety month — Sandbox',
      body: 'Fixture advertisement used to exercise customer home rails.',
      code: 'SEEDSAFETY',
    },
  ];
  for (const ad of ads) {
    await PlatformPromotion.findOneAndUpdate(
      { code: ad.code },
      {
        $set: {
          kind: 'announcement',
          title: ad.title,
          subtitle: 'FixNow Seed Platform',
          description: ad.body,
          bannerImageUrl: mediaUrl(ad.seedKey, 1200, 400),
          badge: 'Seed',
          code: ad.code,
          discountType: 'none',
          discountValue: 0,
          currency: 'UGX',
          audience: 'customer',
          status: 'active',
          featured: true,
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 60 * 86_400_000),
          createdByAdminId,
          redemptionCount: 0,
          analytics: { views: 0, clicks: 0, redemptions: 0, revenueGenerated: 0 },
          dataEnvironment,
          metadata: buildSeedMeta({ seedKey: ad.seedKey }),
          isDeleted: false,
          deletedAt: null,
        },
      },
      { upsert: true },
    );
    await SponsoredContent.findOneAndUpdate(
      { title: ad.title, dataEnvironment, 'metadata.seedKey': `sponsored-${ad.seedKey}` },
      {
        $set: {
          type: 'announcement',
          title: ad.title,
          body: ad.body,
          bannerImageUrl: mediaUrl(`sponsored-${ad.seedKey}`, 1200, 500),
          placement: 'home',
          audience: 'customer',
          sponsorName: 'FixNow Seed Platform',
          status: 'active',
          priority: 20,
          displayOrder: count,
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 60 * 86_400_000),
          createdByAdminId,
          analytics: { impressions: 0, clicks: 0, dismissals: 0 },
          dataEnvironment,
          metadata: buildSeedMeta({ seedKey: `sponsored-${ad.seedKey}` }),
          isDeleted: false,
          deletedAt: null,
        },
      },
      { upsert: true },
    );
    count += 2;
  }
  return count;
}

async function seedReviews(
  jobIdsByFixture: Map<string, string>,
  customerIds: Map<string, string>,
  techIds: Map<string, { userId: string; profileId: string }>,
) {
  let count = 0;
  for (const rev of SEED_REVIEWS) {
    const jobId = jobIdsByFixture.get(rev.fixtureId);
    const customerId = customerIds.get(rev.customerKey);
    const tech = techIds.get(rev.technicianKey);
    if (!jobId || !customerId || !tech) continue;

    const rating = await Rating.findOneAndUpdate(
      { jobId, 'metadata.seedTag': SEED_TAG },
      {
        $set: {
          jobId,
          customerId,
          technicianId: tech.userId,
          quality: rev.overallRating,
          professionalism: rev.overallRating,
          communication: Math.max(1, rev.overallRating - (rev.overallRating < 4 ? 1 : 0)),
          timeliness: rev.overallRating,
          valueForMoney: rev.overallRating,
          overall: rev.overallRating,
          dataEnvironment,
          metadata: buildSeedMeta({ seedKey: `rating-${rev.seedKey}` }),
        },
      },
      { upsert: true, new: true },
    );

    await Review.findOneAndUpdate(
      { jobId },
      {
        $set: {
          jobId,
          customerId,
          technicianId: tech.userId,
          technicianProfileId: tech.profileId,
          ratingId: rating?._id,
          overallRating: rev.overallRating,
          comment: rev.comment,
          isPublic: true,
          isFlagged: false,
          dataEnvironment,
          metadata: buildSeedMeta({ seedKey: rev.seedKey, fixtureId: rev.fixtureId }),
          isDeleted: false,
          deletedAt: null,
        },
      },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function seedPortfolio(tech: SeedTechnicianDef, ids: { userId: string; profileId: string }) {
  const portfolio = await Portfolio.findOneAndUpdate(
    { technicianUserId: ids.userId },
    {
      $set: {
        technicianUserId: ids.userId,
        technicianProfileId: ids.profileId,
        title: `${tech.fullName} — project gallery`,
        summary: `${tech.headline}. Seeded portfolio for QA authenticity checks.`,
        isPublic: true,
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: `portfolio-${tech.seedKey}` }),
        isDeleted: false,
        deletedAt: null,
      },
    },
    { upsert: true, new: true },
  );

  await PortfolioMedia.deleteMany({ portfolioId: portfolio!._id, 'metadata.seedTag': SEED_TAG });

  const items = [
    {
      kind: 'before_after' as const,
      title: 'Before — site survey',
      beforeAfter: 'before' as const,
      seed: `${tech.seedKey}-before`,
    },
    {
      kind: 'before_after' as const,
      title: 'After — completed work',
      beforeAfter: 'after' as const,
      seed: `${tech.seedKey}-after`,
    },
    {
      kind: 'photo' as const,
      title: 'On-site detail',
      beforeAfter: 'none' as const,
      seed: `${tech.seedKey}-detail`,
    },
    {
      kind: 'certificate' as const,
      title: 'Trade certificate',
      beforeAfter: 'none' as const,
      seed: `${tech.seedKey}-cert-img`,
    },
  ];

  let sortOrder = 0;
  for (const item of items) {
    await PortfolioMedia.create({
      portfolioId: portfolio!._id,
      technicianUserId: ids.userId,
      mediaType: MEDIA_TYPE.IMAGE,
      kind: item.kind,
      url: mediaUrl(item.seed),
      thumbnailUrl: mediaUrl(item.seed, 400, 300),
      title: item.title,
      caption: `${tech.companyName || tech.fullName} · ${item.title}`,
      description: `Seed Platform portfolio item for ${tech.fullName}.`,
      tags: ['seed', tech.categoryName.toLowerCase()],
      district: tech.district,
      completionDate: new Date(Date.now() - 30 * 86_400_000),
      customerPermission: true,
      visibility: 'public',
      featured: sortOrder === 1,
      status: 'active',
      beforeAfter: item.beforeAfter,
      galleryUrls: [],
      sortOrder: sortOrder++,
      dataEnvironment,
      metadata: buildSeedMeta({ seedKey: `media-${item.seed}` }),
    });
  }

  await Portfolio.updateOne({ _id: portfolio!._id }, { $set: { itemCount: items.length } });

  await CaseStudy.findOneAndUpdate(
    { technicianUserId: ids.userId, 'metadata.seedKey': `case-${tech.seedKey}` },
    {
      $set: {
        portfolioId: portfolio!._id,
        technicianUserId: ids.userId,
        title: `${tech.categoryName} recovery — ${tech.district}`,
        challenge: `Customer needed reliable ${tech.categoryName.toLowerCase()} help with clear photo proof.`,
        solution: `${tech.fullName} diagnosed on site, agreed a fixed quote, and documented before/after photos.`,
        outcome: 'Job completed with customer confirmation and a public review.',
        tags: ['seed', tech.categoryName],
        district: tech.district,
        completionDate: new Date(Date.now() - 20 * 86_400_000),
        customerPermission: true,
        visibility: 'public',
        featured: true,
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
        sortOrder: 0,
        mediaIds: [],
        coverImageUrl: mediaUrl(`${tech.seedKey}-case`),
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: `case-${tech.seedKey}` }),
      },
    },
    { upsert: true },
  );

  await Certificate.findOneAndUpdate(
    { technicianUserId: ids.userId, 'metadata.seedKey': `cert-${tech.seedKey}` },
    {
      $set: {
        portfolioId: portfolio!._id,
        technicianUserId: ids.userId,
        title: `${tech.categoryName} proficiency certificate`,
        issuer: 'FixNow Seed Platform (QA fixture)',
        kind: 'certificate',
        issuedAt: new Date('2024-06-01'),
        expiresAt: new Date('2027-06-01'),
        documentUrl: mediaUrl(`${tech.seedKey}-certificate-doc`),
        thumbnailUrl: mediaUrl(`${tech.seedKey}-certificate-thumb`, 400, 300),
        description: `Seeded certificate for ${tech.fullName}.`,
        visibility: 'public',
        featured: true,
        status: 'active',
        sortOrder: 0,
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: `cert-${tech.seedKey}` }),
      },
    },
    { upsert: true },
  );

  return 1;
}

async function seedAiConversations(techIds: Map<string, { userId: string; profileId: string }>) {
  const dev = techIds.get(DEVELOPER_TECHNICIAN.seedKey);
  if (!dev) return 0;
  const convo = await AiConversation.findOneAndUpdate(
    { ownerUserId: dev.userId, 'metadata.seedKey': 'ai-dev-main', 'metadata.seedTag': SEED_TAG },
    {
      $set: {
        ownerUserId: dev.userId,
        role: 'technician',
        title: 'Seed · How do I apply to nearby jobs?',
        status: 'active',
        lastMessageAt: new Date(),
        dataEnvironment,
        metadata: buildSeedMeta({ seedKey: 'ai-dev-main' }),
      },
    },
    { upsert: true, new: true },
  );
  await AiMessage.deleteMany({ conversationId: convo!._id, 'metadata.seedTag': SEED_TAG });
  await AiMessage.create([
    {
      conversationId: convo!._id,
      sender: 'user',
      content: 'Show me open jobs near Ntinda I can apply to.',
      dataEnvironment,
      metadata: buildSeedMeta({ seedKey: 'ai-msg-1' }),
    },
    {
      conversationId: convo!._id,
      sender: 'assistant',
      content:
        'In the sandbox Seed Platform you should see fixtures F01–F05 on the jobs feed. Open F03 to practise multi-application UX.',
      dataEnvironment,
      metadata: buildSeedMeta({ seedKey: 'ai-msg-2' }),
    },
  ]);
  return 1;
}

export async function softDeleteSeedPlatformData(): Promise<{ users: number }> {
  const permanentEmails = [
    DEVELOPER_TECHNICIAN.email.toLowerCase(),
    DEVELOPER_CUSTOMER.email.toLowerCase(),
  ];
  const permanentUsers = await User.find({ email: { $in: permanentEmails } }).select('_id');
  const permanentIds = new Set(permanentUsers.map((u) => String(u._id)));

  const users = await User.find(seedUserFilter()).select('_id email metadata');
  const ids = users
    .filter((u) => {
      if (permanentIds.has(String(u._id))) return false;
      const meta = (u.metadata || {}) as Record<string, unknown>;
      if (meta.permanentDevelopmentTechnician || meta.permanentDevelopmentCustomer) return false;
      return true;
    })
    .map((u) => u._id);
  const now = new Date();
  if (ids.length) {
    await Promise.all([
      User.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now, accountStatus: 'suspended' } }),
      CustomerProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
      TechnicianProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
    ]);
  }
  await Promise.all([
    Job.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    JobApplication.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    TechnicianOffer.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    Review.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    Rating.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    Portfolio.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    PortfolioMedia.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    PlatformPromotion.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    SponsoredContent.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
    AiConversation.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { isDeleted: true, deletedAt: now } }),
  ]);
  return { users: ids.length };
}

export async function generateSeedPlatform(opts: {
  modules?: SeedGenerateModule[];
  regenerate?: boolean;
} = {}): Promise<SeedGenerateResult> {
  await assertSandboxEnabled();

  const modules = opts.modules?.length ? opts.modules : (['all'] as SeedGenerateModule[]);
  const runAll = modules.includes('all');
  const want = (m: SeedGenerateModule) => runAll || modules.includes(m);

  if (opts.regenerate) {
    await softDeleteSeedPlatformData();
  }

  const counts: Record<string, number> = {};
  const customerIds = new Map<string, string>();
  const techIds = new Map<string, { userId: string; profileId: string }>();
  const jobIdsByFixture = new Map<string, string>();

  const seedPasswordHash = await hashPassword(SEED_USER_PASSWORD);
  const developerPasswordHash = await hashPassword(DEVELOPER_TECHNICIAN.password);

  if (want('customers') || want('jobs') || want('reviews') || runAll) {
    for (const c of SEED_CUSTOMERS) {
      const id = await upsertCustomer(c, seedPasswordHash);
      customerIds.set(c.seedKey, id);
    }
    counts.customers = SEED_CUSTOMERS.length;
  } else {
    for (const c of SEED_CUSTOMERS) {
      const u = await User.findOne({ email: c.email.toLowerCase() }).select('_id');
      if (u) customerIds.set(c.seedKey, u._id.toString());
    }
  }

  if (want('technicians') || want('companies') || want('portfolios') || want('jobs') || want('offers') || runAll) {
    const allTechs = [developerTechnicianDef(), ...SEED_SUPPORT_TECHNICIANS];
    for (const t of allTechs) {
      const hash = t.isDeveloper ? developerPasswordHash : seedPasswordHash;
      const ids = await upsertTechnician(t, hash);
      techIds.set(t.seedKey, ids);
    }
    counts.technicians = allTechs.length;
    counts.companies = allTechs.filter((t) => t.companyName).length;
  } else {
    for (const t of [developerTechnicianDef(), ...SEED_SUPPORT_TECHNICIANS]) {
      const u = await User.findOne({ email: t.email.toLowerCase() }).select('_id');
      const p = u ? await TechnicianProfile.findOne({ userId: u._id }).select('_id') : null;
      if (u && p) techIds.set(t.seedKey, { userId: u._id.toString(), profileId: p._id.toString() });
    }
  }

  if (want('jobs') || runAll) {
    for (const fixture of [...WORKFLOW_FIXTURES, ...HISTORY_JOBS]) {
      const id = await upsertJobFixture(fixture, customerIds, techIds);
      jobIdsByFixture.set(fixture.fixtureId, id);
    }
    counts.jobs = WORKFLOW_FIXTURES.length + HISTORY_JOBS.length;
    counts.workflowFixtures = WORKFLOW_FIXTURES.length;
  } else {
    for (const fixture of [...WORKFLOW_FIXTURES, ...HISTORY_JOBS]) {
      const job = await Job.findOne({ 'metadata.fixtureId': fixture.fixtureId, 'metadata.seedTag': SEED_TAG }).select(
        '_id',
      );
      if (job) jobIdsByFixture.set(fixture.fixtureId, job._id.toString());
    }
  }

  if (want('offers') || runAll) {
    counts.offers = await seedOffers(techIds);
  }

  if (want('advertisements') || runAll) {
    counts.advertisements = await seedAdvertisements();
  }

  if (want('reviews') || runAll) {
    counts.reviews = await seedReviews(jobIdsByFixture, customerIds, techIds);
  }

  if (want('portfolios') || runAll) {
    let portfolios = 0;
    for (const t of [developerTechnicianDef(), ...SEED_SUPPORT_TECHNICIANS]) {
      const ids = techIds.get(t.seedKey);
      if (!ids) continue;
      portfolios += await seedPortfolio(t, ids);
    }
    counts.portfolios = portfolios;
  }

  if (want('ai') || runAll) {
    counts.aiConversations = await seedAiConversations(techIds);
  }

  return {
    version: SEED_PLATFORM_VERSION,
    environment: SEED_CONTENT_ENVIRONMENT,
    modules,
    counts,
    developerTechnician: {
      email: DEVELOPER_TECHNICIAN.email,
      password: DEVELOPER_TECHNICIAN.password,
      seedKey: DEVELOPER_TECHNICIAN.seedKey,
    },
    loginHints: {
      customers: SEED_CUSTOMERS.map((c) => ({
        email: c.email,
        password: SEED_USER_PASSWORD,
        name: c.fullName,
      })),
      technicians: [
        {
          email: DEVELOPER_TECHNICIAN.email,
          password: DEVELOPER_TECHNICIAN.password,
          name: DEVELOPER_TECHNICIAN.fullName,
          developer: true,
        },
        ...SEED_SUPPORT_TECHNICIANS.map((t) => ({
          email: t.email,
          password: SEED_USER_PASSWORD,
          name: t.fullName,
        })),
      ],
    },
    fixtures: WORKFLOW_FIXTURES.map((f) => ({
      fixtureId: f.fixtureId,
      purpose: f.purpose,
      title: f.title,
    })),
  };
}
