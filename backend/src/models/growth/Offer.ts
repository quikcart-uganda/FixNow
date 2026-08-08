import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import { DAY_OF_WEEK, OFFER_STATUS, OFFER_TYPE, type OfferStatus, type OfferType } from '../shared/enums.js';

export interface IOfferAnalytics {
  views: number;
  clicks: number;
  bookings: number;
  revenueGenerated: number;
  redemptionCount: number;
}

export interface ITechnicianOffer extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianId: Types.ObjectId;
  type: OfferType;
  title: string;
  subtitle?: string;
  description: string;
  terms?: string;
  bannerImageUrl?: string;
  promotionColor?: string;
  badge?: string;

  categoryIds: Types.ObjectId[];
  serviceNames: string[];
  serviceAreaDistricts: string[];
  availabilityNote?: string;

  discountValue?: number;
  currency: string;
  minimumBookingAmount?: number;
  maximumDiscountAmount?: number;
  maxRedemptions?: number;
  perCustomerLimit?: number;

  startsAt: Date;
  endsAt: Date;
  timeStart?: string;
  timeEnd?: string;
  weekdays: string[];
  holidayNotes?: string;

  status: OfferStatus;
  rejectionReason?: string;
  reviewedByAdminId?: Types.ObjectId;
  reviewedAt?: Date;
  submittedAt?: Date;
  publishedAt?: Date;

  analytics: IOfferAnalytics;
  /** Admin-featured flag — surfaced preferentially in customer discovery. */
  featured: boolean;
  /** Lowercased trimmed title for duplicate detection within a technician's non-archived offers. */
  titleKey: string;
}

const offerAnalyticsSchema = new Schema<IOfferAnalytics>(
  {
    views: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    bookings: { type: Number, default: 0, min: 0 },
    revenueGenerated: { type: Number, default: 0, min: 0 },
    redemptionCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const technicianOfferSchema = createSchema<ITechnicianOffer>({
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: Object.values(OFFER_TYPE), required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subtitle: { type: String, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  terms: { type: String, trim: true, maxlength: 2000 },
  bannerImageUrl: { type: String, maxlength: 500 },
  promotionColor: { type: String, maxlength: 32, default: '#0F766E' },
  badge: { type: String, maxlength: 40 },

  categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  serviceNames: [{ type: String, maxlength: 80 }],
  serviceAreaDistricts: [{ type: String, maxlength: 80 }],
  availabilityNote: { type: String, maxlength: 240 },

  discountValue: { type: Number, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  minimumBookingAmount: { type: Number, min: 0 },
  maximumDiscountAmount: { type: Number, min: 0 },
  maxRedemptions: { type: Number, min: 1 },
  perCustomerLimit: { type: Number, min: 1, default: 1 },

  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  timeStart: { type: String, maxlength: 5 },
  timeEnd: { type: String, maxlength: 5 },
  weekdays: [{ type: String, enum: Object.values(DAY_OF_WEEK) }],
  holidayNotes: { type: String, maxlength: 240 },

  status: {
    type: String,
    enum: Object.values(OFFER_STATUS),
    default: OFFER_STATUS.DRAFT,
    index: true,
  },
  rejectionReason: { type: String, maxlength: 500 },
  reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  submittedAt: Date,
  publishedAt: Date,

  analytics: { type: offerAnalyticsSchema, default: () => ({}) },
  featured: { type: Boolean, default: false, index: true },
  titleKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 140, index: true },
});

technicianOfferSchema.index({ technicianId: 1, status: 1, createdAt: -1 });
technicianOfferSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
technicianOfferSchema.index({ technicianId: 1, titleKey: 1, status: 1 });
technicianOfferSchema.index({ technicianId: 1, title: 1, startsAt: 1 });
technicianOfferSchema.index({ status: 1, isDeleted: 1, endsAt: 1, featured: -1 });
technicianOfferSchema.index({ technicianId: 1, isDeleted: 1, updatedAt: -1 });

technicianOfferSchema.pre('validate', function setTitleKey(next) {
  if (this.title) this.titleKey = String(this.title).trim().toLowerCase();
  next();
});

export const TechnicianOffer = model<ITechnicianOffer>('TechnicianOffer', technicianOfferSchema);
