/**
 * Centralised UX copy for Customer, Technician, and gated Development surfaces.
 * Prefer importing from here over hardcoding strings in screens.
 *
 * Audience legend:
 * - public    → customers, technicians, guests (production-safe)
 * - admin     → Command Center / operational (not used in marketplace apps)
 * - developer → Permanent Development Technician / Developer Preview only
 */

import type { UxMessageMeta } from './policy'

function msg(audience: UxMessageMeta['audience'], key: string, text: string): UxMessageMeta {
  return { audience, key, text }
}

/** Public auth & account recovery. */
export const UX_AUTH = {
  googleUnavailable: msg(
    'public',
    'auth.google.unavailable',
    'Google Sign-In is currently unavailable. Please sign in using your email and password.',
  ),
  googleChecking: msg('public', 'auth.google.checking', 'Checking Google Sign-In…'),
  googleConnecting: msg('public', 'auth.google.connecting', 'Connecting to Google…'),
  googleContinue: msg('public', 'auth.google.continue', 'Continue with Google'),
  emailSignInAvailable: msg(
    'public',
    'auth.google.emailAvailable',
    'Email sign-in is currently available for this version of FixNow.',
  ),
  incorrectCredentials: msg('public', 'auth.credentials.incorrect', 'Incorrect email or password.'),
  accountUnavailable: msg(
    'public',
    'auth.account.unavailable',
    'This account is not available. Please contact support.',
  ),
  accountLocked: msg(
    'public',
    'auth.account.locked',
    'This account is temporarily locked. Try again later or reset your password.',
  ),
  verifyEmail: msg('public', 'auth.email.verify', 'Please verify your email before signing in.'),
  roleMismatch: msg(
    'public',
    'auth.role.mismatch',
    'This email is already registered under a different account type.',
  ),
  googleIdentityConflict: msg(
    'public',
    'auth.google.identityConflict',
    'This Google account is already linked to a different FixNow email.',
  ),
  noCustomerProfile: msg(
    'public',
    'auth.profile.noCustomer',
    'This account does not have a customer profile yet.',
  ),
  noTechnicianProfile: msg(
    'public',
    'auth.profile.noTechnician',
    'This account does not have a technician profile yet.',
  ),
  notTechnicianAccount: msg(
    'public',
    'auth.profile.notTechnician',
    'This account is not a technician account.',
  ),
} as const

/** Public subscription & payment. */
export const UX_SUBSCRIPTION = {
  paymentReviewNotice: msg(
    'public',
    'subscription.payment.reviewNotice',
    "We'll notify you as soon as your payment has been verified.",
  ),
  paymentReviewDetail: msg(
    'public',
    'subscription.payment.reviewDetail',
    "Your subscription will become active after your payment has been reviewed. You'll receive a notification once it's approved.",
  ),
  paymentPendingTitle: msg(
    'public',
    'subscription.payment.pendingTitle',
    'Payment pending verification',
  ),
  paymentPendingBody: msg(
    'public',
    'subscription.payment.pendingBody',
    'Your payment is pending verification. You will be notified when it is approved.',
  ),
  submitPaymentCta: msg(
    'public',
    'subscription.payment.submitCta',
    'Submit payment for verification',
  ),
  upgradesPausedTitle: msg(
    'public',
    'subscription.upgrades.pausedTitle',
    'Upgrades temporarily unavailable',
  ),
  upgradesPausedBody: msg(
    'public',
    'subscription.upgrades.pausedBody',
    'New subscription purchases are paused for now. You can still use your current access.',
  ),
  transactionIdLabel: msg('public', 'subscription.payment.txIdLabel', 'Transaction ID'),
} as const

/**
 * Development Mode guidance — Permanent Development Technician only.
 * Must never replace production payment copy for ordinary technicians.
 */
