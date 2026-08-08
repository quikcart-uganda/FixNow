import { Schema, model, type Types } from 'mongoose';
import {
  createSchema,
  geoPointSchema,
  ugandaLocationSchema,
  type GeoPoint,
  type SoftDeleteFields,
  type TimestampFields,
  type UgandaLocation,
} from '../shared/base.js';
import {
  APPLICATION_STATUS,
  ASSIGNMENT_STATUS,
  JOB_STATUS,
  MEDIA_TYPE,
  type ApplicationStatus,
  type JobStatus,
} from '../shared/enums.js';

export type CategoryStatus = 'active' | 'suspended' | 'archived';

export interface ICategory extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  bannerImageUrl?: string;
  accentColor?: string;
  /** Public visibility mirror — false when suspended/archived. */
  isActive: boolean;
  status: CategoryStatus;
  sortOrder: number;
}

const categorySchema = createSchema<ICategory>({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 140 },
  icon: { type: String, maxlength: 64 },
  description: { type: String, maxlength: 1000 },
  bannerImageUrl: { type: String, maxlength: 500 },
  accentColor: { type: String, maxlength: 32 },
  isActive: { type: Boolean, default: true, index: true },
  status: {
    type: String,
    enum: ['active', 'suspended', 'archived'],
    default: 'active',
    index: true,
  },
  sortOrder: { type: Number, default: 0, index: true },
});

categorySchema.index({ name: 'text', description: 'text' });

export const Category = model<ICategory>('Category', categorySchema);

export interface ISubcategory extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

const subcategorySchema = createSchema<ISubcategory>({
  categoryId: { type: 'ObjectId', ref: 'Category', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 140 },
  description: { type: String, maxlength: 1000 },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
});

subcategorySchema.index({ categoryId: 1, slug: 1 }, { unique: true });

export const Subcategory = model<ISubcategory>('Subcategory', subcategorySchema);

export interface IJobStatusHistoryEntry {
  status: JobStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId;
  note?: string;
}

export interface IJobTimelineEvent {
  type: string;
  at: Date;
  actorId?: Types.ObjectId;
  payload?: Record<string, unknown>;
}

export interface IJob extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  customerProfileId?: Types.ObjectId;
  assignedTechnicianId?: Types.ObjectId;
  assignedTechnicianProfileId?: Types.ObjectId;
  assignmentId?: Types.ObjectId;
  title: string;
  description: string;
  categoryId?: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  categoryName?: string;
  subcategoryName?: string;
  status: JobStatus;
  statusHistory: IJobStatusHistoryEntry[];
  timeline: IJobTimelineEvent[];
  location?: UgandaLocation;
  geo?: GeoPoint;
  preferredDate?: Date;
  preferredTimeWindow?: { start?: string; end?: string };
  budgetMin?: number;
  budgetMax?: number;
  currency: string;
  applicationCount: number;
  photoUrls: string[];
  videoUrls: string[];
  aiMatchScore?: number;
  successPrediction?: number;
  trustIndicators?: {
    customerCompletedJobs?: number;
    customerRating?: number;
    riskFlags?: string[];
  };
  recommendedTechnicianIds: Types.ObjectId[];
  postedAt?: Date;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  archivedAt?: Date;
  cancelReason?: string;
  disputeReason?: string;
  searchText?: string;
  /**
   * Human-friendly public reference shown in UI/support.
   * Mongo `_id` remains the internal identifier.
   * Format: CAT-DIST-DDMMYY-HHMM-SEQ (e.g. PST-KLA-260726-0935-001)
   */
  publicJobReference?: string;
  /** Technician-submitted completion package while awaiting customer confirmation. */
  completionRequest?: {
    requestedAt: Date;
    requestedBy: Types.ObjectId;
    notes?: string;
    photoUrls: string[];
    materialsUsed?: string;
    completedAtEstimate?: Date;
    confirmedByTechnician: boolean;
  };
  /** Customer issue report that returned the job to in_progress. */
  completionIssue?: {
    reportedAt: Date;
    reportedBy: Types.ObjectId;
    category: string;
    description: string;
    photoUrls: string[];
    comments?: string;
  };
  /**
   * Idempotency flag: free completed-job quota was deducted for this job.
   * Set only when customer (or admin) confirms completion.
   */
  freeJobSlotConsumed?: boolean;
  freeJobConsumedAt?: Date;
  confirmedCompletedBy?: Types.ObjectId;
  metadata?: Record<string, unknown>;
}

