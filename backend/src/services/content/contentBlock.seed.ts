import type {
  ContentBlockAudience,
  ContentBlockPage,
  ContentBlockType,
} from '../../models/growth/ContentBlock.js';

export interface SeedContentBlock {
  type: ContentBlockType;
  audience: ContentBlockAudience;
  page: ContentBlockPage;
  section: string;
  locale?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  icon?: string;
  badge?: string;
  color?: string;
  ctaLabel?: string;
  ctaHref?: string;
  priority?: number;
  displayOrder?: number;
}

/**
 * Default platform copy. These mirror the previously hardcoded marketing
 * strings so the apps render identical content out of the box while the Admin
 * Panel remains the single source of truth (admins can edit/replace freely).
 * Pre-auth screens target the `guests` audience.
 */
export const DEFAULT_CONTENT_BLOCKS: SeedContentBlock[] = [
  // --- Customer · Register ---
  {
    type: 'hero_headline',
    audience: 'guests',
    page: 'customer.register',
    section: 'hero',
    title: 'Quality fixes, just a tap away.',
    priority: 10,
  },
  {
    type: 'hero_description',
    audience: 'guests',
    page: 'customer.register',
    section: 'hero',
    body: 'Join thousands of homeowners in Kampala who trust FixNow for reliable, vetted, and professional home services.',
    priority: 9,
  },
  {
    type: 'feature_card',
    audience: 'guests',
    page: 'customer.register',
    section: 'feature',
    icon: 'verified_user',
    title: 'Vetted Pros',
    body: 'Every technician undergoes a rigorous multi-step background check.',
    displayOrder: 0,
  },
  {
    type: 'feature_card',
    audience: 'guests',
    page: 'customer.register',
    section: 'feature',
    icon: 'speed',
    title: 'Fast Arrival',
    body: 'Average response time of under 45 minutes across the city.',
    displayOrder: 1,
  },

  // --- Customer · Onboarding ---
  {
    type: 'customer_onboarding',
    audience: 'guests',
    page: 'customer.onboarding',
    section: 'slide',
    icon: 'handshake',
    title: 'Find Trusted Technicians',
    body: 'Connect with verified experts for electrical, plumbing, and home repairs.',
    displayOrder: 0,
  },
  {
    type: 'customer_onboarding',
    audience: 'guests',
    page: 'customer.onboarding',
    section: 'slide',
    icon: 'post_add',
    title: 'Post Jobs Instantly',
    body: 'Describe your problem, upload photos, and get matches in minutes.',
    displayOrder: 1,
  },
  {
    type: 'customer_onboarding',
    audience: 'guests',
    page: 'customer.onboarding',
    section: 'slide',
    icon: 'verified_user',
    title: 'Hire with Confidence',
    body: 'Track your technician in real-time and pay securely after the job is done.',
    displayOrder: 2,
  },

  // --- Customer · Splash ---
  {
    type: 'welcome_message',
    audience: 'guests',
    page: 'customer.splash',
    section: 'tagline',
    body: 'Book verified help in minutes',
  },

  // --- Technician · Onboarding ---
  {
    type: 'technician_onboarding',
    audience: 'guests',
    page: 'technician.onboarding',
    section: 'slide',
    icon: 'near_me',
    title: 'Jobs near you',
    body: 'Browse posted jobs in your parishes and apply with one tap when you match.',
    displayOrder: 0,
  },
  {
    type: 'technician_onboarding',
    audience: 'guests',
    page: 'technician.onboarding',
    section: 'slide',
    icon: 'military_tech',
    title: 'Build your reputation',
    body: 'Trust Score, reviews, and badges help you win more work in Kampala and beyond.',
    displayOrder: 1,
  },
  {
    type: 'technician_onboarding',
    audience: 'guests',
    page: 'technician.onboarding',
    section: 'slide',
    icon: 'payments',
    title: 'Get paid via Mobile Money',
    body: 'MTN MoMo and Airtel Money ready — track earnings and upgrade when you grow.',
    displayOrder: 2,
  },

  // --- Technician · Splash ---
  {
    type: 'welcome_message',
    audience: 'guests',
    page: 'technician.splash',
    section: 'tagline',
    body: 'East Africa’s most trusted technician marketplace',
  },

  // --- Customer · Home educational ---
  {
    type: 'educational',
    audience: 'customers',
    page: 'customer.home',
    section: 'tip',
    title: 'How to choose a trusted technician',
    body: 'Look for Verified badges, Trust Score above 80, and recent completed jobs in your parish.',
    icon: 'verified_user',
    displayOrder: 0,
  },
  {
    type: 'safety_tip',
    audience: 'customers',
    page: 'customer.home',
    section: 'tip',
    title: 'Emergency home safety',
    body: 'For gas leaks or exposed wiring, leave the area and book an emergency electrician immediately.',
    icon: 'emergency_home',
    displayOrder: 1,
  },
  {
    type: 'seasonal_campaign',
    audience: 'customers',
    page: 'customer.home',
    section: 'tip',
    title: 'Seasonal maintenance tips',
    body: 'Before the rains: clear gutters, check roof seals, and service your HVAC filters.',
    icon: 'rainy',
    displayOrder: 2,
  },

  // --- Technician · Dashboard ---
  {
    type: 'welcome_message',
    audience: 'technicians',
    page: 'technician.dashboard',
    section: 'blurb',
    body: 'Grow your business by staying online during peak hours and completing jobs on time.',
  },
  {
    type: 'feature_card',
    audience: 'technicians',
    page: 'technician.dashboard',
    section: 'feature',
    icon: 'work',
    title: 'Complete more jobs',
    body: 'Stay online during peak hours to win more nearby work.',
    displayOrder: 0,
  },
  {
    type: 'feature_card',
    audience: 'technicians',
    page: 'technician.dashboard',
    section: 'feature',
    icon: 'verified_user',
    title: 'Get verified',
    body: 'Verified pros earn more trust and higher booking rates.',
    displayOrder: 1,
  },
  {
    type: 'feature_card',
    audience: 'technicians',
    page: 'technician.dashboard',
    section: 'feature',
    icon: 'payments',
    title: 'Track earnings',
    body: 'Mobile Money payouts keep your cashflow moving.',
    displayOrder: 2,
  },
];
