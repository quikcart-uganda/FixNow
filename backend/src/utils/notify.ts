import { logger } from '../config/logger.js';
import { notifyUser } from '../services/push/push.service.js';

/**
 * Persist an in-app notification and fan-out push (preferences / quiet hours / devices).
 * Never throws — marketplace and auth callers must remain resilient.
 */
export async function createDbNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  jobId?: string;
  conversationId?: string;
  href?: string;
  meta?: Record<string, unknown>;
  bypassQuietHours?: boolean;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    await notifyUser(input);
  } catch (err) {
    logger.error('Failed to create notification', err);
  }
}
