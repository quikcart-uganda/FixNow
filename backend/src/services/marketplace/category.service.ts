import type { Request } from 'express';
import mongoose from 'mongoose';
import {
  CaseStudy,
  Category,
  Job,
  MarketplaceListing,
  PortfolioAlbum,
  SearchAnalytics,
  SkillVerification,
  Subcategory,
  TechnicianOffer,
  TechnicianProfile,
  TechnicianService,
  type CategoryStatus,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';
import { emitCategoryUpdated } from '../../sockets/realtime.js';
import {
  applySharedCatalogueEnvironment,
  resolveUserDataEnvironment,
} from '../sandbox/dataEnvironment.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function syncActiveFromStatus(status: CategoryStatus): boolean {
  return status === 'active';
}

function resolveStatus(input: {
  status?: CategoryStatus;
  isActive?: boolean;
  current?: CategoryStatus;
}): CategoryStatus {
  if (input.status) return input.status;
  if (input.isActive === false) return 'suspended';
  if (input.isActive === true) return 'active';
  return input.current ?? 'active';
}

type CategoryUsage = {
  jobs: number;
  technicians: number;
  technicianServices: number;
  offers: number;
  skillVerifications: number;
  portfolioAlbums: number;
  caseStudies: number;
  searchAnalytics: number;
  marketplaceListings: number;
  subcategories: number;
  total: number;
};

async function countUsage(categoryId: string): Promise<CategoryUsage> {
  const oid = new mongoose.Types.ObjectId(categoryId);
  const [
    jobs,
    technicians,
    technicianServices,
    offers,
    skillVerifications,
    portfolioAlbums,
    caseStudies,
    searchAnalytics,
    marketplaceListings,
    subcategories,
  ] = await Promise.all([
    Job.countDocuments({ categoryId: oid }),
    TechnicianProfile.countDocuments({ primaryCategoryId: oid }),
    TechnicianService.countDocuments({ categoryId: oid }),
    TechnicianOffer.countDocuments({ categoryIds: oid }),
    SkillVerification.countDocuments({ categoryId: oid }),
    PortfolioAlbum.countDocuments({ categoryId: oid }),
    CaseStudy.countDocuments({ categoryId: oid }),
    SearchAnalytics.countDocuments({ categoryId: oid }),
    MarketplaceListing.countDocuments({ categoryId: oid }),
    Subcategory.countDocuments({ categoryId: oid }),
  ]);
  const total =
    jobs +
    technicians +
    technicianServices +
    offers +
    skillVerifications +
    portfolioAlbums +
    caseStudies +
    searchAnalytics +
    marketplaceListings;
  return {
    jobs,
    technicians,
    technicianServices,
    offers,
    skillVerifications,
    portfolioAlbums,
    caseStudies,
    searchAnalytics,
    marketplaceListings,
    subcategories,
    total,
  };
}

function serializeCategory(
  c: InstanceType<typeof Category>,
  extras?: { subcategories?: unknown[]; usage?: CategoryUsage },
) {
  const obj = c.toObject();
  const status = (obj.status as CategoryStatus | undefined) ?? (obj.isActive ? 'active' : 'suspended');
  return {
    ...obj,
    status,
    isActive: obj.isActive !== false && status === 'active',
    subcategories: extras?.subcategories ?? [],
    usage: extras?.usage,
  };
}

