import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

/**
 * Technician → customer review for a completed job.
 * Separate from Review/Rating (customer → technician) which keep unique jobId constraints.
 */
export interface IPeerReview extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  revieweeId: Types.ObjectId;
  direction: 'technician_to_customer';
  overallRating: number;
  professionalism?: number;
  communication?: number;
  punctuality?: number;
  comment?: string;
  isPublic: boolean;
  isFlagged: boolean;
  moderatedBy?: Types.ObjectId;
  editedAt?: Date;
}

const peerReviewSchema = createSchema<IPeerReview>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  revieweeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  direction: { type: String, enum: ['technician_to_customer'], default: 'technician_to_customer' },
  overallRating: { type: Number, required: true, min: 1, max: 5, index: true },
  professionalism: { type: Number, min: 1, max: 5 },
  communication: { type: Number, min: 1, max: 5 },
  punctuality: { type: Number, min: 1, max: 5 },
  comment: { type: String, maxlength: 3000 },
  isPublic: { type: Boolean, default: true, index: true },
  isFlagged: { type: Boolean, default: false, index: true },
  moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  editedAt: Date,
});

peerReviewSchema.index({ jobId: 1, reviewerId: 1 }, { unique: true });
peerReviewSchema.index({ revieweeId: 1, createdAt: -1 });

export const PeerReview = model<IPeerReview>('PeerReview', peerReviewSchema);
