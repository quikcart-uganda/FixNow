/**
 * Thin performance metrics abstraction for application code.
 * Prefer this over ad-hoc Date.now() bookkeeping in handlers.
 * Backed by the in-process metrics ring (no Prometheus / operator config).
 */

import { recordHttpResult, getMetricsSnapshot } from './metrics.js';

export type PerfTimer = {
  end: (statusCode?: number) => number;
};

export function startPerfTimer(): PerfTimer {
  const startedAt = Date.now();
  return {
    end(statusCode = 200) {
      const durationMs = Date.now() - startedAt;
      recordHttpResult(statusCode, durationMs);
      return durationMs;
    },
  };
}

export function getPerfSnapshot() {
  const m = getMetricsSnapshot();
  return {
    uptimeSec: m.uptimeSec,
    latency: m.latency,
    http: m.http,
  };
}
