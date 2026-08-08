import { Types } from 'mongoose';
import { AiConversation, AiMessage, type AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { AppError } from '../../../utils/AppError.js';
import { loadAiRuntimeConfig } from '../ai.config.js';

const MAX_CONTENT = 4000;

function sanitizeContent(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT);
}

function titleFromMessage(message: string): string {
  const text = sanitizeContent(message).slice(0, 60);
  return text || 'New chat';
}

export const aiConversationMemory = {
  async create(ownerUserId: string, role: AiAssistantRole, title?: string) {
    const conversation = await AiConversation.create({
      ownerUserId,
      role,
      title: sanitizeContent(title || 'New chat').slice(0, 120) || 'New chat',
      status: 'active',
      lastMessageAt: new Date(),
    });
    return normalizeConversation(conversation);
  },

  async list(ownerUserId: string, role: AiAssistantRole) {
    const items = await AiConversation.find({
      ownerUserId,
      role,
      status: 'active',
    })
      .sort({ updatedAt: -1 })
      .limit(50);
    return { items: items.map(normalizeConversation) };
  },

  async getOwned(conversationId: string, ownerUserId: string, role: AiAssistantRole) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw AppError.badRequest('Invalid conversation id');
    }
    const conversation = await AiConversation.findOne({
      _id: conversationId,
      ownerUserId,
      role,
      status: 'active',
    });
    if (!conversation) throw AppError.notFound('Conversation not found');
    return conversation;
  },

  async listMessages(conversationId: string, ownerUserId: string, role: AiAssistantRole) {
    await this.getOwned(conversationId, ownerUserId, role);
    const items = await AiMessage.find({ conversationId }).sort({ createdAt: 1 }).limit(200);
    return { items: items.map(normalizeMessage) };
  },

  async softDelete(conversationId: string, ownerUserId: string, role: AiAssistantRole) {
    const conversation = await this.getOwned(conversationId, ownerUserId, role);
    conversation.status = 'archived';
    conversation.isDeleted = true;
    conversation.deletedAt = new Date();
    await conversation.save();
    return { ok: true };
  },

  /**
   * Ensures a conversation exists for the turn and returns recent history for the provider.
   */
  async prepareForChat(input: {
    ownerUserId: string;
    role: AiAssistantRole;
    conversationId?: string;
    userMessage: string;
  }) {
    const config = loadAiRuntimeConfig();
    if (!config.conversationHistoryEnabled) {
      return {
        enabled: false,
        conversationId: '',
        historyForProvider: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      };
    }

    let conversationId = String(input.conversationId || '').trim();
    if (conversationId) {
      await this.getOwned(conversationId, input.ownerUserId, input.role);
    } else {
      const created = await this.create(input.ownerUserId, input.role, titleFromMessage(input.userMessage));
      conversationId = created.id;
    }

    const recent = await AiMessage.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(config.historyLimit)
      .lean();

    const historyForProvider = recent
      .reverse()
      .filter((m) => m.sender === 'user' || m.sender === 'assistant')
      .map((m) => ({
        role: m.sender as 'user' | 'assistant',
        content: sanitizeContent(m.content),
      }));

    return { enabled: true, conversationId, historyForProvider };
  },

  async recordTurn(input: {
    conversationId: string;
    ownerUserId: string;
    role: AiAssistantRole;
    userMessage: string;
    assistantMessage: string;
    metadata?: Record<string, unknown>;
  }) {
    const config = loadAiRuntimeConfig();
    if (!config.conversationHistoryEnabled || !input.conversationId) return;

    const conversation = await this.getOwned(input.conversationId, input.ownerUserId, input.role);
    await AiMessage.create([
      {
        conversationId: conversation._id,
        sender: 'user',
        content: sanitizeContent(input.userMessage),
      },
      {
        conversationId: conversation._id,
        sender: 'assistant',
        content: sanitizeContent(input.assistantMessage),
        metadata: input.metadata ?? null,
      },
    ]);
    conversation.lastMessageAt = new Date();
    if (conversation.title === 'New chat') {
      conversation.title = titleFromMessage(input.userMessage);
    }
    await conversation.save();
  },
};

function normalizeConversation(record: {
  _id: { toString(): string };
  ownerUserId: { toString(): string };
  role: string;
  title: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastMessageAt?: Date | null;
}) {
  return {
    id: record._id.toString(),
    ownerUserId: record.ownerUserId.toString(),
    role: record.role,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt?.toISOString?.() ?? '',
    updatedAt: record.updatedAt?.toISOString?.() ?? '',
    lastMessageAt: record.lastMessageAt ? new Date(record.lastMessageAt).toISOString() : '',
  };
}

function normalizeMessage(record: {
  _id: { toString(): string };
  conversationId: { toString(): string };
  sender: string;
  content: string;
  metadata?: unknown;
  createdAt?: Date;
}) {
  return {
    id: record._id.toString(),
    conversationId: record.conversationId.toString(),
    sender: record.sender,
    content: record.content,
    metadata: record.metadata ?? null,
    createdAt: record.createdAt?.toISOString?.() ?? '',
  };
}
