import { AuditLog } from '../models/index.js';
import { logger } from '../config/logger.js';
import { maskSensitive } from '../security/mask.js';

export async function writeAuditLog(input: {
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'critical';
}): Promise<void> {
  try {
    await AuditLog.create({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ip: input.ip,
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 512) : undefined,
      meta: input.meta ? maskSensitive(input.meta) : undefined,
      before: input.before ? maskSensitive(input.before) : undefined,
      after: input.after ? maskSensitive(input.after) : undefined,
      severity: input.severity ?? 'info',
    });
  } catch (err) {
    logger.error('Failed to write audit log', err);
  }
}
