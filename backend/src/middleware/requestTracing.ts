/**
 * Request tracing — ALS context + latency metrics + response timing headers.
 * No external APM / operator config required.
 */

import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext, setRequestContext } from '../observability/context.js';
import { recordHttpResult } from '../observability/metrics.js';

const SKIP_METRICS = new Set(['/livez', '/readyz', '/health', '/version', '/diagnostics']);

export function requestTracing(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0] ?? '';

  runWithRequestContext(
    {
      requestId: req.requestId,
      method: req.method,
      path: pathOnly,
      startedAt,
    },
    () => {
      res.on('finish', () => {
        if (req.auth?.userId) {
          setRequestContext({ userId: req.auth.userId, role: req.auth.role });
        }
        if (!SKIP_METRICS.has(pathOnly)) {
          recordHttpResult(res.statusCode, Date.now() - startedAt);
        }
      });

      const originalEnd = res.end.bind(res);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end = (...args: unknown[]) => {
        try {
          if (!res.getHeader('X-Response-Time')) {
            res.setHeader('X-Response-Time', `${Date.now() - startedAt}ms`);
          }
          if (req.requestId && !res.getHeader('X-Request-Id')) {
            res.setHeader('X-Request-Id', req.requestId);
          }
        } catch {
          /* headers already sent */
        }
        return originalEnd(...(args as Parameters<typeof res.end>));
      };

      next();
    },
  );
}
