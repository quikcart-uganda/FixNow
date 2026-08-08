import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { corsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { requestTracing } from './middleware/requestTracing.js';
import { getBackendDiagnostics } from './observability/diagnostics.js';
import { apiRouter } from './routes/index.js';
import { csrfProtection } from './security/csrf.js';
import { securityHeadersMiddleware } from './security/headers.js';
import { secureUploadDownload } from './security/uploads.js';
import { emailCircuit, smsCircuit, pushCircuit, aiCircuit } from './utils/circuitBreaker.js';
import { sendSuccess } from './utils/response.js';

const MONGO_READY: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const googleAuthBridgePath = path.resolve(process.cwd(), 'public/google-auth-bridge.html');

type ReqWithRawBody = express.Request & { rawBody?: string };

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestTracing);
  app.use(securityHeadersMiddleware());
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(httpLogger);

  // Capture raw body for payment webhook HMAC before JSON parse.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        const request = req as ReqWithRawBody;
        if (request.originalUrl.includes('/webhooks/payments')) {
          request.rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(csrfProtection);

  // Liveness — process is up (never rate-limited; ignore Mongo).
  app.get('/livez', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      service: env.APP_NAME,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness — dependencies ready for traffic.
  app.get('/readyz', (_req, res) => {
    const mongoState = mongoose.connection.readyState;
    const ready = mongoState === 1;
    sendSuccess(
      res,
      {
        status: ready ? 'ready' : 'not_ready',
        mongodb: MONGO_READY[mongoState] ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
      ready ? 200 : 503,
    );
  });

  // Back-compat health: degraded when Mongo is down (ops dashboards).
  app.get('/health', (_req, res) => {
    const mongoState = mongoose.connection.readyState;
    const healthy = mongoState === 1;
    const circuits = [
      { name: emailCircuit.name, state: emailCircuit.state() },
      { name: smsCircuit.name, state: smsCircuit.state() },
      { name: pushCircuit.name, state: pushCircuit.state() },
      { name: aiCircuit.name, state: aiCircuit.state() },
    ];
    const openCircuits = circuits.filter((c) => c.state === 'open').map((c) => c.name);
    sendSuccess(
      res,
      {
        status: healthy ? (openCircuits.length ? 'degraded' : 'ok') : 'degraded',
        service: env.APP_NAME,
        env: env.NODE_ENV,
        uptimeSec: Math.round(process.uptime()),
        mongodb: MONGO_READY[mongoState] ?? 'unknown',
        circuits: { open: openCircuits, all: circuits },
        timestamp: new Date().toISOString(),
      },
      healthy ? 200 : 503,
    );
  });

  app.get('/version', (_req, res) => {
    sendSuccess(res, {
      name: env.APP_NAME,
      version: env.APP_VERSION,
      apiPrefix: env.API_PREFIX,
      apiVersion: 'v1',
      env: env.NODE_ENV,
    });
  });

  // In-process diagnostics — no secrets, no operator config.
  app.get('/diagnostics', (_req, res) => {
    sendSuccess(res, getBackendDiagnostics());
  });

  // Hosted GIS bridge for Capacitor (Chrome Custom Tabs / SFSafariViewController).
  // Google blocks the GIS script inside Android WebView (User-Agent `; wv)`).
  app.get('/google-auth-bridge.html', (_req, res) => {
    res.sendFile(googleAuthBridgePath);
  });

  // Rate-limit API traffic only — probes stay available under load.
  app.use(env.API_PREFIX, apiRateLimiter);

  // Private uploads: signed query token OR authenticated owner/admin (no open static).
  app.use('/uploads', (req, res, next) => {
    void secureUploadDownload(req, res, next);
  });

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
