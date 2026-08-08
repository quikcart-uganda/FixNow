import { Schema, model, Types } from 'mongoose';
import type { AiAssistantRole } from './AiConversation.js';

export type AiPendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'failed';

export interface IAiPendingAction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  role: AiAssistantRole;
  conversationId?: string;
  tool: string;
  workflowId: string;
  title: string;
  summary: string;
  /** Opaque payload executed only via platform services on confirm. */
  payload: Record<string, unknown>;
  status: AiPendingActionStatus;
  expiresAt: Date;
  resultSummary?: string;
  errorCode?: string;
  confirmedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingSchema = new Schema<IAiPendingAction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true, enum: ['customer', 'technician', 'admin'] },
    conversationId: { type: String },
    tool: { type: String, required: true },
    workflowId: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'expired', 'failed'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    resultSummary: String,
    errorCode: String,
    confirmedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true },
);

pendingSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const AiPendingAction = model<IAiPendingAction>('AiPendingAction', pendingSchema);

export interface IAiActionAudit {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  role: AiAssistantRole | 'guest';
  guest?: boolean;
  dataEnvironment?: string;
  conversationId?: string;
  tool: string;
  workflowId?: string;
  action: 'tool_run' | 'pending_created' | 'pending_confirmed' | 'pending_cancelled' | 'pending_failed' | 'navigation' | 'cross_env_blocked';
  ok: boolean;
  latencyMs?: number;
  errorCode?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const auditSchema = new Schema<IAiActionAudit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, required: true },
    guest: { type: Boolean, default: false },
    dataEnvironment: { type: String, index: true },
    conversationId: String,
    tool: { type: String, required: true },
    workflowId: String,
    action: { type: String, required: true },
    ok: { type: Boolean, required: true },
    latencyMs: Number,
    errorCode: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true },
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ role: 1, tool: 1, createdAt: -1 });
auditSchema.index({ dataEnvironment: 1, createdAt: -1 });

export const AiActionAudit = model<IAiActionAudit>('AiActionAudit', auditSchema);
