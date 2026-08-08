import { model, type Types } from 'mongoose';
import { ROLES, type Role } from '../../constants/roles.js';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import { ACCOUNT_STATUS, type AccountStatus } from '../shared/enums.js';

export type AuthProvider = 'password' | 'google';

export interface IUser extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  email: string;
  phone?: string;
  /** Optional for Google-only accounts */
  passwordHash?: string;
  /** Google subject (`sub`) — sparse unique when present */
  googleId?: string;
  /** Linked sign-in methods for this account */
  authProviders: AuthProvider[];
  role: Role;
  fullName: string;
  accountStatus: AccountStatus;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  locale: string;
  timezone: string;
  /** Incremented on password change / forced logout to invalidate refresh family */
  refreshTokenVersion: number;
  failedLoginAttempts: number;
  lockUntil?: Date;
  passwordChangedAt?: Date;
  /** Future: subscription plan code denormalized for quick gating */
  subscriptionPlanCode?: string;
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  loyaltyPoints: number;
  referralCode?: string;
  metadata?: Record<string, unknown>;
}

const userSchema = createSchema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  phone: {
    type: String,
    trim: true,
    sparse: true,
    unique: true,
    maxlength: 20,
    match: [/^\+?[0-9]{9,15}$/, 'Invalid phone number'],
  },
  passwordHash: { type: String, required: false, select: false, minlength: 20 },
  googleId: {
    type: String,
    trim: true,
    sparse: true,
    unique: true,
    maxlength: 128,
    index: true,
  },
  authProviders: {
    type: [String],
    enum: ['password', 'google'],
    default: ['password'],
  },
  role: { type: String, enum: Object.values(ROLES), required: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  accountStatus: {
    type: String,
    enum: Object.values(ACCOUNT_STATUS),
    default: ACCOUNT_STATUS.ACTIVE,
    index: true,
  },
  emailVerifiedAt: Date,
  phoneVerifiedAt: Date,
  lastLoginAt: Date,
  lastLoginIp: { type: String, maxlength: 45 },
  locale: { type: String, default: 'en-UG', maxlength: 12 },
  timezone: { type: String, default: 'Africa/Kampala', maxlength: 64 },
  refreshTokenVersion: { type: Number, default: 0, min: 0 },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lockUntil: { type: Date, index: true },
  passwordChangedAt: Date,
  subscriptionPlanCode: { type: String, maxlength: 64, index: true },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'trialing', 'active', 'past_due', 'cancelled', 'expired'],
    default: 'none',
    index: true,
  },
  loyaltyPoints: { type: Number, default: 0, min: 0 },
  referralCode: { type: String, uppercase: true, trim: true, sparse: true, unique: true, maxlength: 32 },
  metadata: { type: Object },
});

userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ fullName: 'text', email: 'text' });

export const User = model<IUser>('User', userSchema);
