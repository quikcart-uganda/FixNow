import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import { MEDIA_TYPE } from '../shared/enums.js';

export const PORTFOLIO_ITEM_KIND = [
  'photo',
  'video',
  'before_after',
  'certificate',
  'licence',
  'case_study',
] as const;
export type PortfolioItemKind = (typeof PORTFOLIO_ITEM_KIND)[number];

export const PORTFOLIO_VISIBILITY = ['public', 'private'] as const;
export const PORTFOLIO_ITEM_STATUS = ['active', 'archived', 'pending_review', 'rejected'] as const;

export interface IPortfolio extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  technicianProfileId: Types.ObjectId;
  title: string;
  summary?: string;
  isPublic: boolean;
  coverMediaId?: Types.ObjectId;
  albumIds: Types.ObjectId[];
  itemCount: number;
}

const portfolioSchema = createSchema<IPortfolio>({
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  technicianProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'TechnicianProfile',
    required: true,
    unique: true,
  },
  title: { type: String, required: true, maxlength: 160 },
  summary: { type: String, maxlength: 2000 },
  isPublic: { type: Boolean, default: true, index: true },
  coverMediaId: { type: Schema.Types.ObjectId, ref: 'PortfolioMedia' },
  albumIds: [{ type: Schema.Types.ObjectId, ref: 'PortfolioAlbum' }],
  itemCount: { type: Number, default: 0, min: 0 },
});

export const Portfolio = model<IPortfolio>('Portfolio', portfolioSchema);

export interface IPortfolioAlbum extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  name: string;
  description?: string;
  categoryId?: Types.ObjectId;
  sortOrder: number;
  mediaCount: number;
}

const portfolioAlbumSchema = createSchema<IPortfolioAlbum>({
  portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 1000 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
  sortOrder: { type: Number, default: 0 },
  mediaCount: { type: Number, default: 0, min: 0 },
});

portfolioAlbumSchema.index({ portfolioId: 1, sortOrder: 1 });

export const PortfolioAlbum = model<IPortfolioAlbum>('PortfolioAlbum', portfolioAlbumSchema);

export interface IPortfolioMedia extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  albumId?: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  mediaType: string;
  /** Semantic kind for filters (photo, video, certificate, …). */
  kind: PortfolioItemKind;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  caption?: string;
  description?: string;
  tags: string[];
  categoryId?: Types.ObjectId;
  district?: string;
  completionDate?: Date;
  customerPermission: boolean;
  visibility: 'public' | 'private';
  featured: boolean;
  status: 'active' | 'archived' | 'pending_review' | 'rejected';
  beforeAfter?: 'before' | 'after' | 'none';
  galleryUrls: string[];
  videoUrl?: string;
  sortOrder: number;
  moderationNote?: string;
  moderatedByAdminId?: Types.ObjectId;
  moderatedAt?: Date;
}

const portfolioMediaSchema = createSchema<IPortfolioMedia>({
  portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  albumId: { type: Schema.Types.ObjectId, ref: 'PortfolioAlbum', index: true },
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaType: { type: String, enum: Object.values(MEDIA_TYPE), required: true },
  kind: {
    type: String,
    enum: PORTFOLIO_ITEM_KIND,
    default: 'photo',
    index: true,
  },
  url: { type: String, required: true, maxlength: 2048 },
  thumbnailUrl: { type: String, maxlength: 2048 },
  title: { type: String, maxlength: 160 },
  caption: { type: String, maxlength: 500 },
  description: { type: String, maxlength: 4000 },
  tags: [{ type: String, maxlength: 40 }],
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  district: { type: String, maxlength: 80 },
  completionDate: Date,
  customerPermission: { type: Boolean, default: false },
  visibility: { type: String, enum: PORTFOLIO_VISIBILITY, default: 'public', index: true },
  featured: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: PORTFOLIO_ITEM_STATUS,
    default: 'active',
    index: true,
  },
  beforeAfter: { type: String, enum: ['before', 'after', 'none'], default: 'none' },
  galleryUrls: [{ type: String, maxlength: 2048 }],
  videoUrl: { type: String, maxlength: 2048 },
  sortOrder: { type: Number, default: 0 },
  moderationNote: { type: String, maxlength: 500 },
  moderatedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
});