const jobStatusHistorySchema = new Schema<IJobStatusHistoryEntry>(
  {
    status: { type: String, enum: Object.values(JOB_STATUS), required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const jobTimelineSchema = new Schema<IJobTimelineEvent>(
  {
    type: { type: String, required: true, maxlength: 80 },
    at: { type: Date, default: Date.now },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    payload: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const jobSchema = createSchema<IJob>({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerProfileId: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', index: true },
  assignedTechnicianId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  assignedTechnicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile' },
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 10000 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory', index: true },
  categoryName: { type: String, maxlength: 120 },
  subcategoryName: { type: String, maxlength: 120 },
  status: {
    type: String,
    enum: Object.values(JOB_STATUS),
    default: JOB_STATUS.DRAFT,
    index: true,
  },
  statusHistory: { type: [jobStatusHistorySchema], default: [] },
  timeline: { type: [jobTimelineSchema], default: [] },
  location: { type: ugandaLocationSchema },
  geo: { type: geoPointSchema },
  preferredDate: { type: Date, index: true },
  preferredTimeWindow: {
    start: { type: String, maxlength: 5 },
    end: { type: String, maxlength: 5 },
  },
  budgetMin: { type: Number, min: 0 },
  budgetMax: { type: Number, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  applicationCount: { type: Number, default: 0, min: 0 },
  photoUrls: { type: [String], default: [] },
  videoUrls: { type: [String], default: [] },
  aiMatchScore: { type: Number, min: 0, max: 100 },
  successPrediction: { type: Number, min: 0, max: 100 },
  trustIndicators: {
    customerCompletedJobs: { type: Number, min: 0 },
    customerRating: { type: Number, min: 0, max: 5 },
    riskFlags: { type: [String], default: [] },
  },
  recommendedTechnicianIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  postedAt: Date,
  assignedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  archivedAt: Date,
  cancelReason: { type: String, maxlength: 1000 },
  disputeReason: { type: String, maxlength: 1000 },
  searchText: { type: String, maxlength: 5000 },
  publicJobReference: { type: String, trim: true, uppercase: true, maxlength: 40 },
  completionRequest: {
    requestedAt: Date,
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, maxlength: 2000 },
    photoUrls: { type: [String], default: [] },
    materialsUsed: { type: String, maxlength: 1000 },
    completedAtEstimate: Date,
    confirmedByTechnician: { type: Boolean, default: false },
  },
  completionIssue: {
    reportedAt: Date,
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    category: { type: String, maxlength: 80 },
    description: { type: String, maxlength: 2000 },
    photoUrls: { type: [String], default: [] },
    comments: { type: String, maxlength: 2000 },
  },
  freeJobSlotConsumed: { type: Boolean, default: false, index: true },
  freeJobConsumedAt: Date,
  confirmedCompletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: Schema.Types.Mixed },
});

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ status: 1, 'location.district': 1, createdAt: -1 });
jobSchema.index({ customerId: 1, status: 1, createdAt: -1 });
jobSchema.index({ assignedTechnicianId: 1, status: 1 });
jobSchema.index({ categoryId: 1, status: 1 });
jobSchema.index({ publicJobReference: 1 }, { unique: true, sparse: true });
jobSchema.index({ geo: '2dsphere' });
jobSchema.index({ 'location.geo': '2dsphere' });
jobSchema.index({ title: 'text', description: 'text', searchText: 'text', categoryName: 'text' });
jobSchema.index({ aiMatchScore: -1 });
jobSchema.index({ preferredDate: 1, status: 1 });

export const Job = model<IJob>('Job', jobSchema);

export interface IJobAttachment extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  mediaType: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  caption?: string;
  sortOrder: number;
}

const jobAttachmentSchema = createSchema<IJobAttachment>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mediaType: { type: String, enum: Object.values(MEDIA_TYPE), required: true },
  url: { type: String, required: true, maxlength: 2048 },
  thumbnailUrl: { type: String, maxlength: 2048 },
  mimeType: { type: String, maxlength: 120 },
  sizeBytes: { type: Number, min: 0 },
  caption: { type: String, maxlength: 300 },
  sortOrder: { type: Number, default: 0 },
});

