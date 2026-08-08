import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

/**
 * Profile Boost — optional marketing products (NOT subscription plans).
 * Soft visibility only; ranking still prioritises trust / quality.
 */

export const BOOST_TYPES = [
  'category_boost',
  'district_boost',
  'homepage_featured',
  'weekend_boost',
  'emergency_boost',
  'search_boost',
  'promotion_boost',
  'new_customer_boost',
  'business_spotlight',
  'seasonal_boost',
] as const;
export type BoostType = (typeof BOOST_TYPES)[number];

export const BOOST_DURATIONS_HOURS = [24, 72, 168, 336, 720, 1440, 2160] as const;

export type BoostEligibilityPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'BUSINESS';

export interface IBoostProduct extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  code: string;
  type: BoostType;
  name: string;
  description: string;
  benefits: string[];
  currency: string;
  price: number;
  durationHours: number;
  /** Soft ranking contribution (capped when applied with other boosts). */
  weight: number;
  priority: number;
  sortOrder: number;
  isActive: boolean;
  isVisible: boolean;
  eligiblePlans: BoostEligibilityPlan[];
  /** Optional category scope (empty = all categories for category_boost). */
  categoryIds: Types.ObjectId[];
  /** Optional district scope (empty = all for district_boost until purchase selects). */
  districts: string[];
  allowTechnicianDistrictPick: boolean;
  maxConcurrentPurchases: number;
  estimatedVisibilityLiftPercent: number;
  placements: string[];
  expiresAt?: Date;
}

const boostProductSchema = createSchema<IBoostProduct>({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 40 },
  type: { type: String, enum: BOOST_TYPES, required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 4000 },
  benefits: { type: [String], default: [] },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  price: { type: Number, required: true, min: 0 },
  durationHours: { type: Number, required: true, min: 1 },
  weight: { type: Number, default: 8, min: 0, max: 40 },
  priority: { type: Number, default: 0, min: 0 },
  sortOrder: { type: Number, default: 0, index: true },
  isActive: { type: Boolean, default: true, index: true },
  isVisible: { type: Boolean, default: true, index: true },
  eligiblePlans: {
    type: [String],
    enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS'],
    default: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
  },
  categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  districts: { type: [String], default: [] },
  allowTechnicianDistrictPick: { type: Boolean, default: false },
  maxConcurrentPurchases: { type: Number, default: 1, min: 0 },
  estimatedVisibilityLiftPercent: { type: Number, default: 15, min: 0, max: 100 },
  placements: { type: [String], default: [] },
  expiresAt: Date,
});

boostProductSchema.index({ isActive: 1, isVisible: 1, sortOrder: 1 });

export const BoostProduct = model<IBoostProduct>('BoostProduct', boostProductSchema);

export interface IBoostPurchase extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  productCode: string;
  productType: BoostType;
  productName: string;
  status: 'pending_payment' | 'active' | 'expired' | 'rejected' | 'cancelled';
  amount: number;
  currency: string;
  durationHours: number;
  weight: number;
  startsAt?: Date;
  endsAt?: Date;
  /** Districts this purchase applies to (district_boost). */
  districts: string[];
  categoryIds: Types.ObjectId[];
  network?: 'mtn' | 'airtel';
  payerMsisdn?: string;
  transactionId?: string;
  screenshotUrl?: string;
  paymentReference?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  reminder3dSentAt?: Date;
  reminder1dSentAt?: Date;
  expiredNotifiedAt?: Date;
  analytics: {
    views: number;
    clicks: number;
    enquiries: number;
    applications: number;
    conversions: number;
  };
}

