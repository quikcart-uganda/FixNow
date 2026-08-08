/**
 * Seed Platform admin service — Generate / Reset / Delete / Archive / Export / Validate.
 * Distinct from Sandbox Management (which remains for settings + legacy demo dataset).
 */

import {
  CustomerProfile,
  Job,
  JobApplication,
  PlatformPromotion,
  Portfolio,
  Review,
  SponsoredContent,
  TechnicianOffer,
  TechnicianProfile,
  User,
} from '../../../models/index.js';
import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../../utils/audit.js';
import { assertSandboxEnabled, getSandboxSettings } from '../sandboxSettings.service.js';
import {
  DEVELOPER_TECHNICIAN,
  DEVELOPER_CUSTOMER,
  SEED_CONTENT_ENVIRONMENT,
  SEED_PLATFORM_VERSION,
  SEED_TAG,
  SEED_USER_PASSWORD,
  seedUserFilter,
} from './constants.js';
import { WORKFLOW_FIXTURES } from './fixtures.catalog.js';
import {
  generateSeedPlatform,
  softDeleteSeedPlatformData,
  type SeedGenerateModule,
  type SeedGenerateResult,
} from './seedPlatform.generator.js';
import { ACCOUNT_STATUS } from '../../../models/shared/enums.js';
import { ROLES } from '../../../constants/roles.js';
import { DEV_ADMIN } from '../../../constants/adminIdentity.js';
import { ensureDeveloperCustomerIntegrity } from './seedCustomer.integrity.js';
import { seedScenarioService } from './seedScenario.service.js';

type Actor = { userId: string };

/**
 * Idempotent integrity repair for the permanent developer technician.
 * Preserves password hash, user id, ownership, and marketplace history.
 * Never promotes to admin. Never creates a duplicate account.
 * Never silently overwrites the password.
 */
