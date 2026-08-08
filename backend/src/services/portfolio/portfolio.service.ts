import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  CaseStudy,
  Category,
  Certificate,
  ModeratorAction,
  Portfolio,
  PortfolioMedia,
  TechnicianProfile,
  User,
  type ICaseStudy,
  type ICertificate,
  type IPortfolio,
  type IPortfolioMedia,
  type PortfolioItemKind,
} from '../../models/index.js';
import { MEDIA_TYPE } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import {
  assertDocumentVisibleToViewer,
  documentDataEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

function oid(id: string) {
  return new Types.ObjectId(id);
}

function idStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  return String(v);
}

function mapKindToMediaType(kind: string): string {
  if (kind === 'video') return MEDIA_TYPE.VIDEO;
  if (['certificate', 'licence', 'document'].includes(kind)) return MEDIA_TYPE.DOCUMENT;
  return MEDIA_TYPE.IMAGE;
}

function serializePortfolio(doc: IPortfolio) {
  return {
    id: doc._id.toString(),
    technicianUserId: doc.technicianUserId.toString(),
    technicianProfileId: doc.technicianProfileId.toString(),
    title: doc.title,
    summary: doc.summary,
    isPublic: doc.isPublic,
    coverMediaId: idStr(doc.coverMediaId),
    albumIds: doc.albumIds.map(String),
    itemCount: doc.itemCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeMedia(doc: IPortfolioMedia) {
  return {
    id: doc._id.toString(),
    portfolioId: doc.portfolioId.toString(),
    albumId: idStr(doc.albumId),
    technicianUserId: doc.technicianUserId.toString(),
    mediaType: doc.mediaType,
    kind: doc.kind,
    url: doc.url,
    thumbnailUrl: doc.thumbnailUrl,
    title: doc.title,
    caption: doc.caption,
    description: doc.description,
    tags: doc.tags,
    categoryId: idStr(doc.categoryId),
    district: doc.district,
    completionDate: doc.completionDate,
    customerPermission: doc.customerPermission,
    visibility: doc.visibility,
    featured: doc.featured,
    status: doc.status,
    beforeAfter: doc.beforeAfter,
    galleryUrls: doc.galleryUrls,
    videoUrl: doc.videoUrl,
    sortOrder: doc.sortOrder,
    moderationNote: doc.moderationNote,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeCaseStudy(doc: ICaseStudy) {
  return {
    id: doc._id.toString(),
    portfolioId: doc.portfolioId.toString(),
    technicianUserId: doc.technicianUserId.toString(),
    jobId: idStr(doc.jobId),
    title: doc.title,
    challenge: doc.challenge,
    solution: doc.solution,
    outcome: doc.outcome,
    categoryId: idStr(doc.categoryId),
    mediaIds: doc.mediaIds.map(String),
    coverImageUrl: doc.coverImageUrl,
    tags: doc.tags,
    district: doc.district,
    completionDate: doc.completionDate,
    customerPermission: doc.customerPermission,
    visibility: doc.visibility,
    featured: doc.featured,
    status: doc.status,
    isPublished: doc.isPublished,
    publishedAt: doc.publishedAt,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeCertificate(doc: ICertificate) {
  return {
    id: doc._id.toString(),
    portfolioId: doc.portfolioId.toString(),
    technicianUserId: doc.technicianUserId.toString(),
    title: doc.title,
    issuer: doc.issuer,
    kind: doc.kind,
    documentUrl: doc.documentUrl,
    thumbnailUrl: doc.thumbnailUrl,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    description: doc.description,
    visibility: doc.visibility,
    featured: doc.featured,
    status: doc.status,
    moderationNote: doc.moderationNote,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function loadOwnedMedia(userId: string, id: string) {
  const doc = await PortfolioMedia.findById(id);
  if (!doc || doc.isDeleted) throw AppError.notFound('Portfolio media not found');
  if (doc.technicianUserId.toString() !== userId) throw AppError.forbidden();
  return doc;
}

async function loadOwnedCaseStudy(userId: string, id: string) {
  const doc = await CaseStudy.findById(id);
  if (!doc || doc.isDeleted) throw AppError.notFound('Case study not found');
  if (doc.technicianUserId.toString() !== userId) throw AppError.forbidden();
  return doc;
}

async function loadOwnedCertificate(userId: string, id: string) {
  const doc = await Certificate.findById(id);
  if (!doc || doc.isDeleted) throw AppError.notFound('Certificate not found');
  if (doc.technicianUserId.toString() !== userId) throw AppError.forbidden();
  return doc;
}

async function validateCategoryId(categoryId?: string) {
  if (!categoryId) return undefined;
  const cat = await Category.findById(categoryId);
  if (!cat || cat.isDeleted) throw AppError.badRequest('Invalid category');
  return oid(categoryId);
}

function mediaListFilter(
  technicianUserId: string,
  req?: Request,
  publicOnly = false,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
  if (publicOnly) {
    filter.visibility = 'public';
    filter.status = 'active';
  } else if (req) {
    const status = String(req.query.status || '').trim();
    const kind = String(req.query.kind || '').trim();
    const q = String(req.query.q || '').trim();
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (q) filter.$text = { $search: q };
  }
  return filter;
}

export const portfolioService = {
  async ensurePortfolio(technicianUserId: string) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!profile) throw AppError.notFound('Technician profile not found');

    let portfolio = await Portfolio.findOne({ technicianUserId: oid(technicianUserId) });
    if (!portfolio) {
      portfolio = await Portfolio.create({
        technicianUserId: oid(technicianUserId),
        technicianProfileId: profile._id,
        title: profile.headline?.trim() || 'My Portfolio',
        summary: profile.bio?.slice(0, 2000),
        isPublic: true,
        albumIds: [],
        itemCount: 0,
      });
    }
    return { portfolio: serializePortfolio(portfolio) };
  },

  async listPublic(technicianUserId: string, req?: Request) {
    const viewerEnv = await resolveUserDataEnvironment(
      (req as { auth?: { userId?: string } } | undefined)?.auth?.userId,
    );
    const techUser = await User.findById(technicianUserId).select('dataEnvironment').lean();
    const techProfile = await TechnicianProfile.findOne({ userId: technicianUserId })
      .select('dataEnvironment')
      .lean();
    if (!techUser && !techProfile) throw AppError.notFound('Technician not found');
    assertDocumentVisibleToViewer(
      viewerEnv,
      documentDataEnvironment(techUser as { dataEnvironment?: unknown } | null) !== 'production'
        ? documentDataEnvironment(techUser as { dataEnvironment?: unknown } | null)
        : documentDataEnvironment(techProfile as { dataEnvironment?: unknown } | null),
      'Technician not found',
    );

    const { page, limit, skip } = parsePagination(req ?? ({ query: {} } as Request));
    const filter = mediaListFilter(technicianUserId, req, true);
    const [total, rows] = await Promise.all([
      PortfolioMedia.countDocuments(filter),
      PortfolioMedia.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    ]);
    return {
      items: rows.map(serializeMedia),
      meta: paginationMeta(total, page, limit),
    };
  },

  async listMine(technicianUserId: string, req?: Request) {
    const { page, limit, skip } = parsePagination(req ?? ({ query: {} } as Request));
    const filter = mediaListFilter(technicianUserId, req, false);
    const [total, rows] = await Promise.all([
      PortfolioMedia.countDocuments(filter),
      PortfolioMedia.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    ]);
    return {
      items: rows.map(serializeMedia),
      meta: paginationMeta(total, page, limit),
    };
  },

  async createMedia(userId: string, body: Record<string, unknown>) {
    const { portfolio } = await this.ensurePortfolio(userId);
    const kind = String(body.kind || 'photo') as PortfolioItemKind;
    const url = String(body.url || '').trim();
    if (!url) throw AppError.badRequest('Media url is required');

    const { assertMediaUploadAllowed } = await import('../marketplace/entitlements.service.js');
    const mediaKind =
      kind === 'video'
        ? 'video'
        : kind === 'before_after'
          ? 'before_after'
          : kind === 'certificate' || kind === 'licence'
            ? 'certificate'
            : 'photo';
    const ent = await assertMediaUploadAllowed(userId, mediaKind);

    const existingCount = await PortfolioMedia.countDocuments({ technicianUserId: oid(userId) });
    if (existingCount >= ent.limits.maxGalleryItems) {
      throw AppError.badRequest(`Gallery limit reached (${ent.limits.maxGalleryItems}). Upgrade or remove items.`);
    }
    if (kind === 'photo' || kind === 'image') {
      const photos = await PortfolioMedia.countDocuments({
        technicianUserId: oid(userId),
        kind: { $in: ['photo', 'image'] },
      });
      if (photos >= ent.limits.maxPhotos) {
        throw AppError.badRequest(`Photo limit reached (${ent.limits.maxPhotos}).`);
      }
    }
    if (kind === 'video') {
      const videos = await PortfolioMedia.countDocuments({ technicianUserId: oid(userId), kind: 'video' });
      if (videos >= ent.limits.maxVideos) {
        throw AppError.badRequest(`Video limit reached (${ent.limits.maxVideos}).`);
      }
    }
    if (kind === 'certificate' || kind === 'licence') {
      const certs = await PortfolioMedia.countDocuments({
        technicianUserId: oid(userId),
        kind: { $in: ['certificate', 'licence'] },
      });
      if (certs >= ent.limits.maxCertificates) {
        throw AppError.badRequest(`Certificate / licence limit reached (${ent.limits.maxCertificates}).`);
      }
    }

    const categoryId = await validateCategoryId(
      typeof body.categoryId === 'string' ? body.categoryId : undefined,
    );
    const needsReview = ['certificate', 'licence'].includes(kind);

    const maxOrder = await PortfolioMedia.findOne({ portfolioId: oid(portfolio.id) })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    const sortOrder = (maxOrder?.sortOrder ?? -1) + 1;

    const doc = await PortfolioMedia.create({
      portfolioId: oid(portfolio.id),
      technicianUserId: oid(userId),
      mediaType: mapKindToMediaType(kind),
      kind,
      url,
      thumbnailUrl: typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : undefined,
      title: typeof body.title === 'string' ? body.title.slice(0, 160) : undefined,
      caption: typeof body.caption === 'string' ? body.caption.slice(0, 500) : undefined,
      description: typeof body.description === 'string' ? body.description.slice(0, 4000) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
      categoryId,
      district: typeof body.district === 'string' ? body.district.slice(0, 80) : undefined,
      completionDate: body.completionDate ? new Date(String(body.completionDate)) : undefined,
      customerPermission: Boolean(body.customerPermission),
      visibility: body.visibility === 'private' ? 'private' : 'public',
      featured: Boolean(body.featured),
      status: needsReview ? 'pending_review' : 'active',
      beforeAfter:
        body.beforeAfter === 'before' || body.beforeAfter === 'after' ? body.beforeAfter : 'none',
      galleryUrls: Array.isArray(body.galleryUrls) ? body.galleryUrls.map(String).slice(0, 24) : [],
      videoUrl: typeof body.videoUrl === 'string' ? body.videoUrl : undefined,
      sortOrder,
    });

    await Portfolio.updateOne({ _id: oid(portfolio.id) }, { $inc: { itemCount: 1 } });

    await writeAuditLog({
      actorId: userId,
      actorRole: 'technician',
      action: 'portfolio.media.created',
      resourceType: 'PortfolioMedia',
      resourceId: doc._id.toString(),
    });

    return { media: serializeMedia(doc) };
  },

  async updateMedia(userId: string, id: string, body: Record<string, unknown>) {
    const doc = await loadOwnedMedia(userId, id);

    if (body.kind != null) {
      const kind = String(body.kind) as PortfolioItemKind;
      doc.kind = kind;
      doc.mediaType = mapKindToMediaType(kind);
    }
    for (const key of [
      'url',
      'thumbnailUrl',
      'title',
      'caption',
      'description',
      'district',
      'videoUrl',
    ] as const) {
      if (body[key] != null) (doc as Record<string, unknown>)[key] = body[key];
    }
    if (Array.isArray(body.tags)) doc.tags = body.tags.map(String).slice(0, 20);
    if (Array.isArray(body.galleryUrls)) doc.galleryUrls = body.galleryUrls.map(String).slice(0, 24);
    if (body.categoryId != null) {
      doc.categoryId = await validateCategoryId(
        typeof body.categoryId === 'string' ? body.categoryId : undefined,
      );
    }
    if (body.completionDate != null) doc.completionDate = new Date(String(body.completionDate));
    if (body.customerPermission != null) doc.customerPermission = Boolean(body.customerPermission);
    if (body.visibility === 'public' || body.visibility === 'private') doc.visibility = body.visibility;
    if (body.featured != null) doc.featured = Boolean(body.featured);
    if (body.beforeAfter === 'before' || body.beforeAfter === 'after' || body.beforeAfter === 'none') {
      doc.beforeAfter = body.beforeAfter;
    }
    if (body.status === 'active' || body.status === 'archived' || body.status === 'pending_review') {
      doc.status = body.status;
    }

    await doc.save();
    return { media: serializeMedia(doc) };
  },

  async removeMedia(userId: string, id: string) {
    const doc = await loadOwnedMedia(userId, id);
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    await Portfolio.updateOne(
      { _id: doc.portfolioId, itemCount: { $gt: 0 } },
      { $inc: { itemCount: -1 } },
    );
    await writeAuditLog({
      actorId: userId,
      actorRole: 'technician',
      action: 'portfolio.media.deleted',
      resourceType: 'PortfolioMedia',
      resourceId: id,
    });
    return { removed: true };
  },

  async archiveMedia(userId: string, id: string) {
    const doc = await loadOwnedMedia(userId, id);
    doc.status = 'archived';
    await doc.save();
    return { media: serializeMedia(doc) };
  },

  async restoreMedia(userId: string, id: string) {
    const doc = await loadOwnedMedia(userId, id);
    doc.status = 'active';
    await doc.save();
    return { media: serializeMedia(doc) };
  },

  async featureMedia(userId: string, id: string) {
    const doc = await loadOwnedMedia(userId, id);
    doc.featured = true;
    await doc.save();
    return { media: serializeMedia(doc) };
  },

  async reorderMedia(userId: string, orderedIds: string[]) {
    if (!orderedIds.length) throw AppError.badRequest('orderedIds is required');
    const portfolio = await Portfolio.findOne({ technicianUserId: oid(userId) });
    if (!portfolio) throw AppError.notFound('Portfolio not found');

    const media = await PortfolioMedia.find({
      portfolioId: portfolio._id,
      _id: { $in: orderedIds.map(oid) },
    });
    if (media.length !== orderedIds.length) throw AppError.badRequest('Invalid media ids');

    await Promise.all(
      orderedIds.map((mediaId, index) =>
        PortfolioMedia.updateOne({ _id: oid(mediaId), technicianUserId: oid(userId) }, { sortOrder: index }),
      ),
    );
    return { reordered: orderedIds.length };
  },

  async createCaseStudy(userId: string, body: Record<string, unknown>) {
    const { portfolio } = await this.ensurePortfolio(userId);
    const title = String(body.title || '').trim();
    const challenge = String(body.challenge || '').trim();
    const solution = String(body.solution || '').trim();
    if (!title || !challenge || !solution) {
      throw AppError.badRequest('title, challenge, and solution are required');
    }

    const categoryId = await validateCategoryId(
      typeof body.categoryId === 'string' ? body.categoryId : undefined,
    );
    const maxOrder = await CaseStudy.findOne({ portfolioId: oid(portfolio.id) })
      .sort({ sortOrder: -1 })
      .select('sortOrder');

    const doc = await CaseStudy.create({
      portfolioId: oid(portfolio.id),
      technicianUserId: oid(userId),
      jobId: typeof body.jobId === 'string' ? oid(body.jobId) : undefined,
      title: title.slice(0, 160),
      challenge: challenge.slice(0, 4000),
      solution: solution.slice(0, 4000),
      outcome: typeof body.outcome === 'string' ? body.outcome.slice(0, 2000) : undefined,
      categoryId,
      mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds.map((m) => oid(String(m))) : [],
      coverImageUrl: typeof body.coverImageUrl === 'string' ? body.coverImageUrl : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
      district: typeof body.district === 'string' ? body.district.slice(0, 80) : undefined,
      completionDate: body.completionDate ? new Date(String(body.completionDate)) : undefined,
      customerPermission: Boolean(body.customerPermission),
      visibility: body.visibility === 'private' ? 'private' : 'public',
      featured: Boolean(body.featured),
      status: 'pending_review',
      isPublished: false,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    });

    return { caseStudy: serializeCaseStudy(doc) };
  },

  async updateCaseStudy(userId: string, id: string, body: Record<string, unknown>) {
    const doc = await loadOwnedCaseStudy(userId, id);
    for (const key of ['title', 'challenge', 'solution', 'outcome', 'coverImageUrl', 'district'] as const) {
      if (body[key] != null) (doc as Record<string, unknown>)[key] = body[key];
    }
    if (Array.isArray(body.tags)) doc.tags = body.tags.map(String).slice(0, 20);
    if (Array.isArray(body.mediaIds)) doc.mediaIds = body.mediaIds.map((m) => oid(String(m)));
    if (body.categoryId != null) {
      doc.categoryId = await validateCategoryId(
        typeof body.categoryId === 'string' ? body.categoryId : undefined,
      );
    }
    if (body.completionDate != null) doc.completionDate = new Date(String(body.completionDate));
    if (body.customerPermission != null) doc.customerPermission = Boolean(body.customerPermission);
    if (body.visibility === 'public' || body.visibility === 'private') doc.visibility = body.visibility;
    if (body.featured != null) doc.featured = Boolean(body.featured);
    await doc.save();
    return { caseStudy: serializeCaseStudy(doc) };
  },

  async removeCaseStudy(userId: string, id: string) {
    const doc = await loadOwnedCaseStudy(userId, id);
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    return { removed: true };
  },

  async listCaseStudies(technicianUserId: string, req?: Request, publicOnly = false) {
    const { page, limit, skip } = parsePagination(req ?? ({ query: {} } as Request));
    const filter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
    if (publicOnly) {
      filter.visibility = 'public';
      filter.status = 'active';
      filter.isPublished = true;
    } else if (req) {
      const status = String(req.query.status || '').trim();
      const q = String(req.query.q || '').trim();
      if (status) filter.status = status;
      if (q) filter.title = new RegExp(escapeRegex(q), 'i');
    }
    const [total, rows] = await Promise.all([
      CaseStudy.countDocuments(filter),
      CaseStudy.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    ]);
    return {
      items: rows.map(serializeCaseStudy),
      meta: paginationMeta(total, page, limit),
    };
  },

  async createCertificate(userId: string, body: Record<string, unknown>) {
    const { portfolio } = await this.ensurePortfolio(userId);
    const title = String(body.title || '').trim();
    const documentUrl = String(body.documentUrl || body.url || '').trim();
    if (!title || !documentUrl) throw AppError.badRequest('title and documentUrl are required');

    const maxOrder = await Certificate.findOne({ portfolioId: oid(portfolio.id) })
      .sort({ sortOrder: -1 })
      .select('sortOrder');

    const doc = await Certificate.create({
      portfolioId: oid(portfolio.id),
      technicianUserId: oid(userId),
      title: title.slice(0, 160),
      issuer: typeof body.issuer === 'string' ? body.issuer.slice(0, 160) : undefined,
      kind: body.kind === 'licence' ? 'licence' : 'certificate',
      documentUrl,
      thumbnailUrl: typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : undefined,
      issuedAt: body.issuedAt ? new Date(String(body.issuedAt)) : undefined,
      expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : undefined,
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : undefined,
      visibility: body.visibility === 'private' ? 'private' : 'public',
      featured: Boolean(body.featured),
      status: 'pending_review',
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    });

    return { certificate: serializeCertificate(doc) };
  },

  async updateCertificate(userId: string, id: string, body: Record<string, unknown>) {
    const doc = await loadOwnedCertificate(userId, id);
    for (const key of ['title', 'issuer', 'documentUrl', 'thumbnailUrl', 'description'] as const) {
      if (body[key] != null) (doc as Record<string, unknown>)[key] = body[key];
    }
    if (body.kind === 'licence' || body.kind === 'certificate') doc.kind = body.kind;
    if (body.issuedAt != null) doc.issuedAt = new Date(String(body.issuedAt));
    if (body.expiresAt != null) doc.expiresAt = new Date(String(body.expiresAt));
    if (body.visibility === 'public' || body.visibility === 'private') doc.visibility = body.visibility;
    if (body.featured != null) doc.featured = Boolean(body.featured);
    await doc.save();
    return { certificate: serializeCertificate(doc) };
  },

  async removeCertificate(userId: string, id: string) {
    const doc = await loadOwnedCertificate(userId, id);
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    return { removed: true };
  },

  async listCertificates(technicianUserId: string, req?: Request, publicOnly = false) {
    const { page, limit, skip } = parsePagination(req ?? ({ query: {} } as Request));
    const filter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
    if (publicOnly) {
      filter.visibility = 'public';
      filter.status = 'active';
    } else if (req) {
      const status = String(req.query.status || '').trim();
      const kind = String(req.query.kind || '').trim();
      const q = String(req.query.q || '').trim();
      if (status) filter.status = status;
      if (kind) filter.kind = kind;
      if (q) filter.title = new RegExp(escapeRegex(q), 'i');
    }
    const [total, rows] = await Promise.all([
      Certificate.countDocuments(filter),
      Certificate.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    ]);
    return {
      items: rows.map(serializeCertificate),
      meta: paginationMeta(total, page, limit),
    };
  },

  async adminList(req: Request) {
    const { page, limit, skip } = parsePagination(req, { limit: 30 });
    const targetType = String(req.query.targetType || '').trim();
    const status = String(req.query.status || 'pending_review').trim();
    const technicianUserId = String(req.query.technicianUserId || '').trim();
    const q = String(req.query.q || '').trim();

    type QueueItem = {
      id: string;
      targetType: 'portfolio_media' | 'certificate' | 'case_study';
      technicianUserId: string;
      title: string;
      status: string;
      createdAt: Date;
      payload: Record<string, unknown>;
    };

    const baseFilter: Record<string, unknown> = { status };
    if (technicianUserId && /^[a-f\d]{24}$/i.test(technicianUserId)) {
      baseFilter.technicianUserId = oid(technicianUserId);
    }

    const fetchMedia = !targetType || targetType === 'media' || targetType === 'portfolio_media';
    const fetchCert = !targetType || targetType === 'certificate';
    const fetchCase = !targetType || targetType === 'case_study';

    const [mediaRows, certRows, caseRows] = await Promise.all([
      fetchMedia
        ? PortfolioMedia.find({
            ...baseFilter,
            ...(q ? { title: new RegExp(escapeRegex(q), 'i') } : {}),
          })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()
        : [],
      fetchCert
        ? Certificate.find({
            ...baseFilter,
            ...(q ? { title: new RegExp(escapeRegex(q), 'i') } : {}),
          })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()
        : [],
      fetchCase
        ? CaseStudy.find({
            ...baseFilter,
            ...(q ? { title: new RegExp(escapeRegex(q), 'i') } : {}),
          })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()
        : [],
    ]);

    const combined: QueueItem[] = [
      ...mediaRows.map((row) => ({
        id: String(row._id),
        targetType: 'portfolio_media' as const,
        technicianUserId: String(row.technicianUserId),
        title: row.title || row.caption || 'Portfolio media',
        status: row.status,
        createdAt: row.createdAt,
        payload: serializeMedia(row as IPortfolioMedia),
      })),
      ...certRows.map((row) => ({
        id: String(row._id),
        targetType: 'certificate' as const,
        technicianUserId: String(row.technicianUserId),
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        payload: serializeCertificate(row as ICertificate),
      })),
      ...caseRows.map((row) => ({
        id: String(row._id),
        targetType: 'case_study' as const,
        technicianUserId: String(row.technicianUserId),
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        payload: serializeCaseStudy(row as ICaseStudy),
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = combined.length;
    const items = combined.slice(skip, skip + limit);

    const techIds = [...new Set(items.map((i) => i.technicianUserId))];
    const users = techIds.length
      ? await User.find({ _id: { $in: techIds.map(oid) } })
          .select('fullName email')
          .lean()
      : [];
    const nameMap = new Map(users.map((u) => [String(u._id), u.fullName || u.email || 'Technician']));

    return {
      items: items.map((item) => ({
        ...item,
        technicianName: nameMap.get(item.technicianUserId) || 'Technician',
      })),
      meta: paginationMeta(total, page, limit),
    };
  },

  async adminModerate(
    adminId: string,
    targetType: 'media' | 'certificate' | 'case_study',
    id: string,
    action: 'approve' | 'reject' | 'feature' | 'archive',
    note?: string,
  ) {
    const now = new Date();
    const modTargetType =
      targetType === 'media' ? 'portfolio_media' : targetType === 'certificate' ? 'certificate' : 'case_study';

    if (targetType === 'media') {
      const doc = await PortfolioMedia.findById(id);
      if (!doc || doc.isDeleted) throw AppError.notFound('Portfolio media not found');
      if (action === 'approve') doc.status = 'active';
      else if (action === 'reject') doc.status = 'rejected';
      else if (action === 'feature') doc.featured = true;
      else if (action === 'archive') doc.status = 'archived';
      doc.moderationNote = note?.slice(0, 500);
      doc.moderatedByAdminId = oid(adminId);
      doc.moderatedAt = now;
      await doc.save();
    } else if (targetType === 'certificate') {
      const doc = await Certificate.findById(id);
      if (!doc || doc.isDeleted) throw AppError.notFound('Certificate not found');
      if (action === 'approve') doc.status = 'active';
      else if (action === 'reject') doc.status = 'rejected';
      else if (action === 'feature') doc.featured = true;
      else if (action === 'archive') doc.status = 'archived';
      doc.moderationNote = note?.slice(0, 500);
      doc.moderatedByAdminId = oid(adminId);
      doc.moderatedAt = now;
      await doc.save();
    } else {
      const doc = await CaseStudy.findById(id);
      if (!doc || doc.isDeleted) throw AppError.notFound('Case study not found');
      if (action === 'approve') {
        doc.status = 'active';
        doc.isPublished = true;
        doc.publishedAt = now;
      } else if (action === 'reject') doc.status = 'rejected';
      else if (action === 'feature') doc.featured = true;
      else if (action === 'archive') {
        doc.status = 'archived';
        doc.isPublished = false;
      }
      await doc.save();
    }

    await ModeratorAction.create({
      adminId: oid(adminId),
      targetType: modTargetType,
      targetId: oid(id),
      action,
      note: note?.slice(0, 1000),
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `portfolio.${action}`,
      resourceType: modTargetType,
      resourceId: id,
      meta: { note },
    });

    return { moderated: true, targetType, id, action };
  },

  async getUnifiedFeed(
    technicianUserId: string,
    opts: { publicOnly?: boolean; mediaLimit?: number; caseStudyLimit?: number; certificateLimit?: number } = {},
  ) {
    const publicOnly = opts.publicOnly ?? false;
    const mediaLimit = opts.mediaLimit ?? 48;
    const caseStudyLimit = opts.caseStudyLimit ?? 12;
    const certificateLimit = opts.certificateLimit ?? 12;

    const portfolioDoc = await Portfolio.findOne({ technicianUserId: oid(technicianUserId) });
    const portfolio = portfolioDoc ? serializePortfolio(portfolioDoc) : null;

    const mediaFilter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
    const caseFilter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
    const certFilter: Record<string, unknown> = { technicianUserId: oid(technicianUserId) };
    if (publicOnly) {
      mediaFilter.visibility = 'public';
      mediaFilter.status = 'active';
      caseFilter.visibility = 'public';
      caseFilter.status = 'active';
      caseFilter.isPublished = true;
      certFilter.visibility = 'public';
      certFilter.status = 'active';
    }

    const [media, caseStudies, certificates, mediaCount, caseStudyCount, certificateCount, featuredCount, photoCount, videoCount] =
      await Promise.all([
        PortfolioMedia.find(mediaFilter).sort({ featured: -1, sortOrder: 1, createdAt: -1 }).limit(mediaLimit),
        CaseStudy.find(caseFilter).sort({ featured: -1, sortOrder: 1, createdAt: -1 }).limit(caseStudyLimit),
        Certificate.find(certFilter).sort({ featured: -1, sortOrder: 1, createdAt: -1 }).limit(certificateLimit),
        PortfolioMedia.countDocuments(mediaFilter),
        CaseStudy.countDocuments(caseFilter),
        Certificate.countDocuments(certFilter),
        PortfolioMedia.countDocuments({ ...mediaFilter, featured: true }),
        PortfolioMedia.countDocuments({ ...mediaFilter, kind: 'photo' }),
        PortfolioMedia.countDocuments({ ...mediaFilter, kind: 'video' }),
      ]);

    return {
      portfolio,
      media: media.map(serializeMedia),
      caseStudies: caseStudies.map(serializeCaseStudy),
      certificates: certificates.map(serializeCertificate),
      counts: {
        media: mediaCount,
        photos: photoCount,
        videos: videoCount,
        caseStudies: caseStudyCount,
        certificates: certificateCount,
        featured: featuredCount,
        total: mediaCount + caseStudyCount + certificateCount,
      },
    };
  },
};
