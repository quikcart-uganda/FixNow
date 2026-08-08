import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import { VERIFICATION_STATUS, type VerificationStatus } from '../shared/enums.js';

export interface IIdentityVerification extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'customer' | 'technician';
  documentType: 'national_id' | 'passport' | 'driving_license' | 'lc1_letter' | 'selfie' | 'certificate' | 'police_clearance' | 'business_registration' | 'professional_licence' | 'other';
  nationalIdNumberHash?: string;
  documentUrls: string[];
  selfieUrl?: string;
  status: VerificationStatus;
  lc1Ready: boolean;
  lc1Reference?: string;
  reviewedBy?: Types.ObjectId;
  reviewNotes?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  expiresAt?: Date;
}

const identityVerificationSchema = createSchema<IIdentityVerification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['customer', 'technician'], required: true },
  documentType: {
    type: String,
    enum: [
      'national_id',
      'passport',
      'driving_license',
      'lc1_letter',
      'selfie',
      'certificate',
      'police_clearance',
      'business_registration',
      'professional_licence',
      'other',
    ],
    required: true,
  },
  nationalIdNumberHash: { type: String, select: false, maxlength: 128 },
  documentUrls: { type: [String], default: [] },
  selfieUrl: { type: String, maxlength: 2048 },
  status: {
    type: String,
    enum: Object.values(VERIFICATION_STATUS),
    default: VERIFICATION_STATUS.PENDING,
    index: true,
  },
  lc1Ready: { type: Boolean, default: false },
  lc1Reference: { type: String, maxlength: 120 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: { type: String, maxlength: 2000 },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: Date,
  expiresAt: Date,
});

identityVerificationSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const IdentityVerification = model<IIdentityVerification>(
  'IdentityVerification',
  identityVerificationSchema,
);

/** Legacy alias for older VerificationRequest name */
export type IVerificationRequest = IIdentityVerification;
export const VerificationRequest = IdentityVerification;

export interface ISkillVerification extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  evidenceUrls: string[];
  status: VerificationStatus;
  assessedBy?: Types.ObjectId;
  score?: number;
  notes?: string;
  submittedAt: Date;
  reviewedAt?: Date;
}

const skillVerificationSchema = createSchema<ISkillVerification>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile', required: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
  subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
  evidenceUrls: { type: [String], default: [] },
  status: {
    type: String,
    enum: Object.values(VERIFICATION_STATUS),
    default: VERIFICATION_STATUS.PENDING,
    index: true,
  },
  assessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  score: { type: Number, min: 0, max: 100 },
  notes: { type: String, maxlength: 2000 },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: Date,
});

skillVerificationSchema.index({ technicianUserId: 1, categoryId: 1 });

export const SkillVerification = model<ISkillVerification>('SkillVerification', skillVerificationSchema);

export interface ICertification extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  name: string;
  issuer: string;
  credentialId?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  documentUrl?: string;
  status: VerificationStatus;
  verifiedAt?: Date;
}

const certificationSchema = createSchema<ICertification>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile', required: true },
  name: { type: String, required: true, maxlength: 160 },
  issuer: { type: String, required: true, maxlength: 160 },
  credentialId: { type: String, maxlength: 120 },
  issuedAt: Date,
  expiresAt: Date,
  documentUrl: { type: String, maxlength: 2048 },
  status: {
    type: String,
    enum: Object.values(VERIFICATION_STATUS),
    default: VERIFICATION_STATUS.PENDING,
    index: true,
  },
  verifiedAt: Date,
});

certificationSchema.index({ technicianUserId: 1, status: 1 });

export const Certification = model<ICertification>('Certification', certificationSchema);
