import { model, type Types } from 'mongoose';
import {
  createSchema,
  ugandaLocationSchema,
  type SoftDeleteFields,
  type TimestampFields,
  type UgandaLocation,
} from '../shared/base.js';
import {
  ACCOUNT_STATUS,
  EXPERIENCE_LEVEL,
  TECHNICIAN_RANK,
  VERIFICATION_STATUS,
  type AccountStatus,
  type VerificationStatus,
} from '../shared/enums.js';
import { DAY_OF_WEEK } from '../shared/enums.js';

export interface ITechnicianProfile extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  headline?: string;
  bio?: string;
  photoUrl?: string;
  /** Selected avatar library id (kept when a real photo is uploaded). */
  avatarId?: string;
  /** Last uploaded real photo URL (kept when switching back to an avatar). */
  uploadedPhotoUrl?: string;
  coverUrl?: string;
  primaryCategoryId?: Types.ObjectId;
  subcategoryIds: Types.ObjectId[];
  skills: string[];
  languages: string[];
  experienceYears: number;
  experienceLevel: string;
  currentRank: string;
  location?: UgandaLocation;
  /** Denormalized trust for search sort — source of truth is TrustScore collection */
  trustScore: number;
  reliabilityScore: number;
  completionScore: number;
  responseScore: number;
  punctualityScore: number;
  ratingAverage: number;
  reviewCount: number;
  jobsCompleted: number;
  jobsCancelled: number;
  /** Customer-confirmed completions that consumed a free-plan slot (= completedJobsUnderFreePlan). */
  freeJobsUsed: number;
  /** Alias for freeJobsUsed — customer-confirmed free-plan completions. */
  completedJobsUnderFreePlan: number;
  freeJobLimit: number;
  remainingFreeJobs: number;
  /** Promotional / bonus free completed jobs granted by admin (added to effective remaining). */
  promotionalFreeJobs: number;
  lastCompletedJobAt?: Date;
  lastCompletedJobId?: Types.ObjectId;
  accountStatus: AccountStatus;
  accountLocked: boolean;
  lockReason?: string;
  /** Set when technician requests unlock while locked. */
  unlockRequestedAt?: Date;
  unlockRequestNote?: string;
  verificationStatus: VerificationStatus;
  identityVerified: boolean;
  skillVerified: boolean;
  badgeIds: Types.ObjectId[];
  isAvailableNow: boolean;
  responseTimeMinutesAvg?: number;
  /** Free quota + subscription entitlements (enforcement via entitlements.service). */
  subscriptionPlanCode?: string;
  subscriptionStatus:
    | 'none'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'cancelled'
    | 'expired'
    | 'required'
    | 'pending_payment';
  subscriptionPeriodEnd?: Date;
  subscriptionBillingPeriod?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  trialFinished: boolean;
  monetizationSuspended: boolean;
  /** Professional branding (gated by plan featureFlags). */
  companyName?: string;
  businessLogoUrl?: string;
  businessSlogan?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  /** Business company profile */
  companyMission?: string;
  companyVision?: string;
  businessRegistrationNumber?: string;
  taxIdentificationNumber?: string;
  businessVerificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  businessVerificationNote?: string;
  leadCredits: number;
  academyProgressPercent: number;
  searchKeywords: string[];
  /** Account-level approval workflow (distinct from document IdentityVerification). */
  approvalSubmittedAt?: Date;
  approvalDeadlineAt?: Date;
  approvalMode?: 'automatic' | 'manual';
  approvalPolicyVersion?: number;
  approvalSource?: 'manual' | 'automatic' | 'escalated' | 'seed' | 'grandfather' | 'admin';
  approvalReviewedAt?: Date;
  approvalReviewedBy?: Types.ObjectId;
  approvalAdminNote?: string;
  approvalRemindersSent?: string[];
}

