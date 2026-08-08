import { Types } from 'mongoose';
import { AccountDeletionRequest, ContentPage } from '../../models/content/Content.js';
import { User } from '../../models/auth/User.js';
import { Session } from '../../models/auth/Session.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { contentService } from './content.service.js';

export const CONFIRM_DELETE_PHRASE = 'DELETE MY ACCOUNT';
const COOLING_OFF_HOURS = 48;

function summarizePolicy(bodyMarkdown?: string, bodyHtml?: string) {
  const text = bodyMarkdown || bodyHtml || '';
  const deleted: string[] = [];
  const retained: string[] = [];
  const lines = text.split(/\n+/);
  let mode: 'none' | 'deleted' | 'retained' = 'none';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('what is deleted')) mode = 'deleted';
    else if (lower.includes('what is retained')) mode = 'retained';
    else if (lower.startsWith('##')) mode = 'none';
    else if (mode === 'deleted' && line.trim()) deleted.push(line.replace(/^[-*]\s*/, '').trim());
    else if (mode === 'retained' && line.trim()) retained.push(line.replace(/^[-*]\s*/, '').trim());
  }
  return {
    deleted: deleted.length
      ? deleted
      : ['Profile details', 'Preferences', 'Device push tokens', 'Non-essential messaging history'],
    retained: retained.length
      ? retained
      : ['Payment / escrow records', 'Dispute evidence', 'Fraud prevention logs'],
  };
}

