/**
 * Idempotent UX content repair seed.
 *
 * - Repoints broken `/uploads/placeholders/...` banners to local asset catalog keys
 * - Adds technician-audience promotions + partner ads (never reused from customer)
 * - Ensures Internet & CCTV category exists
 * - Re-seeds ContentBlock defaults
 *
 * Safe to run many times. Does not delete existing live data.
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-ux-content.ts
 */

import dotenv from 'dotenv';
dotenv.config();

const ASSET = {
  firstBooking: 'asset:promotions.first-booking',
  weekend: 'asset:promotions.weekend',
  emergency: 'asset:promotions.emergency',
  rainy: 'asset:promotions.rainy-season',
  safety: 'asset:promotions.safety-month',
  referral: 'asset:promotions.referral',
  bank: 'asset:advertisements.bank',
  insurance: 'asset:advertisements.insurance',
  materials: 'asset:advertisements.building-materials',
  solar: 'asset:advertisements.solar',
  tools: 'asset:advertisements.tools',
  vehicle: 'asset:advertisements.vehicle',
  training: 'asset:advertisements.training',
  telecom: 'asset:advertisements.telecom',
  chooseTech: 'asset:campaigns.choose-tech',
  earnings: 'asset:campaigns.earnings',
  verification: 'asset:campaigns.verification',
};

