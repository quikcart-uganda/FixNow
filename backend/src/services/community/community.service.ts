import type { Request } from 'express';
import { type HydratedDocument, Types } from 'mongoose';
import {
  CommunityBookmark,
  CommunityFollow,
  CommunityReaction,
  CommunityReply,
  CommunityReport,
  Discussion,
  ModeratorAction,
  type IDiscussion,
  type ICommunityReply,
} from '../../models/community/Community.js';
import { User } from '../../models/auth/User.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';

type AuthorRole = 'technician' | 'customer' | 'admin';
type ReactionKind = 'like' | 'helpful';
type ReactionTarget = 'discussion' | 'reply';
type ReportTarget = 'discussion' | 'reply';
type ModerateTarget = 'discussion' | 'reply';

type DiscussionWriteBody = {
  title?: string;
  body?: string;
  category?: IDiscussion['category'];
  tags?: string[];
  district?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  attachmentUrls?: string[];
};

type DiscussionCreateBody = DiscussionWriteBody & {
  title: string;
  body: string;
};

type ReplyWriteBody = {
  parentReplyId?: string;
  body?: string;
  images?: string[];
  attachments?: string[];
  mentionUserIds?: string[];
};

type ReplyCreateBody = ReplyWriteBody & {
  body: string;
};

type ModerateInput = {
  targetType: ModerateTarget;
  targetId: string;
  action: 'approve' | 'remove' | 'lock' | 'pin' | 'unpin' | 'feature' | 'archive' | 'unlock';
  note?: string;
};

function oid(id: string, label = 'id'): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw AppError.badRequest(`Invalid ${label}`);
  return new Types.ObjectId(id);
}

function toAuthorRole(role: string): AuthorRole {
  if (role === ROLES.ADMIN) return 'admin';
  if (role === ROLES.TECHNICIAN) return 'technician';
  if (role === ROLES.CUSTOMER) return 'customer';
  throw AppError.badRequest('Invalid role');
}

function discussionHref(discussionId: string): string {
  return `/technician/community/${discussionId}`;
}

