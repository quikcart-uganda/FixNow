import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  ContentBlock,
  CONTENT_BLOCK_TYPE,
  CONTENT_BLOCK_PAGE,
  CONTENT_BLOCK_STATUS,
  type IContentBlock,
  type ContentBlockAudience,
  type ContentBlockPage,
  type ContentBlockStatus,
  type ContentBlockType,
} from '../../models/growth/ContentBlock.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import { DEFAULT_CONTENT_BLOCKS } from './contentBlock.seed.js';
import {
  applySharedCatalogueEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

export type DeliveryChannel = 'public' | 'customer' | 'technician';

function oid(id: string) {
  return new Types.ObjectId(id);
}

function asDateOrNull(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) throw AppError.badRequest('Invalid date');
  return d;
}

/** Derive the delivery status from schedule + stored status (draft/archived stick). */
export function syncBlockStatus(doc: Pick<IContentBlock, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): ContentBlockStatus {
  if (doc.status === 'draft' || doc.status === 'archived') return doc.status;
  if (doc.endsAt && now >= doc.endsAt) return 'expired';
  if (doc.startsAt && now < doc.startsAt) return 'scheduled';
  return 'published';
}

/**
 * Which audiences a viewer on a given channel may see. This is the ONLY place
 * audience permissions are decided — the frontend never filters by audience.
 */
export function eligibleAudiences(
  channel: DeliveryChannel,
  authenticated: boolean,
  isNewUser: boolean,
): ContentBlockAudience[] {
  const set = new Set<ContentBlockAudience>();
  if (!authenticated || channel === 'public') set.add('guests');
  if (authenticated) {
    set.add('logged_in');
    set.add(isNewUser ? 'new_users' : 'returning_users');
  }
  if (channel === 'customer') {
    set.add('customers');
    set.add('both');
  } else if (channel === 'technician') {
    set.add('technicians');
    set.add('both');
  }
  return [...set];
}

