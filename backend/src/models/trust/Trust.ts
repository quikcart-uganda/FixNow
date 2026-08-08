import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface ITrustScore extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  trust: number;
  reliability: number;
  completion: number;
  response: number;
  punctuality: number;
  composite: number;
  sampleSize: number;
  computedAt: Date;
  algorithmVersion: string;
  breakdown?: Record<string, number>;
}

const trustScoreSchema = createSchema<ITrustScore>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  technicianProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'TechnicianProfile',
    required: true,
    unique: true,
  },
  trust: { type: Number, default: 0, min: 0, max: 100, index: true },
  reliability: { type: Number, default: 0, min: 0, max: 100 },
  completion: { type: Number, default: 0, min: 0, max: 100 },
  response: { type: Number, default: 0, min: 0, max: 100 },
  punctuality: { type: Number, default: 0, min: 0, max: 100 },
  composite: { type: Number, default: 0, min: 0, max: 100, index: true },
  sampleSize: { type: Number, default: 0, min: 0 },
  computedAt: { type: Date, default: Date.now, index: true },
  algorithmVersion: { type: String, default: 'v1', maxlength: 32 },
  breakdown: { type: Schema.Types.Mixed },
});

trustScoreSchema.index({ composite: -1 });

export const TrustScore = model<ITrustScore>('TrustScore', trustScoreSchema);

export interface IReputation extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'customer' | 'technician';
  score: number;
  level: string;
  positiveEvents: number;
  negativeEvents: number;
  lastEventAt?: Date;
}

const reputationSchema = createSchema<IReputation>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['customer', 'technician'], required: true },
  score: { type: Number, default: 0, min: 0, max: 1000, index: true },
  level: { type: String, default: 'new', maxlength: 40 },
  positiveEvents: { type: Number, default: 0, min: 0 },
  negativeEvents: { type: Number, default: 0, min: 0 },
  lastEventAt: Date,
});

reputationSchema.index({ userId: 1, role: 1 }, { unique: true });

export const Reputation = model<IReputation>('Reputation', reputationSchema);

export interface IBadge extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  isActive: boolean;
  criteria?: Record<string, unknown>;
}

const badgeSchema = createSchema<IBadge>({
  key: { type: String, required: true, unique: true, lowercase: true, maxlength: 80 },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 500 },
  icon: { type: String, maxlength: 64 },
  category: { type: String, required: true, index: true, maxlength: 60 },
  isActive: { type: Boolean, default: true },
  criteria: { type: Schema.Types.Mixed },
});

export const Badge = model<IBadge>('Badge', badgeSchema);

export interface IAchievement extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  title: string;
  description: string;
  icon?: string;
  target: number;
  points: number;
  badgeId?: Types.ObjectId;
  isActive: boolean;
}

const achievementSchema = createSchema<IAchievement>({
  key: { type: String, required: true, unique: true, lowercase: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 500 },
  icon: { type: String, maxlength: 64 },
  target: { type: Number, required: true, min: 1 },
  points: { type: Number, default: 0, min: 0 },
  badgeId: { type: Schema.Types.ObjectId, ref: 'Badge' },
  isActive: { type: Boolean, default: true, index: true },
});

export const Achievement = model<IAchievement>('Achievement', achievementSchema);

export interface IUserAchievement extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  achievementId: Types.ObjectId;
  progress: number;
  unlockedAt?: Date;
}

const userAchievementSchema = createSchema<IUserAchievement>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  achievementId: { type: Schema.Types.ObjectId, ref: 'Achievement', required: true },
  progress: { type: Number, default: 0, min: 0 },
  unlockedAt: Date,
});

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export const UserAchievement = model<IUserAchievement>('UserAchievement', userAchievementSchema);