async function loadAuthorNames(authorIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(authorIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('_id fullName');
  return new Map(users.map((u) => [u._id.toString(), u.fullName]));
}

function serializeDiscussion(
  doc: IDiscussion,
  authorName?: string,
  viewer?: { bookmarked?: boolean; following?: boolean; liked?: boolean },
) {
  return {
    id: doc._id.toString(),
    authorId: doc.authorId.toString(),
    authorName: authorName ?? undefined,
    authorRole: doc.authorRole,
    title: doc.title,
    body: doc.body,
    category: doc.category,
    tags: doc.tags,
    district: doc.district,
    imageUrls: doc.imageUrls,
    videoUrls: doc.videoUrls,
    attachmentUrls: doc.attachmentUrls,
    status: doc.status,
    pinned: doc.pinned,
    featured: doc.featured,
    replyCount: doc.replyCount,
    viewCount: doc.viewCount,
    likeCount: doc.likeCount,
    helpfulCount: doc.helpfulCount,
    participantCount: doc.participantCount,
    acceptedReplyId: doc.acceptedReplyId?.toString(),
    lastActivityAt: doc.lastActivityAt,
    reportCount: doc.reportCount,
    moderatedByAdminId: doc.moderatedByAdminId?.toString(),
    moderationNote: doc.moderationNote,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    viewer: viewer
      ? {
          bookmarked: viewer.bookmarked ?? false,
          following: viewer.following ?? false,
          liked: viewer.liked ?? false,
        }
      : undefined,
  };
}

function serializeReply(doc: ICommunityReply, authorName?: string) {
  return {
    id: doc._id.toString(),
    discussionId: doc.discussionId.toString(),
    authorId: doc.authorId.toString(),
    authorName: authorName ?? undefined,
    authorRole: doc.authorRole,
    parentReplyId: doc.parentReplyId?.toString(),
    body: doc.body,
    imageUrls: doc.imageUrls,
    attachmentUrls: doc.attachmentUrls,
    likeCount: doc.likeCount,
    helpfulCount: doc.helpfulCount,
    isAccepted: doc.isAccepted,
    status: doc.status,
    mentionUserIds: doc.mentionUserIds.map((id) => id.toString()),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function getDiscussionOrThrow(id: string): Promise<HydratedDocument<IDiscussion>> {
  const discussion = await Discussion.findById(id);
  if (!discussion) throw AppError.notFound('Discussion not found');
  return discussion;
}

async function assertDiscussionAuthor(userId: string, discussion: IDiscussion): Promise<void> {
  if (discussion.authorId.toString() !== userId) {
    throw AppError.forbidden('Only the discussion author can perform this action');
  }
}

async function assertReplyAuthor(userId: string, reply: ICommunityReply): Promise<void> {
  if (reply.authorId.toString() !== userId) {
    throw AppError.forbidden('Only the reply author can perform this action');
  }
}

async function recalculateParticipantCount(discussionId: Types.ObjectId): Promise<number> {
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) return 0;

  const replyAuthors = await CommunityReply.distinct('authorId', {
    discussionId,
    status: 'visible',
  });
  const authorIds = new Set(replyAuthors.map((id) => id.toString()));
  authorIds.add(discussion.authorId.toString());
  const count = authorIds.size;
  discussion.participantCount = count;
  await discussion.save();
  return count;
}

async function incrementTargetCount(
  targetType: ReactionTarget,
  targetId: Types.ObjectId,
  kind: ReactionKind,
  delta: 1 | -1,
): Promise<void> {
  const field = kind === 'like' ? 'likeCount' : 'helpfulCount';
  if (targetType === 'discussion') {
    await Discussion.updateOne({ _id: targetId }, { $inc: { [field]: delta } });
  } else {
    await CommunityReply.updateOne({ _id: targetId }, { $inc: { [field]: delta } });
  }
}

async function getViewerFlags(userId: string | undefined, discussionId: string) {
  if (!userId) {
    return { bookmarked: false, following: false, liked: false };
  }

  const [bookmark, follow, like] = await Promise.all([
    CommunityBookmark.findOne({ userId: oid(userId), discussionId: oid(discussionId) }),
    CommunityFollow.findOne({ followerId: oid(userId), discussionId: oid(discussionId) }),
    CommunityReaction.findOne({
      userId: oid(userId),
      targetType: 'discussion',
      targetId: oid(discussionId),
      kind: 'like',
    }),
  ]);

  return {
    bookmarked: Boolean(bookmark),
    following: Boolean(follow),
    liked: Boolean(like),
  };
}

async function notifyReplyParticipants(input: {
  discussion: IDiscussion;
  reply: ICommunityReply;
  replierId: string;
  mentionUserIds: string[];
}): Promise<void> {
  const { discussion, reply, replierId, mentionUserIds } = input;
  const discussionId = discussion._id.toString();
  const href = discussionHref(discussionId);
  const notifyIds = new Set<string>();

  const authorId = discussion.authorId.toString();
  if (authorId !== replierId) notifyIds.add(authorId);

  for (const mentionId of mentionUserIds) {
    if (mentionId && mentionId !== replierId) notifyIds.add(mentionId);
  }

  const followers = await CommunityFollow.find({ discussionId: discussion._id }).select('followerId');
  for (const follow of followers) {
    const followerId = follow.followerId.toString();
    if (followerId !== replierId) notifyIds.add(followerId);
  }

  const title = 'New community reply';
  const body = `Someone replied to "${discussion.title.slice(0, 120)}"`;

  await Promise.all(
    [...notifyIds].map((userId) =>
      createDbNotification({
        userId,
        type: 'community.reply',
        title,
        body,
        href,
        meta: {
          discussionId,
          replyId: reply._id.toString(),
        },
      }),
    ),
  );
}

export const communityService = {
  async list(req: Request, viewerId?: string) {
    const { page, limit, skip } = parsePagination(req);
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim();
    const tag = String(req.query.tag || '').trim();
    const district = String(req.query.district || '').trim();
    const status = String(req.query.status || 'open').trim();

    const filter: Record<string, unknown> = { status };
    if (category) filter.category = category;
    if (district) filter.district = district;
    if (tag) filter.tags = tag;
    if (q) {
      filter.$text = { $search: q };
    }

    const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> = q
      ? { score: { $meta: 'textScore' }, pinned: -1, lastActivityAt: -1 }
      : { pinned: -1, lastActivityAt: -1 };

    const [total, rows] = await Promise.all([
      Discussion.countDocuments(filter),
      Discussion.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit),
    ]);

    const authorIds = rows.map((row) => row.authorId.toString());
    const authorNames = await loadAuthorNames(authorIds);

    let viewerFlags = new Map<string, { bookmarked: boolean; following: boolean; liked: boolean }>();
    if (viewerId) {
      const discussionIds = rows.map((row) => row._id);
      const userOid = oid(viewerId);
      const [bookmarks, follows, likes] = await Promise.all([
        CommunityBookmark.find({ userId: userOid, discussionId: { $in: discussionIds } }).select(
          'discussionId',
        ),
        CommunityFollow.find({ followerId: userOid, discussionId: { $in: discussionIds } }).select(
          'discussionId',
        ),
        CommunityReaction.find({
          userId: userOid,
          targetType: 'discussion',
          targetId: { $in: discussionIds },
          kind: 'like',
        }).select('targetId'),
      ]);

      const bookmarked = new Set(bookmarks.map((b) => b.discussionId.toString()));
      const following = new Set(follows.map((f) => f.discussionId.toString()));
      const liked = new Set(likes.map((l) => l.targetId.toString()));

      viewerFlags = new Map(
        rows.map((row) => {
          const id = row._id.toString();
          return [
            id,
            {
              bookmarked: bookmarked.has(id),
              following: following.has(id),
              liked: liked.has(id),
            },
          ];
        }),
      );
    }

    const items = rows.map((row) => {
      const id = row._id.toString();
      return serializeDiscussion(
        row,
        authorNames.get(row.authorId.toString()),
        viewerId ? viewerFlags.get(id) : undefined,
      );
    });

    return { items, meta: paginationMeta(total, page, limit) };
  },

  async get(id: string, viewerId?: string) {
    const discussion = await getDiscussionOrThrow(id);

    await Discussion.updateOne({ _id: discussion._id }, { $inc: { viewCount: 1 } });
    discussion.viewCount += 1;

    const [authorNames, viewer, acceptedReply] = await Promise.all([
      loadAuthorNames([discussion.authorId.toString()]),
      getViewerFlags(viewerId, id),
      discussion.acceptedReplyId
        ? CommunityReply.findById(discussion.acceptedReplyId)
        : Promise.resolve(null),
    ]);

    let acceptedReplySummary: ReturnType<typeof serializeReply> | undefined;
    if (acceptedReply && acceptedReply.status === 'visible') {
      const replyAuthorNames = await loadAuthorNames([acceptedReply.authorId.toString()]);
      acceptedReplySummary = serializeReply(
        acceptedReply,
        replyAuthorNames.get(acceptedReply.authorId.toString()),
      );
    }

    return {
      discussion: serializeDiscussion(
        discussion,
        authorNames.get(discussion.authorId.toString()),
        viewer,
      ),
      acceptedReply: acceptedReplySummary,
    };
  },

  async create(userId: string, role: string, body: DiscussionCreateBody) {
    const authorRole = toAuthorRole(role);
    const discussion = await Discussion.create({
      authorId: oid(userId),
      authorRole,
      title: body.title.trim(),
      body: body.body.trim(),
      category: body.category ?? 'general',
      tags: body.tags ?? [],
      district: body.district?.trim(),
      imageUrls: body.imageUrls ?? [],
      videoUrls: body.videoUrls ?? [],
      attachmentUrls: body.attachmentUrls ?? [],
      status: 'open',
      participantCount: 1,
      lastActivityAt: new Date(),
    });

    const authorNames = await loadAuthorNames([userId]);
    return serializeDiscussion(discussion, authorNames.get(userId));
  },

  async update(userId: string, id: string, body: DiscussionWriteBody) {
    const discussion = await getDiscussionOrThrow(id);
    await assertDiscussionAuthor(userId, discussion);

    if (discussion.status === 'locked' || discussion.status === 'archived') {
      throw AppError.badRequest('Discussion cannot be edited in its current state');
    }

    if (body.title !== undefined) discussion.title = body.title.trim();
    if (body.body !== undefined) discussion.body = body.body.trim();
    if (body.category !== undefined) discussion.category = body.category;
    if (body.tags !== undefined) discussion.tags = body.tags;
    if (body.district !== undefined) discussion.district = body.district?.trim();
    if (body.imageUrls !== undefined) discussion.imageUrls = body.imageUrls;
    if (body.videoUrls !== undefined) discussion.videoUrls = body.videoUrls;
    if (body.attachmentUrls !== undefined) discussion.attachmentUrls = body.attachmentUrls;
    discussion.lastActivityAt = new Date();

    await discussion.save();

    const authorNames = await loadAuthorNames([discussion.authorId.toString()]);
    return serializeDiscussion(discussion, authorNames.get(discussion.authorId.toString()));
  },

  async remove(userId: string, id: string) {
    const discussion = await getDiscussionOrThrow(id);
    await assertDiscussionAuthor(userId, discussion);

    discussion.status = 'removed';
    discussion.isDeleted = true;
    discussion.deletedAt = new Date();
    await discussion.save();

    return { id: discussion._id.toString(), removed: true };
  },

  async listReplies(discussionId: string, req: Request) {
    await getDiscussionOrThrow(discussionId);

    const { page, limit, skip } = parsePagination(req);
    const filter = {
      discussionId: oid(discussionId),
      status: 'visible' as const,
    };

    const [total, rows] = await Promise.all([
      CommunityReply.countDocuments(filter),
      CommunityReply.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit),
    ]);

    const authorNames = await loadAuthorNames(rows.map((row) => row.authorId.toString()));
    const items = rows.map((row) =>
      serializeReply(row, authorNames.get(row.authorId.toString())),
    );

    return { items, meta: paginationMeta(total, page, limit) };
  },

  async createReply(userId: string, role: string, discussionId: string, body: ReplyCreateBody) {
    const discussion = await getDiscussionOrThrow(discussionId);
    if (discussion.status !== 'open') {
      throw AppError.badRequest('Replies are not allowed on this discussion');
    }

    const authorRole = toAuthorRole(role);
    let parentReplyId: Types.ObjectId | undefined;
    if (body.parentReplyId) {
      const parent = await CommunityReply.findOne({
        _id: oid(body.parentReplyId),
        discussionId: discussion._id,
        status: 'visible',
      });
      if (!parent) throw AppError.badRequest('Parent reply not found');
      parentReplyId = parent._id;
    }

    const mentionUserIds = (body.mentionUserIds ?? [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => oid(id));

    const reply = await CommunityReply.create({
      discussionId: discussion._id,
      authorId: oid(userId),
      authorRole,
      parentReplyId,
      body: body.body.trim(),
      imageUrls: body.images ?? [],
      attachmentUrls: body.attachments ?? [],
      mentionUserIds,
      status: 'visible',
    });

    discussion.replyCount += 1;
    discussion.lastActivityAt = new Date();
    await discussion.save();
    await recalculateParticipantCount(discussion._id);

    await notifyReplyParticipants({
      discussion,
      reply,
      replierId: userId,
      mentionUserIds: mentionUserIds.map((id) => id.toString()),
    });

    const authorNames = await loadAuthorNames([userId]);
    return serializeReply(reply, authorNames.get(userId));
  },

  async updateReply(userId: string, replyId: string, body: ReplyWriteBody) {
    const reply = await CommunityReply.findById(replyId);
    if (!reply || reply.status === 'removed') throw AppError.notFound('Reply not found');
    await assertReplyAuthor(userId, reply);

    const discussion = await getDiscussionOrThrow(reply.discussionId.toString());
    if (discussion.status === 'locked' || discussion.status === 'archived') {
      throw AppError.badRequest('Reply cannot be edited on this discussion');
    }

    if (body.body !== undefined) reply.body = body.body.trim();
    if (body.images !== undefined) reply.imageUrls = body.images;
    if (body.attachments !== undefined) reply.attachmentUrls = body.attachments;
    if (body.mentionUserIds !== undefined) {
      reply.mentionUserIds = body.mentionUserIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => oid(id));
    }

    await reply.save();
    await Discussion.updateOne({ _id: reply.discussionId }, { lastActivityAt: new Date() });

    const authorNames = await loadAuthorNames([reply.authorId.toString()]);
    return serializeReply(reply, authorNames.get(reply.authorId.toString()));
  },

  async removeReply(userId: string, replyId: string) {
    const reply = await CommunityReply.findById(replyId);
    if (!reply || reply.status === 'removed') throw AppError.notFound('Reply not found');
    await assertReplyAuthor(userId, reply);

    reply.status = 'removed';
    reply.isDeleted = true;
    reply.deletedAt = new Date();
    if (reply.isAccepted) reply.isAccepted = false;
    await reply.save();

    const discussion = await getDiscussionOrThrow(reply.discussionId.toString());
    discussion.replyCount = Math.max(0, discussion.replyCount - 1);
    if (discussion.acceptedReplyId?.toString() === replyId) {
      discussion.acceptedReplyId = undefined;
    }
    discussion.lastActivityAt = new Date();
    await discussion.save();
    await recalculateParticipantCount(discussion._id);

    return { id: reply._id.toString(), removed: true };
  },

  async react(userId: string, targetType: ReactionTarget, targetId: string, kind: ReactionKind) {
    const targetOid = oid(targetId);
    const userOid = oid(userId);

    if (targetType === 'discussion') {
      const discussion = await Discussion.findById(targetId);
      if (!discussion) throw AppError.notFound('Discussion not found');
    } else {
      const reply = await CommunityReply.findById(targetId);
      if (!reply || reply.status === 'removed') throw AppError.notFound('Reply not found');
    }

    const existing = await CommunityReaction.findOne({
      userId: userOid,
      targetType,
      targetId: targetOid,
      kind,
    }).setOptions({ withDeleted: true });

    let active: boolean;

    if (existing && !existing.isDeleted) {
      existing.isDeleted = true;
      existing.deletedAt = new Date();
      await existing.save();
      await incrementTargetCount(targetType, targetOid, kind, -1);
      active = false;
    } else if (existing && existing.isDeleted) {
      existing.isDeleted = false;
      existing.deletedAt = null;
      await existing.save();
      await incrementTargetCount(targetType, targetOid, kind, 1);
      active = true;
    } else {
      await CommunityReaction.create({
        userId: userOid,
        targetType,
        targetId: targetOid,
        kind,
      });
      await incrementTargetCount(targetType, targetOid, kind, 1);
      active = true;
    }

    const updated =
      targetType === 'discussion'
        ? await Discussion.findById(targetId).select('likeCount helpfulCount')
        : await CommunityReply.findById(targetId).select('likeCount helpfulCount');
    const counts = {
      likeCount: updated?.likeCount ?? 0,
      helpfulCount: updated?.helpfulCount ?? 0,
    };

    return { targetType, targetId, kind, active, ...counts };
  },

  async acceptReply(userId: string, discussionId: string, replyId: string) {
    const discussion = await getDiscussionOrThrow(discussionId);
    await assertDiscussionAuthor(userId, discussion);

    const reply = await CommunityReply.findOne({
      _id: oid(replyId),
      discussionId: discussion._id,
      status: 'visible',
    });
    if (!reply) throw AppError.notFound('Reply not found');

    if (discussion.acceptedReplyId && discussion.acceptedReplyId.toString() !== replyId) {
      await CommunityReply.updateOne(
        { _id: discussion.acceptedReplyId },
        { $set: { isAccepted: false } },
      );
    }

    reply.isAccepted = true;
    await reply.save();

    discussion.acceptedReplyId = reply._id;
    discussion.lastActivityAt = new Date();
    await discussion.save();

    const authorNames = await loadAuthorNames([reply.authorId.toString()]);
    return {
      discussionId: discussion._id.toString(),
      acceptedReply: serializeReply(reply, authorNames.get(reply.authorId.toString())),
    };
  },

  async bookmark(userId: string, discussionId: string) {
    await getDiscussionOrThrow(discussionId);

    const userOid = oid(userId);
    const discussionOid = oid(discussionId);
    const existing = await CommunityBookmark.findOne({
      userId: userOid,
      discussionId: discussionOid,
    }).setOptions({ withDeleted: true });

    let bookmarked: boolean;

    if (existing && !existing.isDeleted) {
      existing.isDeleted = true;
      existing.deletedAt = new Date();
      await existing.save();
      bookmarked = false;
    } else if (existing && existing.isDeleted) {
      existing.isDeleted = false;
      existing.deletedAt = null;
      await existing.save();
      bookmarked = true;
    } else {
      await CommunityBookmark.create({ userId: userOid, discussionId: discussionOid });
      bookmarked = true;
    }

    return { discussionId, bookmarked };
  },

  async follow(userId: string, discussionId: string) {
    await getDiscussionOrThrow(discussionId);

    const followerOid = oid(userId);
    const discussionOid = oid(discussionId);
    const existing = await CommunityFollow.findOne({
      followerId: followerOid,
      discussionId: discussionOid,
    }).setOptions({ withDeleted: true });

    let following: boolean;

    if (existing && !existing.isDeleted) {
      existing.isDeleted = true;
      existing.deletedAt = new Date();
      await existing.save();
      following = false;
    } else if (existing && existing.isDeleted) {
      existing.isDeleted = false;
      existing.deletedAt = null;
      await existing.save();
      following = true;
    } else {
      await CommunityFollow.create({ followerId: followerOid, discussionId: discussionOid });
      following = true;
    }

    return { discussionId, following };
  },

  async report(userId: string, targetType: ReportTarget, targetId: string, reason: string) {
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw AppError.badRequest('Report reason is required');

    const targetOid = oid(targetId);

    if (targetType === 'discussion') {
      const discussion = await Discussion.findById(targetId);
      if (!discussion) throw AppError.notFound('Discussion not found');
      discussion.reportCount += 1;
      await discussion.save();
    } else {
      const reply = await CommunityReply.findById(targetId);
      if (!reply || reply.status === 'removed') throw AppError.notFound('Reply not found');
    }

    const report = await CommunityReport.create({
      reporterId: oid(userId),
      targetType,
      targetId: targetOid,
      reason: trimmedReason,
      status: 'open',
    });

    if (targetType === 'reply') {
      await Discussion.updateOne(
        { _id: (await CommunityReply.findById(targetId))!.discussionId },
        { $inc: { reportCount: 1 } },
      );
    }

    return {
      id: report._id.toString(),
      targetType,
      targetId,
      status: report.status,
    };
  },

  async adminList(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || '').trim();
    const reportedOnly = String(req.query.reported || '').trim() === 'true';
    const q = String(req.query.q || '').trim();

    const filter: Record<string, unknown> = {};

    if (status) {
      filter.status = status;
    } else {
      filter.$or = [{ status: 'pending_review' }, { reportCount: { $gt: 0 } }];
    }

    if (reportedOnly) filter.reportCount = { $gt: 0 };
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');

    const [total, rows] = await Promise.all([
      Discussion.countDocuments(filter).setOptions({ withDeleted: true }),
      Discussion.find(filter)
        .setOptions({ withDeleted: true })
        .sort({ reportCount: -1, lastActivityAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const authorNames = await loadAuthorNames(rows.map((row) => row.authorId.toString()));
    const items = rows.map((row) =>
      serializeDiscussion(row, authorNames.get(row.authorId.toString())),
    );

    return { items, meta: paginationMeta(total, page, limit) };
  },

  async adminModerate(adminId: string, input: ModerateInput) {
    const { targetType, targetId, action, note } = input;
    const targetOid = oid(targetId);

    let before: Record<string, unknown> | undefined;
    let after: Record<string, unknown> | undefined;

    if (targetType === 'discussion') {
      const discussion = await Discussion.findById(targetId).setOptions({ withDeleted: true });
      if (!discussion) throw AppError.notFound('Discussion not found');

      before = {
        status: discussion.status,
        pinned: discussion.pinned,
        featured: discussion.featured,
        isDeleted: discussion.isDeleted,
      };

      switch (action) {
        case 'approve':
          discussion.status = 'open';
          discussion.isDeleted = false;
          discussion.deletedAt = null;
          break;
        case 'remove':
          discussion.status = 'removed';
          discussion.isDeleted = true;
          discussion.deletedAt = new Date();
          break;
        case 'lock':
          discussion.status = 'locked';
          break;
        case 'unlock':
          discussion.status = 'open';
          break;
        case 'pin':
          discussion.pinned = true;
          break;
        case 'unpin':
          discussion.pinned = false;
          break;
        case 'feature':
          discussion.featured = true;
          break;
        case 'archive':
          discussion.status = 'archived';
          break;
        default:
          throw AppError.badRequest('Unsupported moderation action');
      }

      discussion.moderatedByAdminId = oid(adminId);
      if (note !== undefined) discussion.moderationNote = note.trim();
      await discussion.save();

      after = {
        status: discussion.status,
        pinned: discussion.pinned,
        featured: discussion.featured,
        isDeleted: discussion.isDeleted,
      };
    } else {
      const reply = await CommunityReply.findById(targetId).setOptions({ withDeleted: true });
      if (!reply) throw AppError.notFound('Reply not found');

      before = { status: reply.status, isDeleted: reply.isDeleted };

      switch (action) {
        case 'approve':
          reply.status = 'visible';
          reply.isDeleted = false;
          reply.deletedAt = null;
          break;
        case 'remove':
          reply.status = 'removed';
          reply.isDeleted = true;
          reply.deletedAt = new Date();
          if (reply.isAccepted) reply.isAccepted = false;
          break;
        default:
          throw AppError.badRequest('Unsupported moderation action for replies');
      }

      await reply.save();

      if (action === 'remove') {
        const discussion = await Discussion.findById(reply.discussionId);
        if (discussion) {
          discussion.replyCount = Math.max(0, discussion.replyCount - 1);
          if (discussion.acceptedReplyId?.toString() === targetId) {
            discussion.acceptedReplyId = undefined;
          }
          await discussion.save();
          await recalculateParticipantCount(discussion._id);
        }
      }

      after = { status: reply.status, isDeleted: reply.isDeleted };
    }

    await ModeratorAction.create({
      adminId: oid(adminId),
      targetType,
      targetId: targetOid,
      action,
      note: note?.trim(),
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: ROLES.ADMIN,
      action: `community.moderate.${action}`,
      resourceType: targetType,
      resourceId: targetId,
      before,
      after,
      meta: { note },
    });

    return { targetType, targetId, action, applied: true };
  },

  async stats() {
    const [discussions, replies, openReports, helpfulVotes] = await Promise.all([
      Discussion.countDocuments(),
      CommunityReply.countDocuments({ status: 'visible' }),
      CommunityReport.countDocuments({ status: 'open' }),
      CommunityReaction.countDocuments({ kind: 'helpful' }),
    ]);

    return { discussions, replies, openReports, helpfulVotes };
  },

  async related(discussionId: string, limit = 5) {
    const discussion = await getDiscussionOrThrow(discussionId);

    const orFilters: Record<string, unknown>[] = [{ category: discussion.category }];
    if (discussion.tags.length > 0) {
      orFilters.push({ tags: { $in: discussion.tags } });
    }

    const rows = await Discussion.find({
      _id: { $ne: discussion._id },
      status: 'open',
      $or: orFilters,
    })
      .sort({ pinned: -1, lastActivityAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 20));

    const authorNames = await loadAuthorNames(rows.map((row) => row.authorId.toString()));
    return rows.map((row) =>
      serializeDiscussion(row, authorNames.get(row.authorId.toString())),
    );
  },
};
