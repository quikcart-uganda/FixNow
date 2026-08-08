import { Notification, User } from '../../models/index.js';
import { DeviceToken, PushDeliveryLog } from '../../models/communication/Push.js';
import { NOTIFICATION_CHANNEL } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { logger } from '../../config/logger.js';
import { sendPush } from '../../providers/push/fcm.provider.js';
import { AppError } from '../../utils/AppError.js';
import { categoryForEvent, type PushCategory } from './events.js';
import { deviceService } from './device.service.js';
import { getEffectivePrefs } from './preferences.js';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 30_000;

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  jobId?: string;
  conversationId?: string;
  href?: string;
  meta?: Record<string, unknown>;
  /** Skip creating in-app row (push-only) */
  pushOnly?: boolean;
  /** Force push even during quiet hours (security alerts) */
  bypassQuietHours?: boolean;
  data?: Record<string, string>;
};

function backoffMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

async function unreadBadgeCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: { $exists: false } });
}

async function deliverToDevice(opts: {
  userId: string;
  notificationId?: string;
  device: InstanceType<typeof DeviceToken>;
  eventType: string;
  category: PushCategory;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound: boolean;
  badge?: number;
  attempt?: number;
  existingLogId?: string;
}) {
  const attempt = opts.attempt ?? 1;
  const log =
    opts.existingLogId
      ? await PushDeliveryLog.findById(opts.existingLogId)
      : await PushDeliveryLog.create({
          userId: opts.userId,
          notificationId: opts.notificationId,
          deviceTokenId: opts.device._id,
          tokenSnapshot: opts.device.token,
          platform: opts.device.platform,
          eventType: opts.eventType,
          category: opts.category,
          title: opts.title,
          body: opts.body,
          data: opts.data,
          status: 'queued',
          attempt,
          maxAttempts: MAX_ATTEMPTS,
        });

  if (!log) return null;

  const result = await sendPush({
    token: opts.device.token,
    title: opts.title,
    body: opts.body,
    data: opts.data,
    sound: opts.sound,
    badge: opts.badge,
  });

  log.provider = result.provider;
  log.attempt = attempt;

  if (result.ok) {
    log.status = 'sent';
    log.providerMessageId = result.messageId;
    log.sentAt = new Date();
    log.errorCode = undefined;
    log.errorMessage = undefined;
    log.nextRetryAt = undefined;
    await log.save();
    await deviceService.touch(opts.device.token);
    return log;
  }

  if (result.invalidToken) {
    await deviceService.invalidateToken(opts.device.token, result.errorCode);
    log.status = 'failed';
    log.errorCode = result.errorCode;
    log.errorMessage = result.errorMessage;
    log.nextRetryAt = undefined;
    await log.save();
    return log;
  }

  const canRetry = Boolean(result.transient) && attempt < MAX_ATTEMPTS;
  log.status = 'failed';
  log.errorCode = result.errorCode;
  log.errorMessage = result.errorMessage;
  log.nextRetryAt = canRetry ? new Date(Date.now() + backoffMs(attempt)) : undefined;
  await log.save();
  return log;
}

/**
 * Create in-app notification (if enabled) and fan-out push to all active devices.
 */
export async function notifyUser(input: NotifyInput): Promise<{
  notificationId?: string;
  pushed: number;
  skippedReason?: string;
}> {
  try {
    const category = categoryForEvent(input.type);
    const prefs = await getEffectivePrefs(input.userId, category);

    let notificationId: string | undefined;

    if (!prefs.categoryEnabled && !input.bypassQuietHours) {
      return { notificationId, pushed: 0, skippedReason: 'category_disabled' };
    }

    if (!input.pushOnly && prefs.inAppEnabled) {
      const channels: string[] = [NOTIFICATION_CHANNEL.IN_APP];
      if (prefs.pushEnabled) channels.push(NOTIFICATION_CHANNEL.PUSH);
      if (prefs.emailEnabled) channels.push(NOTIFICATION_CHANNEL.EMAIL);
      if (prefs.smsEnabled) channels.push(NOTIFICATION_CHANNEL.SMS);
      const doc = await Notification.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        jobId: input.jobId,
        conversationId: input.conversationId,
        href: input.href,
        channels,
        meta: input.meta,
      });
      notificationId = doc._id.toString();
    }

    // Email / SMS fan-out (preference-gated). Failures are logged and never block push/in-app.
    if (prefs.categoryEnabled || input.bypassQuietHours) {
      const quietBlocked = prefs.quietHoursActive && !input.bypassQuietHours;
      if (!quietBlocked) {
        try {
          const user = await User.findById(input.userId).select('email phone').lean();
          if (prefs.emailEnabled && user?.email) {
            const { getEmailProvider } = await import('../../providers/email/index.js');
            await getEmailProvider().send({
              to: user.email,
              subject: input.title,
              text: input.body,
            });
          }
          if (prefs.smsEnabled && user?.phone) {
            const { getSmsProvider } = await import('../../providers/sms/index.js');
            await getSmsProvider().send({
              to: user.phone,
              body: `${input.title}: ${input.body}`.slice(0, 320),
            });
          }
        } catch (err) {
          logger.warn('notifyUser email/sms fan-out failed', err);
        }
      }
    }

    if (!prefs.pushEnabled) {
      return { notificationId, pushed: 0, skippedReason: 'push_disabled' };
    }
    if (prefs.quietHoursActive && !input.bypassQuietHours) {
      await PushDeliveryLog.create({
        userId: input.userId,
        notificationId,
        eventType: input.type,
        category,
        title: input.title,
        body: input.body,
        status: 'skipped',
        provider: 'console',
        attempt: 1,
        maxAttempts: 1,
        errorCode: 'quiet_hours',
        errorMessage: 'Skipped due to quiet hours',
      });
      return { notificationId, pushed: 0, skippedReason: 'quiet_hours' };
    }

    const devices = await deviceService.listActiveForUser(input.userId);
    if (!devices.length) {
      return { notificationId, pushed: 0, skippedReason: 'no_devices' };
    }

    const badge = prefs.badge ? await unreadBadgeCount(input.userId) : undefined;
    const data: Record<string, string> = {
      type: input.type,
      category,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.href ? { href: input.href } : {}),
      ...(notificationId ? { notificationId } : {}),
      ...(typeof badge === 'number' ? { badge: String(badge) } : {}),
      ...(input.data ?? {}),
    };

    let pushed = 0;
    for (const device of devices) {
      const log = await deliverToDevice({
        userId: input.userId,
        notificationId,
        device,
        eventType: input.type,
        category,
        title: input.title,
        body: input.body,
        data,
        sound: prefs.sound,
        badge,
      });
      if (log?.status === 'sent') pushed += 1;
    }

    return { notificationId, pushed };
  } catch (err) {
    logger.error('notifyUser failed', err);
    return { pushed: 0, skippedReason: 'error' };
  }
}

