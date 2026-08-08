import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface IReview extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  technicianProfileId?: Types.ObjectId;
  ratingId?: Types.ObjectId;
  overallRating: number;
  comment?: string;
  isPublic: boolean;
  isFlagged: boolean;
  moderatedBy?: Types.ObjectId;
  responseFromTechnician?: string;
  respondedAt?: Date;
}

const reviewSchema = createSchema<IReview>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, unique: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianProfileId: { type: Schema.Types.ObjectId, ref: 'TechnicianProfile' },
  ratingId: { type: Schema.Types.ObjectId, ref: 'Rating' },
  overallRating: { type: Number, required: true, min: 1, max: 5, index: true },
  comment: { type: String, maxlength: 3000 },
  isPublic: { type: Boolean, default: true, index: true },
  isFlagged: { type: Boolean, default: false, index: true },
  moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  responseFromTechnician: { type: String, maxlength: 2000 },
  respondedAt: Date,
});

reviewSchema.index({ technicianId: 1, createdAt: -1 });
reviewSchema.index({ technicianId: 1, overallRating: -1 });

export const Review = model<IReview>('Review', reviewSchema);

export interface IRating extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  reviewId?: Types.ObjectId;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  quality: number;
  professionalism: number;
  communication: number;
  timeliness: number;
  valueForMoney?: number;
  overall: number;
}

const ratingSchema = createSchema<IRating>({
  reviewId: { type: Schema.Types.ObjectId, ref: 'Review', unique: true, sparse: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, unique: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  quality: { type: Number, required: true, min: 1, max: 5 },
  professionalism: { type: Number, required: true, min: 1, max: 5 },
  communication: { type: Number, required: true, min: 1, max: 5 },
  timeliness: { type: Number, required: true, min: 1, max: 5 },
  valueForMoney: { type: Number, min: 1, max: 5 },
  overall: { type: Number, required: true, min: 1, max: 5, index: true },
});

ratingSchema.index({ technicianId: 1, overall: -1 });

export const Rating = model<IRating>('Rating', ratingSchema);