const boostPurchaseSchema = createSchema<IBoostPurchase>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'BoostProduct', required: true, index: true },
  productCode: { type: String, required: true, index: true },
  productType: { type: String, enum: BOOST_TYPES, required: true, index: true },
  productName: { type: String, required: true, maxlength: 120 },
  status: {
    type: String,
    enum: ['pending_payment', 'active', 'expired', 'rejected', 'cancelled'],
    default: 'pending_payment',
    index: true,
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'UGX' },
  durationHours: { type: Number, required: true, min: 1 },
  weight: { type: Number, default: 0, min: 0 },
  startsAt: Date,
  endsAt: { type: Date, index: true },
  districts: { type: [String], default: [] },
  categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  network: { type: String, enum: ['mtn', 'airtel'] },
  payerMsisdn: { type: String, maxlength: 20 },
  transactionId: { type: String, maxlength: 120, index: true },
  screenshotUrl: { type: String, maxlength: 1024 },
  paymentReference: { type: String, maxlength: 80, index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 1000 },
  reminder3dSentAt: Date,
  reminder1dSentAt: Date,
  expiredNotifiedAt: Date,
  analytics: {
    views: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    enquiries: { type: Number, default: 0, min: 0 },
    applications: { type: Number, default: 0, min: 0 },
    conversions: { type: Number, default: 0, min: 0 },
  },
});

boostPurchaseSchema.index({ userId: 1, status: 1, endsAt: 1 });
boostPurchaseSchema.index({ status: 1, endsAt: 1 });
boostPurchaseSchema.index(
  { transactionId: 1, network: 1 },
  { unique: true, partialFilterExpression: { transactionId: { $type: 'string' } } },
);

export const BoostPurchase = model<IBoostPurchase>('BoostPurchase', boostPurchaseSchema);

export interface IBoostSettings extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  enabled: boolean;
  /** Hard cap on combined soft boost weight applied in ranking. */
  maxCombinedWeight: number;
  currency: string;
}