export async function notifyUsers(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map((userId) => notifyUser({ ...input, userId })));
}

export async function notifyAdmins(input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const admins = await User.find({ role: ROLES.ADMIN, isDeleted: { $ne: true } }).select('_id');
  await notifyUsers(
    admins.map((a) => a._id.toString()),
    input,
  );
}

export async function retryDelivery(logId: string) {
  const log = await PushDeliveryLog.findById(logId);
  if (!log) throw AppError.notFound('Delivery log not found');
  if (log.status === 'sent' || log.status === 'delivered') {
    return { log, retried: false };
  }

  const device = log.deviceTokenId
    ? await DeviceToken.findById(log.deviceTokenId)
    : log.tokenSnapshot
      ? await DeviceToken.findOne({ token: log.tokenSnapshot })
      : null;

  if (!device || !device.isActive) {
    throw AppError.badRequest('No active device for retry');
  }

  const prefs = await getEffectivePrefs(log.userId.toString(), log.category as PushCategory);
  const badge = prefs.badge ? await unreadBadgeCount(log.userId.toString()) : undefined;
  const nextAttempt = log.attempt + 1;

  const updated = await deliverToDevice({
    userId: log.userId.toString(),
    notificationId: log.notificationId?.toString(),
    device,
    eventType: log.eventType,
    category: log.category as PushCategory,
    title: log.title,
    body: log.body,
    data: (log.data as Record<string, string>) || undefined,
    sound: prefs.sound,
    badge,
    attempt: nextAttempt,
    existingLogId: log._id.toString(),
  });

  return { log: updated, retried: true };
}

export async function processPushRetries(limit = 50): Promise<number> {
  const due = await PushDeliveryLog.find({
    status: 'failed',
    nextRetryAt: { $lte: new Date() },
    $expr: { $lt: ['$attempt', '$maxAttempts'] },
  })
    .sort({ nextRetryAt: 1 })
    .limit(limit);

  let count = 0;
  for (const log of due) {
    try {
      await retryDelivery(log._id.toString());
      count += 1;
    } catch (err) {
      logger.warn('Push retry failed', { id: log._id.toString(), err });
    }
  }
  return count;
}

export async function getPushStats(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [byStatus, byEvent, devices, failed] = await Promise.all([
    PushDeliveryLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PushDeliveryLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    DeviceToken.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    PushDeliveryLog.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
  ]);

  return {
    since: since.toISOString(),
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
    byEvent: byEvent.map((r) => ({ eventType: r._id, count: r.count })),
    activeDevicesByPlatform: Object.fromEntries(devices.map((r) => [r._id, r.count])),
    failedCount: failed,
  };
}

export async function broadcastAnnouncement(input: {
  title: string;
  body: string;
  roles?: string[];
  userIds?: string[];
  href?: string;
}) {
  const roles = input.roles?.length ? input.roles : [ROLES.CUSTOMER, ROLES.TECHNICIAN];
  let userIds = input.userIds ?? [];
  if (!userIds.length) {
    const users = await User.find({
      role: { $in: roles },
      isDeleted: { $ne: true },
      accountStatus: { $ne: 'deleted' },
    })
      .select('_id')
      .limit(5000);
    userIds = users.map((u) => u._id.toString());
  }

  await notifyUsers(userIds, {
    type: 'admin.announcement',
    title: input.title,
    body: input.body,
    href: input.href,
    bypassQuietHours: true,
  });

  return { recipients: userIds.length };
}
