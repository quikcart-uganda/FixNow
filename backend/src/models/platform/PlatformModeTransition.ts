/**
 * Platform Mode transition history — permanent audit of Development ↔ Production switches.
 * Platform Mode is an operating state, NOT dataEnvironment.
 */

import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const PLATFORM_MODES = ['development', 'production'] as const;
export type PlatformMode = (typeof PLATFORM_MODES)[number];

export interface IPlatformModeTransition extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  previousMode: PlatformMode;
  newMode: PlatformMode;
  administratorUserId: Types.ObjectId;
  administratorEmail: string;
  administratorName: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  affectedVisibility: Record<string, unknown>;
  snapshotRestored?: boolean;
  confirmationPhrase?: string;
}

const platformModeTransitionSchema = createSchema<IPlatformModeTransition>({
  previousMode: { type: String, enum: PLATFORM_MODES, required: true, index: true },
  newMode: { type: String, enum: PLATFORM_MODES, required: true, index: true },
  administratorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  administratorEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
  administratorName: { type: String, required: true, trim: true, maxlength: 200 },
  reason: { type: String, maxlength: 1000 },
  ipAddress: { type: String, maxlength: 80 },
  userAgent: { type: String, maxlength: 500 },
  device: { type: String, maxlength: 200 },
  affectedVisibility: { type: Schema.Types.Mixed, default: {} },
  snapshotRestored: { type: Boolean, default: false },
  confirmationPhrase: { type: String, maxlength: 40 },
});

platformModeTransitionSchema.index({ createdAt: -1 });
platformModeTransitionSchema.index({ newMode: 1, createdAt: -1 });

export const PlatformModeTransition = model<IPlatformModeTransition>(
  'PlatformModeTransition',
  platformModeTransitionSchema,
);