const technicianProfileSchema = createSchema<ITechnicianProfile>({
  userId: { type: 'ObjectId', ref: 'User', required: true, unique: true, index: true },
  headline: { type: String, maxlength: 160 },
  bio: { type: String, maxlength: 2000 },
  photoUrl: { type: String, maxlength: 1024 },
  avatarId: { type: String, maxlength: 64, index: true },
  uploadedPhotoUrl: { type: String, maxlength: 1024 },
  coverUrl: { type: String, maxlength: 1024 },
  primaryCategoryId: { type: 'ObjectId', ref: 'Category', index: true },
  subcategoryIds: [{ type: 'ObjectId', ref: 'Subcategory', index: true }],
  skills: { type: [String], default: [] },
  languages: { type: [String], default: ['en'] },
  experienceYears: { type: Number, default: 0, min: 0, max: 60 },
  experienceLevel: {
    type: String,
    enum: Object.values(EXPERIENCE_LEVEL),
    default: EXPERIENCE_LEVEL.BEGINNER,
    index: true,
  },
  currentRank: {
    type: String,
    enum: Object.values(TECHNICIAN_RANK),
    default: TECHNICIAN_RANK.BRONZE,
    index: true,
  },
  location: { type: ugandaLocationSchema },
  trustScore: { type: Number, default: 0, min: 0, max: 100, index: true },
  reliabilityScore: { type: Number, default: 0, min: 0, max: 100 },
  completionScore: { type: Number, default: 0, min: 0, max: 100 },
  responseScore: { type: Number, default: 0, min: 0, max: 100 },
  punctualityScore: { type: Number, default: 0, min: 0, max: 100 },
  ratingAverage: { type: Number, default: 0, min: 0, max: 5, index: true },
  reviewCount: { type: Number, default: 0, min: 0 },
  jobsCompleted: { type: Number, default: 0, min: 0 },
  jobsCancelled: { type: Number, default: 0, min: 0 },
  freeJobsUsed: { type: Number, default: 0, min: 0 },
  completedJobsUnderFreePlan: { type: Number, default: 0, min: 0 },
  freeJobLimit: { type: Number, default: 20, min: 0 },
  remainingFreeJobs: { type: Number, default: 20, min: 0 },
  promotionalFreeJobs: { type: Number, default: 0, min: 0 },
  lastCompletedJobAt: { type: Date, index: true },
  lastCompletedJobId: { type: 'ObjectId', ref: 'Job' },
  accountStatus: {
    type: String,
    enum: Object.values(ACCOUNT_STATUS),
    default: ACCOUNT_STATUS.ACTIVE,
    index: true,
  },
  accountLocked: { type: Boolean, default: false, index: true },
  lockReason: { type: String, maxlength: 500 },
  unlockRequestedAt: { type: Date, index: true },
  unlockRequestNote: { type: String, maxlength: 1000 },
  verificationStatus: {
    type: String,
    enum: Object.values(VERIFICATION_STATUS),
    default: VERIFICATION_STATUS.UNVERIFIED,
    index: true,
  },
  identityVerified: { type: Boolean, default: false, index: true },
  skillVerified: { type: Boolean, default: false },
  badgeIds: [{ type: 'ObjectId', ref: 'Badge' }],
  isAvailableNow: { type: Boolean, default: false, index: true },
  responseTimeMinutesAvg: { type: Number, min: 0 },
  subscriptionPlanCode: { type: String, maxlength: 64, index: true },
  subscriptionStatus: {
    type: String,
    enum: [
      'none',
      'trialing',
      'active',
      'past_due',
      'cancelled',
      'expired',
      'required',
      'pending_payment',
    ],
    default: 'none',
    index: true,
  },
  subscriptionPeriodEnd: { type: Date, index: true },
  subscriptionBillingPeriod: {
    type: String,
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'],
  },
  trialFinished: { type: Boolean, default: false, index: true },
  monetizationSuspended: { type: Boolean, default: false, index: true },
  companyName: { type: String, maxlength: 120 },
  businessLogoUrl: { type: String, maxlength: 1024 },
  businessSlogan: { type: String, maxlength: 160 },
  brandPrimaryColor: { type: String, maxlength: 32 },
  brandSecondaryColor: { type: String, maxlength: 32 },
  companyMission: { type: String, maxlength: 2000 },
  companyVision: { type: String, maxlength: 2000 },
  businessRegistrationNumber: { type: String, maxlength: 80 },
  taxIdentificationNumber: { type: String, maxlength: 80 },
  businessVerificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified',
    index: true,
  },
  businessVerificationNote: { type: String, maxlength: 500 },
  leadCredits: { type: Number, default: 0, min: 0 },
  academyProgressPercent: { type: Number, default: 0, min: 0, max: 100 },
  searchKeywords: { type: [String], default: [] },
  approvalSubmittedAt: { type: Date, index: true },
  approvalDeadlineAt: { type: Date, index: true },
  approvalMode: { type: String, enum: ['automatic', 'manual'], index: true },
  approvalPolicyVersion: { type: Number, min: 1 },
  approvalSource: {
    type: String,
    enum: ['manual', 'automatic', 'escalated', 'seed', 'grandfather', 'admin'],
  },
  approvalReviewedAt: { type: Date },
  approvalReviewedBy: { type: 'ObjectId', ref: 'User' },
  approvalAdminNote: { type: String, maxlength: 2000 },
  approvalRemindersSent: { type: [String], default: [] },
});

