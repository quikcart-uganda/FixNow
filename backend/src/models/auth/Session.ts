import { model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface IRefreshToken extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedByTokenHash?: string;
  /** When true, refresh rotation continues to use the extended remember-me TTL. */
  rememberMe?: boolean;
  userAgent?: string;
  ip?: string;
}

const refreshTokenSchema = createSchema<IRefreshToken>({
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  familyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  replacedByTokenHash: String,
  rememberMe: { type: Boolean, default: false },
  userAgent: { type: String, maxlength: 512 },
  ip: { type: String, maxlength: 45 },
});

refreshTokenSchema.index({ userId: 1, expiresAt: -1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);

export interface ISession extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenId?: Types.ObjectId;
  deviceId?: string;
  deviceLabel?: string;
  platform?: 'web' | 'ios' | 'android' | 'unknown';
  ip?: string;
  userAgent?: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

const sessionSchema = createSchema<ISession>({
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  refreshTokenId: { type: 'ObjectId', ref: 'RefreshToken' },
  deviceId: { type: String, maxlength: 128, index: true },
  deviceLabel: { type: String, maxlength: 120 },
  platform: { type: String, enum: ['web', 'ios', 'android', 'unknown'], default: 'unknown' },
  ip: { type: String, maxlength: 45 },
  userAgent: { type: String, maxlength: 512 },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
});

sessionSchema.index({ userId: 1, lastSeenAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