jobAttachmentSchema.index({ jobId: 1, sortOrder: 1 });

export const JobAttachment = model<IJobAttachment>('JobAttachment', jobAttachmentSchema);

export interface IJobApplication extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  technicianId: Types.ObjectId;
  technicianProfileId?: Types.ObjectId;
  message?: string;
  proposedAmount?: number;
  currency: string;
  estimatedHours?: number;
  availableFrom?: Date;
  status: ApplicationStatus;
  /** How the application was created — invite enables direct-hire UX. */
  source?: 'open_apply' | 'invite' | 'direct_booking';
  invitedAt?: Date;
  matchScore?: number;
  trustSnapshot?: {
    trust: number;
    ratingAverage: number;
    jobsCompleted: number;
  };
  respondedAt?: Date;
  withdrawnAt?: Date;
}

const jobApplicationSchema = createSchema<IJobApplication>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile' },
  message: { type: String, maxlength: 2000 },
  proposedAmount: { type: Number, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  estimatedHours: { type: Number, min: 0 },
  availableFrom: Date,
  status: {
    type: String,
    enum: Object.values(APPLICATION_STATUS),
    default: APPLICATION_STATUS.PENDING,
    index: true,
  },
  source: {
    type: String,
    enum: ['open_apply', 'invite', 'direct_booking'],
    default: 'open_apply',
    index: true,
  },
  invitedAt: Date,
  matchScore: { type: Number, min: 0, max: 100 },
  trustSnapshot: {
    trust: { type: Number, min: 0, max: 100 },
    ratingAverage: { type: Number, min: 0, max: 5 },
    jobsCompleted: { type: Number, min: 0 },
  },
  respondedAt: Date,
  withdrawnAt: Date,
});

jobApplicationSchema.index({ jobId: 1, technicianId: 1 }, { unique: true });
jobApplicationSchema.index({ technicianId: 1, status: 1, createdAt: -1 });
jobApplicationSchema.index({ jobId: 1, status: 1, matchScore: -1 });

export const JobApplication = model<IJobApplication>('JobApplication', jobApplicationSchema);

/** Legacy repository alias */
export type IApplication = IJobApplication;
export const Application = JobApplication;

export interface IAssignment extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  status: string;
  agreedAmount?: number;
  currency: string;
  assignedAt: Date;
  enRouteAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  notes?: string;
}

const assignmentSchema = createSchema<IAssignment>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'JobApplication' },
  status: {
    type: String,
    enum: Object.values(ASSIGNMENT_STATUS),
    default: ASSIGNMENT_STATUS.ACTIVE,
    index: true,
  },
  agreedAmount: { type: Number, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  assignedAt: { type: Date, default: Date.now },
  enRouteAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  notes: { type: String, maxlength: 1000 },
});

assignmentSchema.index({ technicianId: 1, status: 1, assignedAt: -1 });
assignmentSchema.index({ customerId: 1, status: 1 });

export const Assignment = model<IAssignment>('Assignment', assignmentSchema);
