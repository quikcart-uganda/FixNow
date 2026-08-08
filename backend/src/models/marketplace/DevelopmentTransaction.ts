/**
 * Development Transaction IDs — sandbox verification source for the Permanent
 * Development Technician. Feeds the same SubscriptionPayment → activateSubscription
 * path; never a second catalogue or entitlement engine.
 */

import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const DEV_TX_PLAN_PREFIXES = {
  STARTER: 'DEV-STARTER',
  PROFESSIONAL: 'DEV-PRO',
  BUSINESS: 'DEV-BUSINESS',
} as const;

export type DevTxPlanCode = keyof typeof DEV_TX_PLAN_PREFIXES;

export const DEV_TX_STATUSES = ['available', 'claimed', 'consumed', 'revoked', 'expired'] as const;
export type DevTxStatus = (typeof DEV_TX_STATUSES)[number];

export type DevTxUsageAction = 'issued' | 'claimed' | 'consumed' | 'revoked' | 'expired';

export interface IDevelopmentTransactionUsage {
  at: Date;
  action: DevTxUsageAction;
  actorId?: string;
  note?: string;
  paymentId?: string;
  subscriptionId?: string;
}

export interface IDevelopmentTransaction extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  planCode: DevTxPlanCode;
  status: DevTxStatus;
  createdBy: string;
  expiresAt: Date;
  claimedAt?: Date | null;
  claimedByUserId?: Types.ObjectId | null;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  paymentId?: Types.ObjectId | null;
  subscriptionId?: Types.ObjectId | null;
  usageHistory: IDevelopmentTransactionUsage[];
  dataEnvironment: 'sandbox';
  seedTag: string;
}

const usageSchema = new Schema(
  {
    at: { type: Date, required: true },
    action: {
      type: String,
      enum: ['issued', 'claimed', 'consumed', 'revoked', 'expired'],
      required: true,
    },
    actorId: String,
    note: { type: String, maxlength: 500 },
    paymentId: String,
    subscriptionId: String,
  },
  { _id: false },
);

const developmentTransactionSchema = createSchema<IDevelopmentTransaction>({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 40, index: true },
  planCode: {
    type: String,
    enum: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: DEV_TX_STATUSES,
    default: 'available',
    index: true,
  },
  createdBy: { type: String, required: true, maxlength: 120 },
  expiresAt: { type: Date, required: true, index: true },
  claimedAt: { type: Date, default: null },
  claimedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  consumedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: String, default: null },
  revokeReason: { type: String, maxlength: 500, default: null },
  paymentId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPayment', default: null },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
  usageHistory: { type: [usageSchema], default: [] },
  dataEnvironment: { type: String, enum: ['sandbox'], default: 'sandbox', index: true },
  seedTag: { type: String, required: true, index: true },
});

developmentTransactionSchema.index({ planCode: 1, status: 1, expiresAt: 1 });

export const DevelopmentTransaction = model<IDevelopmentTransaction>(
  'DevelopmentTransaction',
  developmentTransactionSchema,
);
