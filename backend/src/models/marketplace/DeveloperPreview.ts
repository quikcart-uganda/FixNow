/**
 * Developer Preview Session — temporary entitlement source (Phase 3).
 * NEVER creates Subscription / Payment / Invoice records.
 */

import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const PREVIEW_PLAN_CODES = [
  'STARTER',
  'PROFESSIONAL',
  'BUSINESS',
  'BUSINESS_BOOST',
] as const;
export type PreviewPlanCode = (typeof PREVIEW_PLAN_CODES)[number];

export const PREVIEW_SESSION_STATUS = ['active', 'ended', 'expired', 'terminated'] as const;
export type PreviewSessionStatus = (typeof PREVIEW_SESSION_STATUS)[number];

export interface IDeveloperPreviewSession extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  /** Entitlement plan to simulate (BUSINESS_BOOST → BUSINESS + boost flags). */
  planCode: PreviewPlanCode;
  /** Content environment — always sandbox for preview. */
  environment: 'sandbox' | 'development' | 'demo';
  activatedAt: Date;
  expiresAt: Date;
  endedAt?: Date | null;
  status: PreviewSessionStatus;
  activeBoosts: boolean;
  activatedByAdminId?: Types.ObjectId;
  endedByAdminId?: Types.ObjectId;
  endReason?: string;
  aiContext?: {
    subscriptionSource: 'developer_preview';
    simulationOnly: true;
    planCode: string;
  };
  metadata?: Record<string, unknown>;
}

const developerPreviewSessionSchema = createSchema<IDeveloperPreviewSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200, index: true },
  planCode: { type: String, enum: PREVIEW_PLAN_CODES, required: true, index: true },
  environment: {
    type: String,
    enum: ['sandbox', 'development', 'demo'],
    default: 'sandbox',
    index: true,
  },
  activatedAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  endedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: PREVIEW_SESSION_STATUS,
    default: 'active',
    index: true,
  },
  activeBoosts: { type: Boolean, default: false, index: true },
  activatedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  endedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  endReason: { type: String, maxlength: 240 },
  aiContext: { type: Schema.Types.Mixed },
  metadata: { type: Schema.Types.Mixed },
});

developerPreviewSessionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
developerPreviewSessionSchema.index({ status: 1, activatedAt: -1 });

export const DeveloperPreviewSession = model<IDeveloperPreviewSession>(
  'DeveloperPreviewSession',
  developerPreviewSessionSchema,
);
