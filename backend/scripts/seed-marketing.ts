/**
 * Idempotent Marketing Administration seed data.
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-marketing.ts --env=sandbox
 *   SEED_DATA_ENVIRONMENT=sandbox npm run seed:marketing
 *
 * Content environment MUST be declared (--env= or SEED_DATA_ENVIRONMENT).
 * Allowed: sandbox | development | demo
 * Refused: production (never accidentally populate the production content bucket)
 * Also refuses when APP_ENV/NODE_ENV is production.
 *
 * Phase 1 note — Seed Platform plug-in point:
 * Future generators (jobs, reviews, portfolios, AI) should accept the same
 * --env= / SEED_DATA_ENVIRONMENT contract and stamp dataEnvironment on every row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLACEHOLDER_DIR = path.join(ROOT, 'uploads', 'placeholders');

const SEED_TAG = 'fixnow-marketing-seed-v1';
const ALLOWED_SEED_ENVS = new Set(['sandbox', 'development', 'demo']);

function parseSeedDataEnvironment(): string {
  const fromArg = process.argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
  const fromEnv = process.env.SEED_DATA_ENVIRONMENT || process.env.SEED_ENV;
  const value = String(fromArg || fromEnv || '')
    .trim()
    .toLowerCase();
  if (!value) {
    console.error(
      '[seed-marketing] Missing content environment.\n' +
        '  Pass --env=sandbox (or development|demo)\n' +
        '  or set SEED_DATA_ENVIRONMENT=sandbox\n' +
        '  Production content seeding is never allowed from this script.',
    );
    process.exit(1);
  }
  if (value === 'production' || value === 'archived') {
    console.error(`[seed-marketing] Refusing to seed content environment "${value}".`);
    process.exit(1);
  }
  if (!ALLOWED_SEED_ENVS.has(value)) {
    console.error(`[seed-marketing] Unknown SEED_DATA_ENVIRONMENT "${value}". Use sandbox|development|demo.`);
    process.exit(1);
  }
  return value;
}

/** Prefer catalog assets — do not rely on local /uploads/placeholders for runtime. */
const BANNER_MARKETING = 'asset:promotions.first-booking';
const BANNER_SPONSORED = 'asset:advertisements.bank';

function offerBannerForCategory(slug: string): string {
  return `asset:categories.${slug}`;
}

function promoBannerForTitle(title: string): string {
  const t = title.toLowerCase();
  if (/weekend/.test(t)) return 'asset:promotions.weekend';
  if (/emergency|electric/.test(t)) return 'asset:promotions.emergency';
  if (/rain|roof/.test(t)) return 'asset:promotions.rainy-season';
  if (/safety/.test(t)) return 'asset:promotions.safety-month';
  if (/refer/.test(t)) return 'asset:promotions.referral';
  if (/first|welcome/.test(t)) return 'asset:promotions.first-booking';
  return BANNER_MARKETING;
}

function sponsoredBannerForTitle(title: string, type?: string): string {
  const t = `${title} ${type || ''}`.toLowerCase();
  if (/fire safety/.test(t)) return 'asset:campaigns.seasonal';
  if (/home safety|safety month|storm season/.test(t)) return 'asset:campaigns.safety';
  if (/energy sav/.test(t)) return 'asset:categories.hvac';
  if (/water conservation|leak/.test(t)) return 'asset:categories.plumbing';
  if (/clean-?up|community clean/.test(t)) return 'asset:categories.cleaning';
  if (/home maintenance|handyman/.test(t)) return 'asset:categories.handyman';
  if (/emergency technician/.test(t)) return 'asset:promotions.emergency';
  if (/fast response/.test(t)) return 'asset:categories.emergency';
  if (/verified professional|verification/.test(t)) return 'asset:campaigns.verification';
  if (/partner advertisement|partner promotion|tool/.test(t)) return 'asset:advertisements.tools';
  if (/solar/.test(t)) return 'asset:advertisements.solar';
  if (/momo|telecom|mtn/.test(t)) return 'asset:advertisements.telecom';
  if (/training|academy|certified/.test(t)) return 'asset:advertisements.training';
  if (/refer/.test(t)) return 'asset:promotions.referral';
  if (/financ|bank|loan/.test(t)) return 'asset:advertisements.bank';
  if (/insurance|protect your home/.test(t)) return 'asset:advertisements.insurance';
  return BANNER_SPONSORED;
}

type Counters = { created: number; skipped: number };

const report = {
  categories: { created: 0, skipped: 0 } as Counters,
  users: { created: 0, skipped: 0 } as Counters,
  technicianProfiles: { created: 0, skipped: 0 } as Counters,
  platformPromotions: { created: 0, skipped: 0 } as Counters,
  sponsoredContent: { created: 0, skipped: 0 } as Counters,
  technicianOffers: { created: 0, skipped: 0 } as Counters,
  notifications: { created: 0, skipped: 0 } as Counters,
  auditLogs: { created: 0, skipped: 0 } as Counters,
  placeholders: { created: 0, skipped: 0 } as Counters,
};

