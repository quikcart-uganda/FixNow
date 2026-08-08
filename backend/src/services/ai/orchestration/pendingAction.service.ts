import { Types } from 'mongoose';
import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { AiActionAudit, AiPendingAction } from '../../../models/ai/AiPendingAction.js';
import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../../utils/audit.js';
import { jobMarketplaceService as jobService } from '../../marketplace/job.service.js';
import { technicianMarketplaceService as technicianService } from '../../marketplace/technician.service.js';

const PENDING_TTL_MS = 15 * 60 * 1000;

export type PendingActionPublic = {
  id: string;
  tool: string;
  workflowId: string;
  title: string;
  summary: string;
  expiresAt: string;
  status: string;
};

export async function recordAiAction(input: {
  userId?: string;
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
}) {
  try {
    await AiActionAudit.create({
      userId: input.userId ? new Types.ObjectId(input.userId) : undefined,
      role: input.role,
      guest: Boolean(input.guest),
      dataEnvironment: input.dataEnvironment,
      conversationId: input.conversationId,
      tool: input.tool,
      workflowId: input.workflowId,
      action: input.action,
      ok: input.ok,
      latencyMs: input.latencyMs,
      errorCode: input.errorCode,
      meta: input.meta,
    });
  } catch {
    /* never block chat */
  }
}

export async function createPendingAction(input: {
  userId: string;
  role: AiAssistantRole;
  conversationId?: string;
  tool: string;
  workflowId: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}): Promise<PendingActionPublic> {
  const doc = await AiPendingAction.create({
    userId: input.userId,
    role: input.role,
    conversationId: input.conversationId,
    tool: input.tool,
    workflowId: input.workflowId,
    title: input.title,
    summary: input.summary,
    payload: input.payload,
    status: 'pending',
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  });

  await recordAiAction({
    userId: input.userId,
    role: input.role,
    conversationId: input.conversationId,
    tool: input.tool,
    workflowId: input.workflowId,
    action: 'pending_created',
    ok: true,
    meta: { title: input.title },
  });

  return serializePending(doc);
}

function serializePending(doc: {
  _id: Types.ObjectId;
  tool: string;
  workflowId: string;
  title: string;
  summary: string;
  expiresAt: Date;
  status: string;
}): PendingActionPublic {
  return {
    id: doc._id.toString(),
    tool: doc.tool,
    workflowId: doc.workflowId,
    title: doc.title,
    summary: doc.summary,
    expiresAt: doc.expiresAt.toISOString(),
    status: doc.status,
  };
}

export async function cancelPendingAction(userId: string, actionId: string) {
  const doc = await AiPendingAction.findOne({
    _id: actionId,
    userId,
    status: 'pending',
  });
  if (!doc) throw AppError.notFound('Pending action not found');
  doc.status = 'cancelled';
  doc.cancelledAt = new Date();
  await doc.save();
  await recordAiAction({
    userId,
    role: doc.role,
    conversationId: doc.conversationId,
    tool: doc.tool,
    workflowId: doc.workflowId,
    action: 'pending_cancelled',
    ok: true,
  });
  return serializePending(doc);
}

