import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface IAuditLog extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
}

const auditLogSchema = createSchema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  actorRole: { type: String, maxlength: 40, index: true },
  action: { type: String, required: true, index: true, maxlength: 80 },
  resourceType: { type: String, required: true, index: true, maxlength: 80 },
  resourceId: { type: String, maxlength: 64, index: true },
  ip: { type: String, maxlength: 45 },
  userAgent: { type: String, maxlength: 512 },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },
  meta: { type: Schema.Types.Mixed },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export interface IPlatformSetting extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  value: Record<string, unknown>;
  scope: 'platform' | 'customer' | 'technician' | 'admin';
  description?: string;
  updatedBy?: Types.ObjectId;
  isSecret: boolean;
}

const platformSettingSchema = createSchema<IPlatformSetting>({
  key: { type: String, required: true, unique: true, maxlength: 120 },
  value: { type: Schema.Types.Mixed, required: true },
  scope: {
    type: String,
    enum: ['platform', 'customer', 'technician', 'admin'],
    default: 'platform',
    index: true,
  },
  description: { type: String, maxlength: 500 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isSecret: { type: Boolean, default: false },
});

export const PlatformSetting = model<IPlatformSetting>('PlatformSetting', platformSettingSchema);

/** Legacy alias */
export type ISettings = IPlatformSetting;
export const Settings = PlatformSetting;
