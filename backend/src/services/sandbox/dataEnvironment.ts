/**
 * Content Environment helpers — marketplace visibility authority.
 *
 * =============================================================================
 * TWO ORTHOGONAL LAYERS (do not conflate)
 * =============================================================================
 *
 * PROCESS ENVIRONMENT (APP_ENV / NODE_ENV / Dev Controls)
 *   → development | staging | production | test
 *   → OTP, mock providers, deployment rules, developer login flags
 *   → Owned by: config/env.ts, platform/devControls.service.ts
 *
 * CONTENT ENVIRONMENT (dataEnvironment on documents)
 *   → production | sandbox | development | demo | archived
 *   → Who can SEE marketplace rows in the shared MongoDB
 *   → Owned by: THIS MODULE — every marketplace query must use these helpers
 *
 * Payment-provider "sandbox" modes (Stripe/MoMo) are a third, unrelated concept.
 * =============================================================================
 */

import type { FilterQuery } from 'mongoose';
import {
  DATA_ENVIRONMENTS,
  SANDBOX_ENVIRONMENTS,
  normalizeDataEnvironment,
  isSandboxLike,
  type DataEnvironment,
} from '../../constants/dataEnvironment.js';
import { User } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';

export type AnalyticsEnvironmentView = DataEnvironment | 'combined';

export type ViewerEnvironmentInput = {
  userId?: string | null;
  /** Explicit override (e.g. admin ?dataEnvironment=). */
  explicit?: DataEnvironment | 'combined' | null;
  /**
   * Admin directories: when true and no explicit filter, default to production
   * (sandbox users appear only in Sandbox Management or ?dataEnvironment=).
   */
  adminDefaultProduction?: boolean;
};

/** Mongo filter that respects content-environment boundaries. */
export function dataEnvironmentFilter(
  env: AnalyticsEnvironmentView,
): FilterQuery<Record<string, unknown>> {
  if (env === 'combined') return {};
  if (env === 'production') {
    return {
      $or: [
        { dataEnvironment: 'production' },
        { dataEnvironment: { $exists: false } },
        { dataEnvironment: null },
      ],
    };
  }
  return { dataEnvironment: env };
}

/**
 * Merge an environment filter into an existing query object (mutates + returns).
 * Prefer this over hand-rolled dataEnvironment checks in services.
 */
export function applyDataEnvironment<T extends Record<string, unknown>>(
  filter: T,
  env: AnalyticsEnvironmentView,
): T {
  const envFilter = dataEnvironmentFilter(env);
  if (!Object.keys(envFilter).length) return filter;
  if (envFilter.$or && filter.$or) {
    const existing = { ...filter };
    for (const k of Object.keys(filter)) delete filter[k];
    Object.assign(filter, { $and: [existing, envFilter] });
    return filter;
  }
  Object.assign(filter, envFilter);
  return filter;
}

/** Resolve content environment for a logged-in user. Guests / missing → production. */
export async function resolveUserDataEnvironment(userId: string | null | undefined): Promise<DataEnvironment> {
  if (!userId) return 'production';
  const user = await User.findById(userId).select('dataEnvironment metadata').lean();
  if (!user) return 'production';
  const fromField = normalizeDataEnvironment((user as { dataEnvironment?: unknown }).dataEnvironment, 'production');
  if (fromField !== 'production') return fromField;
  const metaEnv = (user.metadata as { dataEnvironment?: unknown } | undefined)?.dataEnvironment;
  return normalizeDataEnvironment(metaEnv, 'production');
}

/**
 * Resolve the content environment a request should query under.
 * - Guests / unauthenticated → production (never see sandbox)
 * - Authenticated → user's dataEnvironment
 * - Admin with ?dataEnvironment=sandbox|production|combined → explicit
 */
export async function resolveViewerDataEnvironment(
  input: ViewerEnvironmentInput | string | null | undefined,
): Promise<AnalyticsEnvironmentView> {
  if (input == null || input === '') return 'production';
  if (typeof input === 'string') {
    return resolveUserDataEnvironment(input);
  }
  if (input.explicit === 'combined') return 'combined';
  if (input.explicit) {
    return normalizeDataEnvironment(input.explicit, 'production');
  }
  if (!input.userId) return 'production';
  const env = await resolveUserDataEnvironment(input.userId);
  if (input.adminDefaultProduction && isSandboxLike(env)) {
    // Admin accounts stamped sandbox still default to production workforce lists
    // unless they pass an explicit environment query.
    return 'production';
  }
  return env;
}

