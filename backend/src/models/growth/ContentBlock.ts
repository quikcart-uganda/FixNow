import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

/**
 * ContentBlock — admin-managed, audience- and page-targeted micro-content.
 *
 * This is the delivery layer for hero headlines, welcome messages, feature
 * cards, banners, onboarding slides, safety tips, campaigns, and feature
 * announcements that previously lived as hardcoded strings in the apps. It
 * complements (does not replace) the CMS `ContentPage` (long-form documents),
 * `PlatformPromotion` (coupon-style promos), `SponsoredContent` (ads), and
 * `TechnicianOffer` (marketplace offers).
 */

export const CONTENT_BLOCK_TYPE = [
  'hero_headline',
  'hero_description',
  'welcome_message',
  'promo_banner',
  'announcement',
  'sponsored_campaign',
  'advertisement',
  'educational',
  'safety_tip',
  'service_awareness',
  'referral_campaign',
  'seasonal_campaign',
  'recruitment_campaign',
  'technician_onboarding',
  'customer_onboarding',
  'feature_announcement',
  'feature_card',
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPE)[number];

/** Who may see the block. Enforced server-side; the frontend never decides. */
export const CONTENT_BLOCK_AUDIENCE = [
  'customers',
  'technicians',
  'both',
  'guests',
  'logged_in',
  'new_users',
  'returning_users',
] as const;
export type ContentBlockAudience = (typeof CONTENT_BLOCK_AUDIENCE)[number];

/** Page/screen the block targets. `global` shows across an app channel. */
export const CONTENT_BLOCK_PAGE = [
  'global',
  // Customer app
  'customer.splash',
  'customer.onboarding',
  'customer.login',
  'customer.register',
  'customer.home',
  'customer.dashboard',
  'customer.bookings',
  'customer.checkout',
  'customer.notifications',
  // Technician app
  'technician.splash',
  'technician.landing',
  'technician.onboarding',
  'technician.login',
  'technician.register',
  'technician.dashboard',
  'technician.jobs',
  'technician.wallet',
  'technician.profile',
  // Admin preview surfaces
  'admin.marketing_preview',
  'admin.content_preview',
] as const;
export type ContentBlockPage = (typeof CONTENT_BLOCK_PAGE)[number];

export const CONTENT_BLOCK_STATUS = [
  'draft',
  'scheduled',
  'published',
  'expired',
  'archived',
] as const;
export type ContentBlockStatus = (typeof CONTENT_BLOCK_STATUS)[number];

export interface IContentBlock extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  type: ContentBlockType;
  audience: ContentBlockAudience;
  page: ContentBlockPage;
  section: string;
  locale: string;

  title?: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  icon?: string;
  ctaLabel?: string;
  ctaHref?: string;
  color?: string;
  badge?: string;

  status: ContentBlockStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;

  priority: number;
  displayOrder: number;
  weight: number;
  maxImpressions?: number | null;
  frequencyCapPerDay?: number | null;

  analytics: {
    impressions: number;
    clicks: number;
  };

  createdByAdminId: Types.ObjectId;
  updatedByAdminId?: Types.ObjectId;
}

const contentBlockSchema = createSchema<IContentBlock>({
  type: { type: String, enum: CONTENT_BLOCK_TYPE, required: true, index: true },
  audience: { type: String, enum: CONTENT_BLOCK_AUDIENCE, default: 'both', index: true },
  page: { type: String, enum: CONTENT_BLOCK_PAGE, required: true, index: true },
  section: { type: String, required: true, trim: true, lowercase: true, maxlength: 60, index: true },
  locale: { type: String, default: 'en', lowercase: true, trim: true, maxlength: 12, index: true },

  title: { type: String, trim: true, maxlength: 200 },
  subtitle: { type: String, trim: true, maxlength: 300 },
  body: { type: String, trim: true, maxlength: 4000 },
  imageUrl: { type: String, trim: true, maxlength: 2000 },
  icon: { type: String, trim: true, maxlength: 60 },
  ctaLabel: { type: String, trim: true, maxlength: 60 },
  ctaHref: { type: String, trim: true, maxlength: 2000 },
  color: { type: String, trim: true, maxlength: 32 },
  badge: { type: String, trim: true, maxlength: 60 },

  status: { type: String, enum: CONTENT_BLOCK_STATUS, default: 'draft', index: true },
  startsAt: { type: Date, default: null, index: true },
  endsAt: { type: Date, default: null, index: true },

  priority: { type: Number, default: 0, index: true },
  displayOrder: { type: Number, default: 0 },
  weight: { type: Number, default: 1, min: 0 },
  maxImpressions: { type: Number, default: null, min: 1 },
  frequencyCapPerDay: { type: Number, default: null, min: 1 },

  analytics: {
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },

  createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
});

// Delivery hot path: resolve published blocks for a page/section/locale by rank.
contentBlockSchema.index({ page: 1, section: 1, status: 1, locale: 1, priority: -1 });
contentBlockSchema.index({ status: 1, startsAt: 1, endsAt: 1 });

export const ContentBlock = model<IContentBlock>('ContentBlock', contentBlockSchema);
