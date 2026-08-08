import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Monitoring hook. Forwards unexpected errors to Sentry when `SENTRY_DSN`
 * is set AND `@sentry/node` is installed; otherwise it is a no-op that
 * relies on structured error logs. Keeping this indirection means adding
 * Sentry later requires only `npm i @sentry/node` + the DSN env var.
 */
type CaptureContext = Record<string, unknown>;

interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
}

let sentry: SentryLike | null = null;
let initialized = false;

export async function initMonitoring(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!env.SENTRY_DSN) return;

  // Variable specifier keeps this optional at build time.
  const moduleId = '@sentry/node';
  try {
    const mod = (await import(moduleId)) as unknown as SentryLike;
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release: `${env.APP_NAME}@${env.APP_VERSION}`,
      tracesSampleRate: 0,
    });
    sentry = mod;
    logger.info('Sentry monitoring initialized');
  } catch {
    logger.warn('SENTRY_DSN is set but @sentry/node is not installed — monitoring disabled');
  }
}

export function captureException(error: unknown, context?: CaptureContext): void {
  if (sentry) {
    try {
      sentry.captureException(error, context ? { extra: context } : undefined);
      return;
    } catch {
      /* fall through to logging */
    }
  }
  logger.error('captured exception', { error, ...(context ?? {}) });
}
