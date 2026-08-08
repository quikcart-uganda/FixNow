/**
 * Promotion Centre — review & clone sandbox marketing/CMS assets into production.
 * Clone never move. Builds on sandbox.service.promoteToProduction.
 */

import {
  Category,
  ContentBlock,
  ContentPage,
  PlatformPromotion,
  PortfolioMedia,
  SponsoredContent,
  TechnicianOffer,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { isProductionSuperAdmin } from './platformMode.service.js';
import { sandboxService } from '../sandbox/sandbox.service.js';
import { applyDataEnvironment } from '../sandbox/dataEnvironment.js';

export type PromotionQueueItem = {
  id: string;
  resourceType: string;
  title: string;
  status: string;
  dataEnvironment: string;
  updatedAt?: Date;
  preview?: Record<string, unknown>;
};

async function assertPsa(userId: string) {
  if (!(await isProductionSuperAdmin(userId))) {
    throw AppError.forbidden('Promotion Centre requires Production Super Admin');
  }
}

function sandboxFilter(): Record<string, unknown> {
  const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
  applyDataEnvironment(filter, 'sandbox');
  return filter;
}

export async function listPromotionQueue(limit = 40): Promise<{
  items: PromotionQueueItem[];
  supportedTypes: string[];
}> {
  const lim = Math.min(80, Math.max(1, limit));
  const filter = sandboxFilter();

  const [offers, sponsored, blocks, promos, pages, categories, portfolios] = await Promise.all([
    TechnicianOffer.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    SponsoredContent.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    ContentBlock.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    PlatformPromotion.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    ContentPage.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    Category.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
    PortfolioMedia.find(filter).sort({ updatedAt: -1 }).limit(lim).lean(),
  ]);

  const items: PromotionQueueItem[] = [
    ...offers.map((d) => ({
      id: d._id.toString(),
      resourceType: 'TechnicianOffer',
      title: String(d.title || 'Offer'),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { featured: Boolean(d.featured) },
    })),
    ...sponsored.map((d) => ({
      id: d._id.toString(),
      resourceType: 'SponsoredContent',
      title: String(d.title || 'Sponsored'),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { type: d.type },
    })),
    ...blocks.map((d) => ({
      id: d._id.toString(),
      resourceType: 'ContentBlock',
      title: String(d.title || 'Content block'),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { page: d.page, section: d.section },
    })),
    ...promos.map((d) => ({
      id: d._id.toString(),
      resourceType: 'PlatformPromotion',
      title: String(d.title || d.code || 'Promotion'),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { code: d.code },
    })),
    ...pages.map((d) => ({
      id: d._id.toString(),
      resourceType: 'CmsPage',
      title: String(d.title || d.slug),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { slug: d.slug, category: d.category },
    })),
    ...categories.map((d) => ({
      id: d._id.toString(),
      resourceType: 'Category',
      title: String(d.name || d.slug || 'Category'),
      status: 'active',
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
      preview: { slug: d.slug },
    })),
    ...portfolios.map((d) => ({
      id: d._id.toString(),
      resourceType: 'PortfolioItem',
      title: String(d.title || 'Portfolio item'),
      status: String(d.status || 'unknown'),
      dataEnvironment: String((d as { dataEnvironment?: string }).dataEnvironment || 'sandbox'),
      updatedAt: d.updatedAt,
    })),
  ].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });

  return {
    items: items.slice(0, lim),
    supportedTypes: [
      'TechnicianOffer',
      'SponsoredContent',
      'ContentBlock',
      'PlatformPromotion',
      'CmsPage',
      'Category',
      'PortfolioItem',
    ],
  };
}

export async function promoteItem(
  actorUserId: string,
  input: { resourceType: string; resourceId: string; note?: string },
) {
  await assertPsa(actorUserId);
  const result = await sandboxService.promoteToProduction(
    { userId: actorUserId },
    { resourceType: input.resourceType, resourceId: input.resourceId },
  );
  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'launch_centre.promote',
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    meta: { note: input.note, cloneId: (result.clone as { _id?: unknown })?._id },
  });
  return result;
}

export async function rejectItem(
  actorUserId: string,
  input: { resourceType: string; resourceId: string; reason?: string },
) {
  await assertPsa(actorUserId);
  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'launch_centre.promote_reject',
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    meta: { reason: input.reason || 'skipped/rejected in Promotion Centre' },
  });
  return { rejected: true, resourceId: input.resourceId };
}

export const promotionCentreService = {
  listQueue: listPromotionQueue,
  promote: promoteItem,
  reject: rejectItem,
};
