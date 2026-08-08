import type { Request } from 'express';
import { Notification } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { paginationMeta, parsePagination } from '../../utils/pagination.js';
import { deviceService } from './device.service.js';
import {
  ensurePreferences,
  serializePreferences,
  updatePreferences,
} from './preferences.js';
import {
  broadcastAnnouncement,
  getPushStats,
  processPushRetries,
  retryDelivery,
} from './push.service.js';

export const notificationService = {
  async list(userId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const unreadOnly = req.query.unread === 'true';
    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) filter.readAt = { $exists: false };

    const [total, items, unreadCount] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ userId, readAt: { $exists: false } }),
    ]);

    return {
      items,
      unreadCount,
      meta: paginationMeta(total, page, limit),
    };
  },

  async markRead(userId: string, notificationId: string) {
    const doc = await Notification.findOne({ _id: notificationId, userId });
    if (!doc) throw AppError.notFound('Notification not found');
    if (!doc.readAt) {
      doc.readAt = new Date();
      doc.seenAt = doc.seenAt ?? new Date();
      await doc.save();
    }
    const unreadCount = await Notification.countDocuments({ userId, readAt: { $exists: false } });
    return { notification: doc, unreadCount };
  },

  async markAllRead(userId: string) {
    const result = await Notification.updateMany(
      { userId, readAt: { $exists: false } },
      { $set: { readAt: new Date(), seenAt: new Date() } },
    );
    return { updated: result.modifiedCount, unreadCount: 0 };
  },

  async getPreferences(userId: string) {
    const prefs = await ensurePreferences(userId);
    return { preferences: serializePreferences(prefs) };
  },

  async updatePreferences(userId: string, body: Record<string, unknown>) {
    const prefs = await updatePreferences(userId, body as Parameters<typeof updatePreferences>[1]);
    return { preferences: serializePreferences(prefs) };
  },

  registerDevice: deviceService.register.bind(deviceService),
  removeDevice: deviceService.remove.bind(deviceService),
  refreshDevice: deviceService.refresh.bind(deviceService),
  listDevices: deviceService.listMine.bind(deviceService),

  getPushStats,
  retryDelivery,
  processPushRetries,
  broadcastAnnouncement,
};

export { deviceService } from './device.service.js';
export * from './events.js';
export * from './push.service.js';
export * from './preferences.js';