function serialize(doc: IContentBlock) {
  const impressions = doc.analytics?.impressions || 0;
  const clicks = doc.analytics?.clicks || 0;
  return {
    id: doc._id.toString(),
    type: doc.type,
    audience: doc.audience,
    page: doc.page,
    section: doc.section,
    locale: doc.locale,
    title: doc.title,
    subtitle: doc.subtitle,
    body: doc.body,
    imageUrl: doc.imageUrl,
    icon: doc.icon,
    ctaLabel: doc.ctaLabel,
    ctaHref: doc.ctaHref,
    color: doc.color,
    badge: doc.badge,
    status: syncBlockStatus(doc),
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    priority: doc.priority,
    displayOrder: doc.displayOrder,
    weight: doc.weight,
    maxImpressions: doc.maxImpressions,
    frequencyCapPerDay: doc.frequencyCapPerDay,
    analytics: {
      impressions,
      clicks,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(1)) : 0,
    },
    createdByAdminId: doc.createdByAdminId?.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Public projection — only what the apps need to render. */
function serializePublic(doc: IContentBlock) {
  return {
    id: doc._id.toString(),
    type: doc.type,
    page: doc.page,
    section: doc.section,
    title: doc.title,
    subtitle: doc.subtitle,
    body: doc.body,
    imageUrl: doc.imageUrl,
    icon: doc.icon,
    ctaLabel: doc.ctaLabel,
    ctaHref: doc.ctaHref,
    color: doc.color,
    badge: doc.badge,
    priority: doc.priority,
    displayOrder: doc.displayOrder,
    weight: doc.weight,
  };
}

export const contentBlockService = {
  /**
   * Audience-filtered delivery. The backend decides visibility from role/auth,
   * schedule window, status, and impression caps. Returns blocks grouped by
   * section (each section pre-sorted by rank), plus a flat list.
   */
  async deliver(
    channel: DeliveryChannel,
    opts: {
      page?: string;
      section?: string;
      locale?: string;
      authenticated: boolean;
      isNewUser: boolean;
      viewerUserId?: string | null;
    },
  ) {
    const now = new Date();
    const locale = (opts.locale || 'en').toLowerCase();
    const audiences = eligibleAudiences(channel, opts.authenticated, opts.isNewUser);

    const filter: Record<string, unknown> = {
      status: { $in: ['published', 'scheduled'] },
      audience: { $in: audiences },
      locale,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
        { $or: [{ maxImpressions: null }, { $expr: { $lt: ['$analytics.impressions', '$maxImpressions'] } }] },
      ],
    };

    if (opts.page) {
      const page = String(opts.page);
      filter.page = { $in: [page, 'global'] };
    }
    if (opts.section) filter.section = String(opts.section).toLowerCase();

    const viewerEnv = await resolveUserDataEnvironment(opts.viewerUserId);
    applySharedCatalogueEnvironment(filter, viewerEnv);

    const rows = await ContentBlock.find(filter)
      .sort({ priority: -1, displayOrder: 1, weight: -1, createdAt: -1 })
      .limit(100);

    const items = rows.map(serializePublic);
    const bySection: Record<string, ReturnType<typeof serializePublic>[]> = {};
    for (const item of items) {
      (bySection[item.section] ??= []).push(item);
    }

    return { items, bySection, channel, audiences };
  },

  /** Fire-and-forget impression/click tracking. No auth required. */
  async track(id: string, event: 'impression' | 'click') {
    const field = event === 'click' ? 'analytics.clicks' : 'analytics.impressions';
    await ContentBlock.updateOne({ _id: id, isDeleted: false }, { $inc: { [field]: 1 } });
    return { ok: true };
  },

  // --- Admin CRUD ---

  async listAdmin(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = {};
    const status = String(req.query.status || '').trim();
    const type = String(req.query.type || '').trim();
    const targetPage = String(req.query.page || req.query.targetPage || '').trim();
    const audience = String(req.query.audience || '').trim();
    const q = String(req.query.q || '').trim();
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (targetPage && (CONTENT_BLOCK_PAGE as readonly string[]).includes(targetPage)) filter.page = targetPage;
    if (audience) filter.audience = audience;
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');

    const [total, rows] = await Promise.all([
      ContentBlock.countDocuments(filter),
      ContentBlock.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    // Keep stored status aligned with the schedule so admin lists are truthful.
    for (const row of rows) {
      const next = syncBlockStatus(row);
      if (next !== row.status) {
        row.status = next;
        await row.save();
      }
    }

    return { items: rows.map(serialize), meta: paginationMeta(total, page, limit) };
  },

  async getAdmin(id: string) {
    const doc = await ContentBlock.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content block not found');
    return { block: serialize(doc) };
  },

  async create(adminId: string, body: Record<string, unknown>) {
    const type = String(body.type || '') as ContentBlockType;
    if (!CONTENT_BLOCK_TYPE.includes(type)) throw AppError.badRequest('Invalid content type');
    const page = String(body.page || '') as ContentBlockPage;
    if (!CONTENT_BLOCK_PAGE.includes(page)) throw AppError.badRequest('Invalid page target');
    const section = String(body.section || '').trim().toLowerCase();
    if (!section) throw AppError.badRequest('Section is required');

    const startsAt = asDateOrNull(body.startsAt);
    const endsAt = asDateOrNull(body.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) throw AppError.badRequest('End date must be after start date');

    let status: ContentBlockStatus = 'draft';
    if (body.status && (CONTENT_BLOCK_STATUS as readonly string[]).includes(String(body.status))) {
      status = String(body.status) as ContentBlockStatus;
    } else if (body.publish) {
      status = 'published';
    }
    status = syncBlockStatus({ status, startsAt, endsAt });

    const doc = await ContentBlock.create({
      type,
      audience: body.audience || 'both',
      page,
      section,
      locale: String(body.locale || 'en').toLowerCase(),
      title: body.title != null ? String(body.title) : undefined,
      subtitle: body.subtitle != null ? String(body.subtitle) : undefined,
      body: body.body != null ? String(body.body) : undefined,
      imageUrl: body.imageUrl != null ? String(body.imageUrl) : undefined,
      icon: body.icon != null ? String(body.icon) : undefined,
      ctaLabel: body.ctaLabel != null ? String(body.ctaLabel) : undefined,
      ctaHref: body.ctaHref != null ? String(body.ctaHref) : undefined,
      color: body.color != null ? String(body.color) : undefined,
      badge: body.badge != null ? String(body.badge) : undefined,
      status,
      startsAt,
      endsAt,
      priority: Number(body.priority || 0),
      displayOrder: Number(body.displayOrder || 0),
      weight: body.weight != null ? Number(body.weight) : 1,
      maxImpressions: body.maxImpressions != null ? Number(body.maxImpressions) : null,
      frequencyCapPerDay: body.frequencyCapPerDay != null ? Number(body.frequencyCapPerDay) : null,
      analytics: { impressions: 0, clicks: 0 },
      createdByAdminId: oid(adminId),
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content_block.created',
      resourceType: 'ContentBlock',
      resourceId: doc._id.toString(),
    });
    return { block: serialize(doc) };
  },

  async update(adminId: string, id: string, body: Record<string, unknown>) {
    const doc = await ContentBlock.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content block not found');

    for (const key of [
      'title',
      'subtitle',
      'body',
      'imageUrl',
      'icon',
      'ctaLabel',
      'ctaHref',
      'color',
      'badge',
      'section',
      'locale',
    ] as const) {
      if (body[key] != null) (doc as never as Record<string, unknown>)[key] = String(body[key]);
    }
    if (body.type != null) {
      if (!CONTENT_BLOCK_TYPE.includes(String(body.type) as ContentBlockType)) {
        throw AppError.badRequest('Invalid content type');
      }
      doc.type = String(body.type) as ContentBlockType;
    }
    if (body.page != null) {
      if (!CONTENT_BLOCK_PAGE.includes(String(body.page) as ContentBlockPage)) {
        throw AppError.badRequest('Invalid page target');
      }
      doc.page = String(body.page) as ContentBlockPage;
    }
    if (body.audience != null) doc.audience = body.audience as ContentBlockAudience;
    if (body.priority != null) doc.priority = Number(body.priority);
    if (body.displayOrder != null) doc.displayOrder = Number(body.displayOrder);
    if (body.weight != null) doc.weight = Number(body.weight);
    if ('maxImpressions' in body) doc.maxImpressions = body.maxImpressions != null ? Number(body.maxImpressions) : null;
    if ('frequencyCapPerDay' in body)
      doc.frequencyCapPerDay = body.frequencyCapPerDay != null ? Number(body.frequencyCapPerDay) : null;
    if ('startsAt' in body) doc.startsAt = asDateOrNull(body.startsAt);
    if ('endsAt' in body) doc.endsAt = asDateOrNull(body.endsAt);
    if (doc.startsAt && doc.endsAt && doc.endsAt <= doc.startsAt) {
      throw AppError.badRequest('End date must be after start date');
    }
    if (body.status && (CONTENT_BLOCK_STATUS as readonly string[]).includes(String(body.status))) {
      doc.status = String(body.status) as ContentBlockStatus;
    }
    doc.status = syncBlockStatus(doc);
    doc.updatedByAdminId = oid(adminId);
    await doc.save();

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content_block.updated',
      resourceType: 'ContentBlock',
      resourceId: doc._id.toString(),
    });
    return { block: serialize(doc) };
  },

  async setStatus(adminId: string, id: string, status: ContentBlockStatus) {
    const doc = await ContentBlock.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content block not found');
    doc.status = status;
    doc.status = syncBlockStatus(doc);
    doc.updatedByAdminId = oid(adminId);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `content_block.${status}`,
      resourceType: 'ContentBlock',
      resourceId: doc._id.toString(),
    });
    return { block: serialize(doc) };
  },

  async duplicate(adminId: string, id: string) {
    const source = await ContentBlock.findById(id);
    if (!source || source.isDeleted) throw AppError.notFound('Content block not found');
    const clone = source.toObject() as unknown as Record<string, unknown>;
    delete clone._id;
    delete clone.id;
    delete clone.createdAt;
    delete clone.updatedAt;
    const doc = await ContentBlock.create({
      ...clone,
      title: source.title ? `${source.title} (copy)` : source.title,
      status: 'draft',
      analytics: { impressions: 0, clicks: 0 },
      createdByAdminId: oid(adminId),
      updatedByAdminId: undefined,
    });
    return { block: serialize(doc) };
  },

  async remove(adminId: string, id: string) {
    const doc = await ContentBlock.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Content block not found');
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.status = 'archived';
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content_block.deleted',
      resourceType: 'ContentBlock',
      resourceId: doc._id.toString(),
    });
    return { ok: true };
  },

  /** Aggregate analytics for the admin marketing dashboard. */
  async analyticsOverview() {
    const rows = await ContentBlock.find({});
    const now = new Date();
    let impressions = 0;
    let clicks = 0;
    let live = 0;
    let scheduled = 0;
    let draft = 0;
    for (const r of rows) {
      impressions += r.analytics?.impressions || 0;
      clicks += r.analytics?.clicks || 0;
      const s = syncBlockStatus(r, now);
      if (s === 'published') live += 1;
      else if (s === 'scheduled') scheduled += 1;
      else if (s === 'draft') draft += 1;
    }
    const topPerforming = [...rows]
      .sort((a, b) => (b.analytics?.clicks || 0) - (a.analytics?.clicks || 0))
      .slice(0, 8)
      .map((r) => ({
        id: r._id.toString(),
        title: r.title || r.section,
        page: r.page,
        section: r.section,
        impressions: r.analytics?.impressions || 0,
        clicks: r.analytics?.clicks || 0,
      }));
    return {
      totals: {
        blocks: rows.length,
        live,
        scheduled,
        draft,
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(1)) : 0,
      },
      topPerforming,
    };
  },

  /** Flip scheduled→published and published→expired based on the clock. */
  async runScheduledTransitions(now = new Date()) {
    const [published, expired] = await Promise.all([
      ContentBlock.updateMany(
        {
          status: 'scheduled',
          startsAt: { $ne: null, $lte: now },
          $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
        },
        { $set: { status: 'published' } },
      ),
      ContentBlock.updateMany(
        { status: { $in: ['published', 'scheduled'] }, endsAt: { $ne: null, $lte: now } },
        { $set: { status: 'expired' } },
      ),
    ]);
    return { published: published.modifiedCount ?? 0, expired: expired.modifiedCount ?? 0 };
  },

  /**
   * Idempotently seed sensible default blocks so pages are never empty even
   * before admins author content. Only inserts blocks that don't already exist
   * (matched by page + section + audience + locale).
   */
  async ensureDefaults(adminId?: string) {
    const systemAdminId = adminId ? oid(adminId) : new Types.ObjectId();
    let created = 0;
    for (const seed of DEFAULT_CONTENT_BLOCKS) {
      const exists = await ContentBlock.findOne({
        page: seed.page,
        section: seed.section,
        audience: seed.audience,
        locale: seed.locale || 'en',
        type: seed.type,
        title: seed.title || null,
        displayOrder: seed.displayOrder ?? 0,
      }).lean();
      if (exists) continue;
      await ContentBlock.create({
        ...seed,
        locale: seed.locale || 'en',
        status: 'published',
        analytics: { impressions: 0, clicks: 0 },
        createdByAdminId: systemAdminId,
      });
      created += 1;
    }
    if (created > 0 && adminId) {
      await writeAuditLog({
        actorId: adminId,
        actorRole: 'admin',
        action: 'content_block.seed',
        resourceType: 'ContentBlock',
        resourceId: 'defaults',
        meta: { created },
      });
    }
    return { created, total: DEFAULT_CONTENT_BLOCKS.length };
  },
};