export const categoryMarketplaceService = {
  async list(req: Request) {
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const activeOnly = req.query.active !== 'false';
    const statusFilter =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? (req.query.status.trim() as CategoryStatus | 'all')
        : undefined;
    const includeUsage = req.query.includeUsage === 'true';

    const filter: Record<string, unknown> = {};
    if (activeOnly) {
      // Public surfaces: only active categories (legacy rows without status still work via isActive).
      filter.isActive = true;
    } else if (statusFilter && statusFilter !== 'all') {
      filter.status = statusFilter;
      if (statusFilter === 'active') filter.isActive = true;
      if (statusFilter === 'suspended' || statusFilter === 'archived') filter.isActive = false;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: escapeRegex(q), $options: 'i' } },
        { slug: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } },
      ];
    }

    // Shared taxonomy: production never sees sandbox categories; sandbox may see production + own.
    const viewerEnv = await resolveUserDataEnvironment(
      (req as { auth?: { userId?: string } }).auth?.userId,
    );
    applySharedCatalogueEnvironment(filter, viewerEnv);

    const [total, categories] = await Promise.all([
      Category.countDocuments(filter),
      Category.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit),
    ]);

    const subs = await Subcategory.find({
      categoryId: { $in: categories.map((c) => c._id) },
      ...(activeOnly ? { isActive: true } : {}),
    }).sort({ sortOrder: 1, name: 1 });

    const byCat = new Map<string, typeof subs>();
    for (const s of subs) {
      const key = s.categoryId.toString();
      const list = byCat.get(key) ?? [];
      list.push(s);
      byCat.set(key, list);
    }

    const usageById = new Map<string, CategoryUsage>();
    if (includeUsage && categories.length) {
      await Promise.all(
        categories.map(async (c) => {
          usageById.set(c._id.toString(), await countUsage(c._id.toString()));
        }),
      );
    }

    return {
      items: categories.map((c) =>
        serializeCategory(c, {
          subcategories: byCat.get(c._id.toString()) ?? [],
          usage: usageById.get(c._id.toString()),
        }),
      ),
      meta: paginationMeta(total, page, limit),
    };
  },

  async create(
    adminId: string,
    input: {
      name: string;
      icon?: string;
      description?: string;
      sortOrder?: number;
      slug?: string;
      bannerImageUrl?: string;
      accentColor?: string;
      status?: CategoryStatus;
      isActive?: boolean;
    },
  ) {
    const slug = input.slug ?? slugify(input.name);
    const existing = await Category.findOne({ $or: [{ slug }, { name: input.name }] });
    if (existing) throw AppError.conflict('Category already exists');
    const status = resolveStatus({ status: input.status, isActive: input.isActive });
    const category = await Category.create({
      name: input.name,
      slug,
      icon: input.icon,
      description: input.description,
      bannerImageUrl: input.bannerImageUrl,
      accentColor: input.accentColor,
      sortOrder: input.sortOrder ?? 0,
      status,
      isActive: syncActiveFromStatus(status),
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'category.create',
      resourceType: 'Category',
      resourceId: category._id.toString(),
    });
    emitCategoryUpdated(category, 'created');
    return { category: serializeCategory(category) };
  },

  async update(
    adminId: string,
    categoryId: string,
    input: Partial<{
      name: string;
      icon: string;
      description: string;
      sortOrder: number;
      isActive: boolean;
      status: CategoryStatus;
      slug: string;
      bannerImageUrl: string;
      accentColor: string;
    }>,
  ) {
    const category = await Category.findById(categoryId);
    if (!category) throw AppError.notFound('Category not found');

    if (input.name !== undefined) category.name = input.name;
    if (input.slug !== undefined) category.slug = input.slug;
    if (input.icon !== undefined) category.icon = input.icon;
    if (input.description !== undefined) category.description = input.description;
    if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
    if (input.bannerImageUrl !== undefined) category.bannerImageUrl = input.bannerImageUrl;
    if (input.accentColor !== undefined) category.accentColor = input.accentColor;

    const nextStatus = resolveStatus({
      status: input.status,
      isActive: input.isActive,
      current: (category.status as CategoryStatus | undefined) ?? (category.isActive ? 'active' : 'suspended'),
    });
    if (input.status !== undefined || input.isActive !== undefined) {
      category.status = nextStatus;
      category.isActive = syncActiveFromStatus(nextStatus);
    }

    await category.save();
    const action =
      nextStatus === 'suspended'
        ? 'category.suspend'
        : nextStatus === 'archived'
          ? 'category.archive'
          : input.isActive === false
            ? 'category.disable'
            : 'category.update';
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action,
      resourceType: 'Category',
      resourceId: categoryId,
    });
    emitCategoryUpdated(category, 'updated');
    return { category: serializeCategory(category) };
  },

  async remove(adminId: string, categoryId: string) {
    const category = await Category.findById(categoryId);
    if (!category) throw AppError.notFound('Category not found');

    const usage = await countUsage(categoryId);
    if (usage.total > 0) {
      throw AppError.conflict(
        'Category is referenced by existing records and cannot be deleted. Suspend it instead to hide it from Customer and Technician apps.',
        {
          code: 'CATEGORY_IN_USE',
          usage,
          recommendation: 'suspend',
        },
      );
    }

    category.isDeleted = true;
    category.deletedAt = new Date();
    category.isActive = false;
    category.status = 'archived';
    await category.save();

    // Soft-delete orphan subcategories so they do not reappear under a restored sibling.
    await Subcategory.updateMany(
      { categoryId: category._id },
      { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } },
    );

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'category.delete',
      resourceType: 'Category',
      resourceId: categoryId,
    });
    emitCategoryUpdated(category, 'deleted');
    return { ok: true, category: serializeCategory(category, { usage }) };
  },

  async reorder(adminId: string, orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw AppError.badRequest('orderedIds must be a non-empty array');
    }
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sortOrder: index + 1 } },
      },
    }));
    await Category.bulkWrite(ops);
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'category.reorder',
      resourceType: 'Category',
      meta: { count: orderedIds.length },
    });
    const categories = await Category.find({ _id: { $in: orderedIds } }).sort({ sortOrder: 1, name: 1 });
    emitCategoryUpdated({ ids: orderedIds }, 'reordered');
    return { items: categories.map((c) => serializeCategory(c)) };
  },

  async usage(categoryId: string) {
    const category = await Category.findById(categoryId);
    if (!category) throw AppError.notFound('Category not found');
    const usage = await countUsage(categoryId);
    return { category: serializeCategory(category, { usage }), usage };
  },

  async createSubcategory(
    adminId: string,
    input: { categoryId: string; name: string; description?: string; sortOrder?: number; slug?: string },
  ) {
    const parent = await Category.findById(input.categoryId);
    if (!parent) throw AppError.notFound('Category not found');
    const slug = input.slug ?? slugify(input.name);
    const subcategory = await Subcategory.create({
      categoryId: input.categoryId,
      name: input.name,
      slug,
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    });
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'subcategory.create',
      resourceType: 'Subcategory',
      resourceId: subcategory._id.toString(),
    });
    emitCategoryUpdated(subcategory, 'created');
    return { subcategory };
  },

  async updateSubcategory(
    adminId: string,
    subcategoryId: string,
    input: Partial<{ name: string; description: string; sortOrder: number; isActive: boolean; slug: string }>,
  ) {
    const subcategory = await Subcategory.findById(subcategoryId);
    if (!subcategory) throw AppError.notFound('Subcategory not found');
    Object.assign(subcategory, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    await subcategory.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'subcategory.update',
      resourceType: 'Subcategory',
      resourceId: subcategoryId,
    });
    emitCategoryUpdated(subcategory, 'updated');
    return { subcategory };
  },
};
