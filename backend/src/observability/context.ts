/**
 * AsyncLocalStorage request context — correlates logs without operator config.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId?: string;
  method?: string;
  path?: string;
  userId?: string;
  role?: string;
  startedAt?: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}

export function setRequestContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.requestId;
}