export async function confirmPendingAction(userId: string, actionId: string, meta: { ip?: string } = {}) {
  const started = Date.now();
  const doc = await AiPendingAction.findOne({
    _id: actionId,
    userId,
    status: 'pending',
  });
  if (!doc) throw AppError.notFound('Pending action not found');
  if (doc.expiresAt.getTime() < Date.now()) {
    doc.status = 'expired';
    await doc.save();
    throw AppError.badRequest('This action expired. Ask the assistant to prepare it again.');
  }

  try {
    const result = await executeWorkflow(doc.role, doc.workflowId, doc.payload, userId, meta);
    doc.status = 'confirmed';
    doc.confirmedAt = new Date();
    doc.resultSummary = result.summary;
    await doc.save();

    await recordAiAction({
      userId,
      role: doc.role,
      conversationId: doc.conversationId,
      tool: doc.tool,
      workflowId: doc.workflowId,
      action: 'pending_confirmed',
      ok: true,
      latencyMs: Date.now() - started,
      meta: { result: result.summary },
    });

    await writeAuditLog({
      actorId: userId,
      actorRole: doc.role,
      action: `ai.orchestrate.${doc.workflowId}`,
      resourceType: 'AiPendingAction',
      resourceId: doc._id.toString(),
      ip: meta.ip,
      meta: { tool: doc.tool, summary: result.summary },
    });

    return {
      action: serializePending(doc),
      result,
    };
  } catch (err) {
    doc.status = 'failed';
    doc.errorCode = err instanceof AppError ? err.code || 'failed' : 'failed';
    doc.resultSummary = err instanceof Error ? err.message : 'Execution failed';
    await doc.save();
    await recordAiAction({
      userId,
      role: doc.role,
      tool: doc.tool,
      workflowId: doc.workflowId,
      action: 'pending_failed',
      ok: false,
      errorCode: doc.errorCode,
      latencyMs: Date.now() - started,
    });
    throw err;
  }
}

async function executeWorkflow(
  role: AiAssistantRole,
  workflowId: string,
  payload: Record<string, unknown>,
  userId: string,
  meta: { ip?: string },
): Promise<{ summary: string; data?: unknown; deepLinks?: Array<{ label: string; href: string }> }> {
  if (role === 'customer' && workflowId === 'customer.createJob') {
    const title = String(payload.title || '').trim();
    const description = String(payload.description || '').trim();
    if (!title || !description) throw AppError.badRequest('Job title and description are required');
    const created = await jobService.create(
      userId,
      {
        title,
        description,
        categoryId: payload.categoryId ? String(payload.categoryId) : undefined,
        budgetMin: typeof payload.budgetMin === 'number' ? payload.budgetMin : undefined,
        budgetMax: typeof payload.budgetMax === 'number' ? payload.budgetMax : undefined,
        preferredDate: payload.preferredDate ? String(payload.preferredDate) : undefined,
        location: (payload.location as Record<string, unknown>) || undefined,
        publish: payload.publish === true,
      },
      { ip: meta.ip },
    );
    const jobId = created.job?._id?.toString?.() || String(created.job?._id || '');
    return {
      summary: payload.publish === true ? 'Job published successfully.' : 'Job draft created successfully.',
      data: { jobId },
      deepLinks: [{ label: 'Open My Jobs', href: '/customer/jobs' }],
    };
  }

  if (role === 'customer' && workflowId === 'customer.cancelJob') {
    const jobId = String(payload.jobId || '');
    if (!jobId) throw AppError.badRequest('jobId required');
    await jobService.cancel(userId, jobId, String(payload.reason || 'Cancelled via FixNow AI'), {
      ip: meta.ip,
    });
    return {
      summary: 'Job cancelled using the platform cancellation workflow.',
      deepLinks: [{ label: 'My Jobs', href: '/customer/jobs' }],
    };
  }

  if (role === 'technician' && workflowId === 'technician.availability') {
    const status = String(payload.status || 'offline') as 'available' | 'busy' | 'offline' | 'on_job';
    if (!['available', 'busy', 'offline', 'on_job'].includes(status)) {
      throw AppError.badRequest('Invalid availability status');
    }
    await technicianService.updateAvailability(userId, {
      status,
      availableFrom: payload.availableFrom ? String(payload.availableFrom) : undefined,
      availableUntil: payload.availableUntil ? String(payload.availableUntil) : undefined,
      notes: payload.notes ? String(payload.notes) : undefined,
    });
    return {
      summary: `Availability updated to ${status}.`,
      deepLinks: [{ label: 'Availability', href: '/technician/availability' }],
    };
  }

  throw AppError.badRequest(`Unknown or unsupported workflow: ${workflowId}`);
}

export const aiOrchestrationActions = {
  createPendingAction,
  confirmPendingAction,
  cancelPendingAction,
  recordAiAction,
};
