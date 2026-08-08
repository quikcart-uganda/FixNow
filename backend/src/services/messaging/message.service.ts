import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  Conversation,
  ConversationParticipant,
  Job,
  Message,
  MessageAttachment,
  User,
} from '../../models/index.js';
import { JOB_STATUS, MEDIA_TYPE, MESSAGE_TYPE } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import {
  emitConversationUpdated,
  emitMessageDeleted,
  emitMessageDelivered,
  emitMessageEdited,
  emitMessageNew,
  emitReadReceipt,
} from '../../sockets/messaging.js';
import { env } from '../../config/env.js';
import {
  assertSameDataEnvironment,
  documentDataEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

const EDIT_WINDOW_MS = env.MESSAGE_EDIT_WINDOW_MS;

function previewOf(body: string, type: string): string {
  if (type === MESSAGE_TYPE.IMAGE) return '[Image]';
  if (type === MESSAGE_TYPE.LOCATION) return '[Location]';
  if (type === MESSAGE_TYPE.SYSTEM) return body.slice(0, 280);
  return body.slice(0, 280);
}

function participantIds(conversation: { participantUserIds: Types.ObjectId[] }): string[] {
  return conversation.participantUserIds.map((id) => id.toString());
}

async function assertParticipant(
  conversationId: string,
  userId: string,
  role: string,
): Promise<{
  conversation: InstanceType<typeof Conversation>;
  participant: InstanceType<typeof ConversationParticipant> | null;
}> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw AppError.notFound('Conversation not found');

  if (role === ROLES.ADMIN) {
    return { conversation, participant: null };
  }

  const isMember = conversation.participantUserIds.some((id) => id.toString() === userId);
  if (!isMember) throw AppError.forbidden('Not a conversation participant');

  const participant = await ConversationParticipant.findOne({ conversationId, userId });
  if (!participant || participant.leftAt) {
    throw AppError.forbidden('Not a conversation participant');
  }
  return { conversation, participant };
}

async function ensureParticipants(
  conversationId: Types.ObjectId,
  entries: Array<{ userId: string; role: 'customer' | 'technician' | 'admin' | 'support' }>,
) {
  for (const entry of entries) {
    await ConversationParticipant.findOneAndUpdate(
      { conversationId, userId: entry.userId },
      {
        $setOnInsert: {
          conversationId,
          userId: entry.userId,
          role: entry.role,
          joinedAt: new Date(),
          unreadCount: 0,
        },
        $unset: { leftAt: 1 },
      },
      { upsert: true, new: true },
    );
  }
}

export async function ensureJobConversation(jobId: string): Promise<InstanceType<typeof Conversation>> {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (!job.assignedTechnicianId) {
    throw AppError.badRequest('Job has no assigned technician yet');
  }

  const customerEnv = await resolveUserDataEnvironment(job.customerId.toString());
  const techEnv = await resolveUserDataEnvironment(job.assignedTechnicianId.toString());
  assertSameDataEnvironment(
    customerEnv,
    techEnv,
    'Sandbox and production users cannot message across environments.',
  );
  // Conversation inherits job content environment for future list filters.
  const jobEnv = documentDataEnvironment(job);

  let conversation = await Conversation.findOne({ jobId, type: 'job' });
  if (!conversation) {
    conversation = await Conversation.create({
      jobId,
      type: 'job',
      title: job.title?.slice(0, 160) || 'Job conversation',
      participantUserIds: [job.customerId, job.assignedTechnicianId],
      messageCount: 0,
      isLocked: job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.CANCELLED,
      dataEnvironment: jobEnv,
    });
    await ensureParticipants(conversation._id, [
      { userId: job.customerId.toString(), role: 'customer' },
      { userId: job.assignedTechnicianId.toString(), role: 'technician' },
    ]);
  } else {
    const ids = new Set(conversation.participantUserIds.map((id) => id.toString()));
    if (!ids.has(job.customerId.toString())) conversation.participantUserIds.push(job.customerId);
    if (!ids.has(job.assignedTechnicianId.toString())) {
      conversation.participantUserIds.push(job.assignedTechnicianId);
    }
    await conversation.save();
    await ensureParticipants(conversation._id, [
      { userId: job.customerId.toString(), role: 'customer' },
      { userId: job.assignedTechnicianId.toString(), role: 'technician' },
    ]);
  }
  return conversation;
}