export const accountDeletionService = {
  async getPublicPolicy(language = 'en') {
    try {
      const { page } = await contentService.getPublicBySlug('delete-account', { language, audience: 'all' });
      const summary = summarizePolicy(page.bodyMarkdown, page.bodyHtml);
      return {
        page,
        confirmPhrase: CONFIRM_DELETE_PHRASE,
        coolingOffHours: COOLING_OFF_HOURS,
        deleted: summary.deleted,
        retained: summary.retained,
        recoveryNote: 'You can cancel during the cooling-off window before irreversible processing.',
        irreversibleNote: 'After processing completes, personal profile data cannot be restored.',
      };
    } catch {
      const fallback = await ContentPage.findOne({ slug: 'delete-account', status: 'published' });
      if (!fallback) throw AppError.notFound('Delete account policy not published');
      const summary = summarizePolicy(fallback.bodyMarkdown, fallback.bodyHtml);
      return {
        page: {
          id: fallback._id.toString(),
          title: fallback.title,
          slug: fallback.slug,
          version: fallback.version,
          bodyHtml: fallback.bodyHtml,
          bodyMarkdown: fallback.bodyMarkdown,
          publishedAt: fallback.publishedAt,
        },
        confirmPhrase: CONFIRM_DELETE_PHRASE,
        coolingOffHours: COOLING_OFF_HOURS,
        deleted: summary.deleted,
        retained: summary.retained,
        recoveryNote: 'You can cancel during the cooling-off window before irreversible processing.',
        irreversibleNote: 'After processing completes, personal profile data cannot be restored.',
      };
    }
  },

  async getStatus(userId: string) {
    const latest = await AccountDeletionRequest.findOne({ userId }).sort({ createdAt: -1 });
    if (!latest) return { request: null };
    return {
      request: {
        id: latest._id.toString(),
        status: latest.status,
        coolingOffEndsAt: latest.coolingOffEndsAt,
        processedAt: latest.processedAt,
        completedAt: latest.completedAt,
        cancelledAt: latest.cancelledAt,
        policyVersion: latest.policyVersion,
        deletedSummary: latest.deletedSummary,
        retainedSummary: latest.retainedSummary,
        createdAt: latest.createdAt,
      },
    };
  },

  async requestDeletion(
    userId: string,
    role: 'customer' | 'technician' | 'admin',
    input: { confirmPhrase: string; reason?: string; ipAddress?: string; userAgent?: string },
  ) {
    if (String(input.confirmPhrase || '').trim().toUpperCase() !== CONFIRM_DELETE_PHRASE) {
      throw AppError.badRequest(`Type ${CONFIRM_DELETE_PHRASE} to confirm`);
    }

    const existing = await AccountDeletionRequest.findOne({
      userId,
      status: { $in: ['pending', 'cooling_off', 'processing'] },
    });
    if (existing) throw AppError.conflict('A deletion request is already in progress');

    const policy = await this.getPublicPolicy();
    const coolingOffEndsAt = new Date(Date.now() + COOLING_OFF_HOURS * 60 * 60 * 1000);
    const request = await AccountDeletionRequest.create({
      userId,
      role,
      status: 'cooling_off',
      confirmPhrase: CONFIRM_DELETE_PHRASE,
      reason: input.reason,
      policySlug: 'delete-account',
      policyVersion: Number(policy.page.version || 1),
      coolingOffEndsAt,
      deletedSummary: policy.deleted,
      retainedSummary: policy.retained,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await writeAuditLog({
      actorId: userId,
      actorRole: role,
      action: 'account.deletion_requested',
      resourceType: 'AccountDeletionRequest',
      resourceId: request._id.toString(),
    });

    return {
      request: {
        id: request._id.toString(),
        status: request.status,
        coolingOffEndsAt: request.coolingOffEndsAt,
        policyVersion: request.policyVersion,
        deletedSummary: request.deletedSummary,
        retainedSummary: request.retainedSummary,
      },
    };
  },

  async cancelDeletion(userId: string) {
    const request = await AccountDeletionRequest.findOne({
      userId,
      status: { $in: ['pending', 'cooling_off'] },
    }).sort({ createdAt: -1 });
    if (!request) throw AppError.notFound('No cancellable deletion request');
    request.status = 'cancelled';
    request.cancelledAt = new Date();
    await request.save();
    await writeAuditLog({
      actorId: userId,
      actorRole: request.role,
      action: 'account.deletion_cancelled',
      resourceType: 'AccountDeletionRequest',
      resourceId: request._id.toString(),
    });
    return { request: { id: request._id.toString(), status: request.status } };
  },

  async processDueRequests(adminId?: string) {
    const due = await AccountDeletionRequest.find({
      status: 'cooling_off',
      coolingOffEndsAt: { $lte: new Date() },
    }).limit(25);

    let processed = 0;
    for (const request of due) {
      request.status = 'processing';
      request.processedAt = new Date();
      await request.save();

      const user = await User.findById(request.userId);
      if (user) {
        user.accountStatus = ACCOUNT_STATUS.DELETED;
        user.isDeleted = true;
        user.deletedAt = new Date();
        user.refreshTokenVersion += 1;
        user.email = `deleted+${user._id.toString()}@fixnow.invalid`;
        user.phone = undefined;
        user.fullName = 'Deleted User';
        await user.save();
        await Session.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        );
      }

      request.status = 'completed';
      request.completedAt = new Date();
      if (adminId) request.reviewedBy = new Types.ObjectId(adminId);
      await request.save();
      processed += 1;

      await writeAuditLog({
        actorId: adminId || request.userId.toString(),
        actorRole: adminId ? 'admin' : request.role,
        action: 'account.deletion_completed',
        resourceType: 'AccountDeletionRequest',
        resourceId: request._id.toString(),
      });
    }
    return { processed };
  },

  async listAdmin(limit = 50) {
    const items = await AccountDeletionRequest.find({}).sort({ createdAt: -1 }).limit(limit);
    return {
      items: items.map((r) => ({
        id: r._id.toString(),
        userId: r.userId.toString(),
        role: r.role,
        status: r.status,
        coolingOffEndsAt: r.coolingOffEndsAt,
        completedAt: r.completedAt,
        reason: r.reason,
        policyVersion: r.policyVersion,
        createdAt: r.createdAt,
      })),
    };
  },
};
