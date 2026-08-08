import http from 'node:http';
import net from 'node:net';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initMonitoring } from './config/monitoring.js';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/index.js';
import { getSocketServer, initSocketServer } from './sockets/index.js';

function redactMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/([^@/]+)@/, '//***@');
  }
}

/**
 * Preflight bind probe — detects an occupied port *before* the real server,
 * sockets, and background jobs are wired up. A race is still possible between
 * probe and listen(), so the real server also handles the 'error' event.
 */
function assertPortAvailable(port: number, host = '0.0.0.0'): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      probe.close();
      reject(err);
    });
    probe.once('listening', () => {
      probe.close(() => resolve());
    });
    probe.listen(port, host);
  });
}

/** Lifecycle state — lets cleanup run safely no matter where startup failed. */
const state = {
  dbConnected: false,
  jobsStarted: false,
  shuttingDown: false,
};

let server: http.Server | null = null;

/**
 * Idempotent, stage-aware shutdown. Every step is individually guarded so a
 * failure in one cleanup routine never blocks the others, and nothing runs
 * against a resource that was never started (e.g. server.close() on a server
 * that never began listening — the source of ERR_SERVER_NOT_RUNNING).
 */
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (state.shuttingDown) return;
  state.shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  let failed = false;

  if (state.jobsStarted) {
    try {
      stopBackgroundJobs();
    } catch (error) {
      failed = true;
      logger.error('Failed to stop background jobs', error);
    }
    state.jobsStarted = false;
  }

  try {
    const io = getSocketServer();
    if (io) {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    }
  } catch (error) {
    failed = true;
    logger.error('Failed to close socket server', error);
  }

  // Only close the HTTP server if it is actually accepting connections.
  if (server?.listening) {
    try {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (error) {
      failed = true;
      logger.error('Failed to close HTTP server', error);
    }
  }

  if (state.dbConnected) {
    try {
      const { disconnectDatabase } = await import('./config/database.js');
      await disconnectDatabase();
    } catch (error) {
      failed = true;
      logger.error('Failed to disconnect MongoDB', error);
    }
    state.dbConnected = false;
  }

  clearTimeout(forceTimer);
  logger.info('Shutdown complete');
  process.exit(failed ? 1 : exitCode);
}

/** Register process-level handlers once, before any async startup work. */
function registerProcessHandlers(): void {
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    void shutdown('uncaughtException', 1);
  });
}

async function bootstrap() {
  registerProcessHandlers();

  await initMonitoring();

  // Fail fast on an occupied port before touching the database or jobs.
  try {
    await assertPortAvailable(env.PORT, env.HOST);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.PORT} is already in use. Stop the other process (or set PORT to a free port) and restart.`,
      );
      process.exit(1);
    }
    throw error;
  }

  await connectDatabase();
  state.dbConnected = true;
  logger.info(`MongoDB connected (${redactMongoUri(env.MONGODB_URI)})`);

  try {
    const { contentService } = await import('./services/content/content.service.js');
    const seeded = await contentService.ensureDefaults();
    if (seeded.created > 0) {
      logger.info(`CMS defaults published: ${seeded.created}/${seeded.total}`);
    }
  } catch (error) {
    logger.error('CMS default content seed failed', error);
  }

  try {
    const { contentBlockService } = await import('./services/content/contentBlock.service.js');
    const seededBlocks = await contentBlockService.ensureDefaults();
    if (seededBlocks.created > 0) {
      logger.info(`Content blocks seeded: ${seededBlocks.created}/${seededBlocks.total}`);
    }
  } catch (error) {
    logger.error('Content block default seed failed', error);
  }

  try {
    const { ensureSubscriptionCatalogue } = await import('./services/marketplace/subscription.service.js');
    const plans = await ensureSubscriptionCatalogue();
    logger.info(`Subscription catalogue ready: ${plans.length} plan(s)`);
  } catch (error) {
    logger.error('Subscription catalogue seed failed', error);
  }

  try {
    const { getPaymentProviderAsync } = await import('./providers/payments/index.js');
    await getPaymentProviderAsync();
    logger.info('Provider Manager: payment selection warmed');
  } catch (error) {
    logger.warn('Provider Manager payment warm skipped', error);
  }

  const app = createApp();
  server = http.createServer(app);
  initSocketServer(server);

  // Handle listen() failures (including the probe→listen race) without ever
  // falling through to uncaughtException / secondary shutdown errors.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.PORT} is already in use. Stop the other process (or set PORT to a free port) and restart.`,
      );
    } else {
      logger.error('HTTP server error', error);
    }
    void shutdown('server-error', 1);
  });

  server.listen(env.PORT, env.HOST, () => {
    startBackgroundJobs();
    state.jobsStarted = true;
    logger.info(`${env.APP_NAME} v${env.APP_VERSION} listening on ${env.HOST}:${env.PORT}`);
    logger.info(`API base: ${env.API_PREFIX}`);
    logger.info(`Health (local): http://127.0.0.1:${env.PORT}/health`);
    if (env.HOST === '0.0.0.0' || env.HOST === '::') {
      logger.info(
        `Health (LAN): http://<this-machine-lan-ip>:${env.PORT}/health — use the same IP phones use for Vite`,
      );
    }
    logger.info(`Livez: http://127.0.0.1:${env.PORT}/livez · Readyz: http://127.0.0.1:${env.PORT}/readyz`);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start FixNow backend', error);
  // Clean up whatever partially started (DB connection, jobs) before exiting.
  void shutdown('bootstrap-failure', 1);
});