technicianProfileSchema.index({ verificationStatus: 1, approvalDeadlineAt: 1 });
technicianProfileSchema.index({ verificationStatus: 1, accountStatus: 1 });
technicianProfileSchema.index({ trustScore: -1, ratingAverage: -1 });
technicianProfileSchema.index({ 'location.district': 1, isAvailableNow: 1 });
technicianProfileSchema.index({ 'location.geo': '2dsphere' });
technicianProfileSchema.index({ skills: 1 });
technicianProfileSchema.index({
  headline: 'text',
  bio: 'text',
  skills: 'text',
  searchKeywords: 'text',
});

export const TechnicianProfile = model<ITechnicianProfile>('TechnicianProfile', technicianProfileSchema);

export interface ITechnicianService extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  title: string;
  description?: string;
  basePrice?: number;
  currency: string;
  isActive: boolean;
}

const technicianServiceSchema = createSchema<ITechnicianService>({
  technicianProfileId: { type: 'ObjectId', ref: 'TechnicianProfile', required: true, index: true },
  technicianUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  categoryId: { type: 'ObjectId', ref: 'Category', required: true, index: true },
  subcategoryId: { type: 'ObjectId', ref: 'Subcategory', index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, maxlength: 2000 },
  basePrice: { type: Number, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  isActive: { type: Boolean, default: true, index: true },
});

technicianServiceSchema.index({ technicianUserId: 1, categoryId: 1 });

export const TechnicianService = model<ITechnicianService>('TechnicianService', technicianServiceSchema);

export interface ICoverageArea extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  district: string;
  city?: string;
  division?: string;
  subcounty?: string;
  parish?: string;
  village?: string;
  radiusKm?: number;
  center?: { type: 'Point'; coordinates: [number, number] };
  isPrimary: boolean;
}

const coverageAreaSchema = createSchema<ICoverageArea>({
  technicianProfileId: { type: 'ObjectId', ref: 'TechnicianProfile', required: true, index: true },
  technicianUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  district: { type: String, required: true, trim: true, index: true },
  city: { type: String, trim: true },
  division: { type: String, trim: true },
  subcounty: { type: String, trim: true },
  parish: { type: String, trim: true },
  village: { type: String, trim: true },
  radiusKm: { type: Number, min: 0, max: 200 },
  center: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] },
  },
  isPrimary: { type: Boolean, default: false },
});

coverageAreaSchema.index({ technicianUserId: 1, district: 1 });
coverageAreaSchema.index({ center: '2dsphere' });

export const CoverageArea = model<ICoverageArea>('CoverageArea', coverageAreaSchema);

export interface IWorkingHours extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  dayOfWeek: string;
  openTime: string; // HH:mm
  closeTime: string;
  isClosed: boolean;
  timezone: string;
}

const workingHoursSchema = createSchema<IWorkingHours>({
  technicianProfileId: { type: 'ObjectId', ref: 'TechnicianProfile', required: true, index: true },
  technicianUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  dayOfWeek: { type: String, enum: Object.values(DAY_OF_WEEK), required: true },
  openTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  closeTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  isClosed: { type: Boolean, default: false },
  timezone: { type: String, default: 'Africa/Kampala' },
});

workingHoursSchema.index({ technicianUserId: 1, dayOfWeek: 1 }, { unique: true });

export const WorkingHours = model<IWorkingHours>('WorkingHours', workingHoursSchema);

export interface ITechnicianAvailability extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  status: 'available' | 'busy' | 'offline' | 'on_job';
  availableFrom?: Date;
  availableUntil?: Date;
  notes?: string;
  lastStatusChangeAt: Date;
}

const technicianAvailabilitySchema = createSchema<ITechnicianAvailability>({
  technicianProfileId: { type: 'ObjectId', ref: 'TechnicianProfile', required: true, unique: true },
  technicianUserId: { type: 'ObjectId', ref: 'User', required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['available', 'busy', 'offline', 'on_job'],
    default: 'offline',
    index: true,
  },
  availableFrom: Date,
  availableUntil: Date,
  notes: { type: String, maxlength: 300 },
  lastStatusChangeAt: { type: Date, default: Date.now },
});

technicianAvailabilitySchema.index({ status: 1, lastStatusChangeAt: -1 });

export const TechnicianAvailability = model<ITechnicianAvailability>(
  'TechnicianAvailability',
  technicianAvailabilitySchema,
);
