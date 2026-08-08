import type { NextFunction, Request, Response } from 'express';
import { env, type DevFlagKey } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isDevFeatureEnabled } from '../services/platform/devControls.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Gate for development-only endpoints (dev login, test accounts, mock auth,
 * debug/diagnostics routes). Production responds with 404 so the surface is not
 * even discoverable, and non-production requires the flag to be enabled by an
 * admin. Frontend hiding is never relied upon.
 */
export function requireDevFeature(flag: DevFlagKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (env.isProductionEnv) {
          logger.warn(`[devGuard] blocked ${req.method} ${req.originalUrl} (${flag}) in production`);
          next(AppError.notFound('Not found'));
          return;
        }
        if (!(await isDevFeatureEnabled(flag))) {
          next(AppError.forbidden(`Development feature "${flag}" is disabled`));
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}

/** Hard block for any route that must never exist outside development tooling. */
export function blockInProduction() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (env.isProductionEnv) {
      logger.warn(`[devGuard] blocked ${req.method} ${req.originalUrl} in production`);
      next(AppError.notFound('Not found'));
      return;
    }
    next();
  };
}
