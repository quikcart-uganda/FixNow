/**
 * Technician subscription plans, payments (manual MoMo), and entitlements.
 * Free completed-job accounting stays in freeJob.service.ts — this module
 * only grants paid access after admin-verified payment.
 */
import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

/** Per-plan feature toggles + numeric limits. All admin-editable. */
export type PlanFeatureFlags = {
  unlimitedApplications: boolean;
  unlimitedCompletedJobs: boolean;
  publicProfile: boolean;
  customerRatings: boolean;
  customerReviews: boolean;
  portfolio: boolean;
  basicGallery: boolean;
  uploadPhotos: boolean;
  uploadVideos: boolean;
  beforeAfterGalleries: boolean;
  basicProfileBanner: boolean;
  advancedProfileBanner: boolean;
  companyName: boolean;
  businessDescription: boolean;
  businessSlogan: boolean;
  customCoverImage: boolean;
  workingHours: boolean;
  location: boolean;
  mapCoverage: boolean;
  basicAvailability: boolean;
  availabilityCalendar: boolean;
  basicAnalytics: boolean;
  basicEarnings: boolean;
  advancedEarnings: boolean;
  customerInsights: boolean;
  chat: boolean;
  pushNotifications: boolean;
  jobHistory: boolean;
  certificates: boolean;
  licences: boolean;
  insuranceDocuments: boolean;
  businessLogo: boolean;
  portfolioVisibility: boolean;
  customerContactDisplay: boolean;
  customProfileColours: boolean;
  basicOffers: boolean;
  advertisingBanner: boolean;
  promotionalBanner: boolean;
  advertisingSlides: boolean;
  promotionalAnnouncements: boolean;
  portfolioCampaigns: boolean;
  standardSearchRanking: boolean;
  featuredPlacement: boolean;
  premiumBadge: boolean;
  verifiedBusinessBadge: boolean;
  prioritySupport: boolean;
  dispatcher: boolean;
  teamManagement: boolean;
  marketingCentre: boolean;
  companyVerification: boolean;
  businessRegistration: boolean;
  taxInformation: boolean;
  homepagePromotions: boolean;
  seasonalCampaigns: boolean;
  leadAnalytics: boolean;
  advertisingAnalytics: boolean;
  branchesReady: boolean;
  standardSupport: boolean;
  referralProgramme: boolean;
  referralRewards: boolean;
  advancedReferralRewards: boolean;
};

export type PlanLimits = {
  maxPhotos: number;
  maxVideos: number;
  maxCertificates: number;
  maxGalleryItems: number;
  maxActiveOffers: number;
  maxPromotionalBanners: number;
  maxProfileBanners: number;
  /** Rotating advertising slides shown in customer UI. */
  maxAdvertisingSlides: number;
  /** Dedicated homepage hero slides (Business). Falls back to maxAdvertisingSlides when 0. */
  maxHomepageSlides: number;
  maxAnnouncements: number;
  maxCampaigns: number;
  /** Soft ranking boost (0 = fair/standard). Applied with trust/distance, not absolute priority. */
  searchPriorityWeight: number;
  featuredWeighting: number;
  recommendationWeighting: number;
};

export const DEFAULT_STARTER_FEATURES: PlanFeatureFlags = {
  unlimitedApplications: true,
  unlimitedCompletedJobs: true,
  publicProfile: true,
  customerRatings: true,
  customerReviews: true,
  portfolio: true,
  basicGallery: true,
  uploadPhotos: true,
  uploadVideos: false,
  beforeAfterGalleries: true,
  basicProfileBanner: true,
  advancedProfileBanner: false,
  companyName: true,
  businessDescription: true,
  businessSlogan: false,
  customCoverImage: false,
  workingHours: true,
  location: true,
  mapCoverage: true,
  basicAvailability: true,
  availabilityCalendar: false,
  basicAnalytics: true,
  basicEarnings: true,
  advancedEarnings: false,
  customerInsights: false,
  chat: true,
  pushNotifications: true,
  jobHistory: true,
  certificates: true,
  licences: false,
  insuranceDocuments: false,
  businessLogo: false,
  portfolioVisibility: true,
  customerContactDisplay: true,
  customProfileColours: false,
  basicOffers: true,
  advertisingBanner: true,
  promotionalBanner: true,
  advertisingSlides: false,
  promotionalAnnouncements: false,
  portfolioCampaigns: false,
  standardSearchRanking: true,
  featuredPlacement: false,
  premiumBadge: false,
  verifiedBusinessBadge: false,
  prioritySupport: false,
  dispatcher: false,
  teamManagement: false,
  marketingCentre: false,
  companyVerification: false,
  businessRegistration: false,
  taxInformation: false,
  homepagePromotions: false,
  seasonalCampaigns: false,
  leadAnalytics: false,
  advertisingAnalytics: false,
  branchesReady: false,
  standardSupport: true,
  referralProgramme: true,
  referralRewards: true,
  advancedReferralRewards: false,
};

