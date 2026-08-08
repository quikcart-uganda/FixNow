import type { Request } from 'express';
import { DeviceToken, type DevicePlatform } from '../../models/communication/Push.js';
import { AppError } from '../../utils/AppError.js';
import { paginationMeta, parsePagination } from '../../utils/pagination.js';

export const deviceService = {
  async register(
    userId: string,
    input: {
      token: string;
      platform: DevicePlatform;
      deviceId?: string;
      appVersion?: string;
      userAgent?: string;
      locale?: string;
      timezone?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const token = input.token.trim();
    if (!token) throw AppError.badRequest('Device token is required');

    // Token may move between users (shared device / re-login)
    await DeviceToken.updateMany(
      { token, userId: { $ne: userId }, isActive: true },
      { $set: { isActive: false, invalidatedAt: new Date(), invalidReason: 'reassigned' } },
    );

    let device =
      (input.deviceId
        ? await DeviceToken.findOne({ userId, deviceId: input.deviceId })
        : null) || (await DeviceToken.findOne({ token }));

    if (device) {
      device.userId = userId as unknown as typeof device.userId;
      device.token = token;
      device.platform = input.platform;
      device.deviceId = input.deviceId ?? device.deviceId;
      device.appVersion = input.appVersion ?? device.appVersion;
      device.userAgent = input.userAgent ?? device.userAgent;
      device.locale = input.locale ?? device.locale;
      device.timezone = input.timezone ?? device.timezone;
      device.meta = input.meta ?? device.meta;
      device.isActive = true;
      device.lastActiveAt = new Date();
      device.lastRegisteredAt = new Date();
      device.invalidatedAt = undefined;
      device.invalidReason = undefined;
      device.isDeleted = false;
      device.deletedAt = null;
      await device.save();
    } else {
      device = await DeviceToken.create({
        userId,
        token,
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        userAgent: input.userAgent,
        locale: input.locale,
        timezone: input.timezone,
        meta: input.meta,
        isActive: true,
        lastActiveAt: new Date(),
        lastRegisteredAt: new Date(),
      });
    }

    return { device };
  },

  async remove(userId: string, input: { token?: string; deviceId?: string }) {
    if (!input.token && !input.deviceId) throw AppError.badRequest('token or deviceId required');
    const filter: Record<string, unknown> = { userId, isActive: true };
    if (input.token) filter.token = input.token;
    if (input.deviceId) filter.deviceId = input.deviceId;

    const result = await DeviceToken.updateMany(filter, {
      $set: {
        isActive: false,
        invalidatedAt: new Date(),
        invalidReason: 'user_removed',
      },
    });
    return { removed: result.modifiedCount };
  },

  async refresh(
    userId: string,
    input: { oldToken?: string; newToken: string; platform: DevicePlatform; deviceId?: string },
  ) {
    if (input.oldToken && input.oldToken !== input.newToken) {
      await DeviceToken.updateMany(
        { userId, token: input.oldToken },
        {
          $set: {
            isActive: false,
            invalidatedAt: new Date(),
            invalidReason: 'token_refreshed',
          },
        },
      );
    }
    return this.register(userId, {
      token: input.newToken,
      platform: input.platform,
      deviceId: input.deviceId,
    });
  },

  async listMine(userId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter = { userId, isActive: true };
    const [total, items] = await Promise.all([
      DeviceToken.countDocuments(filter),
      DeviceToken.find(filter).sort({ lastActiveAt: -1 }).skip(skip).limit(limit),
    ]);
    return { items, meta: paginationMeta(total, page, limit) };
  },

  async touch(token: string) {
    await DeviceToken.updateOne(
      { token, isActive: true },
      { $set: { lastActiveAt: new Date() } },
    );
  },

  async invalidateToken(token: string, reason: string) {
    await DeviceToken.updateMany(
      { token },
      {
        $set: {
          isActive: false,
          invalidatedAt: new Date(),
          invalidReason: reason.slice(0, 200),
        },
      },
    );
  },

  async listActiveForUser(userId: string) {
    return DeviceToken.find({ userId, isActive: true });
  },
};
