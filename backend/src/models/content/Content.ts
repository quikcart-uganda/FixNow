import { model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const CONTENT_CATEGORIES = [
  'legal',
  'support',
  'public',
  'authentication',
  'account',
  'system',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_STATUSES = ['draft', 'published', 'scheduled', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_AUDIENCES = ['all', 'customer', 'technician', 'admin'] as const;
export type ContentAudience = (typeof CONTENT_AUDIENCES)[number];

export interface ContentAttachment {
  name: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ContentRevision {
  version: number;
  title: string;
  bodyHtml: string;
  bodyMarkdown?: string;
  status: ContentStatus;
  snapshotAt: Date;
  actorId?: Types.ObjectId;
  note?: string;
}

export interface IContentPage extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  category: ContentCategory;
  audience: ContentAudience;
  bodyHtml: string;
  bodyMarkdown?: string;
  excerpt?: string;
  heroImageUrl?: string;
  attachments: ContentAttachment[];
  seoTitle?: string;
  seoDescription?: string;
  keywords: string[];
  language: string;
  status: ContentStatus;
  version: number;
  scheduledPublishAt?: Date | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  publishedBy?: Types.ObjectId;
  sortOrder: number;
  isSystem: boolean;
  revisionHistory: ContentRevision[];
}

const attachmentSchema = {
  name: { type: String, required: true, trim: true, maxlength: 200 },
  url: { type: String, required: true, trim: true, maxlength: 2000 },
  mimeType: { type: String, trim: true, maxlength: 120 },
  sizeBytes: { type: Number, min: 0 },
};

const revisionSchema = {
  version: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, maxlength: 200 },
  bodyHtml: { type: String, required: true },
  bodyMarkdown: { type: String },
  status: { type: String, enum: CONTENT_STATUSES, required: true },
  snapshotAt: { type: Date, required: true },
  actorId: { type: 'ObjectId', ref: 'User' },
  note: { type: String, maxlength: 500 },
};

const contentPageSchema = createSchema<IContentPage>({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 120,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug'],
  },
  category: { type: String, enum: CONTENT_CATEGORIES, required: true, index: true },
  audience: { type: String, enum: CONTENT_AUDIENCES, default: 'all', index: true },
  bodyHtml: { type: String, required: true, default: '' },
  bodyMarkdown: { type: String },
  excerpt: { type: String, trim: true, maxlength: 500 },
  heroImageUrl: { type: String, trim: true, maxlength: 2000 },
  attachments: { type: [attachmentSchema], default: [] },
  seoTitle: { type: String, trim: true, maxlength: 160 },
  seoDescription: { type: String, trim: true, maxlength: 320 },
  keywords: { type: [String], default: [] },
  language: { type: String, default: 'en', lowercase: true, trim: true, maxlength: 12, index: true },
  status: { type: String, enum: CONTENT_STATUSES, default: 'draft', index: true },
  version: { type: Number, default: 1, min: 1 },
  scheduledPublishAt: { type: Date, default: null, index: true },
  publishedAt: { type: Date, default: null, index: true },
  archivedAt: { type: Date, default: null },
  createdBy: { type: 'ObjectId', ref: 'User' },
  updatedBy: { type: 'ObjectId', ref: 'User' },
  publishedBy: { type: 'ObjectId', ref: 'User' },
  sortOrder: { type: Number, default: 0 },
  isSystem: { type: Boolean, default: false },
  revisionHistory: { type: [revisionSchema], default: [] },
});

contentPageSchema.index({ slug: 1, language: 1 }, { unique: true });
contentPageSchema.index({ category: 1, status: 1, audience: 1 });
contentPageSchema.index({ status: 1, scheduledPublishAt: 1 });
contentPageSchema.index({ title: 'text', excerpt: 'text', keywords: 'text', bodyMarkdown: 'text' });

export const ContentPage = model<IContentPage>('ContentPage', contentPageSchema);

export const DELETION_REQUEST_STATUSES = [
  'pending',
  'cooling_off',
  'processing',
  'completed',
  'cancelled',
  'rejected',
] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export interface IAccountDeletionRequest extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'customer' | 'technician' | 'admin';
  status: DeletionRequestStatus;
  confirmPhrase: string;
  reason?: string;
  policySlug: string;
  policyVersion: number;
  coolingOffEndsAt?: Date | null;
  processedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  reviewedBy?: Types.ObjectId;
  reviewNote?: string;
  retainedSummary?: string[];
  deletedSummary?: string[];
  ipAddress?: string;
  userAgent?: string;
}

const deletionRequestSchema = createSchema<IAccountDeletionRequest>({
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  role: { type: String, enum: ['customer', 'technician', 'admin'], required: true },
  status: { type: String, enum: DELETION_REQUEST_STATUSES, default: 'pending', index: true },
  confirmPhrase: { type: String, required: true, maxlength: 64 },
  reason: { type: String, trim: true, maxlength: 1000 },
  policySlug: { type: String, default: 'delete-account', maxlength: 120 },
  policyVersion: { type: Number, default: 1, min: 1 },
  coolingOffEndsAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  reviewedBy: { type: 'ObjectId', ref: 'User' },
  reviewNote: { type: String, maxlength: 1000 },
  retainedSummary: { type: [String], default: [] },
  deletedSummary: { type: [String], default: [] },
  ipAddress: { type: String, maxlength: 45 },
  userAgent: { type: String, maxlength: 500 },
});

deletionRequestSchema.index({ userId: 1, status: 1 });
deletionRequestSchema.index({ createdAt: -1 });

export const AccountDeletionRequest = model<IAccountDeletionRequest>(
  'AccountDeletionRequest',
  deletionRequestSchema,
);
