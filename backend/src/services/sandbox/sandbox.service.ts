/**
 * Sandbox Data Platform — admin control centre for non-production content.
 */

import {
  Category,
  ContentBlock,
  ContentPage,
  CustomerProfile,
  Job,
  JobApplication,
  PlatformPromotion,
  PortfolioMedia,
  SponsoredContent,
  TechnicianOffer,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import {
  NEVER_PROMOTE_RESOURCE_TYPES,
  PROMOTABLE_RESOURCE_TYPES,
  type DataEnvironment,
  type PromotableResourceType,
} from '../../constants/dataEnvironment.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { applyDataEnvironment, dataEnvironmentFilter, listAllDataEnvironments } from './dataEnvironment.js';
import { generateDemoDataset, DEMO_PASSWORD, DEMO_TAG } from './demoData.generator.js';
import { assertSandboxEnabled, getSandboxSettings, updateSandboxSettings } from './sandboxSettings.service.js';
import { listAvatars, getAvatarById } from './avatarLibrary.js';
import { SEED_TAG } from './seed/constants.js';

type Actor = { userId: string };

/** Demo-only users — never Seed Platform permanent or seed-tagged identities. */
function demoOnlyUserFilter(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $and: [
      {
        $or: [{ email: /@fixnow\.demo$/i }, { 'metadata.demoTag': DEMO_TAG }],
      },
      { 'metadata.seedTag': { $ne: SEED_TAG } },
      { 'metadata.permanentDevelopmentTechnician': { $ne: true } },
      { 'metadata.permanentDevelopmentCustomer': { $ne: true } },
      extra,
    ],
  };
}

function demoOnlyContentFilter(environment: DataEnvironment): Record<string, unknown> {
  return {
    dataEnvironment: environment,
    'metadata.demoTag': DEMO_TAG,
    'metadata.seedTag': { $ne: SEED_TAG },
  };
}

/** Strip internal seed/demo governance keys before cloning into production. */
function stripInternalGovernanceMetadata(src: Record<string, unknown>): Record<string, unknown> {
  const { _id, createdAt, updatedAt, __v, metadata, ...rest } = src;
  void _id;
  void createdAt;
  void updatedAt;
  void __v;
  const blocked = new Set([
    'seedTag',
    'seedKey',
    'demoTag',
    'demoKey',
    'developer',
    'seed',
    'sandbox',
    'permanentDevelopmentTechnician',
    'permanentDevelopmentCustomer',
    'governanceRole',
    'platformRole',
    'fixtureId',
    'generatedBy',
    'generatedOn',
    'seedVersion',
    'environment',
    'scenarioPermissions',
    'developmentTestingEnabled',
  ]);
  let nextMeta: Record<string, unknown> | undefined;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    nextMeta = Object.fromEntries(
      Object.entries(metadata as Record<string, unknown>).filter(([k]) => !blocked.has(k)),
    );
    if (!Object.keys(nextMeta).length) nextMeta = undefined;
  }
  return nextMeta ? { ...rest, metadata: nextMeta } : { ...rest, metadata: undefined };
}

async function countsFor(env: DataEnvironment | 'combined') {
  const filter = dataEnvironmentFilter(env);
  const sandboxUserFilter =
    env === 'combined'
      ? { $or: [{ dataEnvironment: { $in: ['sandbox', 'development', 'demo'] } }, { email: /@fixnow\.demo$/i }] }
      : applyDataEnvironment({ $or: [{ email: /@fixnow\.demo$/i }, { 'metadata.demoTag': DEMO_TAG }] }, env);

  const [users, customers, technicians, jobs, offers, applications] = await Promise.all([
    User.countDocuments(sandboxUserFilter),
    CustomerProfile.countDocuments(filter),
    TechnicianProfile.countDocuments(filter),
    Job.countDocuments(filter),
    TechnicianOffer.countDocuments(filter),
    JobApplication.countDocuments(filter),
  ]);
  return { users, customers, technicians, jobs, offers, applications };
}

