import { Schema, model, type Types } from 'mongoose';
import {
  createSchema,
  geoPointSchema,
  type GeoPoint,
  type SoftDeleteFields,
  type TimestampFields,
} from '../shared/base.js';

export interface IVisitVerification extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  assignmentId?: Types.ObjectId;
  technicianId: Types.ObjectId;
  customerId: Types.ObjectId;
  checkInAt?: Date;
  checkOutAt?: Date;
  checkInGeo?: GeoPoint;
  checkOutGeo?: GeoPoint;
  customerConfirmed: boolean;
  photoUrls: string[];
  notes?: string;
  status: 'pending' | 'verified' | 'failed' | 'disputed';
}

const visitVerificationSchema = createSchema<IVisitVerification>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment' },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  checkInAt: Date,
  checkOutAt: Date,
  checkInGeo: { type: geoPointSchema },
  checkOutGeo: { type: geoPointSchema },
  customerConfirmed: { type: Boolean, default: false },
  photoUrls: { type: [String], default: [] },
  notes: { type: String, maxlength: 1000 },
  status: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'disputed'],
    default: 'pending',
    index: true,
  },
});

visitVerificationSchema.index({ jobId: 1, technicianId: 1 });

export const VisitVerification = model<IVisitVerification>('VisitVerification', visitVerificationSchema);

export interface IEmergencyContact extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  phone: string;
  relationship?: string;
  isPrimary: boolean;
}

const emergencyContactSchema = createSchema<IEmergencyContact>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  phone: { type: String, required: true, maxlength: 20 },
  relationship: { type: String, maxlength: 80 },
  isPrimary: { type: Boolean, default: false },
});

emergencyContactSchema.index({ userId: 1, isPrimary: 1 });

export const EmergencyContact = model<IEmergencyContact>('EmergencyContact', emergencyContactSchema);

export const TRACKING_STATUSES = ['active', 'paused', 'arrived', 'ended', 'cancelled'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export interface TrackingHistoryPoint {
  at: Date;
  geo: GeoPoint;
  heading?: number;
  speedMps?: number;
  accuracyMeters?: number;
}

export interface ILiveTrackingSession extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  technicianId: Types.ObjectId;
  customerId: Types.ObjectId;
  status: TrackingStatus;
  startedAt: Date;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
  arrivedAt?: Date | null;
  endedAt?: Date | null;
  destinationGeo?: GeoPoint;
  destinationLabel?: string;
  lastGeo?: GeoPoint;
  lastPingAt?: Date;
  lastHeading?: number;
  lastSpeedMps?: number;
  lastAccuracyMeters?: number;
  etaSeconds?: number | null;
  distanceMeters?: number | null;
  routePolyline?: Array<{ lat: number; lng: number }>;
  updateCount: number;
  history: TrackingHistoryPoint[];
  retentionDays: number;
  shareTokenHash?: string;
  endReason?: string;
}

const historyPointSchema = new Schema(
  {
    at: { type: Date, required: true },
    geo: { type: geoPointSchema, required: true },
    heading: Number,
    speedMps: Number,
    accuracyMeters: Number,
  },
  { _id: false },
);

const liveTrackingSessionSchema = createSchema<ILiveTrackingSession>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: TRACKING_STATUSES, default: 'active', index: true },
  startedAt: { type: Date, default: Date.now },
  pausedAt: { type: Date, default: null },
  resumedAt: { type: Date, default: null },
  arrivedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  destinationGeo: { type: geoPointSchema },
  destinationLabel: { type: String, maxlength: 300 },
  lastGeo: { type: geoPointSchema },
  lastPingAt: Date,
  lastHeading: Number,
  lastSpeedMps: Number,
  lastAccuracyMeters: Number,
  etaSeconds: { type: Number, default: null },
  distanceMeters: { type: Number, default: null },
  routePolyline: {
    type: [{ lat: Number, lng: Number }],
    default: [],
  },
  updateCount: { type: Number, default: 0, min: 0 },
  history: { type: [historyPointSchema], default: [] },
  retentionDays: { type: Number, default: 7, min: 1, max: 90 },
  shareTokenHash: { type: String, select: false },
  endReason: { type: String, maxlength: 200 },
});

liveTrackingSessionSchema.index({ jobId: 1, status: 1 });
liveTrackingSessionSchema.index({ technicianId: 1, status: 1 });
liveTrackingSessionSchema.index({ lastGeo: '2dsphere' });
liveTrackingSessionSchema.index({ endedAt: 1, retentionDays: 1 });

export const LiveTrackingSession = model<ILiveTrackingSession>(
  'LiveTrackingSession',
  liveTrackingSessionSchema,
);
