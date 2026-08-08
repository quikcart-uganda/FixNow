/**
 * In-process metrics ring — no Prometheus/Redis required.
 * Rolling counters + latency samples for diagnostics endpoints.
 */

type LatencyBucket = {
  count: number;
  sumMs: number;
  maxMs: number;
  samples: number[];
};

const MAX_SAMPLES = 200;
const MAX_ERROR_CODES = 40;

const httpByClass = {
  '2xx': 0,
  '3xx': 0,
  '4xx': 0,
  '5xx': 0,
  other: 0,
};

const latency: LatencyBucket = { count: 0, sumMs: 0, maxMs: 0, samples: [] };
const errorCodes = new Map<string, number>();
const startedAt = Date.now();

let socketConnects = 0;
let socketDisconnects = 0;
let socketAuthFailures = 0;
let jobTicks = 0;
let jobFailures = 0;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

export function recordHttpResult(status: number, durationMs: number): void {
  if (status >= 200 && status < 300) httpByClass['2xx'] += 1;
  else if (status >= 300 && status < 400) httpByClass['3xx'] += 1;
  else if (status >= 400 && status < 500) httpByClass['4xx'] += 1;
  else if (status >= 500) httpByClass['5xx'] += 1;
  else httpByClass.other += 1;

  const ms = Math.max(0, durationMs);
  latency.count += 1;
  latency.sumMs += ms;
  latency.maxMs = Math.max(latency.maxMs, ms);
  latency.samples.push(ms);
  if (latency.samples.length > MAX_SAMPLES) latency.samples.shift();
}

export function recordErrorCode(code: string): void {
  if (!code) return;
  const key = String(code).slice(0, 80);
  errorCodes.set(key, (errorCodes.get(key) ?? 0) + 1);
  if (errorCodes.size > MAX_ERROR_CODES) {
    const first = errorCodes.keys().next().value;
    if (first) errorCodes.delete(first);
  }
}

export function recordSocketConnect(): void {
  socketConnects += 1;
}

export function recordSocketDisconnect(): void {
  socketDisconnects += 1;
}

export function recordSocketAuthFailure(): void {
  socketAuthFailures += 1;
}

export function recordJobTick(ok: boolean): void {
  jobTicks += 1;
  if (!ok) jobFailures += 1;
}

export function getMetricsSnapshot() {
  const samples = [...latency.samples].sort((a, b) => a - b);
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    http: { ...httpByClass },
    latency: {
      count: latency.count,
      avgMs: latency.count ? Math.round(latency.sumMs / latency.count) : 0,
      maxMs: latency.maxMs,
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      p99Ms: percentile(samples, 99),
      sampleSize: samples.length,
    },
    errorsByCode: Object.fromEntries([...errorCodes.entries()].sort((a, b) => b[1] - a[1])),
    sockets: {
      connects: socketConnects,
      disconnects: socketDisconnects,
      authFailures: socketAuthFailures,
    },
    jobs: {
      ticks: jobTicks,
      failures: jobFailures,
    },
  };
}
