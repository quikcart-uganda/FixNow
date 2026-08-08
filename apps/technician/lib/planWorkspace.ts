/**
 * Display-only plan workspace helpers.
 * Does not change entitlement resolution — maps already-resolved plan codes to UX tiers.
 */

export type PlanWorkspaceTier = 'free' | 'starter' | 'professional' | 'business'

export function resolvePlanWorkspaceTier(
  planCode: string | null | undefined,
  hasActiveSubscription: boolean,
): PlanWorkspaceTier {
  if (!hasActiveSubscription) return 'free'
  const code = String(planCode || '').toUpperCase()
  if (code === 'BUSINESS') return 'business'
  if (code === 'PROFESSIONAL') return 'professional'
  if (code === 'STARTER') return 'starter'
  return 'starter'
}

export function planWorkspaceLabel(tier: PlanWorkspaceTier): string {
  switch (tier) {
    case 'business':
      return 'Business'
    case 'professional':
      return 'Professional'
    case 'starter':
      return 'Starter'
    default:
      return 'Free'
  }
}

export function planShellSubtitle(tier: PlanWorkspaceTier): string {
  switch (tier) {
    case 'business':
      return 'Company workspace'
    case 'professional':
      return 'Your workspace'
    case 'starter':
      return 'Your workspace'
    default:
      return 'Technician'
  }
}

export function planAssistantLabel(tier: PlanWorkspaceTier): string {
  switch (tier) {
    case 'business':
      return 'Company Assistant'
    case 'professional':
      return 'Assistant'
    case 'starter':
      return 'Assistant'
    default:
      return 'FixNow Assistant'
  }
}

export function planAccentCssVar(tier: PlanWorkspaceTier): string {
  switch (tier) {
    case 'business':
      return 'var(--fn-plan-business, #0f766e)'
    case 'professional':
      return 'var(--fn-plan-professional, #0a2540)'
    case 'starter':
      return 'var(--fn-plan-starter, #004ac6)'
    default:
      return 'var(--color-primary)'
  }
}

export function planThemeClass(tier: PlanWorkspaceTier): string {
  switch (tier) {
    case 'business':
      return 'fn-theme-business fn-plan-business'
    case 'professional':
      return 'fn-theme-professional fn-plan-professional'
    case 'starter':
      return 'fn-theme-starter fn-plan-starter'
    default:
      return ''
  }
}

export type PlanPageKey =
  | 'jobs'
  | 'jobDetails'
  | 'active'
  | 'earnings'
  | 'portfolio'
  | 'profile'
  | 'marketing'
  | 'messages'
  | 'reputation'
  | 'reviews'
  | 'availability'
  | 'settings'
  | 'boosts'
  | 'company'

type Intro = { title: string; subtitle: string }

