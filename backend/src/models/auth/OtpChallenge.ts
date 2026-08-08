import { model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const OTP_PURPOSE = {
  EMAIL_VERIFICATION: 'email_verification',
  PHONE_VERIFICATION: 'phone_verification',
  PASSWORD_RESET: 'password_reset',
  LOGIN: 'login',
} as const;

export type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

export const OTP_CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
} as const;

export type OtpChannel = (typeof OTP_CHANNEL)[keyof typeof OTP_CHANNEL];

export interface IOtpChallenge extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt?: Date;
  metadata?: Record<string, unknown>;
}

const otpChallengeSchema = createSchema<IOtpChallenge>({
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  purpose: {
    type: String,
    enum: Object.values(OTP_PURPOSE),
    required: true,
    index: true,
  },
  channel: {
    type: String,
    enum: Object.values(OTP_CHANNEL),
    required: true,
  },
  destination: { type: String, required: true, maxlength: 254 },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 5, min: 1 },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
  metadata: { type: Object },
});

otpChallengeSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = model<IOtpChallenge>('OtpChallenge', otpChallengeSchema);
