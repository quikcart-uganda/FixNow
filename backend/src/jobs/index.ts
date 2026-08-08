import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { processPushRetries } from '../services/push/push.service.js';
import { processEscrowAutoReleases } from '../services/payments/payment.service.js';
import { accountDeletionService } from '../services/content/accountDeletion.service.js';
import { contentService } from '../services/content/content.service.js';
import { contentBlockService } from '../services/content/contentBlock.service.js';
import { trackingService } from '../services/tracking/tracking.service.js';
import { withJobLease } from './lease.js';

/**
 * Background job registry.
 * Push retry worker runs when PUSH_RETRY_INTERVAL_MS > 0.
 * Escrow auto-release runs when ESCROW_AUTO_RELEASE_MS > 0.
 * Multi-instance safe via Mongo job leases.
 *
 * CMS publish + account deletion run every 60s (time-sensitive).
 * Tracking purge runs on a slower cadence to cut idle DB churn.
 */
let retryTimer: ReturnType<typeof setInterval> | null = null;
let escrowTimer: ReturnType<typeof setInterval> | null = null;
let cmsTimer: ReturnType<typeof setInterval> | null = null;
let trackingTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundJobs(): void {
  const interval = env.PUSH_RETRY_INTERVAL_MS;
  if (interval > 0) {
    retryTimer = setInterval(() => {
      void withJobLease('push-retries', interval, async () => {
        const n = await processPushRetries();
        if (n > 0) logger.info(`Push retries processed: ${n}`);
      });
    }, interval);
    if (typeof retryTimer.unref === 'function') retryTimer.unref();
    logger.info(`Background push retry worker started (every ${interval}ms)`);
  } else {
    logger.info('Background job registry initialized (push retries disabled)');
  }

  if (env.ESCROW_AUTO_RELEASE_MS > 0) {
    const escrowInterval = Math.max(30_000, Math.min(env.ESCROW_AUTO_RELEASE_MS, 300_000));
    escrowTimer = setInterval(() => {
      void withJobLease('escrow-auto-release', escrowInterval, async () => {
        try {
          const n = await processEscrowAutoReleases();
          if (n > 0) logger.info(`Escrow auto-releases processed: ${n}`);
        } catch (error) {
          logger.error('Escrow auto-release worker failed', error);
        }
      });
    }, escrowInterval);
    if (typeof escrowTimer.unref === 'function') escrowTimer.unref();
    logger.info(`Escrow auto-release worker started (every ${escrowInterval}ms)`);
  }

  cmsTimer = setInterval(() => {
    void withJobLease('cms-maintenance', 60_000, async () => {
      try {
        await contentService.runScheduledPublishes();
        const blocks = await contentBlockService.runScheduledTransitions();
        if (blocks.published > 0 || blocks.expired > 0) {
          logger.info(`Content blocks transitioned: ${blocks.published} published, ${blocks.expired} expired`);
        }
        const deleted = await accountDeletionService.processDueRequests();
        if (deleted.processed > 0) logger.info(`Account deletions processed: ${deleted.processed}`);
        const { boostService } = await import('../services/marketplace/boost.service.js');
        const expired = await boostService.expireDueBoosts();
        const reminded = await boostService.processBoostReminders();
        if (expired > 0 || reminded > 0) {
          logger.info(`Boosts: ${expired} expired, ${reminded} reminders`);
        }
        const { subscriptionMarketplaceService } = await import(
          '../services/marketplace/subscription.service.js'
        );
        const subExpired = await subscriptionMarketplaceService.expireDueSubscriptions();
        const subReminded = await subscriptionMarketplaceService.processReminderFanout();
        if (subExpired > 0 || subReminded > 0) {
          logger.info(`Subscriptions: ${subExpired} expired/transitioned, ${subReminded} reminders`);
        }
      } catch (error) {
        logger.error('CMS maintenance worker failed', error);
      }
    });
  }, 60_000);
  if (typeof cmsTimer.unref === 'function') cmsTimer.unref();

  // Tracking TTL purge — every 5 minutes (was bundled every 60s).
  trackingTimer = setInterval(() => {
    void withJobLease('tracking-purge', 300_000, async () => {
      try {
        const purged = await trackingService.purgeExpired();
        if (purged.deleted > 0) logger.info(`Tracking sessions purged: ${purged.deleted}`);
      } catch (error) {
        logger.error('Tracking purge worker failed', error);
      }
    });
  }, 300_000);
  if (typeof trackingTimer.unref === 'function') trackingTimer.unref();
}

export function stopBackgroundJobs(): void {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (escrowTimer) {
    clearInterval(escrowTimer);
    escrowTimer = null;
  }
  if (cmsTimer) {
    clearInterval(cmsTimer);
    cmsTimer = null;
  }
  if (trackingTimer) {
    clearInterval(trackingTimer);
    trackingTimer = null;
  }
  logger.info('Background job registry stopped');
}
