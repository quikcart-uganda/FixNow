import { model, type Types } from 'mongoose';
import {
  createSchema,
  ugandaLocationSchema,
  type SoftDeleteFields,
  type TimestampFields,
  type UgandaLocation,
} from '../shared/base.js';

export interface ICustomerProfile extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  photoUrl?: string;
  /** Selected avatar library id (kept when a real photo is uploaded). */
  avatarId?: string;
  /** Last uploaded real photo URL (kept when switching back to an avatar). */
  uploadedPhotoUrl?: string;
  bio?: string;
  languages: string[];
  defaultAddressId?: Types.ObjectId;
  location?: UgandaLocation;
  preferences: {
    preferredContact?: 'phone' | 'sms' | 'whatsapp' | 'in_app';
    preferredLanguage?: string;
    allowTechnicianSuggestions?: boolean;
    allowMarketing?: boolean;
    /** Notify when a favourited technician publishes a new approved offer. */
    notifyFavouriteTechnicianOffers?: boolean;
  };
  jobStats: {
    posted: number;
    completed: number;
    cancelled: number;
  };
  referralCode?: string;
  referredByUserId?: Types.ObjectId;
}

const customerProfileSchema = createSchema<ICustomerProfile>({
  userId: { type: 'ObjectId', ref: 'User', required: true, unique: true, index: true },
  photoUrl: { type: String, maxlength: 1024 },
  avatarId: { type: String, maxlength: 64, index: true },
  uploadedPhotoUrl: { type: String, maxlength: 1024 },
  bio: { type: String, maxlength: 1000 },
  languages: { type: [String], default: ['en'] },
  defaultAddressId: { type: 'ObjectId', ref: 'CustomerAddress' },
  location: { type: ugandaLocationSchema },
  preferences: {
    preferredContact: {
      type: String,
      enum: ['phone', 'sms', 'whatsapp', 'in_app'],
      default: 'in_app',
    },
    preferredLanguage: { type: String, default: 'en' },
    allowTechnicianSuggestions: { type: Boolean, default: true },
    allowMarketing: { type: Boolean, default: false },
    notifyFavouriteTechnicianOffers: { type: Boolean, default: true },
  },
  jobStats: {
    posted: { type: Number, default: 0, min: 0 },
    completed: { type: Number, default: 0, min: 0 },
    cancelled: { type: Number, default: 0, min: 0 },
  },
  referralCode: { type: String, uppercase: true, sparse: true, unique: true, maxlength: 32 },
  referredByUserId: { type: 'ObjectId', ref: 'User', index: true },
});

customerProfileSchema.index({ 'location.district': 1 });
customerProfileSchema.index({ 'location.geo': '2dsphere' });

export const CustomerProfile = model<ICustomerProfile>('CustomerProfile', customerProfileSchema);

export interface ICustomerAddress extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  customerProfileId: Types.ObjectId;
  userId: Types.ObjectId;
  label: string;
  isDefault: boolean;
  location: UgandaLocation;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

const customerAddressSchema = createSchema<ICustomerAddress>({
  customerProfileId: { type: 'ObjectId', ref: 'CustomerProfile', required: true, index: true },
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  isDefault: { type: Boolean, default: false, index: true },
  location: { type: ugandaLocationSchema, required: true },
  contactName: { type: String, maxlength: 120 },
  contactPhone: { type: String, maxlength: 20 },
  notes: { type: String, maxlength: 500 },
});

customerAddressSchema.index({ userId: 1, isDefault: 1 });
customerAddressSchema.index({ 'location.geo': '2dsphere' });

export const CustomerAddress = model<ICustomerAddress>('CustomerAddress', customerAddressSchema);

export interface ISavedTechnician extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  customerUserId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  notes?: string;
  savedAt: Date;
}

const savedTechnicianSchema = createSchema<ISavedTechnician>({
  customerUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  technicianUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  technicianProfileId: { type: 'ObjectId', ref: 'TechnicianProfile', required: true },
  notes: { type: String, maxlength: 500 },
  savedAt: { type: Date, default: Date.now },
});

savedTechnicianSchema.index({ customerUserId: 1, technicianUserId: 1 }, { unique: true });
savedTechnicianSchema.index({ customerUserId: 1, savedAt: -1 });

export const SavedTechnician = model<ISavedTechnician>('SavedTechnician', savedTechnicianSchema);

/** Customer-saved / favourited technician promotions. */
export interface ISavedOffer extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  customerUserId: Types.ObjectId;
  offerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  remindBeforeExpiry: boolean;
  reminderSentAt?: Date;
  savedAt: Date;
}

const savedOfferSchema = createSchema<ISavedOffer>({
  customerUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  offerId: { type: 'ObjectId', ref: 'TechnicianOffer', required: true, index: true },
  technicianId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  remindBeforeExpiry: { type: Boolean, default: true },
  reminderSentAt: Date,
  savedAt: { type: Date, default: Date.now },
});

savedOfferSchema.index({ customerUserId: 1, offerId: 1 }, { unique: true });
savedOfferSchema.index({ customerUserId: 1, savedAt: -1 });
savedOfferSchema.index({ remindBeforeExpiry: 1, reminderSentAt: 1 });

export const SavedOffer = model<ISavedOffer>('SavedOffer', savedOfferSchema);