export async function postSystemMessage(jobId: string, body: string, meta?: Record<string, unknown>) {
  const conversation = await ensureJobConversation(jobId);
  if (conversation.isLocked && meta?.force !== true) {
    // Still allow system messages when locking/completing
  }
  const message = await Message.create({
    conversationId: conversation._id,
    senderId: conversation.participantUserIds[0],
    body,
    type: MESSAGE_TYPE.SYSTEM,
    clientMessageId: `system:${conversation._id.toString()}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    meta: { system: true, ...(meta ?? {}) },
  });
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = previewOf(body, MESSAGE_TYPE.SYSTEM);
  conversation.lastMessageSenderId = message.senderId;
  conversation.messageCount += 1;
  await conversation.save();

  const ids = participantIds(conversation);
  emitMessageNew(conversation._id.toString(), message.toObject(), ids);
  emitConversationUpdated(conversation.toObject(), ids);
  return { conversation, message };
}

export async function lockConversationForJob(jobId: string, reason: string) {
  const conversation = await Conversation.findOne({ jobId, type: 'job' });
  if (!conversation) return null;
  conversation.isLocked = true;
  await conversation.save();
  try {
    const message = await Message.create({
      conversationId: conversation._id,
      senderId: conversation.participantUserIds[0],
      body: reason,
      type: MESSAGE_TYPE.SYSTEM,
      clientMessageId: `system-lock:${conversation._id.toString()}:${Date.now()}`,
      meta: { system: true, locked: true },
    });
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = previewOf(reason, MESSAGE_TYPE.SYSTEM);
    conversation.messageCount += 1;
    await conversation.save();
    const ids = participantIds(conversation);
    emitMessageNew(conversation._id.toString(), message.toObject(), ids);
    emitConversationUpdated(conversation.toObject(), ids);
  } catch {
    // Lock already persisted; system message is best-effort.
    emitConversationUpdated(conversation.toObject(), participantIds(conversation));
  }
  return conversation;
}

export const messagingService = {
  async ensureForJob(actor: { userId: string; role: string }, jobId: string) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    const isCustomer = job.customerId.toString() === actor.userId;
    const isTech = job.assignedTechnicianId?.toString() === actor.userId;
    const isAdmin = actor.role === ROLES.ADMIN;
    if (!isCustomer && !isTech && !isAdmin) throw AppError.forbidden();
    if (!job.assignedTechnicianId) throw AppError.badRequest('Assign a technician before messaging');

    const conversation = await ensureJobConversation(jobId);
    return { conversation };
  },

  async listConversations(actor: { userId: string; role: string }, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const archived = req.query.archived === 'true';

    const filter: Record<string, unknown> = {};
    if (actor.role !== ROLES.ADMIN) {
      filter.participantUserIds = actor.userId;
    }
    if (archived) {
      // archived via participant leftAt or conversation locked + query flag
      filter.isLocked = true;
    }
    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { lastMessagePreview: { $regex: escapeRegex(q), $options: 'i' } },
      ];
    }

    const [total, conversations] = await Promise.all([
      Conversation.countDocuments(filter),
      Conversation.find(filter)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'participantUserIds title lastMessagePreview lastMessageAt lastMessageBy isLocked jobId createdAt updatedAt',
        )
        .lean(),
    ]);

    const convIds = conversations.map((c) => c._id);
    const participants = await ConversationParticipant.find({
      conversationId: { $in: convIds },
      userId: actor.userId,
    })
      .select('conversationId unreadCount')
      .lean();
    const partMap = new Map(participants.map((p) => [p.conversationId.toString(), p]));

    const otherIds = new Set<string>();
    for (const c of conversations) {
      for (const pid of c.participantUserIds) {
        if (pid.toString() !== actor.userId) otherIds.add(pid.toString());
      }
    }
    const users = await User.find({ _id: { $in: [...otherIds] } }).select('fullName role').lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return {
      items: conversations.map((c) => {
        const mine = partMap.get(c._id.toString());
        const others = c.participantUserIds
          .filter((id) => id.toString() !== actor.userId)
          .map((id) => {
            const u = userMap.get(id.toString());
            return u
              ? { id: u._id.toString(), fullName: u.fullName, role: u.role }
              : { id: id.toString() };
          });
        return {
          conversation: c,
          unreadCount: mine?.unreadCount ?? 0,
          participants: others,
        };
      }),
      meta: paginationMeta(total, page, limit),
    };
  },

  async getConversation(actor: { userId: string; role: string }, conversationId: string, req: Request) {
    const { conversation } = await assertParticipant(conversationId, actor.userId, actor.role);
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

    const msgFilter: Record<string, unknown> = { conversationId };
    if (q) msgFilter.body = { $regex: escapeRegex(q), $options: 'i' };

    const [total, messages, participants, users] = await Promise.all([
      Message.countDocuments(msgFilter),
      Message.find(msgFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ConversationParticipant.find({ conversationId }).select('userId unreadCount role').lean(),
      User.find({ _id: { $in: conversation.participantUserIds } }).select('fullName role').lean(),
    ]);

    const attachmentIds = messages.flatMap((m) => m.attachmentIds);
    const attachments = attachmentIds.length
      ? await MessageAttachment.find({ _id: { $in: attachmentIds } }).lean()
      : [];
    const attMap = new Map(attachments.map((a) => [a._id.toString(), a]));

    return {
      conversation,
      participants: participants.map((p) => ({
        ...p,
        user: users.find((u) => u._id.toString() === p.userId.toString()),
      })),
      items: messages
        .slice()
        .reverse()
        .map((m) => ({
          message: m,
          attachments: m.attachmentIds.map((id) => attMap.get(id.toString())).filter(Boolean),
        })),
      meta: paginationMeta(total, page, limit),
      canSend: actor.role === ROLES.ADMIN ? false : !conversation.isLocked,
      editWindowMs: EDIT_WINDOW_MS,
    };
  },

  async listMessages(actor: { userId: string; role: string }, conversationId: string, req: Request) {
    return this.getConversation(actor, conversationId, req);
  },

  async send(
    actor: { userId: string; role: string },
    input: {
      conversationId: string;
      body: string;
      type?: string;
      clientMessageId?: string;
      replyToMessageId?: string;
      attachmentUrl?: string;
      attachmentMimeType?: string;
      location?: { lat: number; lng: number; label?: string };
    },
  ) {
    if (actor.role === ROLES.ADMIN) {
      throw AppError.forbidden('Admins have read-only access to messaging');
    }
    const { conversation } = await assertParticipant(input.conversationId, actor.userId, actor.role);
    if (conversation.isLocked) {
      throw AppError.forbidden('Conversation is closed');
    }

    if (input.clientMessageId) {
      const existing = await Message.findOne({
        conversationId: conversation._id,
        clientMessageId: input.clientMessageId,
      });
      if (existing) return { message: existing, conversation, deduped: true };
    }

    let type = input.type ?? MESSAGE_TYPE.TEXT;
    let body = input.body;
    let meta: Record<string, unknown> | undefined;

    if (input.location) {
      type = MESSAGE_TYPE.LOCATION;
      meta = { location: input.location };
      body = input.location.label || `${input.location.lat},${input.location.lng}`;
    }
    if (input.attachmentUrl) {
      type = MESSAGE_TYPE.IMAGE;
      meta = { ...(meta ?? {}), attachmentUrl: input.attachmentUrl, mimeType: input.attachmentMimeType };
    }
    if (type === MESSAGE_TYPE.SYSTEM) {
      throw AppError.forbidden('Cannot send system messages directly');
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: actor.userId,
      body,
      type,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      replyToMessageId: input.replyToMessageId,
      meta,
      deliveredAt: new Date(),
    });

    if (input.attachmentUrl) {
      const attachment = await MessageAttachment.create({
        messageId: message._id,
        conversationId: conversation._id,
        uploadedBy: actor.userId,
        mediaType: MEDIA_TYPE.IMAGE,
        url: input.attachmentUrl,
        mimeType: input.attachmentMimeType,
      });
      message.attachmentIds = [attachment._id];
      await message.save();
    }

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = previewOf(body, type);
    conversation.lastMessageSenderId = new Types.ObjectId(actor.userId);
    conversation.messageCount += 1;
    await conversation.save();

    await ConversationParticipant.updateMany(
      { conversationId: conversation._id, userId: { $ne: actor.userId } },
      { $inc: { unreadCount: 1 } },
    );
    await ConversationParticipant.updateOne(
      { conversationId: conversation._id, userId: actor.userId },
      { $set: { lastReadAt: new Date(), lastReadMessageId: message._id, unreadCount: 0 } },
    );

    const ids = participantIds(conversation);
    emitMessageNew(conversation._id.toString(), message.toObject(), ids);
    emitConversationUpdated(conversation.toObject(), ids);

    try {
      const { createDbNotification } = await import('../../utils/notify.js');
      const recipients = ids.filter((id) => id !== actor.userId);
      const isAttachment = type === MESSAGE_TYPE.IMAGE || Boolean(input.attachmentUrl);
      const mentionMatch = /@\w+/.test(body);
      const eventType = mentionMatch
        ? 'message.mention'
        : isAttachment
          ? 'message.attachment'
          : 'message.new';
      const title = mentionMatch
        ? 'You were mentioned'
        : isAttachment
          ? 'New attachment'
          : 'New message';
      await Promise.all(
        recipients.map((userId) =>
          createDbNotification({
            userId,
            type: eventType,
            title,
            body: previewOf(body, type),
            conversationId: conversation._id.toString(),
            jobId: conversation.jobId?.toString(),
            href: `/messages/${conversation._id.toString()}`,
            data: { conversationId: conversation._id.toString() },
          }),
        ),
      );
    } catch {
      // Push side-effect must not fail message send.
    }

    return { message, conversation };
  },

  async edit(
    actor: { userId: string; role: string },
    messageId: string,
    body: string,
  ) {
    const message = await Message.findById(messageId);
    if (!message) throw AppError.notFound('Message not found');
    if (message.senderId.toString() !== actor.userId) throw AppError.forbidden();
    if (message.type === MESSAGE_TYPE.SYSTEM) throw AppError.badRequest('Cannot edit system messages');

    const { conversation } = await assertParticipant(
      message.conversationId.toString(),
      actor.userId,
      actor.role,
    );
    if (conversation.isLocked) throw AppError.forbidden('Conversation is closed');

    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > EDIT_WINDOW_MS) {
      throw AppError.badRequest('Edit window has expired');
    }

    message.body = body;
    message.editedAt = new Date();
    await message.save();

    if (conversation.lastMessageSenderId?.toString() === actor.userId) {
      conversation.lastMessagePreview = previewOf(body, message.type);
      await conversation.save();
    }

    const ids = participantIds(conversation);
    emitMessageEdited(conversation._id.toString(), message.toObject(), ids);
    return { message };
  },

  async remove(actor: { userId: string; role: string }, messageId: string) {
    const message = await Message.findById(messageId);
    if (!message) throw AppError.notFound('Message not found');
    if (message.senderId.toString() !== actor.userId) throw AppError.forbidden();

    const { conversation } = await assertParticipant(
      message.conversationId.toString(),
      actor.userId,
      actor.role,
    );

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    const ids = participantIds(conversation);
    emitMessageDeleted(conversation._id.toString(), message._id.toString(), ids);
    return { messageId: message._id.toString() };
  },

  async markRead(actor: { userId: string; role: string }, conversationId: string) {
    const { conversation, participant } = await assertParticipant(
      conversationId,
      actor.userId,
      actor.role,
    );
    if (actor.role === ROLES.ADMIN) {
      return { conversation, readOnly: true };
    }

    const latest = await Message.findOne({ conversationId }).sort({ createdAt: -1 });
    if (participant) {
      participant.lastReadAt = new Date();
      participant.lastReadMessageId = latest?._id;
      participant.unreadCount = 0;
      await participant.save();
    }

    const ids = participantIds(conversation);
    emitReadReceipt(
      conversationId,
      actor.userId,
      latest?._id.toString() ?? null,
      ids,
    );
    return { conversation, lastReadMessageId: latest?._id ?? null };
  },

  async markDelivered(actor: { userId: string; role: string }, messageId: string) {
    const message = await Message.findById(messageId);
    if (!message) throw AppError.notFound('Message not found');
    const { conversation } = await assertParticipant(
      message.conversationId.toString(),
      actor.userId,
      actor.role,
    );
    if (!message.deliveredAt) {
      message.deliveredAt = new Date();
      await message.save();
    }
    const ids = participantIds(conversation);
    emitMessageDelivered(conversation._id.toString(), message._id.toString(), actor.userId, ids);
    return { message };
  },

  async archive(actor: { userId: string; role: string }, conversationId: string) {
    const { conversation, participant } = await assertParticipant(
      conversationId,
      actor.userId,
      actor.role,
    );
    if (participant) {
      participant.leftAt = new Date();
      await participant.save();
    }
    emitConversationUpdated(conversation.toObject(), participantIds(conversation));
    return { conversation };
  },

  async reopen(actor: { userId: string; role: string }, conversationId: string) {
    if (actor.role !== ROLES.ADMIN) throw AppError.forbidden('Only admins can reopen conversations');
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw AppError.notFound('Conversation not found');
    conversation.isLocked = false;
    await conversation.save();
    const ids = participantIds(conversation);
    emitConversationUpdated(conversation.toObject(), ids);
    return { conversation };
  },
};
