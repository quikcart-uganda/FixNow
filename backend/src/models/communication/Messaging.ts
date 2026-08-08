import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import { MEDIA_TYPE, MESSAGE_TYPE, NOTIFICATION_CHANNEL } from '../shared/enums.js';

export interface IConversation extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId?: Types.ObjectId;
  type: 'job' | 'support' | 'direct';
  title?: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageSenderId?: Types.ObjectId;
  participantUserIds: Types.ObjectId[];
  messageCount: number;
  isLocked: boolean;
}

const conversationSchema = createSchema<IConversation>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
  type: { type: String, enum: ['job', 'support', 'direct'], default: 'job', index: true },
  title: { type: String, maxlength: 160 },
  lastMessageAt: { type: Date, index: true },
  lastMessagePreview: { type: String, maxlength: 280 },
  lastMessageSenderId: { type: Schema.Types.ObjectId, ref: 'User' },
  participantUserIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  messageCount: { type: Number, default: 0, min: 0 },
  isLocked: { type: Boolean, default: false },
});

conversationSchema.index({ participantUserIds: 1, lastMessageAt: -1 });
// jobId already indexed on the field definition

export const Conversation = model<IConversation>('Conversation', conversationSchema);

export interface IConversationParticipant extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'customer' | 'technician' | 'admin' | 'support';
  joinedAt: Date;
  leftAt?: Date;
  lastReadAt?: Date;
  lastReadMessageId?: Types.ObjectId;
  mutedUntil?: Date;
  unreadCount: number;
}

const conversationParticipantSchema = createSchema<IConversationParticipant>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: {
    type: String,
    enum: ['customer', 'technician', 'admin', 'support'],
    required: true,
  },
  joinedAt: { type: Date, default: Date.now },
  leftAt: Date,
  lastReadAt: Date,
  lastReadMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  mutedUntil: Date,
  unreadCount: { type: Number, default: 0, min: 0 },
});

conversationParticipantSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
conversationParticipantSchema.index({ userId: 1, unreadCount: -1 });

export const ConversationParticipant = model<IConversationParticipant>(
  'ConversationParticipant',
  conversationParticipantSchema,
);

export interface IMessage extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  type: string;
  clientMessageId?: string;
  replyToMessageId?: Types.ObjectId;
  attachmentIds: Types.ObjectId[];
  deliveredAt?: Date;
  editedAt?: Date;
  meta?: Record<string, unknown>;
}

const messageSchema = createSchema<IMessage>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, maxlength: 10000 },
  type: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
  clientMessageId: { type: String, maxlength: 64 },
  replyToMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  attachmentIds: [{ type: Schema.Types.ObjectId, ref: 'MessageAttachment' }],
  deliveredAt: Date,
  editedAt: Date,
  meta: { type: Schema.Types.Mixed },
});

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, clientMessageId: 1 }, { unique: true, sparse: true });

export const Message = model<IMessage>('Message', messageSchema);

export interface IMessageAttachment extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  messageId: Types.ObjectId;
  conversationId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  mediaType: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

const messageAttachmentSchema = createSchema<IMessageAttachment>({
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mediaType: { type: String, enum: Object.values(MEDIA_TYPE), required: true },
  url: { type: String, required: true, maxlength: 2048 },
  mimeType: { type: String, maxlength: 120 },
  sizeBytes: { type: Number, min: 0 },
  width: Number,
  height: Number,
});

export const MessageAttachment = model<IMessageAttachment>('MessageAttachment', messageAttachmentSchema);

export interface INotification extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  href?: string;
  channels: string[];
  readAt?: Date;
  seenAt?: Date;
  jobId?: Types.ObjectId;
  conversationId?: Types.ObjectId;
  meta?: Record<string, unknown>;
  expiresAt?: Date;
}

const notificationSchema = createSchema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, index: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 1000 },
  href: { type: String, maxlength: 512 },
  channels: {
    type: [String],
    enum: Object.values(NOTIFICATION_CHANNEL),
    default: [NOTIFICATION_CHANNEL.IN_APP],
  },
  readAt: { type: Date, index: true },
  seenAt: Date,
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  meta: { type: Schema.Types.Mixed },
  expiresAt: Date,
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export const Notification = model<INotification>('Notification', notificationSchema);

export interface INotificationPreference extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  channels: {
    inApp: boolean;
    push: boolean;
    sms: boolean;
    email: boolean;
    whatsapp: boolean;
  };
  categories: Record<string, boolean>;
  quietHours?: { start?: string; end?: string; timezone?: string };
}

const notificationPreferenceSchema = createSchema<INotificationPreference>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  channels: {
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    email: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false },
  },
  categories: { type: Map, of: Boolean, default: {} },
  quietHours: {
    start: String,
    end: String,
    timezone: { type: String, default: 'Africa/Kampala' },
  },
});

export const NotificationPreference = model<INotificationPreference>(
  'NotificationPreference',
  notificationPreferenceSchema,
);