portfolioMediaSchema.index({ portfolioId: 1, sortOrder: 1 });
portfolioMediaSchema.index({ technicianUserId: 1, kind: 1, status: 1 });
portfolioMediaSchema.index({ title: 'text', caption: 'text', description: 'text', tags: 'text' });

export const PortfolioMedia = model<IPortfolioMedia>('PortfolioMedia', portfolioMediaSchema);

/** Legacy alias used by older portfolio routes layer */
export type IPortfolioItem = IPortfolioMedia;
export const PortfolioItem = PortfolioMedia;

export interface ICaseStudy extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  jobId?: Types.ObjectId;
  title: string;
  challenge: string;
  solution: string;
  outcome?: string;
  categoryId?: Types.ObjectId;
  mediaIds: Types.ObjectId[];
  coverImageUrl?: string;
  tags: string[];
  district?: string;
  completionDate?: Date;
  customerPermission: boolean;
  visibility: 'public' | 'private';
  featured: boolean;
  status: 'active' | 'archived' | 'pending_review' | 'rejected';
  isPublished: boolean;
  publishedAt?: Date;
  sortOrder: number;
}

const caseStudySchema = createSchema<ICaseStudy>({
  portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
  title: { type: String, required: true, maxlength: 160 },
  challenge: { type: String, required: true, maxlength: 4000 },
  solution: { type: String, required: true, maxlength: 4000 },
  outcome: { type: String, maxlength: 2000 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
  mediaIds: [{ type: Schema.Types.ObjectId, ref: 'PortfolioMedia' }],
  coverImageUrl: { type: String, maxlength: 2048 },
  tags: [{ type: String, maxlength: 40 }],
  district: { type: String, maxlength: 80 },
  completionDate: Date,
  customerPermission: { type: Boolean, default: false },
  visibility: { type: String, enum: PORTFOLIO_VISIBILITY, default: 'public', index: true },
  featured: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: PORTFOLIO_ITEM_STATUS,
    default: 'active',
    index: true,
  },
  isPublished: { type: Boolean, default: false, index: true },
  publishedAt: Date,
  sortOrder: { type: Number, default: 0 },
});

caseStudySchema.index({ technicianUserId: 1, isPublished: 1, createdAt: -1 });

export const CaseStudy = model<ICaseStudy>('CaseStudy', caseStudySchema);

export interface ICertificate extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  technicianUserId: Types.ObjectId;
  title: string;
  issuer?: string;
  kind: 'certificate' | 'licence';
  documentUrl: string;
  thumbnailUrl?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  description?: string;
  visibility: 'public' | 'private';
  featured: boolean;
  status: 'active' | 'archived' | 'pending_review' | 'rejected';
  moderationNote?: string;
  moderatedByAdminId?: Types.ObjectId;
  moderatedAt?: Date;
  sortOrder: number;
}

const certificateSchema = createSchema<ICertificate>({
  portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  technicianUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 160 },
  issuer: { type: String, maxlength: 160 },
  kind: { type: String, enum: ['certificate', 'licence'], default: 'certificate', index: true },
  documentUrl: { type: String, required: true, maxlength: 2048 },
  thumbnailUrl: { type: String, maxlength: 2048 },
  issuedAt: Date,
  expiresAt: Date,
  description: { type: String, maxlength: 2000 },
  visibility: { type: String, enum: PORTFOLIO_VISIBILITY, default: 'public', index: true },
  featured: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: PORTFOLIO_ITEM_STATUS,
    default: 'pending_review',
    index: true,
  },
  moderationNote: { type: String, maxlength: 500 },
  moderatedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
  sortOrder: { type: Number, default: 0 },
});

certificateSchema.index({ technicianUserId: 1, kind: 1, status: 1 });

export const Certificate = model<ICertificate>('Certificate', certificateSchema);
