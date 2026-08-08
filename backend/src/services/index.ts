import { notImplemented } from '../utils/notImplemented.js';
import { writeAuditLog } from '../utils/audit.js';
import { maskSensitive } from '../security/mask.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import type { Request } from 'express';
import { adminAuthService, authService } from './auth/auth.service.js';
import { adminIdentityService } from './admin/adminIdentity.service.js';
import { adminMarketplaceService } from './marketplace/admin.service.js';
import { categoryMarketplaceService } from './marketplace/category.service.js';
import { customerMarketplaceService } from './marketplace/customer.service.js';
import {
  applicationMarketplaceService,
  jobMarketplaceService,
} from './marketplace/job.service.js';
import { technicianMarketplaceService } from './marketplace/technician.service.js';
import { AuditLog, PlatformSetting, TechnicianProfile, TrustScore, Upload, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { ACCOUNT_STATUS } from '../models/shared/enums.js';
import { ROLES } from '../constants/roles.js';
import { recomputeTrustForTechnician } from './marketplace/trust.service.js';
import { messagingService } from './messaging/message.service.js';
import { verificationMarketplaceService } from './verification/verification.service.js';

export { authService, adminAuthService, adminIdentityService };

export const customerService = customerMarketplaceService;
export const technicianService = technicianMarketplaceService;
export const categoryService = categoryMarketplaceService;
export const jobService = jobMarketplaceService;
export const applicationService = applicationMarketplaceService;
export { jobCompletionService } from './marketplace/jobCompletion.service.js';
export {
  getFreeJobConfig,
  updateFreeJobConfigValue,
  resetTechnicianQuota,
  quotaSnapshot,
} from './marketplace/freeJob.service.js';

export const adminService = {
  getDashboard: () => adminMarketplaceService.dashboard(),
  listUsers: (req: import('express').Request) => adminMarketplaceService.listCustomers(req),
  ...adminMarketplaceService,
  updateUserStatus: async (
    userId: string,
    status: string,
    adminId: string,
    meta: { ip?: string; reason?: string } = {},
  ) => {
    const allowed = Object.values(ACCOUNT_STATUS) as string[];
    if (!allowed.includes(status)) {
      throw AppError.badRequest(`Invalid account status. Allowed: ${allowed.join(', ')}`);
    }
    if (status === ACCOUNT_STATUS.DELETED) {
      throw AppError.badRequest('Use account deletion flow instead of setting deleted via status');
    }

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (user.role === ROLES.ADMIN && status !== ACCOUNT_STATUS.ACTIVE) {
      throw AppError.forbidden('Admin account status must be managed via Admin Operators');
    }

    const before = user.accountStatus;
    user.accountStatus = status as typeof user.accountStatus;
    if (status === ACCOUNT_STATUS.ACTIVE) {
      user.lockUntil = undefined;
      user.failedLoginAttempts = 0;
    }
    if (status === ACCOUNT_STATUS.LOCKED && !user.lockUntil) {
      user.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    await user.save();

    if (user.role === ROLES.TECHNICIAN) {
      const techStatus =
        status === ACCOUNT_STATUS.SUSPENDED
          ? ACCOUNT_STATUS.SUSPENDED
          : status === ACCOUNT_STATUS.LOCKED
            ? ACCOUNT_STATUS.LOCKED
            : ACCOUNT_STATUS.ACTIVE;
      await TechnicianProfile.updateOne(
        { userId: user._id },
        {
          $set: {
            accountStatus: techStatus,
            ...(status === ACCOUNT_STATUS.SUSPENDED || status === ACCOUNT_STATUS.LOCKED
              ? { lockReason: meta.reason || `Admin set status to ${status}` }
              : { lockReason: undefined, unlockRequestedAt: undefined }),
          },
        },
      );
    }

    await writeAuditLog({
      actorId: adminId,
      actorRole: ROLES.ADMIN,
      action: 'admin.user.status',
      resourceType: 'User',
      resourceId: userId,
      ip: meta.ip,
      before: { accountStatus: before },
      after: { accountStatus: status, reason: meta.reason },
      severity: status === ACCOUNT_STATUS.SUSPENDED ? 'warning' : 'info',
    });

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        accountStatus: user.accountStatus,
      },
    };
  },
};

export const trustService = {
  getForTechnician: async (technicianUserId: string) => {
    const trust = await TrustScore.findOne({ technicianUserId });
    if (!trust) throw AppError.notFound('Trust score not found');
    return { trust };
  },
  recompute: async (technicianUserId: string) => {
    await recomputeTrustForTechnician(technicianUserId);
    const trust = await TrustScore.findOne({ technicianUserId });
    return { trust };
  },
};

export { portfolioService } from './portfolio/portfolio.service.js';
export { referralService } from './referral/referral.service.js';
export { communityService } from './community/community.service.js';

export const messageService = messagingService;

export { notificationService } from './push/notification.service.js';
export { reviewService, achievementService } from './reviews/review.service.js';

export const verificationService = verificationMarketplaceService;

