/**
 * FixNow Seed Platform — constants & metadata contract (Phase 2).
 * All seed content lives in Content Environment `sandbox` only.
 */

export const SEED_PLATFORM_VERSION = '2.0.0';
export const SEED_TAG = 'fixnow-seed-platform-v1';
export const SEED_GENERATED_BY = 'FixNow Seed Platform';
export const SEED_CONTENT_ENVIRONMENT = 'sandbox' as const;

/** Permanent developer technician — never production. */
export const DEVELOPER_TECHNICIAN = {
  seedKey: 'developer-technician',
  email: 'quikcart2026@gmail.com',
  phone: '+256700202026',
  fullName: 'Jordan Mutebi',
  password: 'FixNowDev!2026',
  headline: 'Multi-trade field lead · Kampala & Wakiso',
  bio:
    'Jordan Mutebi is FixNow’s official development technician account. Fifteen years across ' +
    'electrical, plumbing, and solar installs for Kampala homes and SMEs. Used by engineers and QA ' +
    'to exercise every technician workflow on the real backend — sandbox only, never production.',
  companyName: 'Mutebi Field Services',
  companyMission: 'Reliable on-site repairs with clear pricing and photo proof.',
  companyVision: 'Every home and shop in Greater Kampala gets verified help within the hour.',
  businessSlogan: 'Show up. Fix it. Prove it.',
  brandPrimaryColor: '#0F766E',
  district: 'Kampala',
  city: 'Kampala',
  landmark: 'Ntinda — opposite Capital Shoppers',
  skills: ['Electrical', 'Plumbing', 'Solar', 'AC service', 'Appliance diagnostics'],
  categoryName: 'Electrical',
  avatarId: 'avatar-seed-dev-01',
  lng: 32.612,
  lat: 0.351,
} as const;

/**
 * Permanent Seed Customer — migrate the existing marketplace customer in place.
 * Password is NEVER set or overwritten by Seed Platform (preserves registration credentials).
 */
export const DEVELOPER_CUSTOMER = {
  seedKey: 'developer-customer',
  email: 'kingjordannyago@gmail.com',
  fullName: 'King Jordan',
  district: 'Kampala',
  city: 'Kampala',
  landmark: 'Greater Kampala — Seed Customer QA',
  bio:
    'Permanent Seed Customer for FixNow Development Mode. Exercises the real customer → job → ' +
    'matching → chat → completion → review pipeline on the production backend with sandbox isolation.',
  lng: 32.582,
  lat: 0.347,
  passwordPolicy: 'preserved_from_registration' as const,
} as const;

/** Shared password for non-developer seed logins (customers + supporting techs). */
export const SEED_USER_PASSWORD = 'SeedPlatform!2026';

export type SeedMeta = {
  generatedBy: typeof SEED_GENERATED_BY;
  generatedOn: string;
  seedVersion: typeof SEED_PLATFORM_VERSION;
  seedTag: typeof SEED_TAG;
  environment: typeof SEED_CONTENT_ENVIRONMENT;
  seedKey?: string;
  fixtureId?: string;
  purpose?: string;
  urgency?: string;
  developer?: boolean;
};

export function buildSeedMeta(extra?: Partial<SeedMeta>): SeedMeta & Record<string, unknown> {
  return {
    generatedBy: SEED_GENERATED_BY,
    generatedOn: new Date().toISOString(),
    seedVersion: SEED_PLATFORM_VERSION,
    seedTag: SEED_TAG,
    environment: SEED_CONTENT_ENVIRONMENT,
    ...extra,
  };
}

/** Mongo filter matching all Seed Platform rows (users via metadata, docs via metadata or field). */
export function seedTagFilter(): Record<string, unknown> {
  return {
    $or: [
      { 'metadata.seedTag': SEED_TAG },
      { seedTag: SEED_TAG },
    ],
  };
}

export function seedUserFilter(): Record<string, unknown> {
  return { 'metadata.seedTag': SEED_TAG };
}