export const DEFAULT_STARTER_LIMITS: PlanLimits = {
  maxPhotos: 20,
  maxVideos: 0,
  maxCertificates: 10,
  maxGalleryItems: 20,
  maxActiveOffers: 2,
  maxPromotionalBanners: 1,
  maxProfileBanners: 1,
  maxAdvertisingSlides: 0,
  maxHomepageSlides: 0,
  maxAnnouncements: 0,
  maxCampaigns: 0,
  searchPriorityWeight: 0,
  featuredWeighting: 0,
  recommendationWeighting: 0,
};

export const DEFAULT_PROFESSIONAL_FEATURES: PlanFeatureFlags = {
  ...DEFAULT_STARTER_FEATURES,
  uploadVideos: true,
  beforeAfterGalleries: true,
  advancedProfileBanner: true,
  businessSlogan: true,
  customCoverImage: true,
  availabilityCalendar: true,
  advancedEarnings: true,
  customerInsights: true,
  licences: true,
  insuranceDocuments: true,
  businessLogo: true,
  customProfileColours: true,
  advertisingSlides: true,
  promotionalAnnouncements: true,
  portfolioCampaigns: true,
  featuredPlacement: true,
  premiumBadge: true,
  prioritySupport: true,
  advancedReferralRewards: true,
};

export const DEFAULT_BUSINESS_FEATURES: PlanFeatureFlags = {
  ...DEFAULT_PROFESSIONAL_FEATURES,
  verifiedBusinessBadge: true,
  dispatcher: true,
  teamManagement: true,
  marketingCentre: true,
  companyVerification: true,
  businessRegistration: true,
  taxInformation: true,
  homepagePromotions: true,
  seasonalCampaigns: true,
  leadAnalytics: true,
  advertisingAnalytics: true,
  branchesReady: true,
  advancedEarnings: true,
  customerInsights: true,
};

/** Professional defaults — recommended OOB experience; admin may change any value. */
export const DEFAULT_PROFESSIONAL_LIMITS: PlanLimits = {
  maxPhotos: 9999,
  maxVideos: 20,
  maxCertificates: 50,
  maxGalleryItems: 200,
  maxActiveOffers: 5,
  maxPromotionalBanners: 3,
  maxProfileBanners: 4,
  maxAdvertisingSlides: 4,
  maxHomepageSlides: 4,
  maxAnnouncements: 10,
  maxCampaigns: 5,
  searchPriorityWeight: 18,
  featuredWeighting: 6,
  recommendationWeighting: 4,
};

/** Business defaults — company management platform; admin may change any value. */
export const DEFAULT_BUSINESS_LIMITS: PlanLimits = {
  maxPhotos: 9999,
  maxVideos: 50,
  maxCertificates: 9999,
  maxGalleryItems: 9999,
  maxActiveOffers: 10,
  maxPromotionalBanners: 6,
  maxProfileBanners: 8,
  maxAdvertisingSlides: 8,
  maxHomepageSlides: 8,
  maxAnnouncements: 30,
  maxCampaigns: 20,
  searchPriorityWeight: 28,
  featuredWeighting: 12,
  recommendationWeighting: 10,
};

