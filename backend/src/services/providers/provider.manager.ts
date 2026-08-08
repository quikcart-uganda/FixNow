/**
 * Central Provider Manager — discovers configured integrations from env,
 * stores active selection in PlatformSetting, and routes factories.
 * Credentials are never persisted; only provider ids / health metadata.
 */

import { env } from '../../config/env.js';
import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { logger } from '../../config/logger.js';
import { resetAiProviderCache } from '../../providers/ai/index.js';
import { clearPaymentProviderCache } from '../../providers/payments/index.js';
import {
  PROVIDER_CATALOG,
  PROVIDER_TYPES,
  findProviderDef,
  providersForType,
  type ProviderDefinition,
  type ProviderType,
} from './provider.catalog.js';

const SELECTIONS_KEY = 'providers.selections';
const FAILOVER_KEY = 'providers.failover';
const HEALTH_KEY = 'providers.health';

export type CredentialStatus = 'ok' | 'missing' | 'partial' | 'n/a';
export type ConnectionStatus = 'unknown' | 'healthy' | 'degraded' | 'failed' | 'disabled';

export interface ProviderStatusRow {
  type: ProviderType;
  typeLabel: string;
  id: string;
  label: string;
  status: ProviderDefinition['status'];
  isNone: boolean;
  configured: boolean;
  active: boolean;
  credentialStatus: CredentialStatus;
  missingEnv: string[];
  connectionStatus: ConnectionStatus;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
  guidance: string;
  requiresRestart: boolean;
  supportsFailover: boolean;
  version?: string;
}

export interface ProviderTypeSummary {
  type: ProviderType;
  label: string;
  description: string;
  activeId: string;
  failoverId?: string;
  providers: ProviderStatusRow[];
}

type SelectionsMap = Partial<Record<ProviderType, string>>;
type FailoverMap = Partial<Record<ProviderType, string>>;
type HealthMap = Partial<
  Record<
    string,
    {
      connectionStatus: ConnectionStatus;
      lastTestAt?: string;
      lastTestOk?: boolean;
      lastTestMessage?: string;
      latencyMs?: number;
    }
  >
>;

function envValue(key: string): string {
  const fromEnv = (env as Record<string, unknown>)[key];
  if (fromEnv != null && String(fromEnv).trim()) return String(fromEnv).trim();
  if (typeof process !== 'undefined' && process.env[key]) return String(process.env[key]).trim();
  return '';
}

function hasEnv(key: string): boolean {
  return Boolean(envValue(key));
}