export const UX_DEVELOPMENT = {
  modeTitle: msg('developer', 'development.mode.title', 'Development Mode'),
  modeBody: msg(
    'developer',
    'development.mode.body',
    'Use a Development Transaction ID to activate this plan for testing. No Mobile Money payment is required.',
  ),
  verificationTitle: msg(
    'developer',
    'development.verification.title',
    'Development Mode',
  ),
  activateCta: msg(
    'developer',
    'development.payment.activateCta',
    'Activate with Development Transaction ID',
  ),
  txIdLabel: msg(
    'developer',
    'development.payment.txIdLabel',
    'Development Transaction ID',
  ),
  noIds: msg(
    'developer',
    'development.payment.noIds',
    'No Development Transaction IDs are available for this plan right now.',
  ),
  footer: msg(
    'developer',
    'development.payment.footer',
    'Development Mode activates this plan for testing — no Mobile Money payment is required.',
  ),
  previewBannerTitle: msg(
    'developer',
    'development.preview.bannerTitle',
    'Development Mode · Preview',
  ),
  previewBannerBody: (plan: string) =>
    msg(
      'developer',
      'development.preview.bannerBody',
      `You're previewing ${plan} features for testing. No payments, invoices, or subscription history are created.`,
    ),
  previewSectionTitle: msg('developer', 'development.preview.sectionTitle', 'Developer Preview'),
  previewSectionBody: msg(
    'developer',
    'development.preview.sectionBody',
    'Try plan features for testing. No payments, invoices, or subscription history are created.',
  ),
  previewPlanBody: (planCode: string, withBoost: boolean) =>
    msg(
      'developer',
      'development.preview.planBody',
      `Temporarily experience ${planCode} features${withBoost ? ' with boost visibility' : ''} for testing.`,
    ),
  simulatorTitle: msg(
    'developer',
    'development.simulator.title',
    'Development plan simulator',
  ),
  simulatorBody: (plan: string, active: boolean) =>
    msg(
      'developer',
      'development.simulator.body',
      `Current plan: ${plan}${active ? ' · preview session active' : ''}. Switch plans for testing — no payments are recorded.`,
    ),
  simulatorActivated: (plan: string) =>
    msg(
      'developer',
      'development.simulator.activated',
      `Now previewing ${plan}. Your dashboard will refresh with that plan's features.`,
    ),
} as const

/** Public generic / system presentation (never leaks internals). */
export const UX_SYSTEM = {
  somethingWentWrong: msg(
    'public',
    'system.generic.error',
    'Something went wrong. Please try again.',
  ),
  serviceUnavailable: msg(
    'public',
    'system.service.unavailable',
    'Service temporarily unavailable.',
  ),
  noInternet: msg('public', 'system.network.offline', 'No internet connection.'),
  featureUnavailable: msg(
    'public',
    'system.feature.unavailable',
    'This feature is currently unavailable.',
  ),
  actionUnavailable: msg(
    'public',
    'system.action.unavailable',
    "This action isn't available for your account.",
  ),
  permissionDenied: msg(
    'public',
    'system.permission.denied',
    "You don't have permission to perform this action.",
  ),
  requestNotified: msg(
    'public',
    'system.request.notified',
    "We'll notify you when your request is complete.",
  ),
} as const

/** Soft customer/technician copy that previously referenced “admin approval”. */
export const UX_MARKETPLACE = {
  offersEmpty: msg(
    'public',
    'marketplace.offers.empty',
    'Check back soon — technicians publish promotions after they are reviewed.',
  ),
  refundRequested: msg(
    'public',
    'marketplace.refund.requested',
    "Refund requested. We'll notify you once it's been reviewed.",
  ),
  previewSession: msg(
    'developer',
    'marketplace.preview.session',
    'Temporary preview · no payments or invoices',
  ),
} as const

/** Flat lookup of static public strings (localisation-ready). */
export const UX_PUBLIC_CATALOG: Record<string, string> = Object.fromEntries(
  [
    ...Object.values(UX_AUTH),
    ...Object.values(UX_SUBSCRIPTION),
    ...Object.values(UX_SYSTEM),
    UX_MARKETPLACE.offersEmpty,
    UX_MARKETPLACE.refundRequested,
  ]
    .filter((m): m is UxMessageMeta => typeof m === 'object' && 'text' in m)
    .map((m) => [m.key, m.text]),
)

export function uxText(meta: UxMessageMeta): string {
  return meta.text
}
