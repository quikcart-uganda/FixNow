/**
 * Technician-owned marketing creatives (slides, banners, announcements, campaigns).
 * Never auto-publish — admin must approve before customer delivery.
 */
import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const MARKETING_CREATIVE_KINDS = [
  'slide',
  'banner',
  'announcement',
  'portfolio_campaign',
] as const;
export type MarketingCreativeKind = (typeof MARKETING_CREATIVE_KINDS)[number];

export const MARKETING_CREATIVE_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'expired',
  'changes_requested',
] as const;
export type MarketingCreativeStatus = (typeof MARKETING_CREATIVE_STATUSES)[number];

export interface ITechnicianMarketingCreative extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  kind: MarketingCreativeKind;
  title: string;
  headline?: string;
  description?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  promotionText?: string;
  sortOrder: number;
  startsAt?: Date;
  endsAt?: Date;
  status: MarketingCreativeStatus;
  rejectionReason?: string;
  adminNote?: string;
  reviewedByAdminId?: Types.ObjectId;
  reviewedAt?: Date;
  submittedAt?: Date;
  publishedAt?: Date;
  analytics: { views: number; clicks: number };
}

const creativeSchema = createSchema<ITechnicianMarketingCreative>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: MARKETING_CREATIVE_KINDS, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  headline: { type: String, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000 },
  imageUrl: { type: String, maxlength: 1024 },
  ctaLabel: { type: String, maxlength: 60 },
  ctaHref: { type: String, maxlength: 500 },
  promotionText: { type: String, maxlength: 240 },
  sortOrder: { type: Number, default: 0, min: 0 },
  startsAt: { type: Date, index: true },
  endsAt: { type: Date, index: true },
  status: {
    type: String,
    enum: MARKETING_CREATIVE_STATUSES,
    default: 'draft',
    index: true,
  },
  rejectionReason: { type: String, maxlength: 500 },
  adminNote: { type: String, maxlength: 1000 },
  reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  submittedAt: Date,
  publishedAt: Date,
  analytics: {
    views: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },
});

creativeSchema.index({ technicianUserId: 1, kind: 1, status: 1 });
creativeSchema.index({ status: 1, kind: 1, sortOrder: 1 });
creativeSchema.index({ status: 1, startsAt: 1, endsAt: 1 });

export const TechnicianMarketingCreative = model<ITechnicianMarketingCreative>(
  'TechnicianMarketingCreative',
  creativeSchema,
);