const featureFlagsSchema = new Schema<PlanFeatureFlags>(
  {
    unlimitedApplications: { type: Boolean, default: true },
    unlimitedCompletedJobs: { type: Boolean, default: true },
    publicProfile: { type: Boolean, default: true },
    customerRatings: { type: Boolean, default: true },
    customerReviews: { type: Boolean, default: true },
    portfolio: { type: Boolean, default: true },
    basicGallery: { type: Boolean, default: true },
    uploadPhotos: { type: Boolean, default: true },
    uploadVideos: { type: Boolean, default: false },
    beforeAfterGalleries: { type: Boolean, default: true },
    basicProfileBanner: { type: Boolean, default: true },
    advancedProfileBanner: { type: Boolean, default: false },
    companyName: { type: Boolean, default: true },
    businessDescription: { type: Boolean, default: true },
    businessSlogan: { type: Boolean, default: false },
    customCoverImage: { type: Boolean, default: false },
    workingHours: { type: Boolean, default: true },
    location: { type: Boolean, default: true },
    mapCoverage: { type: Boolean, default: true },
    basicAvailability: { type: Boolean, default: true },
    availabilityCalendar: { type: Boolean, default: false },
    basicAnalytics: { type: Boolean, default: true },
    basicEarnings: { type: Boolean, default: true },
    advancedEarnings: { type: Boolean, default: false },
    customerInsights: { type: Boolean, default: false },
    chat: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    jobHistory: { type: Boolean, default: true },
    certificates: { type: Boolean, default: true },
    licences: { type: Boolean, default: false },
    insuranceDocuments: { type: Boolean, default: false },
    businessLogo: { type: Boolean, default: false },
    portfolioVisibility: { type: Boolean, default: true },
    customerContactDisplay: { type: Boolean, default: true },
    customProfileColours: { type: Boolean, default: false },
    basicOffers: { type: Boolean, default: true },
    advertisingBanner: { type: Boolean, default: true },
    promotionalBanner: { type: Boolean, default: true },
    advertisingSlides: { type: Boolean, default: false },
    promotionalAnnouncements: { type: Boolean, default: false },
    portfolioCampaigns: { type: Boolean, default: false },
    standardSearchRanking: { type: Boolean, default: true },
    featuredPlacement: { type: Boolean, default: false },
    premiumBadge: { type: Boolean, default: false },
    verifiedBusinessBadge: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    dispatcher: { type: Boolean, default: false },
    teamManagement: { type: Boolean, default: false },
    marketingCentre: { type: Boolean, default: false },
    companyVerification: { type: Boolean, default: false },
    businessRegistration: { type: Boolean, default: false },
    taxInformation: { type: Boolean, default: false },
    homepagePromotions: { type: Boolean, default: false },
    seasonalCampaigns: { type: Boolean, default: false },
    leadAnalytics: { type: Boolean, default: false },
    advertisingAnalytics: { type: Boolean, default: false },
    branchesReady: { type: Boolean, default: false },
    standardSupport: { type: Boolean, default: true },
    referralProgramme: { type: Boolean, default: true },
    referralRewards: { type: Boolean, default: true },
    advancedReferralRewards: { type: Boolean, default: false },
  },
  { _id: false },
);

