/**
 * Business company / team membership — operational team management for Business plan.
 * Owner is the Business subscriber; members are technicians invited into the company.
 */
import { Schema, Types, model } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const COMPANY_MEMBER_ROLES = ['owner', 'dispatcher', 'employee'] as const;
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number];

export const COMPANY_MEMBER_STATUSES = ['active', 'invited', 'suspended', 'removed'] as const;
export type CompanyMemberStatus = (typeof COMPANY_MEMBER_STATUSES)[number];

export const COMPANY_INVITE_STATUSES = ['pending', 'accepted', 'declined', 'revoked', 'expired'] as const;
export type CompanyInviteStatus = (typeof COMPANY_INVITE_STATUSES)[number];

export interface ICompany extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  name: string;
  slogan?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  district?: string;
  settings: {
    autoAssignEnabled: boolean;
    notifyOnDispatch: boolean;
  };
}

const companySchema = createSchema<ICompany>({
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  slogan: { type: String, maxlength: 160 },
  logoUrl: { type: String, maxlength: 1024 },
  primaryColor: { type: String, maxlength: 32 },
  secondaryColor: { type: String, maxlength: 32 },
  district: { type: String, maxlength: 80 },
  settings: {
    autoAssignEnabled: { type: Boolean, default: false },
    notifyOnDispatch: { type: Boolean, default: true },
  },
});

export const Company = model<ICompany>('Company', companySchema as Schema);

export interface ICompanyMember extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  technicianProfileId?: Types.ObjectId;
  role: CompanyMemberRole;
  status: CompanyMemberStatus;
  title?: string;
  invitedBy?: Types.ObjectId;
  joinedAt?: Date;
  suspendedAt?: Date;
  notes?: string;
}

const companyMemberSchema = createSchema<ICompanyMember>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile', index: true },
  role: { type: String, enum: COMPANY_MEMBER_ROLES, default: 'employee', index: true },
  status: { type: String, enum: COMPANY_MEMBER_STATUSES, default: 'invited', index: true },
  title: { type: String, maxlength: 80 },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  joinedAt: Date,
  suspendedAt: Date,
  notes: { type: String, maxlength: 500 },
});

companyMemberSchema.index({ companyId: 1, userId: 1 }, { unique: true });
companyMemberSchema.index({ companyId: 1, status: 1 });

export const CompanyMember = model<ICompanyMember>('CompanyMember', companyMemberSchema as Schema);

export interface ICompanyInvite extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  email: string;
  role: CompanyMemberRole;
  status: CompanyInviteStatus;
  token: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  acceptedByUserId?: Types.ObjectId;
  message?: string;
}

const companyInviteSchema = createSchema<ICompanyInvite>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160, index: true },
  role: { type: String, enum: ['dispatcher', 'employee'], default: 'employee' },
  status: { type: String, enum: COMPANY_INVITE_STATUSES, default: 'pending', index: true },
  token: { type: String, required: true, unique: true, index: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: true },
  acceptedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  message: { type: String, maxlength: 500 },
});

companyInviteSchema.index({ companyId: 1, email: 1, status: 1 });

export const CompanyInvite = model<ICompanyInvite>('CompanyInvite', companyInviteSchema as Schema);