/** Read dataEnvironment from a lean/doc-like object. */
export function documentDataEnvironment(doc: object | null | undefined): DataEnvironment {
  if (!doc) return 'production';
  const value = Reflect.get(doc, 'dataEnvironment');
  return normalizeDataEnvironment(value, 'production');
}

/**
 * Interaction bucket: sandbox-like envs may interact with each other;
 * production only with production; archived is isolated.
 */
export function environmentBucket(env: DataEnvironment): 'sandbox' | 'production' | 'archived' {
  if (SANDBOX_ENVIRONMENTS.includes(env)) return 'sandbox';
  if (env === 'archived') return 'archived';
  return 'production';
}

/** Assert two actors share a compatible environment for marketplace interaction. */
export function assertSameDataEnvironment(
  a: DataEnvironment,
  b: DataEnvironment,
  message = 'Sandbox and production users cannot interact.',
): void {
  if (environmentBucket(a) !== environmentBucket(b)) {
    throw AppError.forbidden(message);
  }
}

/**
 * Assert a document is visible to the viewer. Use on getById / public profile.
 * Throws notFound (not forbidden) to avoid leaking existence across environments.
 */
export function assertDocumentVisibleToViewer(
  viewerEnv: AnalyticsEnvironmentView,
  documentEnv: DataEnvironment | null | undefined,
  message = 'Resource not found',
): void {
  if (viewerEnv === 'combined') return;
  const docEnv = normalizeDataEnvironment(documentEnv, 'production');
  if (viewerEnv === 'production') {
    if (environmentBucket(docEnv) !== 'production') {
      throw AppError.notFound(message);
    }
    return;
  }
  // Exact match for sandbox/development/demo (not whole sandbox bucket) for reads —
  // interactions still use assertSameDataEnvironment buckets.
  if (docEnv !== viewerEnv) {
    throw AppError.notFound(message);
  }
}

/**
 * Parse Express-style query for admin environment filter.
 * Accepts dataEnvironment | environment | env = production|sandbox|demo|development|archived|combined|all
 */
export function parseAdminEnvironmentQuery(query: Record<string, unknown> | undefined): AnalyticsEnvironmentView | null {
  const raw = query?.dataEnvironment ?? query?.environment ?? query?.env;
  if (raw == null || raw === '') return null;
  const v = String(raw).toLowerCase();
  if (v === 'all' || v === 'combined') return 'combined';
  if ((DATA_ENVIRONMENTS as readonly string[]).includes(v)) return v as DataEnvironment;
  return null;
}

export function listSandboxEnvironments(): DataEnvironment[] {
  return [...SANDBOX_ENVIRONMENTS];
}

export function listAllDataEnvironments(): DataEnvironment[] {
  return [...DATA_ENVIRONMENTS];
}

/**
 * Shared catalogue / CMS visibility.
 * Production viewers: production bucket only (never sandbox).
 * Sandbox-like viewers: own env OR production (explicitly permitted shared taxonomy/CMS).
 * Use for Categories and ContentBlocks/ContentPages — NOT for offers, ads, jobs, technicians.
 */
export function applySharedCatalogueEnvironment<T extends Record<string, unknown>>(
  filter: T,
  viewerEnv: AnalyticsEnvironmentView,
): T {
  if (viewerEnv === 'combined') return filter;
  if (viewerEnv === 'production' || viewerEnv === 'archived') {
    return applyDataEnvironment(filter, viewerEnv);
  }
  const production = dataEnvironmentFilter('production');
  const own = dataEnvironmentFilter(viewerEnv);
  const envClause = { $or: [production, own] };
  if (filter.$or) {
    const existing = { ...filter };
    for (const k of Object.keys(filter)) delete filter[k];
    Object.assign(filter, { $and: [existing, envClause] });
    return filter;
  }
  Object.assign(filter, envClause);
  return filter;
}

export { isSandboxLike, normalizeDataEnvironment };
