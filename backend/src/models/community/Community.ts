import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const DISCUSSION_CATEGORIES = [
  'ask_technician',
  'diy_tips',
  'quick_advice',
  'local',
  'safety',
  'tools',
  'business',
  'general',
] as const;
export type DiscussionCategory = (typeof DISCUSSION_CATEGORIES)[number];

export const DISCUSSION_STATUSES = [
  'open',
  'locked',
  'archived',
  'removed',
  'pending_review',
] as const;

export interface IDiscussion extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  authorRole: 'technician' | 'customer' | 'admin';
  title: string;
  body: string;
  category: DiscussionCategory;
  tags: string[];
  district?: string;
  imageUrls: string[];
  videoUrls: string[];
  attachmentUrls: string[];
  status: (typeof DISCUSSION_STATUSES)[number];
  pinned: boolean;
  featured: boolean;
  replyCount: number;
  viewCount: number;
  likeCount: number;
  helpfulCount: number;
  participantCount: number;
  acceptedReplyId?: Types.ObjectId;
  lastActivityAt: Date;
  reportCount: number;
  moderatedByAdminId?: Types.ObjectId;
  moderationNote?: string;
}

const discussionSchema = createSchema<IDiscussion>({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorRole: { type: String, enum: ['technician', 'customer', 'admin'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 10000 },
  category: {
    type: String,
    enum: DISCUSSION_CATEGORIES,
    default: 'general',
    index: true,
  },
  tags: [{ type: String, maxlength: 40 }],
  district: { type: String, maxlength: 80, index: true },
  imageUrls: [{ type: String, maxlength: 2048 }],
  videoUrls: [{ type: String, maxlength: 2048 }],
  attachmentUrls: [{ type: String, maxlength: 2048 }],
  status: {
    type: String,
    enum: DISCUSSION_STATUSES,
    default: 'open',
    index: true,
  },
  pinned: { type: Boolean, default: false, index: true },
  featured: { type: Boolean, default: false, index: true },
  replyCount: { type: Number, default: 0, min: 0 },
  viewCount: { type: Number, default: 0, min: 0 },
  likeCount: { type: Number, default: 0, min: 0 },
  helpfulCount: { type: Number, default: 0, min: 0 },
  participantCount: { type: Number, default: 1, min: 0 },
  acceptedReplyId: { type: Schema.Types.ObjectId, ref: 'CommunityReply' },
  lastActivityAt: { type: Date, default: Date.now, index: true },
  reportCount: { type: Number, default: 0, min: 0 },
  moderatedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  moderationNote: { type: String, maxlength: 500 },
});

discussionSchema.index({ title: 'text', body: 'text', tags: 'text' });
discussionSchema.index({ status: 1, pinned: -1, lastActivityAt: -1 });

export const Discussion = model<IDiscussion>('Discussion', discussionSchema);

export interface ICommunityReply extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  discussionId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorRole: 'technician' | 'customer' | 'admin';
  parentReplyId?: Types.ObjectId;
  body: string;
  imageUrls: string[];
  attachmentUrls: string[];
  likeCount: number;
  helpfulCount: number;
  isAccepted: boolean;
  status: 'visible' | 'removed' | 'pending_review';
  mentionUserIds: Types.ObjectId[];
}

const communityReplySchema = createSchema<ICommunityReply>({
  discussionId: { type: Schema.Types.ObjectId, ref: 'Discussion', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorRole: { type: String, enum: ['technician', 'customer', 'admin'], required: true },
  parentReplyId: { type: Schema.Types.ObjectId, ref: 'CommunityReply', index: true },
  body: { type: String, required: true, maxlength: 8000 },
  imageUrls: [{ type: String, maxlength: 2048 }],
  attachmentUrls: [{ type: String, maxlength: 2048 }],
  likeCount: { type: Number, default: 0, min: 0 },
  helpfulCount: { type: Number, default: 0, min: 0 },
  isAccepted: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: ['visible', 'removed', 'pending_review'],
    default: 'visible',
    index: true,
  },
  mentionUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
});

communityReplySchema.index({ discussionId: 1, createdAt: 1 });

export const CommunityReply = model<ICommunityReply>('CommunityReply', communityReplySchema);

export interface ICommunityReaction extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: 'discussion' | 'reply';
  targetId: Types.ObjectId;
  kind: 'like' | 'helpful';
}

const communityReactionSchema = createSchema<ICommunityReaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['discussion', 'reply'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: ['like', 'helpful'], required: true },
});

communityReactionSchema.index(
  { userId: 1, targetType: 1, targetId: 1, kind: 1 },
  { unique: true },
);

export const CommunityReaction = model<ICommunityReaction>('CommunityReaction', communityReactionSchema);

/** Alias matching product naming */
export const Reaction = CommunityReaction;
export type IReaction = ICommunityReaction;
export const HelpfulVote = CommunityReaction;

export interface ICommunityBookmark extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  discussionId: Types.ObjectId;
}

const communityBookmarkSchema = createSchema<ICommunityBookmark>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  discussionId: { type: Schema.Types.ObjectId, ref: 'Discussion', required: true, index: true },
});

communityBookmarkSchema.index({ userId: 1, discussionId: 1 }, { unique: true });

export const CommunityBookmark = model<ICommunityBookmark>('CommunityBookmark', communityBookmarkSchema);
export const Bookmark = CommunityBookmark;
export type IBookmark = ICommunityBookmark;

export interface ICommunityFollow extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  followerId: Types.ObjectId;
  discussionId: Types.ObjectId;
}

const communityFollowSchema = createSchema<ICommunityFollow>({
  followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  discussionId: { type: Schema.Types.ObjectId, ref: 'Discussion', required: true, index: true },
});

communityFollowSchema.index({ followerId: 1, discussionId: 1 }, { unique: true });

export const CommunityFollow = model<ICommunityFollow>('CommunityFollow', communityFollowSchema);

export interface IModeratorAction extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  targetType: 'discussion' | 'reply' | 'portfolio_media' | 'certificate' | 'case_study';
  targetId: Types.ObjectId;
  action: string;
  note?: string;
  meta?: Record<string, unknown>;
}

const moderatorActionSchema = createSchema<IModeratorAction>({
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: {
    type: String,
    enum: ['discussion', 'reply', 'portfolio_media', 'certificate', 'case_study'],
    required: true,
    index: true,
  },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  action: { type: String, required: true, maxlength: 60, index: true },
  note: { type: String, maxlength: 1000 },
  meta: { type: Schema.Types.Mixed },
});

export const ModeratorAction = model<IModeratorAction>('ModeratorAction', moderatorActionSchema);

export interface ICommunityReport extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  reporterId: Types.ObjectId;
  targetType: 'discussion' | 'reply';
  targetId: Types.ObjectId;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedByAdminId?: Types.ObjectId;
}

const communityReportSchema = createSchema<ICommunityReport>({
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['discussion', 'reply'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
  resolvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
});

export const CommunityReport = model<ICommunityReport>('CommunityReport', communityReportSchema);