const boostSettingsSchema = createSchema<IBoostSettings>({
  key: { type: String, required: true, unique: true, default: 'default' },
  enabled: { type: Boolean, default: true },
  maxCombinedWeight: { type: Number, default: 25, min: 0, max: 50 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
});

export const BoostSettings = model<IBoostSettings>('BoostSettings', boostSettingsSchema);

/** Seed defaults — admin may change every field afterwards. */
export const DEFAULT_BOOST_PRODUCTS: Array<
  Omit<IBoostProduct, keyof SoftDeleteFields | keyof TimestampFields | '_id' | 'categoryIds'> & {
    categoryIds?: Types.ObjectId[];
  }
> = [
  {
    code: 'CATEGORY_BOOST',
    type: 'category_boost',
    name: 'Category Boost',
    description: 'Appear more often inside your trade category listings and featured category cards.',
    benefits: ['Category search lift', 'Nearby category lists', 'Featured category cards'],
    currency: 'UGX',
    price: 25000,
    durationHours: 168,
    weight: 10,
    priority: 10,
    sortOrder: 1,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 2,
    estimatedVisibilityLiftPercent: 20,
    placements: ['category', 'nearby', 'featured_category'],
  },
  {
    code: 'DISTRICT_BOOST',
    type: 'district_boost',
    name: 'District Boost',
    description: 'Higher visibility only inside the districts you choose (e.g. Entebbe).',
    benefits: ['District-scoped lift', 'Nearby in selected areas'],
    currency: 'UGX',
    price: 20000,
    durationHours: 168,
    weight: 10,
    priority: 9,
    sortOrder: 2,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: true,
    maxConcurrentPurchases: 3,
    estimatedVisibilityLiftPercent: 18,
    placements: ['district', 'nearby'],
  },
  {
    code: 'HOMEPAGE_FEATURED',
    type: 'homepage_featured',
    name: 'Homepage Featured',
    description: 'Surface in Featured Professionals / Recommended Services style homepage placements.',
    benefits: ['Homepage featured rail', 'Recommended services cards'],
    currency: 'UGX',
    price: 45000,
    durationHours: 72,
    weight: 8,
    priority: 20,
    sortOrder: 3,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 1,
    estimatedVisibilityLiftPercent: 30,
    placements: ['homepage', 'featured', 'recommended'],
  },
  {
    code: 'WEEKEND_BOOST',
    type: 'weekend_boost',
    name: 'Weekend Boost',
    description: 'Extra visibility for Friday–Sunday and weekend job requests.',
    benefits: ['Weekend ranking lift', 'Weekend job exposure'],
    currency: 'UGX',
    price: 15000,
    durationHours: 72,
    weight: 8,
    priority: 8,
    sortOrder: 4,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 2,
    estimatedVisibilityLiftPercent: 15,
    placements: ['search', 'weekend'],
  },
  {
    code: 'EMERGENCY_BOOST',
    type: 'emergency_boost',
    name: 'Emergency Boost',
    description: 'More visible for urgent repairs, night requests, and emergency jobs.',
    benefits: ['Emergency job lift', 'Urgent / night requests'],
    currency: 'UGX',
    price: 30000,
    durationHours: 48,
    weight: 12,
    priority: 15,
    sortOrder: 5,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 2,
    estimatedVisibilityLiftPercent: 25,
    placements: ['emergency', 'urgent', 'search'],
  },
  {
    code: 'SEARCH_BOOST',
    type: 'search_boost',
    name: 'Search Boost',
    description: 'Soft ranking weight in customer search — never guaranteed first place.',
    benefits: ['Search ranking weight', 'Still respects trust'],
    currency: 'UGX',
    price: 22000,
    durationHours: 168,
    weight: 12,
    priority: 12,
    sortOrder: 6,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 1,
    estimatedVisibilityLiftPercent: 22,
    placements: ['search'],
  },
  {
    code: 'PROMOTION_BOOST',
    type: 'promotion_boost',
    name: 'Promotion Boost',
    description: 'Lift your live offers and promotions into featured / recommended surfaces.',
    benefits: ['Offer visibility', 'Featured promotion cards'],
    currency: 'UGX',
    price: 18000,
    durationHours: 168,
    weight: 6,
    priority: 7,
    sortOrder: 7,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 2,
    estimatedVisibilityLiftPercent: 20,
    placements: ['offers', 'homepage', 'recommended'],
  },
  {
    code: 'NEW_CUSTOMER_BOOST',
    type: 'new_customer_boost',
    name: 'New Customer Boost',
    description: 'Preferential soft ranking when matching new / first-time customers.',
    benefits: ['New customer matching', 'First-booking exposure'],
    currency: 'UGX',
    price: 16000,
    durationHours: 168,
    weight: 7,
    priority: 6,
    sortOrder: 8,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['STARTER', 'PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 1,
    estimatedVisibilityLiftPercent: 15,
    placements: ['recommended', 'new_customer'],
  },
  {
    code: 'BUSINESS_SPOTLIGHT',
    type: 'business_spotlight',
    name: 'Business Spotlight',
    description: 'Company spotlight on homepage and Featured Businesses (Business plan preferred).',
    benefits: ['Homepage spotlight', 'Featured Businesses'],
    currency: 'UGX',
    price: 60000,
    durationHours: 168,
    weight: 10,
    priority: 25,
    sortOrder: 9,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 1,
    estimatedVisibilityLiftPercent: 35,
    placements: ['homepage', 'featured_business', 'promotional'],
  },
  {
    code: 'SEASONAL_BOOST',
    type: 'seasonal_boost',
    name: 'Seasonal Boost',
    description: 'Campaign-style visibility for holidays and seasonal service peaks.',
    benefits: ['Seasonal campaign lift', 'Promotional sections'],
    currency: 'UGX',
    price: 35000,
    durationHours: 336,
    weight: 9,
    priority: 11,
    sortOrder: 10,
    isActive: true,
    isVisible: true,
    eligiblePlans: ['PROFESSIONAL', 'BUSINESS'],
    districts: [],
    allowTechnicianDistrictPick: false,
    maxConcurrentPurchases: 1,
    estimatedVisibilityLiftPercent: 28,
    placements: ['homepage', 'seasonal', 'promotional'],
  },
];
