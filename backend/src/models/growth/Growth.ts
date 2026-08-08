import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const REFERRAL_STATUSES = ['pending', 'accepted', 'completed', 'expired', 'fraud_hold', 'revoked'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_TRIGGERS = [
  'registration',
  'verification',
  'first_paid_job',
  'first_five_jobs',
  'first_booking',
  'first_payment',
] as const;
export type ReferralTrigger = (typeof REFERRAL_TRIGGERS)[number];

export const REFERRAL_REWARD_TYPES = [
  'points',
  'credit',
  'coupon',
  'lead_credit',
  'free_job_credit',
  'premium_days',
  'featured_badge',
  'priority_visibility',
  'cash_wallet',
] as const;
export type ReferralRewardType = (typeof REFERRAL_REWARD_TYPES)[number];

export interface IReferralCampaign extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  inviteRole: 'technician' | 'customer' | 'both';
  trigger: ReferralTrigger;
  rewardType: ReferralRewardType;
  rewardAmount: number;
  currency?: string;
  maxRewards?: number;
  rewardsIssued: number;
  startsAt: Date;
  endsAt: Date;
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived';
  createdByAdminId: Types.ObjectId;
}

const referralCampaignSchema = createSchema<IReferralCampaign>({
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 2000 },
  inviteRole: { type: String, enum: ['technician', 'customer', 'both'], default: 'both', index: true },
  trigger: { type: String, enum: REFERRAL_TRIGGERS, required: true, index: true },
  rewardType: { type: String, enum: REFERRAL_REWARD_TYPES, required: true },
  rewardAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, maxlength: 3, default: 'UGX' },
  maxRewards: { type: Number, min: 0 },
  rewardsIssued: { type: Number, default: 0, min: 0 },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'expired', 'archived'],
    default: 'draft',
    index: true,
  },
  createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
});

referralCampaignSchema.index({ status: 1, trigger: 1, startsAt: 1, endsAt: 1 });

export const ReferralCampaign = model<IReferralCampaign>('ReferralCampaign', referralCampaignSchema);

export interface IReferral extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  referrerId: Types.ObjectId;
  referredUserId?: Types.ObjectId;
  campaignId?: Types.ObjectId;
  code: string;
  status: ReferralStatus;
  channel?: string;
  inviteRole?: 'technician' | 'customer';
  deviceFingerprint?: string;
  phoneHash?: string;
  emailHash?: string;
  completedAt?: Date;
  expiresAt?: Date;
  fraudFlags: string[];
  milestonesCompleted: string[];
}

const referralSchema = createSchema<IReferral>({
  referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referredUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  campaignId: { type: Schema.Types.ObjectId, ref: 'ReferralCampaign', index: true },
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 32 },
  status: {
    type: String,
    enum: REFERRAL_STATUSES,
    default: 'pending',
    index: true,
  },
  channel: { type: String, maxlength: 40 },
  inviteRole: { type: String, enum: ['technician', 'customer'] },
  deviceFingerprint: { type: String, maxlength: 128, index: true },
  phoneHash: { type: String, maxlength: 128, index: true },
  emailHash: { type: String, maxlength: 128, index: true },
  completedAt: Date,
  expiresAt: Date,
  fraudFlags: [{ type: String, maxlength: 60 }],
  milestonesCompleted: [{ type: String, maxlength: 40 }],
});

referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ referredUserId: 1 }, { sparse: true });

export const Referral = model<IReferral>('Referral', referralSchema);

export interface IReferralReward extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  referralId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  userId: Types.ObjectId;
  rewardType: ReferralRewardType;
  amount: number;
  currency?: string;
  status: 'pending' | 'granted' | 'revoked';
  grantedAt?: Date;
  note?: string;
  adjustedByAdminId?: Types.ObjectId;
}

const referralRewardSchema = createSchema<IReferralReward>({
  referralId: { type: Schema.Types.ObjectId, ref: 'Referral', required: true, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'ReferralCampaign', index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rewardType: {
    type: String,
    enum: REFERRAL_REWARD_TYPES,
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, maxlength: 3 },
  status: {
    type: String,
    enum: ['pending', 'granted', 'revoked'],
    default: 'pending',
    index: true,
  },
  grantedAt: Date,
  note: { type: String, maxlength: 500 },
  adjustedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
});

export const ReferralReward = model<IReferralReward>('ReferralReward', referralRewardSchema);

export interface IReferralEvent extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  referralId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  type: string;
  meta?: Record<string, unknown>;
}

const referralEventSchema = createSchema<IReferralEvent>({
  referralId: { type: Schema.Types.ObjectId, ref: 'Referral', required: true, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'ReferralCampaign', index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true, maxlength: 60, index: true },
  meta: { type: Schema.Types.Mixed },
});

referralEventSchema.index({ referralId: 1, createdAt: -1 });

export const ReferralEvent = model<IReferralEvent>('ReferralEvent', referralEventSchema);

export interface IPromotion extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  type: 'percent' | 'fixed' | 'free_job' | 'lead_credit' | 'loyalty_boost';
  value: number;
  currency?: string;
  startsAt: Date;
  endsAt: Date;
  maxRedemptions?: number;
  redemptionCount: number;
  audience: 'all' | 'customer' | 'technician';
  isActive: boolean;
  rules?: Record<string, unknown>;
}

const promotionSchema = createSchema<IPromotion>({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 1000 },
  type: {
    type: String,
    enum: ['percent', 'fixed', 'free_job', 'lead_credit', 'loyalty_boost'],
    required: true,
  },
  value: { type: Number, required: true, min: 0 },
  currency: { type: String, maxlength: 3 },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  maxRedemptions: { type: Number, min: 0 },
  redemptionCount: { type: Number, default: 0, min: 0 },
  audience: { type: String, enum: ['all', 'customer', 'technician'], default: 'all' },
  isActive: { type: Boolean, default: true, index: true },
  rules: { type: Schema.Types.Mixed },
});

promotionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

export const Promotion = model<IPromotion>('Promotion', promotionSchema);