export const sandboxService = {
  async overview() {
    const settings = await getSandboxSettings();
    const [sandbox, production, demo] = await Promise.all([
      countsFor('sandbox'),
      countsFor('production'),
      countsFor('demo'),
    ]);
    return {
      settings,
      environments: listAllDataEnvironments(),
      counts: { sandbox, production, demo },
      demoLoginHint: settings.enableSandbox
        ? { emailDomain: '@fixnow.demo', password: DEMO_PASSWORD, tag: DEMO_TAG }
        : null,
      neverPromote: NEVER_PROMOTE_RESOURCE_TYPES,
      promotable: PROMOTABLE_RESOURCE_TYPES,
      /**
       * Single source of truth for permanent QA fixtures is Seed Platform
       * (`/admin/settings/seed-platform`). This page manages the legacy
       * `@fixnow.demo` dataset only; demo lifecycle never touches Seed identities.
       */
      authoritativeSeedCentre: {
        path: '/admin/settings/seed-platform',
        label: 'Seed Platform',
        demoDatasetStatus: 'legacy',
        demoOpsScope: 'demo-only (@fixnow.demo / metadata.demoTag)',
        seedPlatformExcluded: true,
      },
      /** Phase 4.3 — Promotion Centre clone handlers. */
      promoteImplemented: [
        'TechnicianOffer',
        'SponsoredContent',
        'ContentBlock',
        'PlatformPromotion',
        'CmsPage',
        'Category',
        'PortfolioItem',
      ] as const,
      promoteUnimplemented: [] as string[],
    };
  },

  async updateSettings(patch: Record<string, unknown>, actor: Actor) {
    return updateSandboxSettings(patch as Parameters<typeof updateSandboxSettings>[0], actor.userId);
  },

  async createDemoData(actor: Actor, opts: { environment?: DataEnvironment; regenerate?: boolean } = {}) {
    await assertSandboxEnabled();
    const result = await generateDemoDataset({
      environment: opts.environment ?? 'sandbox',
      regenerate: opts.regenerate,
    });
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: opts.regenerate ? 'sandbox.demo.regenerate' : 'sandbox.demo.create',
      resourceType: 'Sandbox',
      resourceId: result.tag,
      meta: result,
    });
    return result;
  },

  async regenerateDemoData(actor: Actor) {
    return this.createDemoData(actor, { regenerate: true, environment: 'sandbox' });
  },

  async deleteDemoData(actor: Actor, environment: DataEnvironment = 'sandbox') {
    await assertSandboxEnabled();
    const users = await User.find(demoOnlyUserFilter({ dataEnvironment: environment }))
      .select('_id')
      .lean();
    const ids = users.map((u) => u._id);
    const now = new Date();
    if (ids.length) {
      const contentFilter = demoOnlyContentFilter(environment);
      await Promise.all([
        User.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now, accountStatus: 'suspended' } }),
        CustomerProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
        TechnicianProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
        Job.updateMany(
          { $or: [{ customerId: { $in: ids } }, contentFilter] },
          { $set: { isDeleted: true, deletedAt: now } },
        ),
        JobApplication.updateMany(
          { $or: [{ technicianId: { $in: ids } }, contentFilter] },
          { $set: { isDeleted: true, deletedAt: now } },
        ),
        TechnicianOffer.updateMany(
          { $or: [{ technicianId: { $in: ids } }, contentFilter] },
          { $set: { isDeleted: true, deletedAt: now } },
        ),
      ]);
    }
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'sandbox.demo.delete',
      resourceType: 'Sandbox',
      resourceId: environment,
      meta: { deletedUsers: ids.length, scopedTo: 'demo-only', seedPlatformExcluded: true },
    });
    return { deletedUsers: ids.length, environment, seedPlatformExcluded: true };
  },

  async archiveDemoData(actor: Actor, environment: DataEnvironment = 'sandbox') {
    await assertSandboxEnabled();
    const userFilter = demoOnlyUserFilter({ dataEnvironment: environment });
    const contentFilter = demoOnlyContentFilter(environment);
    const users = await User.find(userFilter).select('_id').lean();
    const ids = users.map((u) => u._id);
    await Promise.all([
      User.updateMany(userFilter, { $set: { dataEnvironment: 'archived' } }),
      CustomerProfile.updateMany({ userId: { $in: ids } }, { $set: { dataEnvironment: 'archived' } }),
      TechnicianProfile.updateMany({ userId: { $in: ids } }, { $set: { dataEnvironment: 'archived' } }),
      Job.updateMany(contentFilter, { $set: { dataEnvironment: 'archived' } }),
      TechnicianOffer.updateMany(contentFilter, { $set: { dataEnvironment: 'archived' } }),
    ]);
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'sandbox.demo.archive',
      resourceType: 'Sandbox',
      resourceId: environment,
      meta: { scopedTo: 'demo-only', seedPlatformExcluded: true, users: ids.length },
    });
    return { environment: 'archived' as const, seedPlatformExcluded: true, archivedUsers: ids.length };
  },

  async suspendDemoData(actor: Actor) {
    await assertSandboxEnabled();
    const res = await User.updateMany(
      demoOnlyUserFilter({ dataEnvironment: { $in: ['sandbox', 'development', 'demo'] } }),
      { $set: { accountStatus: 'suspended' } },
    );
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'sandbox.demo.suspend',
      resourceType: 'Sandbox',
      meta: { matched: res.matchedCount, scopedTo: 'demo-only', seedPlatformExcluded: true },
    });
    return { suspended: res.modifiedCount, seedPlatformExcluded: true };
  },

  async reactivateDemoData(actor: Actor) {
    await assertSandboxEnabled();
    const res = await User.updateMany(
      demoOnlyUserFilter({
        dataEnvironment: { $in: ['sandbox', 'development', 'demo'] },
        accountStatus: 'suspended',
        isDeleted: { $ne: true },
      }),
      { $set: { accountStatus: 'active' } },
    );
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'sandbox.demo.reactivate',
      resourceType: 'Sandbox',
      meta: { matched: res.matchedCount, scopedTo: 'demo-only', seedPlatformExcluded: true },
    });
    return { reactivated: res.modifiedCount, seedPlatformExcluded: true };
  },

  async resetDemoEnvironment(actor: Actor) {
    await assertSandboxEnabled();
    await this.deleteDemoData(actor, 'sandbox');
    return this.createDemoData(actor, { environment: 'sandbox', regenerate: false });
  },

  async exportDemoData(environment: DataEnvironment = 'sandbox') {
    await assertSandboxEnabled();
    const userFilter = demoOnlyUserFilter(
      environment === 'sandbox'
        ? { dataEnvironment: { $in: ['sandbox', 'development', 'demo'] } }
        : { dataEnvironment: environment },
    );
    const contentFilter = demoOnlyContentFilter(environment);
    const users = await User.find(userFilter).select('-passwordHash').lean();
    const ids = users.map((u) => u._id);
    const [customers, technicians, jobs, offers] = await Promise.all([
      CustomerProfile.find({ userId: { $in: ids } }).lean(),
      TechnicianProfile.find({ userId: { $in: ids } }).lean(),
      Job.find(contentFilter).lean(),
      TechnicianOffer.find(contentFilter).lean(),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      environment,
      scopedTo: 'demo-only',
      seedPlatformExcluded: true,
      note: 'Legacy @fixnow.demo dataset only. Prefer Seed Platform for permanent QA fixtures.',
      users,
      customers,
      technicians,
      jobs,
      offers,
    };
  },

  async listSection(section: string, environment: DataEnvironment = 'sandbox', limit = 50) {
    await assertSandboxEnabled();
    const filter = dataEnvironmentFilter(environment);
    const lim = Math.min(100, Math.max(1, limit));
    switch (section) {
      case 'users':
      case 'customers':
        return CustomerProfile.find(filter).limit(lim).lean();
      case 'technicians':
        return TechnicianProfile.find(filter).limit(lim).lean();
      case 'jobs':
        return Job.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
      case 'offers':
      case 'advertisements':
      case 'promotions':
        return TechnicianOffer.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
      case 'applications':
        return JobApplication.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
      default:
        throw AppError.badRequest(`Unknown sandbox section: ${section}`);
    }
  },

  async promoteToProduction(
    actor: Actor,
    input: { resourceType: string; resourceId: string },
  ) {
    // In Production Mode, Production Super Admin may still clone sandbox → production without enabling Sandbox UX.
    let skipSandboxEnableGate = false;
    try {
      const { getCurrentPlatformMode, isProductionSuperAdmin } = await import(
        '../platform/platformMode.service.js'
      );
      if ((await getCurrentPlatformMode()) === 'production') {
        if (!(await isProductionSuperAdmin(actor.userId))) {
          throw AppError.forbidden('Sandbox promote requires Production Super Admin in Production Mode');
        }
        skipSandboxEnableGate = true;
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
    if (!skipSandboxEnableGate) await assertSandboxEnabled();
    const type = input.resourceType as PromotableResourceType;
    if ((NEVER_PROMOTE_RESOURCE_TYPES as readonly string[]).includes(type)) {
      throw AppError.badRequest(`${type} cannot be promoted to production.`);
    }
    if (!(PROMOTABLE_RESOURCE_TYPES as readonly string[]).includes(type)) {
      throw AppError.badRequest(`${type} is not a promotable resource.`);
    }

    let clone: object | null = null;

    const stripMeta = (src: Record<string, unknown>) => stripInternalGovernanceMetadata(src);

    if (type === 'TechnicianOffer') {
      const src = await TechnicianOffer.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Offer not found');
      const doc = await TechnicianOffer.create({
        ...stripMeta(src as Record<string, unknown>),
        title: `${String(src.title || 'Offer')} (promoted)`,
        titleKey: undefined,
        dataEnvironment: 'production',
        status: 'pending',
        featured: false,
      });
      clone = doc.toObject();
    } else if (type === 'SponsoredContent') {
      const src = await SponsoredContent.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Sponsored content not found');
      const doc = await SponsoredContent.create({
        ...stripMeta(src as Record<string, unknown>),
        title: `${String(src.title || 'Sponsored')} (promoted)`,
        dataEnvironment: 'production',
        status: 'draft',
      });
      clone = doc.toObject();
    } else if (type === 'ContentBlock') {
      const src = await ContentBlock.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Content block not found');
      const doc = await ContentBlock.create({
        ...stripMeta(src as Record<string, unknown>),
        title: src.title ? `${src.title} (promoted)` : src.title,
        dataEnvironment: 'production',
        status: 'draft',
        analytics: { impressions: 0, clicks: 0 },
      });
      clone = doc.toObject();
    } else if (type === 'PlatformPromotion') {
      const src = await PlatformPromotion.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Promotion not found');
      const baseCode = String(src.code || 'promo').slice(0, 40);
      const doc = await PlatformPromotion.create({
        ...stripMeta(src as Record<string, unknown>),
        title: `${String(src.title || 'Promotion')} (promoted)`,
        code: `${baseCode}-p${Date.now().toString(36).slice(-4)}`,
        dataEnvironment: 'production',
        status: 'draft',
      });
      clone = doc.toObject();
    } else if (type === 'CmsPage') {
      const src = await ContentPage.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('CMS page not found');
      const slug = `${String(src.slug || 'page')}-promoted-${Date.now().toString(36).slice(-5)}`;
      const doc = await ContentPage.create({
        ...stripMeta(src as Record<string, unknown>),
        title: `${String(src.title || 'Page')} (promoted)`,
        slug,
        dataEnvironment: 'production',
        status: 'draft',
        isSystem: false,
        version: 1,
        revisionHistory: [],
      });
      clone = doc.toObject();
    } else if (type === 'Category') {
      const src = await Category.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Category not found');
      const slug = `${String(src.slug || 'category')}-promoted-${Date.now().toString(36).slice(-5)}`;
      const name = `${String(src.name || 'Category')} (promoted)`;
      const existing = await Category.findOne({ $or: [{ slug }, { name }] }).lean();
      if (existing) {
        throw AppError.conflict('A production category with this name/slug already exists — adjust sandbox first');
      }
      const doc = await Category.create({
        ...stripMeta(src as Record<string, unknown>),
        name,
        slug,
        dataEnvironment: 'production',
      });
      clone = doc.toObject();
    } else if (type === 'PortfolioItem') {
      const src = await PortfolioMedia.findById(input.resourceId).lean();
      if (!src) throw AppError.notFound('Portfolio item not found');
      const doc = await PortfolioMedia.create({
        ...stripMeta(src as Record<string, unknown>),
        title: `${String((src as { title?: string }).title || 'Portfolio')} (promoted)`,
        dataEnvironment: 'production',
        status: 'pending',
      });
      clone = doc.toObject();
    } else {
      throw AppError.badRequest(`Promotion for ${type} is not implemented.`);
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'sandbox.promote',
      resourceType: type,
      resourceId: input.resourceId,
      meta: { cloneId: clone ? Reflect.get(clone, '_id') : undefined, note: 'cloned — original unchanged' },
    });

    return { originalId: input.resourceId, clone, note: 'Cloned into production; sandbox original unchanged.' };
  },

  async analytics(view: 'production' | 'sandbox' | 'combined' = 'production') {
    const settings = await getSandboxSettings();
    if (settings.hideSandboxFromReports && view === 'sandbox' && !settings.enableSandbox) {
      throw AppError.forbidden('Sandbox analytics hidden.');
    }
    return {
      view,
      counts: await countsFor(view === 'combined' ? 'combined' : view),
    };
  },

  listAvatars(query?: { collection?: string }) {
    return listAvatars(query);
  },

  getAvatar(id: string) {
    const avatar = getAvatarById(id);
    if (!avatar) throw AppError.notFound('Avatar not found');
    return avatar;
  },
};