export function evaluateCredentials(def: ProviderDefinition): {
  configured: boolean;
  credentialStatus: CredentialStatus;
  missingEnv: string[];
} {
  if (def.isNone || def.id === 'console' || def.id === 'local' || def.id === 'osm') {
    return { configured: true, credentialStatus: 'n/a', missingEnv: [] };
  }
  if (def.status === 'planned') {
    const missing = def.requiredEnv.filter((k) => !hasEnv(k));
    return {
      configured: missing.length === 0 && def.requiredEnv.length > 0,
      credentialStatus: missing.length === 0 ? (def.requiredEnv.length ? 'ok' : 'missing') : 'missing',
      missingEnv: missing,
    };
  }
  if (!def.requiredEnv.length) {
    return { configured: true, credentialStatus: 'n/a', missingEnv: [] };
  }
  const missing = def.requiredEnv.filter((k) => !hasEnv(k));
  // AI special-case: accept alternate keys
  if (def.id === 'openai' && missing.includes('OPENAI_API_KEY') && hasEnv('AI_API_KEY')) {
    const rest = missing.filter((k) => k !== 'OPENAI_API_KEY');
    return {
      configured: rest.length === 0,
      credentialStatus: rest.length ? 'partial' : 'ok',
      missingEnv: rest,
    };
  }
  if (def.id === 'gemini') {
    if (hasEnv('GEMINI_API_KEY') || hasEnv('GOOGLE_AI_API_KEY') || hasEnv('AI_API_KEY')) {
      return { configured: true, credentialStatus: 'ok', missingEnv: [] };
    }
  }
  if (def.type === 'maps' && def.id === 'google') {
    if (hasEnv('GOOGLE_MAPS_SERVER_API_KEY') || hasEnv('VITE_GOOGLE_MAPS_API_KEY') || hasEnv('GOOGLE_MAPS_API_KEY')) {
      return { configured: true, credentialStatus: 'ok', missingEnv: [] };
    }
    return {
      configured: false,
      credentialStatus: 'missing',
      missingEnv: ['GOOGLE_MAPS_SERVER_API_KEY'],
    };
  }
  if (def.id === 'nominatim' || def.id === 'haversine') {
    return { configured: true, credentialStatus: 'n/a', missingEnv: [] };
  }
  if (def.id === 'fcm') {
    const hasProject = hasEnv('FIREBASE_PROJECT_ID');
    const hasJson = hasEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
    const hasPair = hasEnv('FIREBASE_CLIENT_EMAIL') && hasEnv('FIREBASE_PRIVATE_KEY');
    if (hasProject && (hasJson || hasPair)) {
      return { configured: true, credentialStatus: 'ok', missingEnv: [] };
    }
    const missingFcm = [
      ...(!hasProject ? ['FIREBASE_PROJECT_ID'] : []),
      ...(!hasJson && !hasPair ? ['FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL+FIREBASE_PRIVATE_KEY'] : []),
    ];
    return { configured: false, credentialStatus: 'missing', missingEnv: missingFcm };
  }
  if (missing.length === 0) return { configured: true, credentialStatus: 'ok', missingEnv: [] };
  if (missing.length < def.requiredEnv.length) {
    return { configured: false, credentialStatus: 'partial', missingEnv: missing };
  }
  return { configured: false, credentialStatus: 'missing', missingEnv: missing };
}

function defaultActiveFromEnv(type: ProviderType): string {
  const defs = providersForType(type);
  for (const def of defs) {
    if (!def.envSelector || !def.envSelectorValues?.length) continue;
    const current = envValue(def.envSelector).toLowerCase();
    if (def.envSelectorValues.map((v) => v.toLowerCase()).includes(current)) {
      return def.id;
    }
  }
  // Type-specific defaults
  if (type === 'ai') {
    if (!env.AI_ENABLED) return 'none';
    return env.AI_PROVIDER || 'console';
  }
  if (type === 'email') return env.EMAIL_PROVIDER || 'console';
  if (type === 'sms') return env.SMS_PROVIDER || 'console';
  if (type === 'push') return env.PUSH_PROVIDER || 'console';
  if (type === 'storage') {
    const p = env.MEDIA_STORAGE_PROVIDER || 'auto';
    if (p === 'cloudinary' || (p === 'auto' && hasEnv('CLOUDINARY_CLOUD_NAME'))) return 'cloudinary';
    return 'local';
  }
  if (type === 'payments') return env.PAYMENT_DEFAULT_PROVIDER || 'console';
  if (type === 'monitoring') return hasEnv('SENTRY_DSN') ? 'sentry' : 'none';
  if (type === 'maps') {
    if (hasEnv('GOOGLE_MAPS_SERVER_API_KEY') || hasEnv('VITE_GOOGLE_MAPS_API_KEY') || hasEnv('GOOGLE_MAPS_API_KEY')) {
      return 'google';
    }
    return 'none';
  }
  return 'none';
}

async function readSetting<T extends Record<string, unknown>>(key: string): Promise<T> {
  const row = await PlatformSetting.findOne({ key }).lean();
  return ((row?.value || {}) as T) || ({} as T);
}

async function writeSetting(
  key: string,
  value: Record<string, unknown>,
  updatedBy?: string,
  description?: string,
) {
  await PlatformSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        scope: 'platform',
        description,
        updatedBy,
        isSecret: false,
      },
    },
    { upsert: true, new: true },
  );
}

function healthKey(type: ProviderType, id: string) {
  return `${type}:${id}`;
}

