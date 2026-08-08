import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  ContentPage,
  type ContentAudience,
  type ContentCategory,
  type ContentStatus,
  type IContentPage,
} from '../../models/content/Content.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import { emitContentUpdated } from '../../sockets/realtime.js';
import {
  contentCacheGet,
  contentCacheInvalidate,
  contentCacheSet,
  publicContentCacheKey,
} from './content.cache.js';
import { DEFAULT_CONTENT_PAGES } from './content.seed.js';
import { resolveBodyHtml, sanitizeHtml } from './sanitizeHtml.js';
import {
  applySharedCatalogueEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function isObjectId(value: string) {
  return Types.ObjectId.isValid(value);
}

function toPublicDto(doc: IContentPage) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    category: doc.category,
    audience: doc.audience,
    bodyHtml: doc.bodyHtml,
    bodyMarkdown: doc.bodyMarkdown,
    excerpt: doc.excerpt,
    heroImageUrl: doc.heroImageUrl,
    attachments: doc.attachments,
    seoTitle: doc.seoTitle || doc.title,
    seoDescription: doc.seoDescription || doc.excerpt,
    keywords: doc.keywords,
    language: doc.language,
    version: doc.version,
    status: doc.status,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    sortOrder: doc.sortOrder,
  };
}

function toAdminDto(doc: IContentPage) {
  return {
    ...toPublicDto(doc),
    scheduledPublishAt: doc.scheduledPublishAt,
    archivedAt: doc.archivedAt,
    createdBy: doc.createdBy?.toString(),
    updatedBy: doc.updatedBy?.toString(),
    publishedBy: doc.publishedBy?.toString(),
    createdAt: doc.createdAt,
    isSystem: doc.isSystem,
    revisionHistory: (doc.revisionHistory || []).slice(-20).map((r) => ({
      version: r.version,
      title: r.title,
      status: r.status,
      snapshotAt: r.snapshotAt,
      actorId: r.actorId?.toString(),
      note: r.note,
    })),
  };
}

function pushRevision(doc: IContentPage, actorId: string | undefined, note: string) {
  doc.revisionHistory = doc.revisionHistory || [];
  doc.revisionHistory.push({
    version: doc.version,
    title: doc.title,
    bodyHtml: doc.bodyHtml,
    bodyMarkdown: doc.bodyMarkdown,
    status: doc.status,
    snapshotAt: new Date(),
    actorId: actorId && isObjectId(actorId) ? new Types.ObjectId(actorId) : undefined,
    note,
  });
  if (doc.revisionHistory.length > 50) {
    doc.revisionHistory = doc.revisionHistory.slice(-50);
  }
}

function invalidateAndEmit(doc: IContentPage, action: string) {
  contentCacheInvalidate('public:');
  contentCacheInvalidate('search:');
  emitContentUpdated(
    {
      id: doc._id.toString(),
      slug: doc.slug,
      category: doc.category,
      status: doc.status,
      version: doc.version,
      language: doc.language,
    },
    action,
  );
}

export type ContentWriteInput = {
  title?: string;
  slug?: string;
  category?: ContentCategory;
  audience?: ContentAudience;
  bodyHtml?: string;
  bodyMarkdown?: string;
  excerpt?: string;
  heroImageUrl?: string;
  attachments?: Array<{ name: string; url: string; mimeType?: string; sizeBytes?: number }>;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  language?: string;
  status?: ContentStatus;
  scheduledPublishAt?: string | Date | null;
  sortOrder?: number;
};

async function applyScheduledPublishes() {
  const now = new Date();
  const due = await ContentPage.find({
    status: 'scheduled',
    scheduledPublishAt: { $lte: now },
  }).limit(50);
  for (const doc of due) {
    doc.status = 'published';
    doc.publishedAt = now;
    doc.scheduledPublishAt = null;
    doc.version += 1;
    await doc.save();
    invalidateAndEmit(doc, 'published');
  }
}