const PAGE_INTROS: Record<PlanPageKey, Record<PlanWorkspaceTier, Intro>> = {
  jobs: {
    free: { title: 'Nearby jobs', subtitle: 'Browse opportunities near you. Upgrade for unlimited applications.' },
    starter: { title: 'Nearby jobs', subtitle: 'Focused feed — apply fast and keep your queue moving.' },
    professional: {
      title: 'Nearby jobs',
      subtitle: 'See jobs that match you well and apply while they are still open.',
    },
    business: {
      title: 'Demand board',
      subtitle: 'Prioritise high-value jobs for your company.',
    },
  },
  jobDetails: {
    free: { title: 'Job details', subtitle: 'Review the brief before you apply.' },
    starter: { title: 'Job details', subtitle: 'Essential brief — decide quickly and apply.' },
    professional: {
      title: 'Job details',
      subtitle: 'Review the brief and decide if this job is a good fit.',
    },
    business: {
      title: 'Job details',
      subtitle: 'Customer value and urgency to help you decide quickly.',
    },
  },
  active: {
    free: { title: 'Active jobs', subtitle: 'Work currently in progress.' },
    starter: { title: 'Active jobs', subtitle: 'Simple queue of jobs you are delivering.' },
    professional: {
      title: 'Active jobs',
      subtitle: 'Track status and stay on top of work in progress.',
    },
    business: {
      title: 'Active jobs',
      subtitle: 'Jobs in progress across your company.',
    },
  },
  earnings: {
    free: { title: 'Earnings', subtitle: 'Track payouts and available balance.' },
    starter: { title: 'Earnings', subtitle: 'Clear balance and payout history — keep it simple.' },
    professional: { title: 'Income', subtitle: 'See earnings and plan your week.' },
    business: {
      title: 'Revenue',
      subtitle: 'Balance, pace, and payouts for your company.',
    },
  },
  portfolio: {
    free: { title: 'Portfolio', subtitle: 'Show customers what you can do.' },
    starter: { title: 'Portfolio', subtitle: 'Essential showcase — keep proof photos fresh.' },
    professional: {
      title: 'Portfolio',
      subtitle: 'Photos and videos that help customers trust your work.',
    },
    business: {
      title: 'Company portfolio',
      subtitle: 'Case studies, certificates, and brand visuals.',
    },
  },
  profile: {
    free: { title: 'Profile', subtitle: 'Your public technician presence.' },
    starter: { title: 'Your profile', subtitle: 'Clean public presence for winning nearby jobs.' },
    professional: { title: 'Business profile', subtitle: 'Your public page for customers.' },
    business: {
      title: 'Company profile',
      subtitle: 'How your business appears to customers.',
    },
  },
  marketing: {
    free: { title: 'Marketing', subtitle: 'Promote your services when your plan allows.' },
    starter: { title: 'Marketing', subtitle: 'Lightweight promotions when included on your plan.' },
    professional: { title: 'Marketing', subtitle: 'Offers, ads, and results in one place.' },
    business: {
      title: 'Campaigns',
      subtitle: 'Coordinate slides, offers, and announcements.',
    },
  },
  messages: {
    free: { title: 'Inbox', subtitle: 'Customer conversations.' },
    starter: { title: 'Inbox', subtitle: 'Focused customer chat.' },
    professional: {
      title: 'Inbox',
      subtitle: 'Reply quickly to keep customers engaged.',
    },
    business: {
      title: 'Company inbox',
      subtitle: 'Customer conversations for your business.',
    },
  },
  reputation: {
    free: { title: 'Reputation', subtitle: 'Build trust on FixNow.' },
    starter: { title: 'Reputation', subtitle: 'Track trust basics that unlock more work.' },
    professional: {
      title: 'Customer rating',
      subtitle: 'Stay visible by keeping trust scores strong.',
    },
    business: {
      title: 'Brand reputation',
      subtitle: 'Company trust and quality at a glance.',
    },
  },
  reviews: {
    free: { title: 'Reviews', subtitle: 'Customer feedback on completed jobs.' },
    starter: { title: 'Reviews', subtitle: 'Simple feedback list.' },
    professional: {
      title: 'Reviews',
      subtitle: 'Use feedback to improve your service.',
    },
    business: {
      title: 'Customer feedback',
      subtitle: 'See how customers rate your company.',
    },
  },
  availability: {
    free: { title: 'Availability', subtitle: 'Set when customers can book you.' },
    starter: { title: 'Availability', subtitle: 'Stay online when you want work.' },
    professional: {
      title: 'Availability',
      subtitle: 'Stay online when demand is highest.',
    },
    business: {
      title: 'Coverage',
      subtitle: 'When your company is available for work.',
    },
  },
  settings: {
    free: { title: 'Settings', subtitle: 'Account preferences.' },
    starter: { title: 'Settings', subtitle: 'Essentials for your workspace.' },
    professional: { title: 'Settings', subtitle: 'Account preferences and billing shortcuts.' },
    business: { title: 'Settings', subtitle: 'Company preferences and account controls.' },
  },
  boosts: {
    free: { title: 'Boosts', subtitle: 'Increase visibility when eligible.' },
    starter: { title: 'Boosts', subtitle: 'Optional visibility boosts for your plan.' },
    professional: {
      title: 'Boosts',
      subtitle: 'Increase visibility for your offers and profile.',
    },
    business: {
      title: 'Growth boosts',
      subtitle: 'Extra visibility for company demand.',
    },
  },
  company: {
    free: { title: 'Company profile', subtitle: 'Business branding when your plan allows.' },
    starter: { title: 'Company profile', subtitle: 'Basic company fields when available.' },
    professional: {
      title: 'Business branding',
      subtitle: 'Logo, slogan, and colours for your public page.',
    },
    business: {
      title: 'Company identity',
      subtitle: 'Mission, registration, and visual identity.',
    },
  },
}

