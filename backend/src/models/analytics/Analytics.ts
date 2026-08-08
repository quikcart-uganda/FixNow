import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface IDailyMetric extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  date: Date;
  scope: 'platform' | 'district' | 'category';
  scopeKey: string;
  metrics: {
    newUsers?: number;
    activeUsers?: number;
    jobsPosted?: number;
    jobsCompleted?: number;
    applications?: number;
    gmv?: number;
    disputes?: number;
  };
}

const dailyMetricSchema = createSchema<IDailyMetric>({
  date: { type: Date, required: true, index: true },
  scope: { type: String, enum: ['platform', 'district', 'category'], required: true },
  scopeKey: { type: String, required: true, maxlength: 80 },
  metrics: {
    newUsers: { type: Number, min: 0, default: 0 },
    activeUsers: { type: Number, min: 0, default: 0 },
    jobsPosted: { type: Number, min: 0, default: 0 },
    jobsCompleted: { type: Number, min: 0, default: 0 },
    applications: { type: Number, min: 0, default: 0 },
    gmv: { type: Number, min: 0, default: 0 },
    disputes: { type: Number, min: 0, default: 0 },
  },
});

dailyMetricSchema.index({ date: 1, scope: 1, scopeKey: 1 }, { unique: true });

export const DailyMetric = model<IDailyMetric>('DailyMetric', dailyMetricSchema);

export interface IUserActivity extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: string;
  resourceType?: string;
  resourceId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  occurredAt: Date;
}

const userActivitySchema = createSchema<IUserActivity>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, index: true, maxlength: 80 },
  resourceType: { type: String, maxlength: 80, index: true },
  resourceId: { type: String, maxlength: 64 },
  sessionId: { type: String, maxlength: 64 },
  ip: { type: String, maxlength: 45 },
  userAgent: { type: String, maxlength: 512 },
  meta: { type: Schema.Types.Mixed },
  occurredAt: { type: Date, default: Date.now, index: true },
});

userActivitySchema.index({ userId: 1, occurredAt: -1 });
userActivitySchema.index({ action: 1, occurredAt: -1 });

export const UserActivity = model<IUserActivity>('UserActivity', userActivitySchema);

export interface ISearchAnalytics extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  query: string;
  filters?: Record<string, unknown>;
  resultCount: number;
  clickedTechnicianId?: Types.ObjectId;
  clickedJobId?: Types.ObjectId;
  district?: string;
  categoryId?: Types.ObjectId;
  latencyMs?: number;
  searchedAt: Date;
}

const searchAnalyticsSchema = createSchema<ISearchAnalytics>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  query: { type: String, required: true, maxlength: 200, index: true },
  filters: { type: Schema.Types.Mixed },
  resultCount: { type: Number, default: 0, min: 0 },
  clickedTechnicianId: { type: Schema.Types.ObjectId, ref: 'User' },
  clickedJobId: { type: Schema.Types.ObjectId, ref: 'Job' },
  district: { type: String, maxlength: 100, index: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  latencyMs: { type: Number, min: 0 },
  searchedAt: { type: Date, default: Date.now, index: true },
});

searchAnalyticsSchema.index({ searchedAt: -1 });
searchAnalyticsSchema.index({ query: 'text' });

export const SearchAnalytics = model<ISearchAnalytics>('SearchAnalytics', searchAnalyticsSchema);
