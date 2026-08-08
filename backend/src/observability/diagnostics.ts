/**
 * Backend diagnostics snapshot — no operator secrets required.
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getSocketServer } from '../sockets/realtime.js';
import { emailCircuit, smsCircuit, pushCircuit, aiCircuit } from '../utils/circuitBreaker.js';
import { getMetricsSnapshot } from './metrics.js';

const MONGO_READY: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function circuitSnap(c: { name: string; state: () => string }) {
  return { name: c.name, state: c.state() };
}

/** Classify Mongo target without leaking credentials — used by /diagnostics. */
function describeMongoTargetSafe(uri: string | undefined): {
  kind: 'atlas' | 'local' | 'other' | 'missing';
  host: string | null;
  dbName: string | null;
} {
  if (!uri?.trim()) {
    return { kind: 'missing', host: null, dbName: null };
  }
  try {
    const parsed = new URL(uri);
    const host = parsed.host || null;
    const dbName =
      parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/^\//, '').split('?')[0] || null
        : null;
    const isLocal =
      Boolean(host && (/^localhost(?::|$)/i.test(host) || /^127\.0\.0\.1(?::|$)/.test(host)));
    const isAtlas =
      parsed.protocol === 'mongodb+srv:' || /\.mongodb\.net(?::|$)/i.test(host || '');
    return {
      kind: isLocal ? 'local' : isAtlas ? 'atlas' : 'other',
      host,
      dbName,
    };
  } catch {
    return { kind: 'other', host: null, dbName: null };
  }
}

export function getBackendDiagnostics() {
  const mem = process.memoryUsage();
  const io = getSocketServer();
  const mongoState = mongoose.connection.readyState;
  const metrics = getMetricsSnapshot();

  return {
    service: env.APP_NAME,
    version: env.APP_VERSION,
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
      },
    },
    mongodb: {
      state: MONGO_READY[mongoState] ?? 'unknown',
      ready: mongoState === 1,
      /** Secret-free target classification for deployment validation (never includes credentials). */
      target: describeMongoTargetSafe(env.MONGODB_URI),
    },
    sockets: {
      engineClients: io?.engine?.clientsCount ?? 0,
      connected: Boolean(io),
    },
    circuits: [
      circuitSnap(emailCircuit),
      circuitSnap(smsCircuit),
      circuitSnap(pushCircuit),
      circuitSnap(aiCircuit),
    ],
    metrics,
    /** Background job / lease worker counters (in-process queue diagnostics). */
    queue: {
      backgroundJobs: metrics.jobs,
    },
  };
}