export const uploadService = {
  registerUpload: async (input: {
    userId: string;
    file: { filename: string; mimetype: string; size: number; path: string; originalname: string };
    purpose?: string;
    keepLocal?: boolean;
  }) => {
    const fs = await import('node:fs/promises');
    const crypto = await import('node:crypto');

    // Hash staging file first so identical uploads are not pushed twice.
    let contentHash: string | undefined;
    try {
      const bytes = await fs.readFile(input.file.path);
      contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
      const existing = await Upload.findOne({
        contentHash,
        provider: 'cloudinary',
        isDeleted: { $ne: true },
      })
        .select('_id url filename originalName mimeType sizeBytes provider publicId width height format resourceType')
        .lean();
      if (existing?.url) {
        if (!input.keepLocal) {
          try {
            await fs.unlink(input.file.path);
          } catch {
            /* ignore */
          }
        }
        return {
          upload: {
            id: existing._id.toString(),
            url: existing.url,
            filename: existing.filename,
            originalName: existing.originalName,
            mimeType: existing.mimeType,
            sizeBytes: existing.sizeBytes,
            uploadedBy: input.userId,
            storage: 'cloudinary' as const,
            publicId: existing.publicId,
            width: existing.width,
            height: existing.height,
            format: existing.format,
            resourceType: existing.resourceType,
            duplicate: true,
          },
        };
      }
    } catch {
      contentHash = undefined;
    }

    const { getMediaStorage } = await import('../providers/storage/index.js');
    const storage = getMediaStorage();
    const persisted = await storage.persist({
      file: input.file,
      purpose: input.purpose,
      uploadedBy: input.userId,
      keepLocal: input.keepLocal,
    });

    const doc = await Upload.create({
      uploadedBy: input.userId,
      filename: persisted.filename,
      originalName: persisted.originalName,
      mimeType: persisted.mimeType,
      sizeBytes: persisted.bytes ?? input.file.size,
      path: persisted.provider === 'cloudinary' ? `cloudinary://${persisted.publicId || persisted.path}` : persisted.path,
      url: persisted.url,
      purpose: input.purpose ? `${input.purpose}|storage:${persisted.provider}` : `storage:${persisted.provider}`,
      provider: persisted.provider,
      publicId: persisted.publicId,
      format: persisted.format,
      width: persisted.width,
      height: persisted.height,
      resourceType: persisted.resourceType,
      contentHash: persisted.contentHash || contentHash,
    });

    await writeAuditLog({
      actorId: input.userId,
      action: 'upload.create',
      resourceType: 'Upload',
      resourceId: doc._id.toString(),
      meta: {
        filename: persisted.filename,
        mimeType: persisted.mimeType,
        sizeBytes: persisted.bytes ?? input.file.size,
        storage: persisted.provider,
        publicId: persisted.publicId,
        width: persisted.width,
        height: persisted.height,
        contentHash: persisted.contentHash || contentHash,
      },
    });

    return {
      upload: {
        id: doc._id.toString(),
        url: persisted.url,
        filename: persisted.filename,
        originalName: persisted.originalName,
        mimeType: persisted.mimeType,
        sizeBytes: persisted.bytes ?? input.file.size,
        uploadedBy: input.userId,
        storage: persisted.provider,
        publicId: persisted.publicId,
        width: persisted.width,
        height: persisted.height,
        format: persisted.format,
        resourceType: persisted.resourceType,
      },
    };
  },

  destroyUpload: async (uploadId: string, actorId: string) => {
    const doc = await Upload.findOne({ _id: uploadId, isDeleted: { $ne: true } });
    if (!doc) return { deleted: false };
    if (String(doc.uploadedBy) !== actorId) {
      const { User } = await import('../models/index.js');
      const { ROLES } = await import('../constants/roles.js');
      const actor = await User.findById(actorId).select('role').lean();
      if (actor?.role !== ROLES.ADMIN) {
        const { AppError } = await import('../utils/AppError.js');
        throw AppError.forbidden('You can only delete your own uploads');
      }
    }
    const { getMediaStorage } = await import('../providers/storage/index.js');
    const storage = getMediaStorage();
    await storage.destroy({
      path: doc.path,
      filename: doc.filename,
      publicId: doc.publicId,
      resourceType: doc.resourceType,
    });
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    await writeAuditLog({
      actorId,
      action: 'upload.delete',
      resourceType: 'Upload',
      resourceId: uploadId,
      meta: { publicId: doc.publicId, provider: doc.provider },
    });
    return { deleted: true };
  },
};