export const contentService = {
  async runScheduledPublishes() {
    await applyScheduledPublishes();
  },

  async ensureDefaults(adminId?: string) {
    let created = 0;
    for (const seed of DEFAULT_CONTENT_PAGES) {
      const existing = await ContentPage.findOne({ slug: seed.slug, language: 'en' });
      if (existing) continue;
      const bodyHtml = resolveBodyHtml({ bodyMarkdown: seed.bodyMarkdown });
      await ContentPage.create({
        title: seed.title,
        slug: seed.slug,
        category: seed.category,
        audience: seed.audience,
        bodyMarkdown: seed.bodyMarkdown,
        bodyHtml,
        excerpt: seed.excerpt,
        keywords: seed.keywords,
        seoTitle: seed.seoTitle || seed.title,
        seoDescription: seed.seoDescription || seed.excerpt,
        language: 'en',
        status: 'published',
        version: 1,
        publishedAt: new Date(),
        publishedBy: adminId && isObjectId(adminId) ? adminId : undefined,
        sortOrder: seed.sortOrder ?? 0,
        isSystem: true,
      });
      created += 1;
    }
    if (created > 0) contentCacheInvalidate();
    return { created, total: DEFAULT_CONTENT_PAGES.length };
  },

  async listAdmin(req: Request) {
    await applyScheduledPublishes();
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const language = typeof req.query.language === 'string' ? req.query.language : undefined;
    const audience = typeof req.query.audience === 'string' ? req.query.audience : undefined;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (language) filter.language = language.toLowerCase();
    if (audience) filter.audience = audience;
    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { slug: { $regex: escapeRegex(q), $options: 'i' } },
        { keywords: { $regex: escapeRegex(q), $options: 'i' } },
        { excerpt: { $regex: escapeRegex(q), $options: 'i' } },
      ];
    }

    const [total, items] = await Promise.all([
      ContentPage.countDocuments(filter),
      ContentPage.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    return {
      items: items.map(toAdminDto),
      meta: paginationMeta(total, page, limit),
    };
  },

  async getAdminById(id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    return { page: toAdminDto(doc) };
  },

  async create(adminId: string, input: ContentWriteInput) {
    if (!input.title?.trim()) throw AppError.badRequest('Title is required');
    const slug = slugify(input.slug || input.title);
    const language = (input.language || 'en').toLowerCase();
    const existing = await ContentPage.findOne({ slug, language });
    if (existing) throw AppError.conflict('A page with this slug and language already exists');

    const bodyHtml = resolveBodyHtml(input);
    const status = input.status || 'draft';
    const doc = await ContentPage.create({
      title: input.title.trim(),
      slug,
      category: input.category || 'public',
      audience: input.audience || 'all',
      bodyHtml,
      bodyMarkdown: input.bodyMarkdown,
      excerpt: input.excerpt,
      heroImageUrl: input.heroImageUrl,
      attachments: input.attachments || [],
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      keywords: input.keywords || [],
      language,
      status,
      version: 1,
      scheduledPublishAt: input.scheduledPublishAt ? new Date(input.scheduledPublishAt) : null,
      publishedAt: status === 'published' ? new Date() : null,
      publishedBy: status === 'published' ? adminId : undefined,
      createdBy: adminId,
      updatedBy: adminId,
      sortOrder: input.sortOrder ?? 0,
      isSystem: false,
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.create',
      resourceType: 'ContentPage',
      resourceId: doc._id.toString(),
      meta: { slug: doc.slug, status: doc.status },
    });
    invalidateAndEmit(doc, 'created');
    return { page: toAdminDto(doc) };
  },

  async update(adminId: string, id: string, input: ContentWriteInput) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');

    pushRevision(doc, adminId, 'update');

    if (input.title !== undefined) doc.title = input.title.trim();
    if (input.slug !== undefined) {
      const nextSlug = slugify(input.slug);
      if (nextSlug !== doc.slug) {
        const clash = await ContentPage.findOne({ slug: nextSlug, language: doc.language, _id: { $ne: doc._id } });
        if (clash) throw AppError.conflict('Slug already in use for this language');
        doc.slug = nextSlug;
      }
    }
    if (input.category !== undefined) doc.category = input.category;
    if (input.audience !== undefined) doc.audience = input.audience;
    if (input.bodyMarkdown !== undefined || input.bodyHtml !== undefined) {
      doc.bodyMarkdown = input.bodyMarkdown ?? doc.bodyMarkdown;
      doc.bodyHtml = resolveBodyHtml({
        bodyMarkdown: input.bodyMarkdown ?? doc.bodyMarkdown,
        bodyHtml: input.bodyHtml ?? doc.bodyHtml,
      });
    }
    if (input.excerpt !== undefined) doc.excerpt = input.excerpt;
    if (input.heroImageUrl !== undefined) doc.heroImageUrl = input.heroImageUrl;
    if (input.attachments !== undefined) doc.attachments = input.attachments;
    if (input.seoTitle !== undefined) doc.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) doc.seoDescription = input.seoDescription;
    if (input.keywords !== undefined) doc.keywords = input.keywords;
    if (input.language !== undefined) doc.language = input.language.toLowerCase();
    if (input.sortOrder !== undefined) doc.sortOrder = input.sortOrder;
    if (input.scheduledPublishAt !== undefined) {
      doc.scheduledPublishAt = input.scheduledPublishAt ? new Date(input.scheduledPublishAt) : null;
      if (doc.scheduledPublishAt && doc.status === 'draft') doc.status = 'scheduled';
    }
    if (input.status !== undefined && input.status !== 'published') {
      doc.status = input.status;
    }

    doc.version += 1;
    doc.updatedBy = new Types.ObjectId(adminId);
    await doc.save();

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.update',
      resourceType: 'ContentPage',
      resourceId: id,
      meta: { slug: doc.slug, version: doc.version },
    });
    invalidateAndEmit(doc, 'updated');
    return { page: toAdminDto(doc) };
  },

  async publish(adminId: string, id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    pushRevision(doc, adminId, 'publish');
    doc.status = 'published';
    doc.publishedAt = new Date();
    doc.publishedBy = new Types.ObjectId(adminId);
    doc.scheduledPublishAt = null;
    doc.archivedAt = null;
    doc.version += 1;
    doc.updatedBy = new Types.ObjectId(adminId);
    doc.bodyHtml = sanitizeHtml(doc.bodyHtml);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.publish',
      resourceType: 'ContentPage',
      resourceId: id,
      meta: { slug: doc.slug, version: doc.version },
    });
    invalidateAndEmit(doc, 'published');
    return { page: toAdminDto(doc) };
  },

  async unpublish(adminId: string, id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    pushRevision(doc, adminId, 'unpublish');
    doc.status = 'draft';
    doc.version += 1;
    doc.updatedBy = new Types.ObjectId(adminId);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.unpublish',
      resourceType: 'ContentPage',
      resourceId: id,
    });
    invalidateAndEmit(doc, 'unpublished');
    return { page: toAdminDto(doc) };
  },

  async archive(adminId: string, id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    pushRevision(doc, adminId, 'archive');
    doc.status = 'archived';
    doc.archivedAt = new Date();
    doc.version += 1;
    doc.updatedBy = new Types.ObjectId(adminId);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.archive',
      resourceType: 'ContentPage',
      resourceId: id,
    });
    invalidateAndEmit(doc, 'archived');
    return { page: toAdminDto(doc) };
  },

  async restore(adminId: string, id: string, version?: number) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    const history = [...(doc.revisionHistory || [])].reverse();
    const snapshot = version
      ? history.find((h) => h.version === version)
      : history[0];
    if (!snapshot) throw AppError.badRequest('No revision available to restore');

    pushRevision(doc, adminId, `restore-v${snapshot.version}`);
    const draft = await ContentPage.create({
      title: `${snapshot.title} (restored)`,
      slug: `${doc.slug}-restored-${Date.now().toString(36)}`,
      category: doc.category,
      audience: doc.audience,
      bodyHtml: sanitizeHtml(snapshot.bodyHtml),
      bodyMarkdown: snapshot.bodyMarkdown,
      excerpt: doc.excerpt,
      heroImageUrl: doc.heroImageUrl,
      attachments: doc.attachments,
      seoTitle: doc.seoTitle,
      seoDescription: doc.seoDescription,
      keywords: doc.keywords,
      language: doc.language,
      status: 'draft',
      version: 1,
      createdBy: adminId,
      updatedBy: adminId,
      sortOrder: doc.sortOrder,
      isSystem: false,
      revisionHistory: [
        {
          version: snapshot.version,
          title: snapshot.title,
          bodyHtml: snapshot.bodyHtml,
          bodyMarkdown: snapshot.bodyMarkdown,
          status: snapshot.status,
          snapshotAt: new Date(),
          actorId: new Types.ObjectId(adminId),
          note: 'restored-from',
        },
      ],
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.restore',
      resourceType: 'ContentPage',
      resourceId: draft._id.toString(),
      meta: { fromId: id, fromVersion: snapshot.version },
    });
    invalidateAndEmit(draft, 'restored');
    return { page: toAdminDto(draft) };
  },

  async duplicate(adminId: string, id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    const copy = await ContentPage.create({
      title: `${doc.title} (copy)`,
      slug: `${doc.slug}-copy-${Date.now().toString(36)}`,
      category: doc.category,
      audience: doc.audience,
      bodyHtml: doc.bodyHtml,
      bodyMarkdown: doc.bodyMarkdown,
      excerpt: doc.excerpt,
      heroImageUrl: doc.heroImageUrl,
      attachments: doc.attachments,
      seoTitle: doc.seoTitle,
      seoDescription: doc.seoDescription,
      keywords: doc.keywords,
      language: doc.language,
      status: 'draft',
      version: 1,
      createdBy: adminId,
      updatedBy: adminId,
      sortOrder: doc.sortOrder,
      isSystem: false,
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.duplicate',
      resourceType: 'ContentPage',
      resourceId: copy._id.toString(),
      meta: { fromId: id },
    });
    invalidateAndEmit(copy, 'duplicated');
    return { page: toAdminDto(copy) };
  },

  async remove(adminId: string, id: string) {
    const doc = await ContentPage.findById(id);
    if (!doc) throw AppError.notFound('Content page not found');
    if (doc.isSystem && doc.status === 'published') {
      throw AppError.badRequest('Archive system pages before deleting, or unpublish first');
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.status = 'archived';
    doc.updatedBy = new Types.ObjectId(adminId);
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'content.delete',
      resourceType: 'ContentPage',
      resourceId: id,
    });
    invalidateAndEmit(doc, 'deleted');
    return { ok: true };
  },

  async getPublicBySlug(
    slug: string,
    opts: { language?: string; audience?: string; viewerUserId?: string | null } = {},
  ) {
    await applyScheduledPublishes();
    const language = (opts.language || 'en').toLowerCase();
    const audience = opts.audience || 'all';
    const viewerEnv = await resolveUserDataEnvironment(opts.viewerUserId);
    const cacheKey = `${publicContentCacheKey(slug, language, audience)}:${viewerEnv}`;
    const cached = contentCacheGet<ReturnType<typeof toPublicDto>>(cacheKey);
    if (cached) return { page: cached, cached: true };

    const filter: Record<string, unknown> = {
      slug: slugify(slug),
      language,
      status: 'published',
      $or: [{ audience: 'all' }, { audience }],
    };
    applySharedCatalogueEnvironment(filter, viewerEnv);
    const doc = await ContentPage.findOne(filter).sort({ publishedAt: -1 });
    if (!doc) throw AppError.notFound('Content not found');
    const page = toPublicDto(doc);
    contentCacheSet(cacheKey, page);
    return { page, cached: false };
  },

  async listPublic(req: Request) {
    await applyScheduledPublishes();
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const language = typeof req.query.language === 'string' ? req.query.language.toLowerCase() : 'en';
    const audience = typeof req.query.audience === 'string' ? req.query.audience : 'all';
    const viewerEnv = await resolveUserDataEnvironment(
      (req as { auth?: { userId?: string } }).auth?.userId,
    );

    const filter: Record<string, unknown> = {
      status: 'published',
      language,
      $or: [{ audience: 'all' }, { audience }],
    };
    if (category) filter.category = category;
    applySharedCatalogueEnvironment(filter, viewerEnv);

    const [total, items] = await Promise.all([
      ContentPage.countDocuments(filter),
      ContentPage.find(filter).sort({ sortOrder: 1, title: 1 }).skip(skip).limit(limit),
    ]);

    return {
      items: items.map(toPublicDto),
      meta: paginationMeta(total, page, limit),
    };
  },

  async searchPublic(req: Request) {
    await applyScheduledPublishes();
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw AppError.badRequest('Query q is required');
    const language = typeof req.query.language === 'string' ? req.query.language.toLowerCase() : 'en';
    const audience = typeof req.query.audience === 'string' ? req.query.audience : 'all';
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const viewerEnv = await resolveUserDataEnvironment(
      (req as { auth?: { userId?: string } }).auth?.userId,
    );
    const cacheKey = `search:${language}:${audience}:${category || 'any'}:${q.toLowerCase()}:${viewerEnv}`;
    const cached = contentCacheGet<{ items: ReturnType<typeof toPublicDto>[] }>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const filter: Record<string, unknown> = {
      status: 'published',
      language,
      $or: [{ audience: 'all' }, { audience }],
      $and: [
        {
          $or: [
            { title: { $regex: escapeRegex(q), $options: 'i' } },
            { excerpt: { $regex: escapeRegex(q), $options: 'i' } },
            { keywords: { $regex: escapeRegex(q), $options: 'i' } },
            { bodyMarkdown: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        },
      ],
    };
    if (category) filter.category = category;
    applySharedCatalogueEnvironment(filter, viewerEnv);

    const items = await ContentPage.find(filter).sort({ sortOrder: 1, title: 1 }).limit(40);
    const payload = { items: items.map(toPublicDto) };
    contentCacheSet(cacheKey, payload, 60_000);
    return { ...payload, cached: false };
  },
};