function days(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow';
  await import('../src/models/index.js');
  const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
  const {
    User,
    Category,
    PlatformPromotion,
    SponsoredContent,
  } = await import('../src/models/index.js');
  const { contentBlockService } = await import('../src/services/content/contentBlock.service.js');

  await connectDatabase();
  console.log('[seed-ux] connected');

  const admin =
    (await User.findOne({ role: 'admin' })) ||
    (await User.findOne({ email: 'marketing.admin@fixnow.demo' }));
  if (!admin) throw new Error('No admin user found — run seed:marketing first');

  // --- Category: Internet & CCTV ---
  let catCreated = 0;
  const existingCat = await Category.findOne({
    $or: [{ slug: 'internet-cctv' }, { name: 'Internet & CCTV' }],
  });
  if (!existingCat) {
    await Category.create({
      name: 'Internet & CCTV',
      slug: 'internet-cctv',
      icon: 'videocam',
      description: 'Internet installation, Wi-Fi, CCTV and smart security systems.',
      isActive: true,
      sortOrder: 15,
    });
    catCreated = 1;
  }

  // --- Repoint broken placeholder banners ---
  const promoBannerMap: Array<[RegExp, string]> = [
    [/first/i, ASSET.firstBooking],
    [/weekend/i, ASSET.weekend],
    [/emergency|electric/i, ASSET.emergency],
    [/rain|roof/i, ASSET.rainy],
    [/safety/i, ASSET.safety],
    [/refer/i, ASSET.referral],
  ];
  let promoFixed = 0;
  const promos = await PlatformPromotion.find({
    $or: [{ bannerImageUrl: /uploads\/placeholders/ }, { bannerImageUrl: { $exists: false } }, { bannerImageUrl: null }],
  });
  for (const p of promos) {
    const hit = promoBannerMap.find(([re]) => re.test(p.title));
    p.bannerImageUrl = hit?.[1] || ASSET.firstBooking;
    await p.save();
    promoFixed += 1;
  }

  let sponsoredFixed = 0;
  const sponsoredRows = await SponsoredContent.find({
    $or: [{ bannerImageUrl: /uploads\/placeholders/ }, { bannerImageUrl: { $exists: false } }, { bannerImageUrl: null }],
  });
  for (const s of sponsoredRows) {
    if (s.type === 'partner_ad') {
      const map: Record<string, string> = {
        bank: ASSET.bank,
        insurance: ASSET.insurance,
        material: ASSET.materials,
        solar: ASSET.solar,
        tool: ASSET.tools,
        vehicle: ASSET.vehicle,
        train: ASSET.training,
        telecom: ASSET.telecom,
      };
      const key = Object.keys(map).find((k) => new RegExp(k, 'i').test(`${s.title} ${s.sponsorName || ''}`));
      s.bannerImageUrl = (key && map[key]) || ASSET.bank;
    } else if (/earn|business|commission/i.test(s.title)) {
      s.bannerImageUrl = ASSET.earnings;
    } else if (/verif/i.test(s.title)) {
      s.bannerImageUrl = ASSET.verification;
    } else {
      s.bannerImageUrl = ASSET.chooseTech;
    }
    if (!s.audience) s.audience = 'customer';
    await s.save();
    sponsoredFixed += 1;
  }

  // --- Technician-specific platform promotions ---
  const techPromos = [
    {
      kind: 'referral' as const,
      title: 'Refer a technician — earn credits',
      subtitle: 'Grow the FixNow network',
      description: 'Invite a verified technician. When they complete their first 3 jobs, you earn lead credits.',
      badge: 'Referral',
      discountType: 'credit' as const,
      discountValue: 3,
      code: 'TECHREF',
      bannerImageUrl: ASSET.referral,
    },
    {
      kind: 'seasonal' as const,
      title: 'Lower commission weekend',
      subtitle: 'Keep more of what you earn',
      description: 'Complete jobs this weekend with a temporary platform fee reduction for Pro technicians.',
      badge: 'Weekend',
      discountType: 'percent' as const,
      discountValue: 15,
      code: 'PROWEEKEND',
      bannerImageUrl: ASSET.weekend,
    },
  ];

  let techPromoCreated = 0;
  for (const promo of techPromos) {
    const exists = await PlatformPromotion.findOne({ title: promo.title });
    if (exists) continue;
    await PlatformPromotion.create({
      ...promo,
      currency: 'UGX',
      audience: 'technician',
      startsAt: days(-1),
      endsAt: days(30),
      status: 'active',
      featured: true,
      maxRedemptions: 2000,
      redemptionCount: 0,
      createdByAdminId: admin._id,
      terms: 'Technician-only FixNow platform promotion.',
      analytics: { views: 0, clicks: 0, redemptions: 0, revenueGenerated: 0 },
    });
    techPromoCreated += 1;
  }

  // --- Technician educational + partner ads ---
  const techSponsored = [
    {
      type: 'educational_banner' as const,
      title: 'Increase your earnings',
      body: 'Respond within 15 minutes and keep your Trust Score above 85 to unlock higher-value jobs.',
      ctaLabel: 'View tips',
      ctaHref: '/technician/help',
      placement: 'home' as const,
      priority: 12,
      bannerImageUrl: ASSET.earnings,
      sponsorName: 'FixNow Academy',
    },
    {
      type: 'tip' as const,
      title: 'Verification tips',
      body: 'Upload a clear National ID selfie match and at least 3 portfolio photos to speed up review.',
      ctaLabel: 'Open verification',
      ctaHref: '/technician/settings',
      placement: 'home' as const,
      priority: 10,
      bannerImageUrl: ASSET.verification,
      sponsorName: 'FixNow Trust',
    },
    {
      type: 'partner_ad' as const,
      title: 'Pro power tools — partner rates',
      body: 'Exclusive discounts on drills, meters and safety gear for verified FixNow technicians.',
      ctaLabel: 'Shop tools',
      ctaHref: '/technician/help',
      placement: 'home' as const,
      priority: 8,
      bannerImageUrl: ASSET.tools,
      sponsorName: 'ToolMart UG',
    },
    {
      type: 'partner_ad' as const,
      title: 'Work van financing',
      body: 'Flexible vehicle financing for technicians expanding their service radius.',
      ctaLabel: 'Learn more',
      ctaHref: '/technician/help',
      placement: 'global' as const,
      priority: 6,
      bannerImageUrl: ASSET.vehicle,
      sponsorName: 'DrivePro Finance',
    },
    {
      type: 'partner_ad' as const,
      title: 'Professional training',
      body: 'Short courses in solar, CCTV and HVAC — certificates that boost your FixNow profile.',
      ctaLabel: 'Browse courses',
      ctaHref: '/technician/help',
      placement: 'home' as const,
      priority: 5,
      bannerImageUrl: ASSET.training,
      sponsorName: 'SkillUp Kampala',
    },
  ];

  let techSponsoredCreated = 0;
  for (const row of techSponsored) {
    const exists = await SponsoredContent.findOne({ title: row.title, audience: 'technician' });
    if (exists) continue;
    await SponsoredContent.create({
      ...row,
      audience: 'technician',
      startsAt: days(-1),
      endsAt: days(45),
      status: 'active',
      createdByAdminId: admin._id,
      analytics: { impressions: 0, clicks: 0 },
    });
    techSponsoredCreated += 1;
  }

  // --- Technician dashboard hero banners (real photography — JPG via Unsplash CDN) ---
  const HERO_PHOTOS = {
    electrical:
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1600&q=80',
    tools:
      'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1600&q=80',
    safety:
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80',
  };

  const heroBanners = [
    {
      type: 'partner_ad' as const,
      title: 'Pro tools that pay for themselves',
      subtitle: 'Partner rates for verified FixNow technicians',
      body: 'Exclusive discounts on meters, drills and PPE — earn more jobs with gear customers trust.',
      ctaLabel: 'Shop partner deals',
      ctaHref: '/technician/marketing',
      placement: 'dashboard_hero' as const,
      priority: 20,
      bannerImageUrl: HERO_PHOTOS.tools,
      sponsorName: 'ToolMart UG',
    },
    {
      type: 'educational_banner' as const,
      title: 'Stay certified. Win more work.',
      subtitle: 'Safety & skills month',
      body: 'Complete FixNow safety refreshers and boost your trust score visibility in search.',
      ctaLabel: 'Start training',
      ctaHref: '/technician/help',
      placement: 'dashboard_hero' as const,
      priority: 18,
      bannerImageUrl: HERO_PHOTOS.safety,
      sponsorName: 'FixNow Academy',
    },
    {
      type: 'announcement' as const,
      title: 'Electrical season is peaking',
      subtitle: 'Platform tip for Kampala pros',
      body: 'Keep availability on during evening peaks — response rate lifts your ranking this week.',
      ctaLabel: 'Update availability',
      ctaHref: '/technician/availability',
      placement: 'dashboard_hero' as const,
      priority: 16,
      bannerImageUrl: HERO_PHOTOS.electrical,
      sponsorName: 'FixNow',
    },
  ];

  let heroCreated = 0;
  for (const row of heroBanners) {
    const exists = await SponsoredContent.findOne({
      title: row.title,
      placement: 'dashboard_hero',
      audience: 'technician',
    });
    if (exists) continue;
    await SponsoredContent.create({
      ...row,
      audience: 'technician',
      startsAt: days(-1),
      endsAt: days(60),
      status: 'active',
      createdByAdminId: admin._id,
      analytics: { impressions: 0, clicks: 0, dismissals: 0 },
    });
    heroCreated += 1;
  }

  // Ensure customer partner ads exist for key sponsors (if seed-marketing skipped them)
  const customerAds = [
    {
      title: 'Home financing with partner banks',
      body: 'Flexible home improvement loans for FixNow customers — apply in minutes.',
      sponsorName: 'Partner Bank',
      bannerImageUrl: ASSET.bank,
      ctaHref: '/customer/home',
    },
    {
      title: 'Protect your home',
      body: 'Insurance partners covering plumbing, electrical and storm damage claims.',
      sponsorName: 'SafeHome Insurance',
      bannerImageUrl: ASSET.insurance,
      ctaHref: '/customer/home',
    },
    {
      title: 'Building materials delivered',
      body: 'Cement, paint and fixtures delivered same-day across Kampala.',
      sponsorName: 'BuildRight Materials',
      bannerImageUrl: ASSET.materials,
      ctaHref: '/customer/home',
    },
  ];
  let customerAdCreated = 0;
  for (const ad of customerAds) {
    const exists = await SponsoredContent.findOne({ title: ad.title });
    if (exists) continue;
    await SponsoredContent.create({
      type: 'partner_ad',
      title: ad.title,
      body: ad.body,
      sponsorName: ad.sponsorName,
      bannerImageUrl: ad.bannerImageUrl,
      ctaLabel: 'Learn more',
      ctaHref: ad.ctaHref,
      placement: 'home',
      audience: 'customer',
      startsAt: days(-1),
      endsAt: days(60),
      status: 'active',
      priority: 7,
      createdByAdminId: admin._id,
      analytics: { impressions: 0, clicks: 0 },
    });
    customerAdCreated += 1;
  }

  const blocks = await contentBlockService.ensureDefaults(admin._id.toString());

  console.log(
    JSON.stringify(
      {
        categoryCreated: catCreated,
        promoBannersFixed: promoFixed,
        sponsoredBannersFixed: sponsoredFixed,
        techPromoCreated,
        techSponsoredCreated,
        heroCreated,
        customerAdCreated,
        contentBlocks: blocks,
      },
      null,
      2,
    ),
  );

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