function ensurePlaceholders() {
  // Legacy local SVG placeholders are no longer created.
  // Visual photography is seeded via `npm run seed:visual-assets` → Cloudinary.
  fs.mkdirSync(PLACEHOLDER_DIR, { recursive: true })
}

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    console.error('[seed-marketing] Refusing to run in production (demo credentials are not allowed).');
    process.exit(1);
  }

  const seedDataEnvironment = parseSeedDataEnvironment();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required. Set it in backend/.env');
  }

  ensurePlaceholders();

  // Register all domain models then connect
  await import('../src/models/index.js');
  const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
  const { hashPassword } = await import('../src/utils/password.js');
  const {
    User,
    Category,
    TechnicianProfile,
    PlatformPromotion,
    SponsoredContent,
    TechnicianOffer,
    Notification,
    AuditLog,
    PlatformSetting,
    CustomerProfile,
  } = await import('../src/models/index.js');
  const { OFFER_STATUS, OFFER_TYPE, ACCOUNT_STATUS, EXPERIENCE_LEVEL, TECHNICIAN_RANK, VERIFICATION_STATUS } =
    await import('../src/models/shared/enums.js');

  await connectDatabase();
  console.log(`[seed-marketing] Connected. Tag=${SEED_TAG} dataEnvironment=${seedDataEnvironment}`);

  async function ensureAudit(input: {
    actorId: mongoose.Types.ObjectId;
    actorRole?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    meta: { seedKey: string; comment?: string | null };
  }) {
    const existing = await AuditLog.findOne({ 'meta.seedKey': input.meta.seedKey });
    if (existing) {
      report.auditLogs.skipped += 1;
      return;
    }
    await AuditLog.create({
      actorId: input.actorId,
      actorRole: input.actorRole || 'admin',
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      meta: input.meta,
      severity: 'info',
    });
    report.auditLogs.created += 1;
  }

  const passwordHash = await hashPassword('Password1!');

  // --- Categories (marketplace Category — no separate MarketingCategory model) ---
  const { SERVICE_CATEGORY_SEEDS } = await import('./data/serviceCategories.js');
  const categoryDefs = SERVICE_CATEGORY_SEEDS;

  const categoryBySlug = new Map<string, { _id: mongoose.Types.ObjectId; name: string }>();
  for (const def of categoryDefs) {
    const existing = await Category.findOne({ $or: [{ slug: def.slug }, { name: def.name }] });
    if (existing) {
      // Keep seed idempotent: refresh catalogue metadata without wiping admin active/suspend state.
      if (existing.slug === def.slug) existing.name = def.name;
      existing.icon = def.icon;
      existing.sortOrder = def.sortOrder;
      existing.description = def.description;
      if (!existing.get('status')) {
        existing.status = existing.isActive === false ? 'suspended' : 'active';
      }
      await existing.save();
      report.categories.skipped += 1;
      categoryBySlug.set(def.slug, { _id: existing._id, name: existing.name });
      continue;
    }
    const created = await Category.create({
      name: def.name,
      slug: def.slug,
      icon: def.icon,
      sortOrder: def.sortOrder,
      description: def.keywords?.length
        ? `${def.description} Keywords: ${def.keywords.join(', ')}.`
        : def.description,
      bannerImageUrl: `asset:categories.${def.slug}`,
      isActive: true,
      status: def.status ?? 'active',
      dataEnvironment: seedDataEnvironment,
    });
    report.categories.created += 1;
    categoryBySlug.set(def.slug, { _id: created._id, name: created.name });
  }

  // --- Users: admin, customer, technicians ---
  async function ensureUser(input: {
    email: string;
    fullName: string;
    role: 'admin' | 'customer' | 'technician';
    phone?: string;
  }) {
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      report.users.skipped += 1;
      return existing;
    }
    const user = await User.create({
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: input.role,
      passwordHash,
      phone: input.phone,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
      locale: 'en-UG',
      timezone: 'Africa/Kampala',
      refreshTokenVersion: 0,
      failedLoginAttempts: 0,
      loyaltyPoints: 0,
      metadata: { seedTag: SEED_TAG },
      dataEnvironment: seedDataEnvironment,
    });
    report.users.created += 1;
    return user;
  }

  const admin = await ensureUser({
    email: 'marketing.admin@fixnow.demo',
    fullName: 'Marketing Admin',
    role: 'admin',
    phone: '+256700100001',
  });

  // Link demo admin to AdminUser (operations) so ALLOW_DEV_ADMIN_LOGIN can authenticate.
  try {
    const { adminIdentityService } = await import('../src/services/admin/adminIdentity.service.js');
    const { AdminRole, AdminUser } = await import('../src/models/index.js');
    const { ADMIN_OPERATOR_ROLES, ADMIN_OPERATOR_STATUS } = await import(
      '../src/constants/adminIdentity.js'
    );
    await adminIdentityService.seedCatalogue();
    const role = await AdminRole.findOne({ key: ADMIN_OPERATOR_ROLES.OPERATIONS });
    if (role) {
      await AdminUser.findOneAndUpdate(
        { userId: admin._id },
        {
          $set: {
            adminRoleId: role._id,
            adminRoleKey: role.key,
            permissionKeys: role.permissionKeys,
            status: ADMIN_OPERATOR_STATUS.ACTIVE,
            isActive: true,
            department: 'Marketing (seed)',
            notes: 'Demo admin — ALLOW_DEV_ADMIN_LOGIN only',
          },
          $setOnInsert: { userId: admin._id },
        },
        { upsert: true },
      );
    }
  } catch (err) {
    console.warn('[seed-marketing] Could not link AdminUser profile', err);
  }

  const customer = await ensureUser({
    email: 'marketing.customer@fixnow.demo',
    fullName: 'Demo Customer',
    role: 'customer',
    phone: '+256700100002',
  });

  const custProfile = await CustomerProfile.findOne({ userId: customer._id });
  if (!custProfile) {
    await CustomerProfile.create({
      userId: customer._id,
      languages: ['en'],
      location: { district: 'Kampala', parish: 'Nakawa' },
      preferences: {
        preferredContact: 'in_app',
        preferredLanguage: 'en',
        allowTechnicianSuggestions: true,
        allowMarketing: true,
        notifyFavouriteTechnicianOffers: true,
      },
      jobStats: { posted: 2, completed: 1, cancelled: 0 },
      dataEnvironment: seedDataEnvironment,
    });
  }

  const techDefs = [
    {
      email: 'spark.electrical@fixnow.demo',
      fullName: 'Spark Electrical',
      phone: '+256700200001',
      category: 'electrical',
      trade: 'Electrical',
      district: 'Kampala',
    },
    {
      email: 'bright.plumbing@fixnow.demo',
      fullName: 'Bright Plumbing',
      phone: '+256700200002',
      category: 'plumbing',
      trade: 'Plumbing',
      district: 'Kampala',
    },
    {
      email: 'coolair.services@fixnow.demo',
      fullName: 'CoolAir Services',
      phone: '+256700200003',
      category: 'hvac',
      trade: 'HVAC',
      district: 'Entebbe',
    },
    {
      email: 'handyfix.carpentry@fixnow.demo',
      fullName: 'HandyFix Carpentry',
      phone: '+256700200004',
      category: 'carpentry',
      trade: 'Carpentry',
      district: 'Kampala',
    },
    {
      email: 'safelock@fixnow.demo',
      fullName: 'SafeLock',
      phone: '+256700200005',
      category: 'locksmith',
      trade: 'Locksmith',
      district: 'Wakiso',
    },
    {
      email: 'gardenpro@fixnow.demo',
      fullName: 'GardenPro',
      phone: '+256700200006',
      category: 'landscaping',
      trade: 'Landscaping',
      district: 'Kampala',
    },
  ] as const;

  const techs: Array<{
    user: { _id: mongoose.Types.ObjectId; fullName: string; email: string };
    categorySlug: string;
  }> = [];

  for (const def of techDefs) {
    const user = await ensureUser({
      email: def.email,
      fullName: def.fullName,
      role: 'technician',
      phone: def.phone,
    });
    const cat = categoryBySlug.get(def.category);
    const existingProfile = await TechnicianProfile.findOne({ userId: user._id });
    if (existingProfile) {
      report.technicianProfiles.skipped += 1;
    } else {
      await TechnicianProfile.create({
        userId: user._id,
        headline: `${def.trade} specialist`,
        bio: `${def.fullName} — verified ${def.trade.toLowerCase()} services across ${def.district}.`,
        // Deterministic demo portrait (HTTPS) — never marketing banners.
        photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(def.fullName)}`,
        primaryCategoryId: cat?._id,
        skills: [def.trade],
        languages: ['en'],
        experienceYears: 5,
        experienceLevel: EXPERIENCE_LEVEL.ADVANCED,
        currentRank: TECHNICIAN_RANK.GOLD,
        location: { district: def.district, parish: 'Central' },
        trustScore: 88,
        reliabilityScore: 90,
        completionScore: 92,
        responseScore: 85,
        punctualityScore: 87,
        ratingAverage: 4.7,
        reviewCount: 24,
        jobsCompleted: 120,
        jobsCancelled: 2,
        freeJobsUsed: 0,
        freeJobLimit: 5,
        remainingFreeJobs: 5,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        accountLocked: false,
        verificationStatus: VERIFICATION_STATUS.APPROVED,
        identityVerified: true,
        skillVerified: true,
        badgeIds: [],
        isAvailableNow: true,
        leadCredits: 10,
        academyProgressPercent: 40,
        dataEnvironment: seedDataEnvironment,
        searchKeywords: [def.trade.toLowerCase(), def.district.toLowerCase()],
      });
      report.technicianProfiles.created += 1;
    }
    techs.push({ user, categorySlug: def.category });
  }

  // Repair earlier seed runs that stored marketing banners (or empty) as profile photos.
  const badPhotoProfiles = await TechnicianProfile.find({
    $or: [
      {
        photoUrl: {
          $in: [
            'asset:promotions.weekend',
            '/uploads/placeholders/offer-banner.svg',
            'asset:promotions.first-booking',
            'asset:promotions.weekend',
            '',
          ],
        },
      },
      { photoUrl: { $exists: false } },
      { photoUrl: null },
    ],
  })
    .select('_id userId photoUrl')
    .lean();

  let repairedPhotos = 0;
  for (const profile of badPhotoProfiles) {
    const user = await User.findById(profile.userId).select('fullName').lean();
    const seed = encodeURIComponent(user?.fullName || String(profile.userId));
    await TechnicianProfile.updateOne(
      { _id: profile._id },
      { $set: { photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}` } },
    );
    repairedPhotos += 1;
  }
  if (repairedPhotos) {
    console.log(`[seed-marketing] Assigned demo avatars to ${repairedPhotos} technician profiles`);
  }

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  // --- Platform promotions ---
  const platformPromos = [
    {
      kind: 'welcome' as const,
      title: 'Welcome to FixNow',
      subtitle: '20% OFF Your First Booking',
      description:
        'New customers get 20% off their first completed booking. Apply at checkout after you hire a verified technician.',
      terms: 'Valid for first booking only. Maximum discount UGX 50,000. Cannot combine with other platform codes.',
      badge: 'Book Now',
      code: 'WELCOME20',
      discountType: 'percent' as const,
      discountValue: 20,
      featured: true,
      status: 'active' as const,
      startsAt: days(-7),
      endsAt: days(60),
      analytics: { views: 4820, clicks: 910, redemptions: 186, revenueGenerated: 12_400_000 },
    },
    {
      kind: 'seasonal' as const,
      title: 'Weekend Service Deals',
      subtitle: 'Save on Saturday & Sunday bookings',
      description: 'Seasonal weekend pricing across popular home services. Book Friday–Sunday for limited discounts.',
      badge: 'Weekend',
      code: 'WEEKEND15',
      discountType: 'percent' as const,
      discountValue: 15,
      featured: true,
      status: 'active' as const,
      startsAt: days(-3),
      endsAt: days(30),
      analytics: { views: 3100, clicks: 640, redemptions: 98, revenueGenerated: 7_800_000 },
    },
    {
      kind: 'seasonal' as const,
      title: 'Rainy Season Ready',
      subtitle: 'Roofing & plumbing preparedness',
      description: 'Get your home rainy-season ready with discounted inspections for roofs, gutters, and plumbing.',
      badge: 'Seasonal',
      code: 'RAINY10',
      discountType: 'percent' as const,
      discountValue: 10,
      featured: false,
      status: 'active' as const,
      startsAt: days(-14),
      endsAt: days(45),
      analytics: { views: 2200, clicks: 410, redemptions: 72, revenueGenerated: 5_100_000 },
    },
    {
      kind: 'referral' as const,
      title: 'Refer & Earn',
      subtitle: 'Share FixNow, earn credits',
      description: 'Invite a friend to FixNow. When they complete their first job, you both earn platform credits.',
      badge: 'Referral',
      code: 'REFERUG',
      discountType: 'credit' as const,
      discountValue: 15000,
      featured: false,
      status: 'active' as const,
      startsAt: days(-30),
      endsAt: days(90),
      analytics: { views: 5600, clicks: 1200, redemptions: 240, revenueGenerated: 3_200_000 },
    },
    {
      kind: 'custom' as const,
      title: 'Emergency Home Repairs',
      subtitle: 'Priority matching for urgent jobs',
      description: 'Platform campaign highlighting emergency electrical, plumbing, and locksmith availability.',
      badge: 'Emergency',
      code: 'URGENTFIX',
      discountType: 'none' as const,
      discountValue: 0,
      featured: true,
      status: 'active' as const,
      startsAt: days(-2),
      endsAt: days(21),
      analytics: { views: 1900, clicks: 520, redemptions: 61, revenueGenerated: 8_900_000 },
    },
    {
      kind: 'announcement' as const,
      title: 'Verified Technicians',
      subtitle: 'Book with confidence',
      description: 'Platform announcement celebrating identity- and skill-verified technicians across Kampala.',
      badge: 'Verified',
      discountType: 'none' as const,
      discountValue: 0,
      featured: false,
      status: 'active' as const,
      startsAt: days(-10),
      endsAt: days(120),
      analytics: { views: 7800, clicks: 1500, redemptions: 0, revenueGenerated: 0 },
    },
  ];

  for (const promo of platformPromos) {
    const existing = await PlatformPromotion.findOne({
      $or: [{ title: promo.title }, ...(promo.code ? [{ code: promo.code }] : [])],
    });
    if (existing) {
      const desired = promoBannerForTitle(promo.title);
      if (existing.bannerImageUrl !== desired) {
        existing.bannerImageUrl = desired;
        await existing.save();
      }
      report.platformPromotions.skipped += 1;
      continue;
    }
    const created = await PlatformPromotion.create({
      ...promo,
      bannerImageUrl: promoBannerForTitle(promo.title),
      promotionColor: '#3d27bc',
      currency: 'UGX',
      audience: 'customer',
      maxRedemptions: 5000,
      redemptionCount: promo.analytics.redemptions,
      createdByAdminId: admin._id,
      terms: promo.terms || 'Standard FixNow platform promotion terms apply.',
      dataEnvironment: seedDataEnvironment,
    });
    report.platformPromotions.created += 1;

    await ensureAudit({
      actorId: admin._id,
      action: 'platform_promotion.created',
      resourceType: 'PlatformPromotion',
      resourceId: created._id.toString(),
      meta: { seedKey: `${SEED_TAG}:promo:${promo.title}`, comment: 'Seed: created platform promotion' },
    });
  }

  // --- Sponsored content + advertisements (partner_ad) ---
  const sponsoredDefs = [
    {
      type: 'safety_campaign' as const,
      title: 'Home Safety Month',
      body: 'Check smoke alarms, secure wiring, and book a verified electrician for a safety walkthrough this month.',
      ctaLabel: 'Book safety check',
      ctaHref: '/customer/search?categoryId=electrical',
      placement: 'home' as const,
      priority: 10,
      analytics: { impressions: 9200, clicks: 880, dismissals: 0 },
    },
    {
      type: 'tip' as const,
      title: 'Energy Saving Tips',
      body: 'Simple HVAC and lighting tips to cut electricity bills — plus recommended FixNow specialists.',
      ctaLabel: 'View tips',
      ctaHref: '/customer/offers',
      placement: 'offers' as const,
      priority: 5,
      analytics: { impressions: 6100, clicks: 420, dismissals: 0 },
    },
    {
      type: 'educational_banner' as const,
      title: 'Water Conservation',
      body: 'Detect leaks early. Book Bright Plumbing for a free leak inspection while the seasonal campaign runs.',
      ctaLabel: 'Find plumbers',
      ctaHref: '/customer/search?q=plumbing',
      placement: 'search' as const,
      priority: 4,
      analytics: { impressions: 5400, clicks: 390, dismissals: 0 },
    },
    {
      type: 'safety_campaign' as const,
      title: 'Fire Safety Awareness',
      body: 'Keep extinguishers accessible and schedule electrical inspections before the dry season peaks.',
      ctaLabel: 'Learn more',
      ctaHref: '/customer/home',
      placement: 'home' as const,
      priority: 8,
      analytics: { impressions: 7000, clicks: 510, dismissals: 0 },
    },
    {
      type: 'community_notice' as const,
      title: 'Community Clean-Up',
      body: 'Join neighbourhood clean-up weekends. FixNow partners with local groups to keep service areas tidy.',
      ctaLabel: 'See notice',
      ctaHref: '/customer/home',
      placement: 'global' as const,
      priority: 2,
      analytics: { impressions: 3200, clicks: 180, dismissals: 0 },
    },
    {
      type: 'partner_ad' as const,
      title: 'Partner Advertisement',
      body: 'Featured partner tools and materials for technicians — available through FixNow partner network.',
      ctaLabel: 'View partner',
      ctaHref: '/customer/home',
      placement: 'home' as const,
      sponsorName: 'BuildRight Partners',
      priority: 9,
      analytics: { impressions: 11000, clicks: 1450, dismissals: 0 },
    },
    {
      type: 'tip' as const,
      title: 'Home Maintenance Tips',
      body: 'Monthly checklist: filters, taps, hinges, and outdoor drainage — book a handyman when needed.',
      ctaLabel: 'Browse handymen',
      ctaHref: '/customer/search?q=handyman',
      placement: 'profile' as const,
      priority: 3,
      analytics: { impressions: 4100, clicks: 260, dismissals: 0 },
    },
    // Extra ads for Advertisements tab
    {
      type: 'partner_ad' as const,
      title: 'Emergency Technician',
      body: 'Need help now? Priority matching for emergency electrical, plumbing, and locksmith jobs.',
      ctaLabel: 'Get help',
      ctaHref: '/customer/post-job',
      placement: 'home' as const,
      sponsorName: 'FixNow Emergency Desk',
      priority: 12,
      analytics: { impressions: 8600, clicks: 1320, dismissals: 0 },
    },
    {
      type: 'partner_ad' as const,
      title: 'Verified Professionals',
      body: 'Only book identity- and skill-verified technicians. Trust scores updated after every job.',
      ctaLabel: 'Explore',
      ctaHref: '/customer/search',
      placement: 'search' as const,
      sponsorName: 'FixNow Trust',
      priority: 7,
      analytics: { impressions: 9900, clicks: 980, dismissals: 0 },
    },
    {
      type: 'partner_ad' as const,
      title: 'Fast Response',
      body: 'Technicians with sub-30 minute average response times are highlighted in search this week.',
      ctaLabel: 'Find fast techs',
      ctaHref: '/customer/search?available=true',
      placement: 'offers' as const,
      sponsorName: 'FixNow Ops',
      priority: 6,
      analytics: { impressions: 6700, clicks: 740, dismissals: 0 },
    },
    {
      type: 'announcement' as const,
      title: 'Partner Promotion Spotlight',
      body: 'Seasonal partner spotlight featuring tool kits and safety gear discounts for technicians.',
      ctaLabel: 'Open',
      ctaHref: '/customer/home',
      placement: 'global' as const,
      sponsorName: 'ToolHub UG',
      priority: 5,
      analytics: { impressions: 4500, clicks: 390, dismissals: 0 },
    },
    // --- Premium Customer Home hero carousel (placement: home_hero) ---
    {
      type: 'sponsored_advertisement' as const,
      title: 'Finance your dream renovation',
      subtitle: 'Stanbic Home Improvement Loan',
      body: 'Flexible financing for kitchen, bathroom, and whole-home upgrades — apply with verified FixNow project quotes.',
      ctaLabel: 'Learn More',
      ctaHref: '/customer/offers',
      placement: 'home_hero' as const,
      audience: 'customer' as const,
      sponsorName: 'Stanbic Bank',
      badge: 'Partner',
      bannerImageUrl: 'asset:advertisements.bank',
      desktopImageUrl: 'asset:advertisements.bank',
      mobileImageUrl: 'asset:advertisements.bank',
      priority: 100,
      displayOrder: 0,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
    {
      type: 'partner_promotion' as const,
      title: 'Pay securely with MTN MoMo',
      subtitle: 'Trusted mobile money on FixNow',
      body: 'Pay technicians safely using MTN Mobile Money — escrow-protected until the job is complete.',
      ctaLabel: 'How it works',
      ctaHref: '/customer/help',
      placement: 'home_hero' as const,
      audience: 'customer' as const,
      sponsorName: 'MTN MoMo',
      badge: 'Payments',
      bannerImageUrl: 'asset:advertisements.telecom',
      desktopImageUrl: 'asset:advertisements.telecom',
      mobileImageUrl: 'asset:advertisements.telecom',
      priority: 95,
      displayOrder: 1,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
    {
      type: 'partner_promotion' as const,
      title: 'Solar installation packages',
      subtitle: 'TotalEnergies × FixNow',
      body: 'Professional rooftop solar, inverters, and battery systems installed by verified FixNow technicians.',
      ctaLabel: 'Book solar pros',
      ctaHref: '/customer/search?q=solar',
      placement: 'home_hero' as const,
      audience: 'customer' as const,
      sponsorName: 'TotalEnergies',
      badge: 'Energy',
      bannerImageUrl: 'asset:advertisements.solar',
      desktopImageUrl: 'asset:advertisements.solar',
      mobileImageUrl: 'asset:advertisements.solar',
      priority: 90,
      displayOrder: 2,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
    {
      type: 'technician_recruitment' as const,
      title: 'Become a certified FixNow technician',
      subtitle: 'FixNow Academy',
      body: 'Hands-on training, skill verification, and marketplace access — grow your trade with FixNow Academy.',
      ctaLabel: 'Join Academy',
      ctaHref: '/customer/help',
      placement: 'home_hero' as const,
      audience: 'all' as const,
      sponsorName: 'FixNow Academy',
      badge: 'Training',
      bannerImageUrl: 'asset:advertisements.training',
      desktopImageUrl: 'asset:advertisements.training',
      mobileImageUrl: 'asset:advertisements.training',
      priority: 85,
      displayOrder: 3,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
    {
      type: 'emergency_awareness' as const,
      title: 'Storm season readiness',
      subtitle: 'Safety campaign',
      body: 'Secure roofs, clear drains, and book emergency-ready electricians before the rains peak.',
      ctaLabel: 'Find emergency help',
      ctaHref: '/customer/post-job',
      placement: 'home_hero' as const,
      audience: 'customer' as const,
      sponsorName: 'FixNow Safety',
      badge: 'Safety',
      bannerImageUrl: 'asset:campaigns.safety',
      desktopImageUrl: 'asset:campaigns.safety',
      mobileImageUrl: 'asset:campaigns.safety',
      priority: 80,
      displayOrder: 4,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
    {
      type: 'referral_campaign' as const,
      title: 'Refer a neighbour, earn credit',
      subtitle: 'Seasonal referral',
      body: 'Share FixNow with friends. When they complete their first job, you both earn booking credit.',
      ctaLabel: 'Invite friends',
      ctaHref: '/customer/offers',
      placement: 'home_hero' as const,
      audience: 'customer' as const,
      sponsorName: 'FixNow',
      badge: 'Referral',
      bannerImageUrl: 'asset:promotions.referral',
      desktopImageUrl: 'asset:promotions.referral',
      mobileImageUrl: 'asset:promotions.referral',
      priority: 75,
      displayOrder: 5,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    },
  ];

  for (const item of sponsoredDefs) {
    const existing = await SponsoredContent.findOne({ title: item.title, type: item.type });
    const desiredBanner =
      'bannerImageUrl' in item && item.bannerImageUrl
        ? item.bannerImageUrl
        : sponsoredBannerForTitle(item.title, item.type);
    if (existing) {
      // Refresh hero creative fields on re-seed without wiping analytics.
      if (item.placement === 'home_hero') {
        existing.subtitle = 'subtitle' in item ? item.subtitle : existing.subtitle;
        existing.body = item.body;
        existing.ctaLabel = item.ctaLabel;
        existing.ctaHref = item.ctaHref;
        existing.placement = item.placement;
        if ('audience' in item && item.audience) existing.audience = item.audience;
        if ('sponsorName' in item) existing.sponsorName = item.sponsorName;
        if ('badge' in item) existing.badge = item.badge;
        if ('bannerImageUrl' in item) existing.bannerImageUrl = item.bannerImageUrl;
        if ('desktopImageUrl' in item) existing.desktopImageUrl = item.desktopImageUrl;
        if ('mobileImageUrl' in item) existing.mobileImageUrl = item.mobileImageUrl;
        existing.priority = item.priority;
        if ('displayOrder' in item) existing.displayOrder = item.displayOrder;
        existing.status = 'active';
        existing.startsAt = days(-5);
        existing.endsAt = days(90);
        await existing.save();
      } else if (existing.bannerImageUrl !== desiredBanner) {
        existing.bannerImageUrl = desiredBanner;
        await existing.save();
      }
      report.sponsoredContent.skipped += 1;
      continue;
    }
    const created = await SponsoredContent.create({
      ...item,
      bannerImageUrl: desiredBanner,
      startsAt: days(-5),
      endsAt: days(90),
      status: 'active',
      createdByAdminId: admin._id,
      displayOrder: 'displayOrder' in item ? item.displayOrder : 0,
      audience: 'audience' in item && item.audience ? item.audience : 'customer',
      dataEnvironment: seedDataEnvironment,
    });
    report.sponsoredContent.created += 1;
    await ensureAudit({
      actorId: admin._id,
      action: 'sponsored_content.created',
      resourceType: 'SponsoredContent',
      resourceId: created._id.toString(),
      meta: { seedKey: `${SEED_TAG}:sponsored:${item.title}`, comment: 'Seed: published sponsored content' },
    });
  }

  // --- Technician offers ---
  const offerDefs = [
    {
      techEmail: 'spark.electrical@fixnow.demo',
      type: OFFER_TYPE.PERCENTAGE_DISCOUNT,
      title: '15% OFF Electrical Inspection',
      subtitle: 'Spark Electrical special',
      description: 'Book a full electrical safety inspection and save 15% this month.',
      discountValue: 15,
      status: OFFER_STATUS.ACTIVE,
      featured: true,
      serviceNames: ['Electrical inspection', 'Wiring check'],
      category: 'electrical',
      analytics: { views: 2400, clicks: 610, bookings: 88, revenueGenerated: 6_200_000, redemptionCount: 88 },
      reviewComment: 'Approval: Clear pricing, strong customer value, banner meets guidelines.',
    },
    {
      techEmail: 'bright.plumbing@fixnow.demo',
      type: OFFER_TYPE.FREE_INSPECTION,
      title: 'Free Leak Inspection',
      subtitle: 'Bright Plumbing',
      description: 'Complimentary leak inspection for households in Kampala. Repairs quoted separately.',
      discountValue: 0,
      status: OFFER_STATUS.ACTIVE,
      featured: true,
      serviceNames: ['Leak inspection'],
      category: 'plumbing',
      analytics: { views: 3100, clicks: 820, bookings: 140, revenueGenerated: 9_100_000, redemptionCount: 140 },
      reviewComment: 'Approval: Free inspection is well explained; terms are complete.',
    },
    {
      techEmail: 'coolair.services@fixnow.demo',
      type: OFFER_TYPE.FREE_INSPECTION,
      title: 'Free AC Diagnosis',
      subtitle: 'CoolAir Services',
      description: 'Free AC diagnosis for residential units. Diagnosis credit applies if you proceed with repair.',
      discountValue: 0,
      status: OFFER_STATUS.ACTIVE,
      featured: false,
      serviceNames: ['AC diagnosis', 'HVAC service'],
      category: 'hvac',
      analytics: { views: 1800, clicks: 430, bookings: 55, revenueGenerated: 4_400_000, redemptionCount: 55 },
      reviewComment: 'Featured later candidate — strong seasonal fit.',
    },
    {
      techEmail: 'handyfix.carpentry@fixnow.demo',
      type: OFFER_TYPE.PERCENTAGE_DISCOUNT,
      title: '10% OFF Furniture Assembly',
      subtitle: 'HandyFix Carpentry',
      description: 'Assemble furniture faster with a 10% discount on labour for flat-pack jobs.',
      discountValue: 10,
      status: OFFER_STATUS.ACTIVE,
      featured: false,
      serviceNames: ['Furniture assembly'],
      category: 'carpentry',
      analytics: { views: 1500, clicks: 360, bookings: 49, revenueGenerated: 2_800_000, redemptionCount: 49 },
      reviewComment: 'Approval: Straightforward offer.',
    },
    {
      techEmail: 'safelock@fixnow.demo',
      type: OFFER_TYPE.FREE_CALL_OUT,
      title: 'Free Lock Assessment',
      subtitle: 'SafeLock',
      description: 'Free lock assessment and security advice. Call-out fee waived within Wakiso & Kampala.',
      discountValue: 0,
      status: OFFER_STATUS.ACTIVE,
      featured: false,
      serviceNames: ['Lock assessment', 'Locksmith'],
      category: 'locksmith',
      analytics: { views: 2100, clicks: 500, bookings: 70, revenueGenerated: 3_900_000, redemptionCount: 70 },
      reviewComment: 'Approval: Clear service area coverage.',
    },
    {
      techEmail: 'gardenpro@fixnow.demo',
      type: OFFER_TYPE.BUNDLE,
      title: 'Garden Maintenance Package',
      subtitle: 'GardenPro pending review',
      description: 'Monthly lawn + hedge package at a promotional rate. Awaiting admin approval.',
      discountValue: 25000,
      status: OFFER_STATUS.PENDING,
      featured: false,
      serviceNames: ['Lawn care', 'Hedge trimming'],
      category: 'landscaping',
      analytics: { views: 0, clicks: 0, bookings: 0, revenueGenerated: 0, redemptionCount: 0 },
      reviewComment: null,
    },
    {
      techEmail: 'spark.electrical@fixnow.demo',
      type: OFFER_TYPE.CUSTOM,
      title: 'Rejected Wiring Promo Draft',
      subtitle: 'Needs clearer terms',
      description: 'Demo rejected offer used to exercise admin reject queue and revision comments.',
      discountValue: 50,
      status: OFFER_STATUS.REJECTED,
      featured: false,
      serviceNames: ['Rewiring'],
      category: 'electrical',
      rejectionReason: 'Rejected: Discount appears excessive without max-cap; please revise terms and resubmit.',
      analytics: { views: 0, clicks: 0, bookings: 0, revenueGenerated: 0, redemptionCount: 0 },
      reviewComment: 'Rejected: Discount appears excessive without max-cap; please revise terms and resubmit.',
    },
    {
      techEmail: 'bright.plumbing@fixnow.demo',
      type: OFFER_TYPE.LIMITED_TIME,
      title: 'Suspended Flash Drain Offer',
      subtitle: 'Temporarily suspended',
      description: 'Demo suspended offer for admin suspend/archive workflows.',
      discountValue: 20,
      status: OFFER_STATUS.ARCHIVED,
      featured: false,
      serviceNames: ['Drain cleaning'],
      category: 'plumbing',
      rejectionReason: 'Suspended: Creative used unverified claims. Archive until revised.',
      analytics: { views: 900, clicks: 120, bookings: 8, revenueGenerated: 400_000, redemptionCount: 8 },
      reviewComment: 'Suspended: Creative used unverified claims. Archive until revised.',
    },
  ];

  const techByEmail = new Map(techs.map((t) => [t.user.email, t]));

  for (const def of offerDefs) {
    const tech = techByEmail.get(def.techEmail);
    if (!tech) continue;
    const titleKey = def.title.trim().toLowerCase();
    const existing = await TechnicianOffer.findOne({
      technicianId: tech.user._id,
      titleKey,
    });
    if (existing) {
      const desired = offerBannerForCategory(def.category);
      if (existing.bannerImageUrl !== desired) {
        existing.bannerImageUrl = desired;
        await existing.save();
      }
      report.technicianOffers.skipped += 1;
      continue;
    }

    const cat = categoryBySlug.get(def.category);
    const isLive = def.status === OFFER_STATUS.ACTIVE;
    const startsAt = days(-5);
    const endsAt = days(25);
    const created = await TechnicianOffer.create({
      technicianId: tech.user._id,
      type: def.type,
      title: def.title,
      subtitle: def.subtitle,
      description: def.description,
      terms: 'Offer valid within stated dates and service areas. Subject to technician availability.',
      bannerImageUrl: offerBannerForCategory(def.category),
      promotionColor: '#0F766E',
      badge: isLive ? 'Special' : def.status === OFFER_STATUS.PENDING ? 'Pending' : 'Review',
      categoryIds: cat ? [cat._id] : [],
      serviceNames: def.serviceNames,
      serviceAreaDistricts: ['Kampala', 'Wakiso', 'Entebbe'],
      availabilityNote: 'Weekdays 8:00–18:00',
      discountValue: def.discountValue,
      currency: 'UGX',
      minimumBookingAmount: 50000,
      maximumDiscountAmount: 100000,
      maxRedemptions: 200,
      perCustomerLimit: 1,
      startsAt,
      endsAt,
      timeStart: '08:00',
      timeEnd: '18:00',
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      status: def.status,
      rejectionReason: def.rejectionReason,
      reviewedByAdminId:
        def.status !== OFFER_STATUS.PENDING && def.status !== OFFER_STATUS.DRAFT ? admin._id : undefined,
      reviewedAt:
        def.status !== OFFER_STATUS.PENDING && def.status !== OFFER_STATUS.DRAFT ? days(-1) : undefined,
      dataEnvironment: seedDataEnvironment,
      submittedAt: days(-2),
      publishedAt: isLive ? days(-1) : undefined,
      featured: def.featured,
      analytics: def.analytics,
      titleKey,
    });
    report.technicianOffers.created += 1;

    if (def.status === OFFER_STATUS.ACTIVE) {
      await ensureAudit({
        actorId: admin._id,
        action: 'offer.approved',
        resourceType: 'TechnicianOffer',
        resourceId: created._id.toString(),
        meta: {
          seedKey: `${SEED_TAG}:offer-approved:${titleKey}`,
          comment: def.reviewComment || 'Approval',
        },
      });
      if (def.featured) {
        await ensureAudit({
          actorId: admin._id,
          action: 'offer.featured',
          resourceType: 'TechnicianOffer',
          resourceId: created._id.toString(),
          meta: {
            seedKey: `${SEED_TAG}:offer-featured:${titleKey}`,
            comment: 'Featured: High conversion potential and clear creative.',
          },
        });
      }
    } else if (def.status === OFFER_STATUS.REJECTED) {
      await ensureAudit({
        actorId: admin._id,
        action: 'offer.rejected',
        resourceType: 'TechnicianOffer',
        resourceId: created._id.toString(),
        meta: {
          seedKey: `${SEED_TAG}:offer-rejected:${titleKey}`,
          comment: def.reviewComment,
        },
      });
    } else if (def.status === OFFER_STATUS.ARCHIVED) {
      await ensureAudit({
        actorId: admin._id,
        action: 'offer.suspended',
        resourceType: 'TechnicianOffer',
        resourceId: created._id.toString(),
        meta: {
          seedKey: `${SEED_TAG}:offer-suspended:${titleKey}`,
          comment: def.reviewComment,
        },
      });
      await ensureAudit({
        actorId: admin._id,
        action: 'offer.archived',
        resourceType: 'TechnicianOffer',
        resourceId: created._id.toString(),
        meta: {
          seedKey: `${SEED_TAG}:offer-archived:${titleKey}`,
          comment: 'Archived after suspension for demo coverage.',
        },
      });
    } else if (def.status === OFFER_STATUS.PENDING) {
      await ensureAudit({
        actorId: tech.user._id,
        actorRole: 'technician',
        action: 'offer.submitted',
        resourceType: 'TechnicianOffer',
        resourceId: created._id.toString(),
        meta: {
          seedKey: `${SEED_TAG}:offer-submitted:${titleKey}`,
          comment: 'Submitted for approval',
        },
      });
    }
  }

  // --- Notifications (templates as concrete demo inbox rows) ---
  const notificationDefs: Array<{
    userId: mongoose.Types.ObjectId;
    type: string;
    title: string;
    body: string;
    href: string;
    seedKey: string;
  }> = [
    {
      userId: techs[0]!.user._id,
      type: 'offer.approved',
      title: 'Promotion Approved',
      body: 'Your offer “15% OFF Electrical Inspection” was approved and can go live.',
      href: '/technician/marketing/active',
      seedKey: 'tech-approved',
    },
    {
      userId: techs[0]!.user._id,
      type: 'offer.rejected',
      title: 'Promotion Rejected',
      body: 'Your offer “Rejected Wiring Promo Draft” was rejected. Please revise terms.',
      href: '/technician/marketing/rejected',
      seedKey: 'tech-rejected',
    },
    {
      userId: techs[1]!.user._id,
      type: 'offer.suspended',
      title: 'Promotion Suspended',
      body: '“Suspended Flash Drain Offer” was suspended by admin.',
      href: '/technician/marketing/offers',
      seedKey: 'tech-suspended',
    },
    {
      userId: techs[0]!.user._id,
      type: 'offer.featured',
      title: 'Promotion Featured',
      body: 'Your offer is now featured for customers.',
      href: '/technician/marketing/active',
      seedKey: 'tech-featured',
    },
    {
      userId: techs[2]!.user._id,
      type: 'offer.expiry_reminder',
      title: 'Promotion Expiring',
      body: '“Free AC Diagnosis” ends soon. Consider renewing or boosting.',
      href: '/technician/marketing/analytics',
      seedKey: 'tech-expiring',
    },
    {
      userId: techs[1]!.user._id,
      type: 'offer.archived',
      title: 'Promotion Archived',
      body: 'An offer was archived after suspension.',
      href: '/technician/marketing/offers',
      seedKey: 'tech-archived',
    },
    {
      userId: customer._id,
      type: 'offer.favourite_technician',
      title: 'Favourite Technician Promotion',
      body: 'Spark Electrical published a new promotion you may like.',
      href: '/customer/offers',
      seedKey: 'cust-favourite',
    },
    {
      userId: customer._id,
      type: 'offer.nearby',
      title: 'Nearby Promotion',
      body: 'New nearby promotions are available in Kampala.',
      href: '/customer/offers?filter=nearby',
      seedKey: 'cust-nearby',
    },
    {
      userId: customer._id,
      type: 'marketing.featured_campaign',
      title: 'Featured Campaign',
      body: 'Welcome to FixNow — 20% OFF Your First Booking is live.',
      href: '/customer/offers',
      seedKey: 'cust-featured-campaign',
    },
    {
      userId: customer._id,
      type: 'offer.expiry_reminder',
      title: 'Promotion Expiring Soon',
      body: 'A saved offer ends soon. Book now before it expires.',
      href: '/customer/offers/saved',
      seedKey: 'cust-expiring',
    },
    {
      userId: customer._id,
      type: 'marketing.welcome',
      title: 'Welcome Campaign',
      body: 'Thanks for joining FixNow. Explore today’s offers.',
      href: '/customer/home',
      seedKey: 'cust-welcome',
    },
    {
      userId: customer._id,
      type: 'marketing.referral',
      title: 'Referral Reward',
      body: 'Refer & Earn is active — share FixNow and unlock credits.',
      href: '/customer/offers',
      seedKey: 'cust-referral',
    },
  ];

  for (const n of notificationDefs) {
    const seedKey = `${SEED_TAG}:notif:${n.seedKey}`;
    const existing = await Notification.findOne({ 'meta.seedKey': seedKey });
    if (existing) {
      report.notifications.skipped += 1;
      continue;
    }
    await Notification.create({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      channels: ['in_app'],
      meta: { seedKey, seedTag: SEED_TAG },
      dataEnvironment: seedDataEnvironment,
    });
    report.notifications.created += 1;
  }

  // Extra audit samples for search/filter coverage
  await ensureAudit({
    actorId: admin._id,
    action: 'platform_promotion.active',
    resourceType: 'PlatformPromotion',
    resourceId: 'seed-platform',
    meta: { seedKey: `${SEED_TAG}:audit:platform-active`, comment: 'Edited & activated welcome campaign' },
  });
  await ensureAudit({
    actorId: admin._id,
    action: 'offer.expired',
    resourceType: 'TechnicianOffer',
    resourceId: 'seed-expired-demo',
    meta: { seedKey: `${SEED_TAG}:audit:offer-expired`, comment: 'Expired: schedule ended (demo audit)' },
  });

  await PlatformSetting.findOneAndUpdate(
    { key: 'seed.marketing.v1' },
    {
      $set: {
        key: 'seed.marketing.v1',
        value: { tag: SEED_TAG, lastRunAt: new Date().toISOString(), report },
        scope: 'admin',
        description: 'Marketing seed marker — idempotent demo data',
        updatedBy: admin._id,
        isSecret: false,
      },
    },
    { upsert: true },
  );

  console.log('\n[seed-marketing] Complete');
  console.log(JSON.stringify(report, null, 2));
  console.log('\nDemo logins (password: Password1!) — DEVELOPMENT ONLY');
  console.log('  Requires ALLOW_DEV_ADMIN_LOGIN=true (forced off in production).');
  console.log('  Admin:      marketing.admin@fixnow.demo');
  console.log('  Customer:   marketing.customer@fixnow.demo');
  console.log('  Technician: spark.electrical@fixnow.demo (and other @fixnow.demo techs)');
  console.log('\nProduction Super Admin: npm run bootstrap:super-admin -- --email you@company.com --name "Name"');

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('[seed-marketing] Failed', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