function clearFactoryCaches(type: ProviderType) {
  if (type === 'ai') resetAiProviderCache();
  if (type === 'payments') {
    clearPaymentProviderCache();
    void import('../../providers/payments/index.js')
      .then(async (m) => {
        const active = await providerManager.resolveRuntimeId('payments');
        m.setPaymentProviderOverride(active);
      })
      .catch(() => undefined);
  }
  void import('../../providers/email/index.js')
    .then((m) => {
      const anyM = m as { clearEmailProviderCache?: () => void };
      anyM.clearEmailProviderCache?.();
    })
    .catch(() => undefined);
  void import('../../providers/storage/index.js')
    .then((m) => {
      const anyM = m as { clearMediaStorageCache?: () => void };
      anyM.clearMediaStorageCache?.();
    })
    .catch(() => undefined);
}

export const providerManager = {
  catalog() {
    return {
      types: PROVIDER_TYPES,
      providers: PROVIDER_CATALOG.map((p) => ({
        type: p.type,
        id: p.id,
        label: p.label,
        status: p.status,
        isNone: Boolean(p.isNone),
        requiredEnv: p.requiredEnv,
        optionalEnv: p.optionalEnv || [],
        guidance: p.guidance,
        requiresRestart: Boolean(p.requiresRestart),
      })),
    };
  },

  async getActiveId(type: ProviderType): Promise<string> {
    const selections = await readSetting<SelectionsMap>(SELECTIONS_KEY);
    const fromDb = selections[type];
    if (fromDb && findProviderDef(type, fromDb)) return fromDb;
    return defaultActiveFromEnv(type);
  },

  async getFailoverId(type: ProviderType): Promise<string | undefined> {
    const failover = await readSetting<FailoverMap>(FAILOVER_KEY);
    const id = failover[type];
    return id && findProviderDef(type, id) ? id : undefined;
  },

  /**
   * Resolve runtime provider id for factories.
   * `none` → console/local disabled semantics.
   */
  async resolveRuntimeId(type: ProviderType): Promise<string> {
    let active = await this.getActiveId(type);
    if (active === 'none') {
      if (type === 'ai' || type === 'email' || type === 'sms' || type === 'push' || type === 'payments') {
        return 'console';
      }
      if (type === 'storage') return 'local';
      return 'none';
    }
    const def = findProviderDef(type, active);
    if (!def || def.status === 'planned') {
      return defaultActiveFromEnv(type);
    }
    const creds = evaluateCredentials(def);
    if (!creds.configured && !def.isNone && def.id !== 'console' && def.id !== 'local') {
      const failover = await this.getFailoverId(type);
      if (failover) {
        const fDef = findProviderDef(type, failover);
        if (fDef && evaluateCredentials(fDef).configured) {
          logger.warn('[providers] primary unavailable — using failover', { type, active, failover });
          return failover === 'none' ? 'console' : failover;
        }
      }
      if (type === 'ai' || type === 'email' || type === 'sms' || type === 'push') return 'console';
      if (type === 'storage') return 'local';
    }
    return active;
  },

  async listStatus(): Promise<{ types: ProviderTypeSummary[]; discoveredAt: string }> {
    const selections = await readSetting<SelectionsMap>(SELECTIONS_KEY);
    const failover = await readSetting<FailoverMap>(FAILOVER_KEY);
    const health = await readSetting<HealthMap>(HEALTH_KEY);

    const types: ProviderTypeSummary[] = [];
    for (const meta of PROVIDER_TYPES) {
      const activeId = selections[meta.type] || defaultActiveFromEnv(meta.type);
      const providers: ProviderStatusRow[] = providersForType(meta.type).map((def) => {
        const creds = evaluateCredentials(def);
        const h = health[healthKey(meta.type, def.id)];
        const active = activeId === def.id;
        let connectionStatus: ConnectionStatus = h?.connectionStatus || 'unknown';
        if (def.isNone || def.id === 'console') connectionStatus = active ? 'disabled' : connectionStatus;
        if (def.status === 'planned') connectionStatus = 'unknown';
        if (!creds.configured && !def.isNone && def.id !== 'console' && def.id !== 'local') {
          connectionStatus = active ? 'failed' : connectionStatus;
        }
        return {
          type: meta.type,
          typeLabel: meta.label,
          id: def.id,
          label: def.label,
          status: def.status,
          isNone: Boolean(def.isNone),
          configured: creds.configured,
          active,
          credentialStatus: creds.credentialStatus,
          missingEnv: creds.missingEnv,
          connectionStatus,
          lastTestAt: h?.lastTestAt,
          lastTestOk: h?.lastTestOk,
          lastTestMessage: h?.lastTestMessage,
          guidance: def.guidance,
          requiresRestart: Boolean(def.requiresRestart),
          supportsFailover: Boolean(def.supportsFailover),
          version: meta.type === 'ai' && def.id === 'openai' ? env.AI_MODEL_OPENAI || env.AI_MODEL : undefined,
        };
      });
      types.push({
        type: meta.type,
        label: meta.label,
        description: meta.description,
        activeId,
        failoverId: failover[meta.type],
        providers,
      });
    }
    return { types, discoveredAt: new Date().toISOString() };
  },

  async activate(input: {
    type: ProviderType;
    providerId: string;
    actorId?: string;
    failoverId?: string | null;
  }) {
    const def = findProviderDef(input.type, input.providerId);
    if (!def) throw AppError.badRequest('Unknown provider');
    if (def.status === 'planned') {
      throw AppError.badRequest(
        `${def.label} is not implemented yet. Configure env placeholders and wait for the adapter, or choose an implemented provider.`,
      );
    }
    const creds = evaluateCredentials(def);
    if (!def.isNone && def.id !== 'console' && def.id !== 'local' && !creds.configured) {
      throw AppError.badRequest(
        `Cannot activate ${def.label}. Missing environment variables: ${creds.missingEnv.join(', ') || 'credentials'}`,
      );
    }

    const selections = await readSetting<SelectionsMap>(SELECTIONS_KEY);
    const before = { ...selections };
    selections[input.type] = input.providerId;
    await writeSetting(SELECTIONS_KEY, selections as Record<string, unknown>, input.actorId, 'Active provider selections');

    if (input.failoverId !== undefined) {
      const failover = await readSetting<FailoverMap>(FAILOVER_KEY);
      if (input.failoverId === null || input.failoverId === '') {
        delete failover[input.type];
      } else {
        const fDef = findProviderDef(input.type, input.failoverId);
        if (!fDef) throw AppError.badRequest('Unknown failover provider');
        failover[input.type] = input.failoverId;
      }
      await writeSetting(FAILOVER_KEY, failover as Record<string, unknown>, input.actorId, 'Provider failover selections');
    }

    clearFactoryCaches(input.type);

    await writeAuditLog({
      actorId: input.actorId,
      actorRole: 'admin',
      action: 'providers.activate',
      resourceType: 'provider',
      resourceId: `${input.type}:${input.providerId}`,
      before,
      after: selections as Record<string, unknown>,
      severity: 'warning',
      meta: { type: input.type, providerId: input.providerId, failoverId: input.failoverId },
    });

    return {
      ok: true,
      type: input.type,
      activeId: input.providerId,
      requiresRestart: Boolean(def.requiresRestart),
      message: def.requiresRestart
        ? `${def.label} activated. A process/frontend restart may be required for this provider.`
        : `${def.label} is now the active ${input.type} provider.`,
    };
  },

  async deactivate(input: { type: ProviderType; actorId?: string }) {
    return this.activate({ type: input.type, providerId: 'none', actorId: input.actorId, failoverId: null });
  },

  async testConnection(input: { type: ProviderType; providerId: string; actorId?: string }) {
    const def = findProviderDef(input.type, input.providerId);
    if (!def) throw AppError.badRequest('Unknown provider');
    const started = Date.now();
    const creds = evaluateCredentials(def);
    let ok = false;
    let message = '';

    if (def.isNone || def.id === 'console' || def.id === 'local') {
      ok = true;
      message = `${def.label} is a local/disabled provider — no external connection required.`;
    } else if (def.status === 'planned') {
      ok = false;
      message = `${def.label} adapter is not implemented yet.`;
    } else if (!creds.configured) {
      ok = false;
      message = `Missing credentials: ${creds.missingEnv.join(', ')}`;
    } else if (input.type === 'ai' && (input.providerId === 'openai' || input.providerId === 'gemini')) {
      // Lightweight credential presence test (no spend). Full chat test is optional later.
      ok = true;
      message = `${def.label} credentials present. Runtime chat uses the Provider Manager active selection.`;
    } else if (input.type === 'email' && input.providerId === 'resend') {
      ok = Boolean(envValue('RESEND_API_KEY'));
      message = ok ? 'Resend API key present.' : 'RESEND_API_KEY missing.';
    } else if (input.type === 'storage' && input.providerId === 'cloudinary') {
      ok = creds.configured;
      message = ok ? 'Cloudinary credentials present.' : 'Cloudinary credentials incomplete.';
    } else if (input.type === 'monitoring' && input.providerId === 'sentry') {
      ok = hasEnv('SENTRY_DSN');
      message = ok ? 'Sentry DSN present.' : 'SENTRY_DSN missing.';
    } else if (input.type === 'maps' && input.providerId === 'google') {
      ok = hasEnv('GOOGLE_MAPS_SERVER_API_KEY') || hasEnv('VITE_GOOGLE_MAPS_API_KEY') || hasEnv('GOOGLE_MAPS_API_KEY');
      message = ok
        ? 'Google Maps key present. Prefer GOOGLE_MAPS_SERVER_API_KEY for Geocoding/Places/Directions.'
        : 'GOOGLE_MAPS_SERVER_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) missing.';
    } else if (input.type === 'maps' && input.providerId === 'nominatim') {
      ok = true;
      message = 'Nominatim emergency fallback — no key required. Used only after Google failure.';
    } else if (input.type === 'maps' && input.providerId === 'haversine') {
      ok = true;
      message = 'Haversine last-resort approximation — local math only.';
    } else if (input.type === 'push' && input.providerId === 'fcm') {
      ok = creds.configured;
      message = ok ? 'Firebase credentials present.' : `Missing: ${creds.missingEnv.join(', ')}`;
    } else if (input.type === 'payments') {
      ok = creds.configured;
      message = ok
        ? `${def.label} credentials present. Live charges require PAYMENTS_LIVE=true.`
        : `Missing: ${creds.missingEnv.join(', ')}`;
    } else {
      ok = creds.configured;
      message = ok ? `${def.label} appears configured.` : `Missing: ${creds.missingEnv.join(', ')}`;
    }

    const latencyMs = Date.now() - started;
    const health = await readSetting<HealthMap>(HEALTH_KEY);
    health[healthKey(input.type, input.providerId)] = {
      connectionStatus: ok ? 'healthy' : 'failed',
      lastTestAt: new Date().toISOString(),
      lastTestOk: ok,
      lastTestMessage: message,
      latencyMs,
    };
    await writeSetting(HEALTH_KEY, health as Record<string, unknown>, input.actorId, 'Provider health checks');

    await writeAuditLog({
      actorId: input.actorId,
      actorRole: 'admin',
      action: 'providers.test',
      resourceType: 'provider',
      resourceId: `${input.type}:${input.providerId}`,
      severity: 'info',
      meta: { ok, message, latencyMs },
    });

    return { ok, message, latencyMs, testedAt: new Date().toISOString() };
  },

  /** Secret-free public snapshot for diagnostics. */
  async publicSnapshot() {
    const status = await this.listStatus();
    return {
      types: status.types.map((t) => ({
        type: t.type,
        activeId: t.activeId,
        failoverId: t.failoverId,
        providers: t.providers.map((p) => ({
          id: p.id,
          configured: p.configured,
          active: p.active,
          credentialStatus: p.credentialStatus,
          connectionStatus: p.connectionStatus,
          status: p.status,
          missingEnvCount: p.missingEnv.length,
        })),
      })),
      discoveredAt: status.discoveredAt,
    };
  },
};
