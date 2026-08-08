/**
 * Data-environment taxonomy for FixNow marketplace records.
 * Process env (APP_ENV) is orthogonal — this tags *content*, not the host.
 */

export const DATA_ENVIRONMENTS = [
  'production',
  'sandbox',
  'development',
  'demo',
  'archived',
] as const;

export type DataEnvironment = (typeof DATA_ENVIRONMENTS)[number];

/** Non-production environments that participate in Sandbox Management. */
export const SANDBOX_ENVIRONMENTS: DataEnvironment[] = ['sandbox', 'development', 'demo'];

/** Environments that must never be auto-promoted to production. */
export const NEVER_PROMOTE_RESOURCE_TYPES = [
  'Payment',
  'Transaction',
  'EscrowTransaction',
  'Subscription',
  'SubscriptionPayment',
  'AuthSession',
  'RefreshToken',
  'Message',
  'Conversation',
  'Notification',
  'AuditLog',
  'JobApplication',
  'AiConversation',
  'AiPendingAction',
] as const;

/** Resource types admins may clone into production. */
export const PROMOTABLE_RESOURCE_TYPES = [
  'TechnicianOffer',
  'PlatformPromotion',
  'SponsoredContent',
  'ContentBlock',
  'Category',
  'CmsPage',
  'PortfolioItem',
] as const;

export type PromotableResourceType = (typeof PROMOTABLE_RESOURCE_TYPES)[number];

export function isDataEnvironment(value: unknown): value is DataEnvironment {
  return typeof value === 'string' && (DATA_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isSandboxLike(env: DataEnvironment | null | undefined): boolean {
  return Boolean(env && SANDBOX_ENVIRONMENTS.includes(env));
}

export function normalizeDataEnvironment(value: unknown, fallback: DataEnvironment = 'production'): DataEnvironment {
  if (isDataEnvironment(value)) return value;
  return fallback;
}