export async function ensureDeveloperTechnicianIntegrity(): Promise<{
  status: 'ok' | 'missing' | 'repaired' | 'conflict';
  userId?: string;
  message: string;
  changes: string[];
}> {
  const email = DEVELOPER_TECHNICIAN.email.toLowerCase();
  if (email === DEV_ADMIN.email.toLowerCase()) {
    return {
      status: 'conflict',
      message: 'Developer technician email collides with Development Administrator — refused',
      changes: [],
    };
  }

  const user = await User.findOne({ email });
  if (!user) {
    return {
      status: 'missing',
      message: 'Developer technician not found — create the technician account or run Seed Platform Generate',
      changes: [],
    };
  }

  if (user.role === ROLES.ADMIN) {
    return {
      status: 'conflict',
      userId: user._id.toString(),
      message:
        'This email is an administrator account. It is not the Seed Platform developer technician and was not migrated.',
      changes: [],
    };
  }

  const changes: string[] = [];
  const meta = { ...((user.metadata as Record<string, unknown>) || {}) };

  if (user.role !== ROLES.TECHNICIAN) {
    user.role = ROLES.TECHNICIAN;
    changes.push('role→technician');
  }
  if (user.isDeleted || user.accountStatus === ACCOUNT_STATUS.SUSPENDED || user.accountStatus === ACCOUNT_STATUS.LOCKED) {
    user.isDeleted = false;
    user.deletedAt = undefined;
    user.accountStatus = ACCOUNT_STATUS.ACTIVE;
    changes.push('reactivated');
  }
  if (user.failedLoginAttempts) {
    user.failedLoginAttempts = 0;
    changes.push('clearedFailedLogins');
  }
  if (user.lockUntil) {
    user.lockUntil = undefined;
    changes.push('clearedLock');
  }
  if ((user as { dataEnvironment?: string }).dataEnvironment !== 'sandbox') {
    (user as { dataEnvironment?: string }).dataEnvironment = 'sandbox';
    changes.push('dataEnvironment→sandbox');
  }
  if (meta.seedTag !== SEED_TAG) {
    meta.seedTag = SEED_TAG;
    changes.push('seedTag');
  }
  if (meta.seedKey !== DEVELOPER_TECHNICIAN.seedKey) {
    meta.seedKey = DEVELOPER_TECHNICIAN.seedKey;
    changes.push('seedKey');
  }
  if (meta.developer !== true) {
    meta.developer = true;
    changes.push('metadata.developer');
  }
  if (meta.seed !== true) {
    meta.seed = true;
    changes.push('metadata.seed');
  }
  if (meta.sandbox !== true) {
    meta.sandbox = true;
    changes.push('metadata.sandbox');
  }
  if (meta.permanentDevelopmentTechnician !== true) {
    meta.permanentDevelopmentTechnician = true;
    changes.push('metadata.permanentDevelopmentTechnician');
  }
  if (meta.developmentTestingEnabled !== true) {
    meta.developmentTestingEnabled = true;
    changes.push('metadata.developmentTestingEnabled');
  }
  if (meta.environment !== 'sandbox') {
    meta.environment = 'sandbox';
    changes.push('metadata.environment');
  }
  if (meta.governanceRole !== 'permanent_development_technician') {
    meta.governanceRole = 'permanent_development_technician';
    changes.push('metadata.governanceRole');
  }
  if (meta.platformRole !== 'development_technician') {
    meta.platformRole = 'development_technician';
    changes.push('metadata.platformRole');
  }
  user.metadata = meta;
  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
    changes.push('emailVerified');
  }

  if (changes.length) {
    await user.save();
  }

  const profile = await TechnicianProfile.findOne({ userId: user._id });
  if (profile) {
    const profileChanges: string[] = [];
    if (profile.isDeleted) {
      profile.isDeleted = false;
      profile.deletedAt = undefined;
      profileChanges.push('profileReactivated');
    }
    if ((profile as { dataEnvironment?: string }).dataEnvironment !== 'sandbox') {
      (profile as { dataEnvironment?: string }).dataEnvironment = 'sandbox';
      profileChanges.push('profileSandbox');
    }
    const pMeta = {
      ...((profile.metadata as Record<string, unknown>) || {}),
      seedTag: SEED_TAG,
      seedKey: DEVELOPER_TECHNICIAN.seedKey,
      developer: true,
      seed: true,
      sandbox: true,
      permanentDevelopmentTechnician: true,
      developmentTestingEnabled: true,
      environment: 'sandbox',
      governanceRole: 'permanent_development_technician',
      platformRole: 'development_technician',
    };
    profile.metadata = pMeta;
    await profile.save();
    if (profileChanges.length) changes.push(...profileChanges);
    else if (changes.length) changes.push('profileMetadataSynced');
  }

  // Provision Development Transaction ID pool (does not touch password / identity).
  try {
    const { ensureDevelopmentTransactionPool } = await import('./developmentTransaction.service.js');
    const pool = await ensureDevelopmentTransactionPool(`integrity:${user._id.toString()}`);
    if (pool.issued > 0) changes.push(`devTxPool+${pool.issued}`);
  } catch {
    /* pool optional if model not yet migrated */
  }

  return {
    status: changes.length ? 'repaired' : 'ok',
    userId: user._id.toString(),
    message: changes.length
      ? `Permanent Development Technician migrated: ${changes.join(', ')} (password preserved)`
      : 'Permanent Development Technician integrity OK (password and id preserved)',
    changes,
  };
}

async function counts() {
  const [users, customers, technicians, jobs, applications, offers, reviews, portfolios, promotions, sponsored] =
    await Promise.all([
      User.countDocuments(seedUserFilter()),
      CustomerProfile.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      TechnicianProfile.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      Job.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      JobApplication.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      TechnicianOffer.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      Review.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      Portfolio.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      PlatformPromotion.countDocuments({ 'metadata.seedTag': SEED_TAG }),
      SponsoredContent.countDocuments({ 'metadata.seedTag': SEED_TAG }),
    ]);
  return {
    users,
    customers,
    technicians,
    jobs,
    applications,
    offers,
    reviews,
    portfolios,
    promotions,
    sponsored,
  };
}