const planLimitsSchema = new Schema<PlanLimits>(
  {
    maxPhotos: { type: Number, default: 20, min: 0 },
    maxVideos: { type: Number, default: 0, min: 0 },
    maxCertificates: { type: Number, default: 10, min: 0 },
    maxGalleryItems: { type: Number, default: 20, min: 0 },
    maxActiveOffers: { type: Number, default: 2, min: 0 },
    maxPromotionalBanners: { type: Number, default: 1, min: 0 },
    maxProfileBanners: { type: Number, default: 1, min: 0 },
    maxAdvertisingSlides: { type: Number, default: 0, min: 0 },
    maxHomepageSlides: { type: Number, default: 0, min: 0 },
    maxAnnouncements: { type: Number, default: 0, min: 0 },
    maxCampaigns: { type: Number, default: 0, min: 0 },
    searchPriorityWeight: { type: Number, default: 0, min: 0, max: 100 },
    featuredWeighting: { type: Number, default: 0, min: 0, max: 100 },
    recommendationWeighting: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

export type PlanBadgeConfig = {
  enabled: boolean;
  name: string;
  text: string;
  icon: string;
  color: string;
  borderColor: string;
  glow: boolean;
  animation: boolean;
  size: 'sm' | 'md' | 'lg';
  visibleOnProfile: boolean;
  visibleOnSearch: boolean;
  visibleOnChat: boolean;
  visibleOnAdmin: boolean;
};

export const DEFAULT_PLAN_BADGES: Record<'STARTER' | 'PROFESSIONAL' | 'BUSINESS', PlanBadgeConfig> = {
  STARTER: {
    enabled: true,
    name: 'Starter',
    text: 'Starter',
    icon: 'verified',
    color: '#16A34A',
    borderColor: '#15803D',
    glow: false,
    animation: false,
    size: 'sm',
    visibleOnProfile: true,
    visibleOnSearch: true,
    visibleOnChat: true,
    visibleOnAdmin: true,
  },
  PROFESSIONAL: {
    enabled: true,
    name: 'Professional',
    text: 'Professional',
    icon: 'workspace_premium',
    color: '#2563EB',
    borderColor: '#1D4ED8',
    glow: false,
    animation: false,
    size: 'sm',
    visibleOnProfile: true,
    visibleOnSearch: true,
    visibleOnChat: true,
    visibleOnAdmin: true,
  },
  BUSINESS: {
    enabled: true,
    name: 'Business',
    text: 'Business',
    icon: 'apartment',
    color: '#D97706',
    borderColor: '#B45309',
    glow: true,
    animation: false,
    size: 'md',
    visibleOnProfile: true,
    visibleOnSearch: true,
    visibleOnChat: true,
    visibleOnAdmin: true,
  },
};

export interface ISubscriptionPlanDoc extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description: string;
  audience: 'technician' | 'customer' | 'partner';
  sortOrder: number;
  currency: string;
  priceMonthly: number;
  priceQuarterly: number;
  priceHalfYear: number;
  priceYearly: number;
  price: number;
  billingPeriod: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';
  gracePeriodDays: number;
  autoRenew: boolean;
  features: string[];
  featureFlags: PlanFeatureFlags;
  limits: PlanLimits;
  freeJobLimitBonus: number;
  leadCreditsIncluded: number;
  isActive: boolean;
  isDefault: boolean;
  isVisible: boolean;
  /** Admin-configurable subscription badge shown across customer + technician surfaces. */
  badge: PlanBadgeConfig;
};

const planBadgeSchema = new Schema<PlanBadgeConfig>(
  {
    enabled: { type: Boolean, default: true },
    name: { type: String, maxlength: 40, default: '' },
    text: { type: String, maxlength: 40, default: '' },
    icon: { type: String, maxlength: 40, default: 'verified' },
    color: { type: String, maxlength: 32, default: '#16A34A' },
    borderColor: { type: String, maxlength: 32, default: '#15803D' },
    glow: { type: Boolean, default: false },
    animation: { type: Boolean, default: false },
    size: { type: String, enum: ['sm', 'md', 'lg'], default: 'sm' },
    visibleOnProfile: { type: Boolean, default: true },
    visibleOnSearch: { type: Boolean, default: true },
    visibleOnChat: { type: Boolean, default: true },
    visibleOnAdmin: { type: Boolean, default: true },
  },
  { _id: false },
);

const subscriptionPlanSchema = createSchema<ISubscriptionPlanDoc>({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 4000 },
  audience: { type: String, enum: ['technician', 'customer', 'partner'], default: 'technician', index: true },
  sortOrder: { type: Number, default: 0, index: true },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  priceMonthly: { type: Number, default: 0, min: 0 },
  priceQuarterly: { type: Number, default: 0, min: 0 },
  priceHalfYear: { type: Number, default: 0, min: 0 },
  priceYearly: { type: Number, default: 0, min: 0 },
  price: { type: Number, default: 0, min: 0 },
  billingPeriod: {
    type: String,
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'],
    default: 'monthly',
  },
  gracePeriodDays: { type: Number, default: 0, min: 0, max: 90 },
  autoRenew: { type: Boolean, default: false },
  features: { type: [String], default: [] },
  featureFlags: { type: featureFlagsSchema, default: () => ({ ...DEFAULT_STARTER_FEATURES }) },
  limits: { type: planLimitsSchema, default: () => ({ ...DEFAULT_STARTER_LIMITS }) },
  freeJobLimitBonus: { type: Number, default: 0, min: 0 },
  leadCreditsIncluded: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true, index: true },
  isDefault: { type: Boolean, default: false, index: true },
  isVisible: { type: Boolean, default: true, index: true },
  badge: { type: planBadgeSchema, default: () => ({ ...DEFAULT_PLAN_BADGES.STARTER }) },
});

