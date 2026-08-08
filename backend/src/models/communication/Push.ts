import { model, type Types, Schema } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export type DevicePlatform = 'web' | 'android' | 'ios';

export interface IDeviceToken extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  platform: DevicePlatform;
  /** Client-stable device id for upsert / refresh */
  deviceId?: string;
  appVersion?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  /** FCM / web push metadata */
  meta?: Record<string, unknown>;
  isActive: boolean;
  lastActiveAt: Date;
  lastRegisteredAt: Date;
  invalidatedAt?: Date;
  invalidReason?: string;
}

const deviceTokenSchema = createSchema<IDeviceToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, maxlength: 512 },
  platform: { type: String, enum: ['web', 'android', 'ios'], required: true, index: true },
  deviceId: { type: String, maxlength: 128, index: true },
  appVersion: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 512 },
  locale: { type: String, maxlength: 12 },
  timezone: { type: String, maxlength: 64 },
  meta: { type: Schema.Types.Mixed },
  isActive: { type: Boolean, default: true, index: true },
  lastActiveAt: { type: Date, default: Date.now, index: true },
  lastRegisteredAt: { type: Date, default: Date.now },
  invalidatedAt: Date,
  invalidReason: { type: String, maxlength: 200 },
});

deviceTokenSchema.index({ token: 1 }, { unique: true });
deviceTokenSchema.index({ userId: 1, isActive: 1, lastActiveAt: -1 });
deviceTokenSchema.index({ userId: 1, deviceId: 1 }, { sparse: true });

export const DeviceToken = model<IDeviceToken>('DeviceToken', deviceTokenSchema);

export type PushDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'skipped';

export interface IPushDeliveryLog extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  notificationId?: Types.ObjectId;
  deviceTokenId?: Types.ObjectId;
  tokenSnapshot?: string;
  platform?: DevicePlatform;
  eventType: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  status: PushDeliveryStatus;
  provider: 'fcm' | 'console';
  providerMessageId?: string;
  attempt: number;
  maxAttempts: number;
  errorCode?: string;
  errorMessage?: string;
  nextRetryAt?: Date;
  sentAt?: Date;
}

const pushDeliveryLogSchema = createSchema<IPushDeliveryLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', index: true },
  deviceTokenId: { type: Schema.Types.ObjectId, ref: 'DeviceToken', index: true },
  tokenSnapshot: { type: String, maxlength: 512 },
  platform: { type: String, enum: ['web', 'android', 'ios'] },
  eventType: { type: String, required: true, maxlength: 80, index: true },
  category: { type: String, required: true, maxlength: 40, index: true },
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 1000 },
  data: { type: Schema.Types.Mixed },
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'failed', 'skipped'],
    default: 'queued',
    index: true,
  },
  provider: { type: String, enum: ['fcm', 'console'], default: 'console' },
  providerMessageId: { type: String, maxlength: 200 },
  attempt: { type: Number, default: 1, min: 1 },
  maxAttempts: { type: Number, default: 3, min: 1 },
  errorCode: { type: String, maxlength: 80 },
  errorMessage: { type: String, maxlength: 500 },
  nextRetryAt: { type: Date, index: true },
  sentAt: Date,
});

pushDeliveryLogSchema.index({ status: 1, nextRetryAt: 1 });
pushDeliveryLogSchema.index({ createdAt: -1 });
pushDeliveryLogSchema.index({ eventType: 1, createdAt: -1 });

export const PushDeliveryLog = model<IPushDeliveryLog>('PushDeliveryLog', pushDeliveryLogSchema);