export const settingsService = {
  get: async (key: string) => {
    const normalized = String(key || '').trim();
    if (!normalized || normalized.length > 120) {
      throw AppError.badRequest('Invalid settings key');
    }
    const doc = await PlatformSetting.findOne({ key: normalized }).lean();
    if (!doc) throw AppError.notFound('Setting not found');
    return {
      key: doc.key,
      value: doc.isSecret ? { redacted: true } : doc.value,
      scope: doc.scope,
      description: doc.description,
      isSecret: doc.isSecret,
      updatedAt: doc.updatedAt,
    };
  },
  update: async (
    key: string,
    input: { value?: Record<string, unknown>; scope?: string; description?: string; isSecret?: boolean },
    actorId: string,
  ) => {
    const normalized = String(key || '').trim();
    if (!normalized || normalized.length > 120) {
      throw AppError.badRequest('Invalid settings key');
    }
    if (!input || typeof input.value !== 'object' || input.value === null || Array.isArray(input.value)) {
      throw AppError.badRequest('value must be a JSON object');
    }
    const scope =
      input.scope === 'customer' || input.scope === 'technician' || input.scope === 'admin'
        ? input.scope
        : 'platform';

    const before = await PlatformSetting.findOne({ key: normalized }).lean();
    const doc = await PlatformSetting.findOneAndUpdate(
      { key: normalized },
      {
        $set: {
          value: input.value,
          scope,
          description: input.description?.slice(0, 500),
          isSecret: Boolean(input.isSecret ?? before?.isSecret),
          updatedBy: actorId,
        },
        $setOnInsert: { key: normalized },
      },
      { upsert: true, new: true },
    );

    await writeAuditLog({
      actorId,
      actorRole: ROLES.ADMIN,
      action: 'settings.update',
      resourceType: 'PlatformSetting',
      resourceId: normalized,
      before: before ? { value: before.isSecret ? { redacted: true } : before.value } : undefined,
      after: { value: doc.isSecret ? { redacted: true } : doc.value, scope: doc.scope },
      severity: 'warning',
    });

    return {
      key: doc.key,
      value: doc.isSecret ? { redacted: true } : doc.value,
      scope: doc.scope,
      description: doc.description,
      isSecret: doc.isSecret,
      updatedAt: doc.updatedAt,
    };
  },
};

export {
  devControlsService,
  getDevControls,
  getCachedDevControls,
  isDevFeatureEnabled,
  isOtpExposureAllowed,
  DEV_CONTROLS_SETTING_KEY,
  DEV_FLAG_KEYS,
  type DevControls,
  type DevControlsState,
} from './platform/devControls.service.js';

export { providerManager } from './providers/provider.manager.js';
export type { ProviderType } from './providers/provider.catalog.js';

export { contentService } from './content/content.service.js';
export { contentBlockService } from './content/contentBlock.service.js';
export { accountDeletionService } from './content/accountDeletion.service.js';
export { trackingService } from './tracking/tracking.service.js';

export const auditService = {
  list: async (req: Request) => {
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    const q = req.query;

    if (typeof q.action === 'string' && q.action.trim()) filter.action = q.action.trim().slice(0, 80);
    if (typeof q.resourceType === 'string' && q.resourceType.trim()) {
      filter.resourceType = q.resourceType.trim().slice(0, 80);
    }
    if (typeof q.actorId === 'string' && /^[a-f\d]{24}$/i.test(q.actorId)) {
      filter.actorId = q.actorId;
    }
    if (typeof q.severity === 'string' && ['info', 'warning', 'critical'].includes(q.severity)) {
      filter.severity = q.severity;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      items: items.map((row) => ({
        id: row._id.toString(),
        actorId: row.actorId ? String(row.actorId) : null,
        actorRole: row.actorRole ?? null,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId ?? null,
        ip: row.ip ?? null,
        severity: row.severity,
        meta: row.meta ? maskSensitive(row.meta) : null,
        createdAt: row.createdAt,
      })),
      meta: paginationMeta(total, page, limit),
    };
  },

  record: async (input: {
    actorId?: string;
    actorRole?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
    severity?: 'info' | 'warning' | 'critical';
  }) => {
    await writeAuditLog(input);
    return { recorded: true };
  },
};

export const analyticsService = {
  platformSummary: (req?: import('express').Request) =>
    adminMarketplaceService.marketplaceMetrics(
      (req ?? ({ query: { days: '30' } } as unknown)) as import('express').Request,
    ),
  technicianPerformance: async () => notImplemented('Analytics.technicianPerformance'),
};

export const reportService = {
  jobsReport: (req: import('express').Request) => adminMarketplaceService.listJobs(req),
  usersReport: (req: import('express').Request) => adminMarketplaceService.listCustomers(req),
};

export { subscriptionMarketplaceService as subscriptionService } from './marketplace/subscription.service.js';
export { companyTeamService } from './marketplace/companyTeam.service.js';

export {
  paymentService,
  escrowService,
  payoutService,
  processEscrowAutoReleases,
} from './payments/payment.service.js';

export { aiService } from './ai/ai.service.js';
export { publicAiStatus, loadAiRuntimeConfig } from './ai/ai.config.js';
export { offerService } from './marketing/offer.service.js';
export { technicianMarketingCreativeService } from './marketing/technicianMarketingCreative.service.js';
export {
  platformPromotionService,
  sponsoredContentService,
  marketingAnalyticsService,
  marketingDeliveryService,
} from './marketing/marketing.service.js';

export const marketplaceService = {
  listListings: async () => notImplemented('Marketplace.listListings'),
  getListing: async () => notImplemented('Marketplace.getListing'),
  createListing: async () => notImplemented('Marketplace.createListing'),
  createOrder: async () => notImplemented('Marketplace.createOrder'),
};
