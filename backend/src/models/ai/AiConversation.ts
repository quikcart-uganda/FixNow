import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export const AI_ASSISTANT_ROLES = ['customer', 'technician', 'admin'] as const;
export type AiAssistantRole = (typeof AI_ASSISTANT_ROLES)[number];

export interface IAiConversation extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  role: AiAssistantRole;
  title: string;
  status: 'active' | 'archived';
  lastMessageAt?: Date | null;
}

const aiConversationSchema = createSchema<IAiConversation>({
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: AI_ASSISTANT_ROLES, required: true, index: true },
  title: { type: String, default: 'New chat', maxlength: 120 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  lastMessageAt: { type: Date, default: null },
});

aiConversationSchema.index({ ownerUserId: 1, role: 1, status: 1, updatedAt: -1 });

export const AiConversation = model<IAiConversation>('AiConversation', aiConversationSchema);

export interface IAiMessage extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    provider?: string;
    model?: string;
    tools?: string[];
    disabled?: boolean;
    intent?: string;
  } | null;
}

const aiMessageSchema = createSchema<IAiMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'AiConversation',
    required: true,
    index: true,
  },
  sender: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  metadata: {
    type: Schema.Types.Mixed,
    default: null,
  },
});

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const AiMessage = model<IAiMessage>('AiMessage', aiMessageSchema);
