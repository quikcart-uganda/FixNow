/**
 * Domain enums for FixNow MongoDB models.
 * Kept separate from HTTP constants so the data layer owns its vocabulary.
 */

export const USER_ROLES = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  ADMIN: 'admin',
} as const;

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  LOCKED: 'locked',
  SUSPENDED: 'suspended',
  PENDING_VERIFICATION: 'pending_verification',
  DELETED: 'deleted',
} as const;

export const JOB_STATUS = {
  DRAFT: 'draft',
  POSTED: 'posted',
  ASSIGNED: 'assigned',
  TECHNICIAN_EN_ROUTE: 'technician_en_route',
  IN_PROGRESS: 'in_progress',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  ARCHIVED: 'archived',
} as const;

export const APPLICATION_STATUS = {
  PENDING: 'pending',
  SHORTLISTED: 'shortlisted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const;

export const ASSIGNMENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REASSIGNED: 'reassigned',
} as const;

export const VERIFICATION_STATUS = {
  UNVERIFIED: 'unverified',
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

export const EXPERIENCE_LEVEL = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
  MASTER: 'master',
} as const;

export const TECHNICIAN_RANK = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
  DIAMOND: 'diamond',
} as const;

export const MOBILE_MONEY_PROVIDER = {
  MTN: 'mtn',
  AIRTEL: 'airtel',
} as const;

export const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  FILE: 'file',
  LOCATION: 'location',
  SYSTEM: 'system',
} as const;

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
  PUSH: 'push',
  SMS: 'sms',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const;

export const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  HOLD: 'hold',
  RELEASE: 'release',
  REFUND: 'refund',
  FEE: 'fee',
  PAYOUT: 'payout',
} as const;

export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const ESCROW_STATUS = {
  HELD: 'held',
  RELEASED: 'released',
  REFUNDED: 'refunded',
  DISPUTED: 'disputed',
  PARTIALLY_RELEASED: 'partially_released',
} as const;

export const MEDIA_TYPE = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  AUDIO: 'audio',
} as const;

export const DAY_OF_WEEK = {
  MON: 'mon',
  TUE: 'tue',
  WED: 'wed',
  THU: 'thu',
  FRI: 'fri',
  SAT: 'sat',
  SUN: 'sun',
} as const;

/** Technician-created marketing offers (distinct from platform Promotion codes). */
export const OFFER_TYPE = {
  PERCENTAGE_DISCOUNT: 'percentage_discount',
  FIXED_DISCOUNT: 'fixed_discount',
  FREE_CALL_OUT: 'free_call_out',
  FREE_INSPECTION: 'free_inspection',
  BUNDLE: 'bundle',
  SEASONAL: 'seasonal',
  LIMITED_TIME: 'limited_time',
  REFERRAL: 'referral',
  CUSTOM: 'custom',
} as const;

/**
 * Workflow status for technician offers.
 * Scheduled / active / expired are also derived from dates when status=approved.
 */
export const OFFER_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];
export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
export type VerificationStatus = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];
export type OfferType = (typeof OFFER_TYPE)[keyof typeof OFFER_TYPE];
export type OfferStatus = (typeof OFFER_STATUS)[keyof typeof OFFER_STATUS];
