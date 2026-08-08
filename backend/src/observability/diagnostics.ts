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
