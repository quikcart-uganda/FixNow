/**
 * Future-ready collections — schemas exist so product can ship without migrations later.
 * SubscriptionPlan / Subscription / SubscriptionPayment live in marketplace/Subscription.ts.
 */
import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface ILeadPurchase extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  jobId: Types.ObjectId;
  creditsSpent: number;
  amountPaid: number;
  currency: string;
  status: 'pending' | 'completed' | 'refunded';
}

const leadPurchaseSchema = createSchema<ILeadPurchase>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  creditsSpent: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'UGX' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'refunded'],
    default: 'pending',
    index: true,
  },
});

leadPurchaseSchema.index({ technicianUserId: 1, jobId: 1 }, { unique: true });

export const LeadPurchase = model<ILeadPurchase>('LeadPurchase', leadPurchaseSchema);

export interface IMarketplaceListing extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  sellerType: 'technician' | 'hardware_partner' | 'platform';
  title: string;
  description: string;
  price: number;
  currency: string;
  categoryId?: Types.ObjectId;
  sku?: string;
  stock?: number;
  status: 'draft' | 'active' | 'paused' | 'sold_out' | 'archived';
  mediaUrls: string[];
  tags: string[];
}

const marketplaceListingSchema = createSchema<IMarketplaceListing>({
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sellerType: {
    type: String,
    enum: ['technician', 'hardware_partner', 'platform'],
    default: 'technician',
  },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 10000 },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'UGX' },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  sku: { type: String, maxlength: 64, sparse: true, unique: true },
  stock: { type: Number, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'sold_out', 'archived'],
    default: 'draft',
    index: true,
  },
  mediaUrls: { type: [String], default: [] },
  tags: { type: [String], default: [] },
});

marketplaceListingSchema.index({ status: 1, categoryId: 1 });
marketplaceListingSchema.index({ title: 'text', description: 'text', tags: 'text' });

export const MarketplaceListing = model<IMarketplaceListing>('MarketplaceListing', marketplaceListingSchema);

export interface IHardwarePartner extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  tin?: string;
  districts: string[];
  contactPhone: string;
  status: 'pending' | 'approved' | 'suspended';
}

const hardwarePartnerSchema = createSchema<IHardwarePartner>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true, maxlength: 160 },
  tin: { type: String, maxlength: 40 },
  districts: { type: [String], default: [] },
  contactPhone: { type: String, required: true, maxlength: 20 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'suspended'],
    default: 'pending',
    index: true,
  },
});

export const HardwarePartner = model<IHardwarePartner>('HardwarePartner', hardwarePartnerSchema);

export interface IAcademyCourse extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  title: string;
  description: string;
  categoryId?: Types.ObjectId;
  durationHours: number;
  isPublished: boolean;
}

const academyCourseSchema = createSchema<IAcademyCourse>({
  code: { type: String, required: true, unique: true, uppercase: true },
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 4000 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
  durationHours: { type: Number, default: 1, min: 0 },
  isPublished: { type: Boolean, default: false, index: true },
});

export const AcademyCourse = model<IAcademyCourse>('AcademyCourse', academyCourseSchema);

export interface IServiceContract extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId?: Types.ObjectId;
  title: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  visitsIncluded: number;
  visitsUsed: number;
  startsAt?: Date;
  endsAt?: Date;
}

const serviceContractSchema = createSchema<IServiceContract>({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, maxlength: 160 },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'ended'],
    default: 'draft',
    index: true,
  },
  visitsIncluded: { type: Number, default: 0, min: 0 },
  visitsUsed: { type: Number, default: 0, min: 0 },
  startsAt: Date,
  endsAt: Date,
});

export const ServiceContract = model<IServiceContract>('ServiceContract', serviceContractSchema);

export interface ICoupon extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  promotionId?: Types.ObjectId;
  userId?: Types.ObjectId;
  status: 'active' | 'redeemed' | 'expired';
  expiresAt?: Date;
  redeemedAt?: Date;
}

const couponSchema = createSchema<ICoupon>({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 40 },
  promotionId: { type: Schema.Types.ObjectId, ref: 'Promotion' },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['active', 'redeemed', 'expired'], default: 'active', index: true },
  expiresAt: Date,
  redeemedAt: Date,
});

export const Coupon = model<ICoupon>('Coupon', couponSchema);

export interface ILoyaltyLedger extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  delta: number;
  balanceAfter: number;
  reason: string;
  jobId?: Types.ObjectId;
  reference?: string;
}

const loyaltyLedgerSchema = createSchema<ILoyaltyLedger>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  delta: { type: Number, required: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, maxlength: 120 },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
  reference: { type: String, maxlength: 64 },
});

loyaltyLedgerSchema.index({ userId: 1, createdAt: -1 });

export const LoyaltyLedger = model<ILoyaltyLedger>('LoyaltyLedger', loyaltyLedgerSchema);

export interface IAiRecommendation extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  contextType: 'job_match' | 'technician_suggest' | 'upsell' | 'academy';
  contextId?: string;
  recommendations: Array<{
    entityType: string;
    entityId: Types.ObjectId;
    score: number;
    reason?: string;
  }>;
  modelVersion: string;
  generatedAt: Date;
  expiresAt?: Date;
}

const aiRecommendationSchema = createSchema<IAiRecommendation>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contextType: {
    type: String,
    enum: ['job_match', 'technician_suggest', 'upsell', 'academy'],
    required: true,
    index: true,
  },
  contextId: { type: String, maxlength: 64 },
  recommendations: [
    {
      entityType: { type: String, required: true },
      entityId: { type: Schema.Types.ObjectId, required: true },
      score: { type: Number, required: true, min: 0, max: 100 },
      reason: String,
    },
  ],
  modelVersion: { type: String, default: 'v1' },
  generatedAt: { type: Date, default: Date.now },
  expiresAt: Date,
});

aiRecommendationSchema.index({ userId: 1, contextType: 1, generatedAt: -1 });

export const AiRecommendation = model<IAiRecommendation>('AiRecommendation', aiRecommendationSchema);

export interface IUpload extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  url?: string;
  purpose?: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  /** local | cloudinary */
  provider?: string;
  /** Cloudinary public_id */
  publicId?: string;
  format?: string;
  width?: number;
  height?: number;
  resourceType?: string;
  contentHash?: string;
  migratedAt?: Date;
}

const uploadSchema = createSchema<IUpload>({
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  filename: { type: String, required: true, maxlength: 255 },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 120 },
  sizeBytes: { type: Number, required: true, min: 0 },
  path: { type: String, required: true, maxlength: 1024 },
  url: { type: String, maxlength: 2048 },
  purpose: { type: String, maxlength: 120, index: true },
  entityType: { type: String, maxlength: 80 },
  entityId: { type: Schema.Types.ObjectId },
  provider: { type: String, enum: ['local', 'cloudinary'], index: true },
  publicId: { type: String, maxlength: 512, index: true },
  format: { type: String, maxlength: 32 },
  width: { type: Number, min: 0 },
  height: { type: Number, min: 0 },
  resourceType: { type: String, maxlength: 16 },
  contentHash: { type: String, maxlength: 64, index: true },
  migratedAt: { type: Date },
});

uploadSchema.index({ uploadedBy: 1, createdAt: -1 });
uploadSchema.index({ provider: 1, contentHash: 1 });

export const Upload = model<IUpload>('Upload', uploadSchema);