export const SubscriptionPlan = model<ISubscriptionPlanDoc>('SubscriptionPlan', subscriptionPlanSchema);

export interface ISubscriptionDoc extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planCode: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'pending_payment';
  billingPeriod: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  amountPaid: number;
  currency: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  /** Scheduled plan after current paid period (downgrade). */
  scheduledPlanCode?: string | null;
  scheduledChangeType?: 'downgrade' | 'cancel' | null;
  scheduledChangeAt?: Date | null;
  scheduledAt?: Date | null;
  activatedAt?: Date;
  activatedBy?: Types.ObjectId;
  cancelledAt?: Date;
  lastPaymentId?: Types.ObjectId;
  complimentary: boolean;
  notes?: string;
}

const subscriptionSchema = createSchema<ISubscriptionDoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  planCode: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired', 'pending_payment'],
    default: 'pending_payment',
    index: true,
  },
  billingPeriod: {
    type: String,
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'],
    default: 'monthly',
  },
  amountPaid: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'UGX' },
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: { type: Boolean, default: false },
  scheduledPlanCode: { type: String, maxlength: 64, default: null },
  scheduledChangeType: {
    type: String,
    enum: ['downgrade', 'cancel'],
    default: undefined,
  },
  scheduledChangeAt: { type: Date, default: null },
  scheduledAt: { type: Date, default: null },
  activatedAt: Date,
  activatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  lastPaymentId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPayment' },
  complimentary: { type: Boolean, default: false },
  notes: { type: String, maxlength: 2000 },
});

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1, status: 1 });

export const Subscription = model<ISubscriptionDoc>('Subscription', subscriptionSchema);

export interface ISubscriptionPayment extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planCode: string;
  subscriptionId?: Types.ObjectId;
  billingPeriod: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  amount: number;
  currency: string;
  network: 'mtn' | 'airtel';
  payerMsisdn: string;
  transactionId: string;
  screenshotUrl?: string;
  paymentReference: string;
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  /** How the payment was verified — momo_manual (default) or development_transaction. */
  verificationSource?: 'momo_manual' | 'development_transaction';
}

const subscriptionPaymentSchema = createSchema<ISubscriptionPayment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  planCode: { type: String, required: true, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
  billingPeriod: {
    type: String,
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'],
    default: 'monthly',
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'UGX' },
  network: { type: String, enum: ['mtn', 'airtel'], required: true },
  payerMsisdn: { type: String, required: true, maxlength: 20 },
  transactionId: { type: String, required: true, maxlength: 120, index: true },
  screenshotUrl: { type: String, maxlength: 1024 },
  paymentReference: { type: String, required: true, maxlength: 80, index: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'refunded'],
    default: 'pending',
    index: true,
  },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 1000 },
  verificationSource: {
    type: String,
    enum: ['momo_manual', 'development_transaction'],
    default: 'momo_manual',
    index: true,
  },
});

subscriptionPaymentSchema.index({ userId: 1, status: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ transactionId: 1, network: 1 }, { unique: true });

export const SubscriptionPayment = model<ISubscriptionPayment>(
  'SubscriptionPayment',
  subscriptionPaymentSchema,
);
