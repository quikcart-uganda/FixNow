import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

/** Admin-owned platform promotions (not technician offers). */
export const PLATFORM_PROMO_KIND = [
  'holiday',
  'welcome',
  'referral',
  'seasonal',
  'announcement',
  'custom',
] as const;
export type PlatformPromoKind = (typeof PLATFORM_PROMO_KIND)[number];

export const PLATFORM_PROMO_STATUS = [
  'draft',
  'scheduled',
  'active',
  'paused',
  'expired',
  'archived',
] as const;
export type PlatformPromoStatus = (typeof PLATFORM_PROMO_STATUS)[number];

export interface IPlatformPromotion extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  kind: PlatformPromoKind;
  title: string;
  subtitle?: string;
  description: string;
  terms?: string;
  bannerImageUrl?: string;
  badge?: string;
  promotionColor?: string;
  code?: string;
  discountType: 'percent' | 'fixed' | 'none' | 'credit';
  discountValue: number;
  currency: string;
  audience: 'all' | 'customer' | 'technician';
  startsAt: Date;
  endsAt: Date;
  maxRedemptions?: number;
  redemptionCount: number;
  status: PlatformPromoStatus;
  featured: boolean;
  createdByAdminId: Types.ObjectId;
  analytics: {
    views: number;
    clicks: number;
    redemptions: number;
    revenueGenerated: number;
  };
}

const platformPromotionSchema = createSchema<IPlatformPromotion>({
  kind: { type: String, enum: PLATFORM_PROMO_KIND, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subtitle: { type: String, trim: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 2000 },
  terms: { type: String, maxlength: 2000 },
  bannerImageUrl: { type: String, maxlength: 500 },
  badge: { type: String, maxlength: 40 },
  promotionColor: { type: String, maxlength: 32, default: '#3d27bc' },
  code: { type: String, uppercase: true, sparse: true, unique: true, maxlength: 40 },
  discountType: {
    type: String,
    enum: ['percent', 'fixed', 'none', 'credit'],
    default: 'percent',
  },
  discountValue: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  audience: { type: String, enum: ['all', 'customer', 'technician'], default: 'customer', index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  maxRedemptions: { type: Number, min: 1 },
  redemptionCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: PLATFORM_PROMO_STATUS, default: 'draft', index: true },
  featured: { type: Boolean, default: false, index: true },
  createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  analytics: {
    views: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    redemptions: { type: Number, default: 0, min: 0 },
    revenueGenerated: { type: Number, default: 0, min: 0 },
  },
});

platformPromotionSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
platformPromotionSchema.index({ kind: 1, status: 1 });

export const PlatformPromotion = model<IPlatformPromotion>('PlatformPromotion', platformPromotionSchema);

/** Sponsored / educational / partner content published by Admin. */
export const SPONSORED_CONTENT_TYPE = [
  'educational_banner',
  'safety_campaign',
  'tip',
  'partner_ad',
  'announcement',
  'community_notice',
  'sponsored_advertisement',
  'platform_announcement',
  'government_campaign',
  'seasonal_promotion',
  'technician_recruitment',
  'partner_promotion',
  'emergency_awareness',
  'referral_campaign',
] as const;
export type SponsoredContentType = (typeof SPONSORED_CONTENT_TYPE)[number];

export const SPONSORED_PLACEMENT = [
  'home',
  'home_hero',
  'dashboard_hero',
  'offers',
  'search',
  'profile',
  'global',
] as const;
export type SponsoredPlacement = (typeof SPONSORED_PLACEMENT)[number];

/** Premium rotating hero slots on Customer / Technician home. */
export const SPONSORED_HERO_PLACEMENTS: SponsoredPlacement[] = ['home_hero', 'dashboard_hero'];

export const SPONSORED_STATUS = ['draft', 'scheduled', 'active', 'paused', 'expired', 'archived'] as const;
export type SponsoredStatus = (typeof SPONSORED_STATUS)[number];

export interface ISponsoredContent extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  type: SponsoredContentType;
  title: string;
  /** Optional short line under the headline (hero banners). */
  subtitle?: string;
  body: string;
  /** Generic / legacy banner; used when device-specific images are absent. */
  bannerImageUrl?: string;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  /** Optional secondary / sponsor mark for hero overlays. */
  sponsorLogoUrl?: string;
  badge?: string;
  ctaLabel?: string;
  ctaHref?: string;
  placement: SponsoredPlacement;
  /** Role audience — enforced by public delivery. Default customer for legacy rows. */
  audience: 'all' | 'customer' | 'technician';
  sponsorName?: string;
  startsAt: Date;
  endsAt: Date;
  status: SponsoredStatus;
  /** Higher priority surfaces first within a placement. */
  priority: number;
  /** Stable order within the same priority (lower first). */
  displayOrder: number;
  createdByAdminId: Types.ObjectId;
  analytics: {
    impressions: number;
    clicks: number;
    dismissals: number;
  };
}

const sponsoredContentSchema = createSchema<ISponsoredContent>({
  type: { type: String, enum: SPONSORED_CONTENT_TYPE, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subtitle: { type: String, trim: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 4000 },
  bannerImageUrl: { type: String, maxlength: 500 },
  desktopImageUrl: { type: String, maxlength: 500 },
  mobileImageUrl: { type: String, maxlength: 500 },
  sponsorLogoUrl: { type: String, maxlength: 500 },
  badge: { type: String, maxlength: 40 },
  ctaLabel: { type: String, maxlength: 40 },
  ctaHref: { type: String, maxlength: 500 },
  placement: { type: String, enum: SPONSORED_PLACEMENT, default: 'home', index: true },
  audience: { type: String, enum: ['all', 'customer', 'technician'], default: 'customer', index: true },
  sponsorName: { type: String, maxlength: 120 },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: SPONSORED_STATUS, default: 'draft', index: true },
  priority: { type: Number, default: 0 },
  displayOrder: { type: Number, default: 0, min: 0 },
  createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  analytics: {
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    dismissals: { type: Number, default: 0, min: 0 },
  },
});

sponsoredContentSchema.index({ status: 1, placement: 1, priority: -1, displayOrder: 1 });
sponsoredContentSchema.index({ status: 1, audience: 1, startsAt: 1, endsAt: 1 });

export const SponsoredContent = model<ISponsoredContent>('SponsoredContent', sponsoredContentSchema);