export const seedPlatformService = {
  ensureDeveloperTechnicianIntegrity,
  ensureDeveloperCustomerIntegrity,

  /**
   * Explicit provision: migrate existing quikcart technician → Permanent Development
   * Technician metadata + Development Transaction pool. Never creates a duplicate user.
   * Never changes the password hash.
   */
  async provisionPermanentDevelopmentTechnician(actor: Actor) {
    await assertSandboxEnabled();
    const integrity = await ensureDeveloperTechnicianIntegrity();
    if (integrity.status === 'missing' || integrity.status === 'conflict') {
      throw AppError.badRequest(integrity.message);
    }
    const { ensureDevelopmentTransactionPool, getDevelopmentTransactionOverview } = await import(
      './developmentTransaction.service.js'
    );
    const pool = await ensureDevelopmentTransactionPool(`admin:${actor.userId}`);
    const txOverview = await getDevelopmentTransactionOverview();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.permanent_development_technician.provisioned',
      resourceType: 'User',
      resourceId: integrity.userId || DEVELOPER_TECHNICIAN.email,
      severity: 'critical',
      meta: { integrity, pool },
    });

    return {
      integrity,
      pool,
      developmentTransactions: txOverview,
      passwordPreserved: true,
      duplicateCreated: false,
      email: DEVELOPER_TECHNICIAN.email,
    };
  },

  /**
   * Migrate existing customer (kingjordannyago@gmail.com) → Permanent Seed Customer.
   * Never creates a duplicate. Never changes password, profile history, or ownership.
   */
  async provisionPermanentDevelopmentCustomer(actor: Actor) {
    await assertSandboxEnabled();
    const integrity = await ensureDeveloperCustomerIntegrity();
    if (integrity.status === 'missing' || integrity.status === 'conflict') {
      throw AppError.badRequest(integrity.message);
    }
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.permanent_development_customer.provisioned',
      resourceType: 'User',
      resourceId: integrity.userId || DEVELOPER_CUSTOMER.email,
      severity: 'critical',
      meta: { integrity, passwordPreserved: true, duplicateCreated: false },
    });
    return {
      integrity,
      passwordPreserved: true,
      duplicateCreated: false,
      email: DEVELOPER_CUSTOMER.email,
      message: integrity.message,
    };
  },

  async overview() {
    const integrity = await ensureDeveloperTechnicianIntegrity().catch(() => null);
    const customerIntegrity = await ensureDeveloperCustomerIntegrity().catch(() => null);
    const settings = await getSandboxSettings();
    const c = await counts();
    const developer = await User.findOne({
      email: DEVELOPER_TECHNICIAN.email.toLowerCase(),
    })
      .select('email fullName dataEnvironment metadata accountStatus role failedLoginAttempts lockUntil passwordChangedAt')
      .lean();

    const developerCustomer = await User.findOne({
      email: DEVELOPER_CUSTOMER.email.toLowerCase(),
    })
      .select('email fullName dataEnvironment metadata accountStatus role')
      .lean();

    const seedAligned = Boolean(
      developer &&
        developer.role === ROLES.TECHNICIAN &&
        (developer as { dataEnvironment?: string }).dataEnvironment === 'sandbox' &&
        Boolean(
          (developer.metadata as { permanentDevelopmentTechnician?: boolean; developer?: boolean } | undefined)
            ?.permanentDevelopmentTechnician ||
            (developer.metadata as { developer?: boolean } | undefined)?.developer,
        ) &&
        (developer.metadata as { seedKey?: string } | undefined)?.seedKey === DEVELOPER_TECHNICIAN.seedKey,
    );

    const customerSeedAligned = Boolean(
      developerCustomer &&
        developerCustomer.role === ROLES.CUSTOMER &&
        (developerCustomer as { dataEnvironment?: string }).dataEnvironment === 'sandbox' &&
        Boolean(
          (developerCustomer.metadata as { permanentDevelopmentCustomer?: boolean } | undefined)
            ?.permanentDevelopmentCustomer,
        ) &&
        (developerCustomer.metadata as { seedKey?: string } | undefined)?.seedKey === DEVELOPER_CUSTOMER.seedKey,
    );

    let developmentTransactions: Record<string, unknown> | null = null;
    try {
      const { getDevelopmentTransactionOverview } = await import('./developmentTransaction.service.js');
      developmentTransactions = await getDevelopmentTransactionOverview();
    } catch (err) {
      developmentTransactions = {
        available: false,
        reason: err instanceof Error ? err.message : 'Development transactions unavailable',
      };
    }

    let subscriptionSimulator: Record<string, unknown> | null = null;
    try {
      const { developmentSubscriptionSimulatorService } = await import(
        './developmentSubscriptionSimulator.service.js'
      );
      subscriptionSimulator = await developmentSubscriptionSimulatorService.getSimulatorStatus();
    } catch (err) {
      subscriptionSimulator = {
        available: false,
        reason: err instanceof Error ? err.message : 'Simulator unavailable',
      };
    }

    return {
      version: SEED_PLATFORM_VERSION,
      seedTag: SEED_TAG,
      environment: SEED_CONTENT_ENVIRONMENT,
      sandboxEnabled: settings.enableSandbox,
      counts: c,
      identityNote:
        `${DEVELOPER_TECHNICIAN.email} is the Seed Platform developer technician (marketplace QA); ` +
        `${DEVELOPER_CUSTOMER.email} is the Permanent Seed Customer. Neither is the Development Administrator (${DEV_ADMIN.email}).`,
      integrity,
      customerIntegrity,
      subscriptionSimulator,
      workflowFixtures: WORKFLOW_FIXTURES.map((f) => ({
        fixtureId: f.fixtureId,
        purpose: f.purpose,
        title: f.title,
        status: f.status,
      })),
      developerTechnician: developer
        ? {
            exists: true,
            email: developer.email,
            fullName: developer.fullName,
            role: developer.role,
            dataEnvironment: (developer as { dataEnvironment?: string }).dataEnvironment,
            developer: Boolean((developer.metadata as { developer?: boolean } | undefined)?.developer),
            accountStatus: developer.accountStatus,
            seedAligned,
            /**
             * Documented Seed password — only guaranteed after Seed Platform Generate
             * (technicians module) upserts this email. Pre-seed registration accounts keep
             * their original hash until Generate runs. Integrity repair never changes passwords.
             */
            documentedPassword: DEVELOPER_TECHNICIAN.password,
            documentedPasswordApplies: false,
            passwordHint: 'Original registration password (preserved — not overwritten by Seed)',
            credentialNote: seedAligned
              ? `Permanent Development Technician is seed-aligned. Login uses the original registration password unless an administrator changes it through supported account management. Documented seed password ${DEVELOPER_TECHNICIAN.password} is NOT applied automatically.`
              : `Runtime account exists but was missing Seed metadata — integrity repair applies metadata without changing the password. Use the original registration password.`,
            permanentDevelopmentTechnician: Boolean(
              (developer.metadata as { permanentDevelopmentTechnician?: boolean } | undefined)
                ?.permanentDevelopmentTechnician,
            ),
          }
        : {
            exists: false,
            email: DEVELOPER_TECHNICIAN.email,
            seedAligned: false,
            documentedPassword: DEVELOPER_TECHNICIAN.password,
            documentedPasswordApplies: false,
            passwordHint: DEVELOPER_TECHNICIAN.password,
            credentialNote: 'Account missing — create technician or run Seed Platform Generate',
            permanentDevelopmentTechnician: false,
          },
      developerCustomer: developerCustomer
        ? {
            exists: true,
            email: developerCustomer.email,
            fullName: developerCustomer.fullName,
            role: developerCustomer.role,
            dataEnvironment: (developerCustomer as { dataEnvironment?: string }).dataEnvironment,
            accountStatus: developerCustomer.accountStatus,
            seedAligned: customerSeedAligned,
            passwordPolicy: DEVELOPER_CUSTOMER.passwordPolicy,
            passwordHint: 'Original registration password (never overwritten by Seed)',
            credentialNote: customerSeedAligned
              ? 'Permanent Seed Customer is seed-aligned. Login uses the original registration password. Seed never sets or rotates this password.'
              : 'Runtime customer exists but was missing Seed metadata — Provision migrates in place without changing the password.',
            permanentDevelopmentCustomer: Boolean(
              (developerCustomer.metadata as { permanentDevelopmentCustomer?: boolean } | undefined)
                ?.permanentDevelopmentCustomer,
            ),
            scenarioPermissions: Boolean(
              (developerCustomer.metadata as { scenarioPermissions?: boolean } | undefined)?.scenarioPermissions,
            ),
          }
        : {
            exists: false,
            email: DEVELOPER_CUSTOMER.email,
            seedAligned: false,
            passwordPolicy: DEVELOPER_CUSTOMER.passwordPolicy,
            passwordHint: 'Original registration password (preserved)',
            credentialNote:
              'Account missing — sign in once with the existing customer, then Provision Permanent Seed Customer.',
            permanentDevelopmentCustomer: false,
            scenarioPermissions: false,
          },
      loginHints: {
        seedUserPassword: SEED_USER_PASSWORD,
        developerPassword: 'Use original registration password (not auto-migrated)',
        developerPasswordAppliesOnlyWhenSeedAligned: false,
        documentedSeedPasswordReference: DEVELOPER_TECHNICIAN.password,
        developerCustomerPassword: 'Use original registration password (never set by Seed)',
      },
      sandboxPayments: {
        developmentTransactions:
          'Reserved for Permanent Development Technician; disabled in Platform Mode Production',
        customerJobPipeline:
          'Seed scenarios use production jobMarketplaceService.create; jobs stamped dataEnvironment=sandbox',
        productionModeBlocksSandboxTooling: true,
      },
      developmentTransactions,
      modules: [
        'customers',
        'technicians',
        'jobs',
        'reviews',
        'offers',
        'portfolios',
        'companies',
        'advertisements',
        'ai',
      ],
    };
  },

  async generate(actor: Actor, body: { modules?: SeedGenerateModule[]; regenerate?: boolean } = {}) {
    await assertSandboxEnabled();
    const result = await generateSeedPlatform({
      modules: body.modules,
      regenerate: Boolean(body.regenerate),
    });
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: body.regenerate ? 'seed.platform.regenerate' : 'seed.platform.generate',
      resourceType: 'SeedPlatform',
      meta: { modules: result.modules, counts: result.counts, version: result.version },
    });
    return result;
  },

  async generateAll(actor: Actor) {
    return this.generate(actor, { modules: ['all'] });
  },

  async reset(actor: Actor) {
    await assertSandboxEnabled();
    await softDeleteSeedPlatformData();
    const result = await generateSeedPlatform({ modules: ['all'], regenerate: false });
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.platform.reset',
      resourceType: 'SeedPlatform',
      meta: { counts: result.counts },
    });
    return result;
  },

  async deleteSeeds(actor: Actor) {
    await assertSandboxEnabled();
    const result = await softDeleteSeedPlatformData();
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.platform.delete',
      resourceType: 'SeedPlatform',
      meta: result,
    });
    return result;
  },

  async archiveSeeds(actor: Actor) {
    await assertSandboxEnabled();
    const users = await User.find(seedUserFilter()).select('_id');
    const ids = users.map((u) => u._id);
    await Promise.all([
      User.updateMany(seedUserFilter(), { $set: { dataEnvironment: 'archived' } }),
      CustomerProfile.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      TechnicianProfile.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      Job.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      JobApplication.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      TechnicianOffer.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      Review.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      Portfolio.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      PlatformPromotion.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
      SponsoredContent.updateMany({ 'metadata.seedTag': SEED_TAG }, { $set: { dataEnvironment: 'archived' } }),
    ]);
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.platform.archive',
      resourceType: 'SeedPlatform',
      meta: { users: ids.length },
    });
    return { archivedUsers: ids.length, environment: 'archived' as const };
  },

  async exportSeeds() {
    await assertSandboxEnabled();
    const [users, jobs, offers, reviews] = await Promise.all([
      User.find(seedUserFilter()).select('-passwordHash').lean(),
      Job.find({ 'metadata.seedTag': SEED_TAG }).lean(),
      TechnicianOffer.find({ 'metadata.seedTag': SEED_TAG }).lean(),
      Review.find({ 'metadata.seedTag': SEED_TAG }).lean(),
    ]);
    return {
      version: SEED_PLATFORM_VERSION,
      seedTag: SEED_TAG,
      environment: SEED_CONTENT_ENVIRONMENT,
      exportedAt: new Date().toISOString(),
      users,
      jobs,
      offers,
      reviews,
    };
  },

  async importSeeds(actor: Actor, payload: { jobs?: unknown[]; note?: string }) {
    await assertSandboxEnabled();
    // Phase 2: import is a validated regenerate path — full JSON rehydration lands in a later pass.
    if (!payload || typeof payload !== 'object') {
      throw AppError.badRequest('Import payload required. Prefer Generate All / Reset for Phase 2 fixtures.');
    }
    const result = await generateSeedPlatform({ modules: ['all'] });
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.platform.import',
      resourceType: 'SeedPlatform',
      meta: { note: payload.note || 'import-triggers-regenerate', counts: result.counts },
    });
    return {
      mode: 'regenerate-from-catalogue',
      message:
        'Phase 2 import re-applies the permanent fixture catalogue (idempotent). Arbitrary JSON rehydration is deferred.',
      result,
    };
  },

  async validateSeeds() {
    const integrity = await ensureDeveloperTechnicianIntegrity();
    const missing: string[] = [];
    if (integrity.status === 'missing') missing.push('developer-technician');
    if (integrity.status === 'conflict') missing.push('developer-technician-role-conflict');

    const developer = await User.findOne({
      email: DEVELOPER_TECHNICIAN.email.toLowerCase(),
      isDeleted: { $ne: true },
    });
    if (developer && (developer as { dataEnvironment?: string }).dataEnvironment !== 'sandbox') {
      missing.push('developer-technician-not-sandbox');
    }

    for (const f of WORKFLOW_FIXTURES) {
      const job = await Job.findOne({
        'metadata.fixtureId': f.fixtureId,
        'metadata.seedTag': SEED_TAG,
        isDeleted: { $ne: true },
      }).select('_id status');
      if (!job) missing.push(`fixture:${f.fixtureId}`);
    }

    const c = await counts();
    return {
      ok: missing.length === 0,
      missing,
      counts: c,
      integrity,
      identityNote:
        `${DEVELOPER_TECHNICIAN.email} = developer technician (marketplace). ` +
        `${DEV_ADMIN.email} = Development Administrator (Admin Command Center).`,
      version: SEED_PLATFORM_VERSION,
      environment: SEED_CONTENT_ENVIRONMENT,
    };
  },

  async listSection(section: string, limit = 40) {
    const lim = Math.min(100, Math.max(1, limit));
    switch (section) {
      case 'customers':
        return {
          items: await CustomerProfile.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean(),
        };
      case 'technicians':
        return {
          items: await TechnicianProfile.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean(),
        };
      case 'jobs':
      case 'fixtures':
        return { items: await Job.find({ 'metadata.seedTag': SEED_TAG }).sort({ title: 1 }).limit(lim).lean() };
      case 'offers':
        return { items: await TechnicianOffer.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean() };
      case 'reviews':
        return { items: await Review.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean() };
      case 'portfolios':
        return { items: await Portfolio.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean() };
      case 'advertisements':
        return {
          items: await SponsoredContent.find({ 'metadata.seedTag': SEED_TAG }).limit(lim).lean(),
        };
      default:
        throw AppError.badRequest(`Unknown seed section: ${section}`);
    }
  },

  /**
   * List seed technicians with lifecycle status for Seed Management.
   * Only catalogue-retained seed keys are returned as “active catalogue”.
   */
  async listSeedTechnicians() {
    await assertSandboxEnabled();
    const { SEED_SUPPORT_TECHNICIANS, developerTechnicianDef } = await import('./fixtures.catalog.js');
    const retainedKeys = new Set([
      developerTechnicianDef().seedKey,
      ...SEED_SUPPORT_TECHNICIANS.map((t) => t.seedKey),
    ]);

    const profiles = await TechnicianProfile.find({ 'metadata.seedTag': SEED_TAG })
      .select(
        'userId headline companyName accountStatus isAvailableNow metadata photoUrl ratingAverage reviewCount jobsCompleted subscriptionPlanCode',
      )
      .lean();
    const userIds = profiles.map((p) => p.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('email fullName accountStatus phone')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    return {
      retainedSeedKeys: [...retainedKeys],
      items: profiles.map((p) => {
        const u = userMap.get(String(p.userId));
        const meta = (p.metadata || {}) as Record<string, unknown>;
        const seedKey = String(meta.seedKey || '');
        const hidden = Boolean(meta.hiddenFromCustomers);
        const accountStatus = String(p.accountStatus || u?.accountStatus || 'active');
        return {
          userId: String(p.userId),
          seedKey,
          email: u?.email || '',
          fullName: u?.fullName || '',
          companyName: p.companyName || '',
          accountStatus,
          isAvailableNow: Boolean(p.isAvailableNow),
          hiddenFromCustomers: hidden,
          inActiveCatalogue: retainedKeys.has(seedKey),
          permanentDeveloper: seedKey === DEVELOPER_TECHNICIAN.seedKey,
          ratingAverage: p.ratingAverage,
          reviewCount: p.reviewCount,
          jobsCompleted: p.jobsCompleted,
          planCode: p.subscriptionPlanCode || null,
          lifecycle:
            accountStatus === ACCOUNT_STATUS.SUSPENDED
              ? 'suspended'
              : hidden
                ? 'hidden'
                : p.isAvailableNow
                  ? 'available'
                  : 'unavailable',
        };
      }),
    };
  },

  /**
   * Manage a seed technician without deleting historical records.
   * suspend → disappears from customer discovery (accountStatus SUSPENDED)
   * activate → ACTIVE + visible
   * hide / show → metadata.hiddenFromCustomers (discovery filter)
   * available / unavailable → isAvailableNow
   */
  async setSeedTechnicianLifecycle(
    actor: Actor,
    body: {
      userId?: string;
      seedKey?: string;
      action: 'suspend' | 'activate' | 'hide' | 'show' | 'available' | 'unavailable';
    },
  ) {
    await assertSandboxEnabled();
    const action = body.action;
    if (!['suspend', 'activate', 'hide', 'show', 'available', 'unavailable'].includes(action)) {
      throw AppError.badRequest('Invalid lifecycle action');
    }

    let profile = null as Awaited<ReturnType<typeof TechnicianProfile.findOne>> | null;
    if (body.userId) {
      profile = await TechnicianProfile.findOne({ userId: body.userId, 'metadata.seedTag': SEED_TAG });
    } else if (body.seedKey) {
      profile = await TechnicianProfile.findOne({
        'metadata.seedTag': SEED_TAG,
        'metadata.seedKey': body.seedKey,
      });
    }
    if (!profile) throw AppError.notFound('Seed technician not found');

    const user = await User.findById(profile.userId);
    if (!user) throw AppError.notFound('Seed technician user not found');

    const meta = { ...(profile.metadata as Record<string, unknown> | undefined) };
    if (action === 'suspend') {
      user.accountStatus = ACCOUNT_STATUS.SUSPENDED;
      profile.accountStatus = ACCOUNT_STATUS.SUSPENDED;
      profile.isAvailableNow = false;
      profile.lockReason = 'Seed Management suspended';
    } else if (action === 'activate') {
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      profile.accountStatus = ACCOUNT_STATUS.ACTIVE;
      profile.lockReason = undefined;
      meta.hiddenFromCustomers = false;
    } else if (action === 'hide') {
      meta.hiddenFromCustomers = true;
      profile.isAvailableNow = false;
    } else if (action === 'show') {
      meta.hiddenFromCustomers = false;
    } else if (action === 'available') {
      if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
        throw AppError.badRequest('Activate the technician before setting available');
      }
      profile.isAvailableNow = true;
      meta.hiddenFromCustomers = false;
    } else if (action === 'unavailable') {
      profile.isAvailableNow = false;
    }

    profile.metadata = meta as typeof profile.metadata;
    profile.markModified('metadata');
    await Promise.all([user.save(), profile.save()]);

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: `seed.platform.technician.${action}`,
      resourceType: 'TechnicianProfile',
      resourceId: String(profile._id),
      meta: { seedKey: meta.seedKey, email: user.email, action },
    });

    return this.listSeedTechnicians();
  },

  /** Soft-delete obsolete seed technicians no longer in the active catalogue (keeps developer + A/B). */
  async pruneObsoleteSeedTechnicians(actor: Actor) {
    await assertSandboxEnabled();
    const { SEED_SUPPORT_TECHNICIANS, developerTechnicianDef } = await import('./fixtures.catalog.js');
    const retained = new Set([
      developerTechnicianDef().seedKey,
      ...SEED_SUPPORT_TECHNICIANS.map((t) => t.seedKey),
    ]);
    const profiles = await TechnicianProfile.find({ 'metadata.seedTag': SEED_TAG }).select(
      'userId metadata',
    );
    const obsolete = profiles.filter((p) => {
      const key = String((p.metadata as { seedKey?: string } | undefined)?.seedKey || '');
      return key && !retained.has(key);
    });
    const userIds = obsolete.map((p) => p.userId);
    const now = new Date();
    if (userIds.length) {
      await Promise.all([
        User.updateMany(
          { _id: { $in: userIds } },
          {
            $set: {
              isDeleted: true,
              deletedAt: now,
              accountStatus: ACCOUNT_STATUS.SUSPENDED,
              dataEnvironment: 'archived',
            },
          },
        ),
        TechnicianProfile.updateMany(
          { userId: { $in: userIds } },
          {
            $set: {
              isDeleted: true,
              deletedAt: now,
              accountStatus: ACCOUNT_STATUS.SUSPENDED,
              isAvailableNow: false,
              dataEnvironment: 'archived',
              'metadata.hiddenFromCustomers': true,
            },
          },
        ),
      ]);
    }
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.platform.technicians.prune',
      resourceType: 'SeedPlatform',
      meta: { pruned: userIds.length, retained: [...retained] },
    });
    return { pruned: userIds.length, retained: [...retained] };
  },

  /**
   * List seed customers (catalogue + permanent Seed Customer) with lifecycle status.
   */
  async listSeedCustomers() {
    await assertSandboxEnabled();
    const { SEED_CUSTOMERS } = await import('./fixtures.catalog.js');
    const retainedKeys = new Set([
      DEVELOPER_CUSTOMER.seedKey,
      ...SEED_CUSTOMERS.map((c) => c.seedKey),
    ]);

    const users = await User.find({
      role: ROLES.CUSTOMER,
      'metadata.seedTag': SEED_TAG,
    })
      .select('email fullName accountStatus phone dataEnvironment metadata')
      .lean();

    const userIds = users.map((u) => u._id);
    const profiles = await CustomerProfile.find({ userId: { $in: userIds } })
      .select('userId jobStats bio metadata')
      .lean();
    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

    return {
      retainedSeedKeys: [...retainedKeys],
      permanentCustomerEmail: DEVELOPER_CUSTOMER.email,
      items: users.map((u) => {
        const meta = (u.metadata || {}) as Record<string, unknown>;
        const seedKey = String(meta.seedKey || '');
        const profile = profileMap.get(String(u._id));
        const accountStatus = String(u.accountStatus || 'active');
        const permanent =
          seedKey === DEVELOPER_CUSTOMER.seedKey ||
          Boolean(meta.permanentDevelopmentCustomer) ||
          String(u.email || '').toLowerCase() === DEVELOPER_CUSTOMER.email.toLowerCase();
        return {
          userId: String(u._id),
          seedKey,
          email: u.email || '',
          fullName: u.fullName || '',
          accountStatus,
          dataEnvironment: (u as { dataEnvironment?: string }).dataEnvironment,
          inActiveCatalogue: retainedKeys.has(seedKey) || permanent,
          permanentDeveloperCustomer: permanent,
          scenarioPermissions: Boolean(meta.scenarioPermissions),
          jobsPosted: profile?.jobStats?.posted ?? 0,
          jobsCompleted: profile?.jobStats?.completed ?? 0,
          lifecycle: accountStatus === ACCOUNT_STATUS.SUSPENDED ? 'suspended' : 'active',
        };
      }),
    };
  },

  /**
   * Manage a seed customer without deleting history or touching password.
   * suspend / activate only — Permanent Seed Customer may be suspended for QA but is never pruned.
   */
  async setSeedCustomerLifecycle(
    actor: Actor,
    body: { userId?: string; seedKey?: string; action: 'suspend' | 'activate' },
  ) {
    await assertSandboxEnabled();
    const action = body.action;
    if (!['suspend', 'activate'].includes(action)) {
      throw AppError.badRequest('Invalid customer lifecycle action');
    }

    let user = null as Awaited<ReturnType<typeof User.findOne>> | null;
    if (body.userId) {
      user = await User.findOne({ _id: body.userId, role: ROLES.CUSTOMER, 'metadata.seedTag': SEED_TAG });
    } else if (body.seedKey) {
      user = await User.findOne({
        role: ROLES.CUSTOMER,
        'metadata.seedTag': SEED_TAG,
        'metadata.seedKey': body.seedKey,
      });
    }
    if (!user) throw AppError.notFound('Seed customer not found');

    if (action === 'suspend') {
      user.accountStatus = ACCOUNT_STATUS.SUSPENDED;
    } else {
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      user.isDeleted = false;
      user.deletedAt = undefined;
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
    }
    await user.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: `seed.platform.customer.${action}`,
      resourceType: 'User',
      resourceId: String(user._id),
      meta: {
        seedKey: (user.metadata as { seedKey?: string } | undefined)?.seedKey,
        email: user.email,
        action,
        passwordPreserved: true,
      },
    });

    return this.listSeedCustomers();
  },

  listSeedScenarios() {
    return seedScenarioService.listScenarios();
  },

  async generateSeedScenarios(
    actor: Actor,
    body: { scenarioIds?: string[]; all?: boolean } = {},
  ) {
    return seedScenarioService.generate(actor, body as Parameters<typeof seedScenarioService.generate>[1]);
  },
};

export type { SeedGenerateResult, SeedGenerateModule };