export function planPageIntro(
  tier: PlanWorkspaceTier,
  page: PlanPageKey,
): { eyebrow: string; title: string; subtitle: string } {
  const row = PAGE_INTROS[page][tier]
  return {
    eyebrow: tier === 'free' ? 'FixNow' : 'Workspace',
    title: row.title,
    subtitle: row.subtitle,
  }
}

export type PlanEmptyDomain = 'jobs' | 'portfolio' | 'earnings' | 'reviews' | 'messages' | 'active'

const EMPTY_COPY: Record<PlanEmptyDomain, Record<PlanWorkspaceTier, { title: string; hint: string }>> = {
  jobs: {
    free: {
      title: 'No jobs nearby yet',
      hint: 'Widen your radius or check back soon. Upgrade for unlimited applications.',
    },
    starter: {
      title: 'No jobs in range',
      hint: 'Stay available and pull to refresh — check again soon.',
    },
    professional: {
      title: 'No jobs nearby right now',
      hint: 'Stay available and check again soon — peak hours bring more work.',
    },
    business: {
      title: 'No nearby jobs right now',
      hint: 'Widen coverage or refresh your campaigns to attract more demand.',
    },
  },
  portfolio: {
    free: { title: 'Portfolio is empty', hint: 'Add a few photos of completed work.' },
    starter: {
      title: 'Add your first proof photos',
      hint: 'A simple gallery helps customers trust your profile.',
    },
    professional: {
      title: 'Add photos of your work',
      hint: 'Before/after photos and videos help customers hire you with confidence.',
    },
    business: {
      title: 'Company gallery needs assets',
      hint: 'Publish case studies and certificates to strengthen trust.',
    },
  },
  earnings: {
    free: { title: 'No earnings yet', hint: 'Complete jobs to see payouts here.' },
    starter: {
      title: 'No balance yet',
      hint: 'Finish confirmed jobs to grow this week’s earnings.',
    },
    professional: {
      title: 'No income yet this period',
      hint: 'Apply to jobs and keep offers fresh to grow weekly earnings.',
    },
    business: {
      title: 'No revenue yet this period',
      hint: 'Run campaigns and complete jobs to build your outlook.',
    },
  },
  reviews: {
    free: {
      title: 'No reviews yet',
      hint: 'Reviews appear after customers rate completed jobs.',
    },
    starter: { title: 'No reviews yet', hint: 'Deliver well — feedback will land here.' },
    professional: {
      title: 'No reviews yet',
      hint: 'Ask happy customers to leave a review after the job.',
    },
    business: {
      title: 'No customer feedback yet',
      hint: 'Completed jobs with reviews appear here.',
    },
  },
  messages: {
    free: { title: 'No conversations', hint: 'Messages from customers show up here.' },
    starter: { title: 'Inbox is clear', hint: 'New chats appear when customers message you.' },
    professional: {
      title: 'No open threads',
      hint: 'Reply quickly when customers message you.',
    },
    business: {
      title: 'Inbox is clear',
      hint: 'Customer messages appear here as jobs progress.',
    },
  },
  active: {
    free: { title: 'No active jobs', hint: 'Accepted work will appear in your queue.' },
    starter: {
      title: 'Queue is empty',
      hint: 'Apply to nearby jobs to fill your pipeline.',
    },
    professional: {
      title: 'No active jobs',
      hint: 'Win a nearby job to start tracking delivery here.',
    },
    business: {
      title: 'No jobs in progress',
      hint: 'Accept nearby jobs to populate this board.',
    },
  },
}

export function planEmptyCopy(
  tier: PlanWorkspaceTier,
  domain: PlanEmptyDomain,
): { title: string; hint: string } {
  return EMPTY_COPY[domain][tier]
}
