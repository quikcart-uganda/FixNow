/**
 * Secret-free AI telemetry. Never log message bodies, prompts, or tool payloads.
 */

import { logger } from '../../../config/logger.js';

export type AiTelemetryEvent = {
  role: string;
  provider: string;
  ok: boolean;
  latencyMs?: number;
  usedFallback?: boolean;
  usedLocalKnowledge?: boolean;
  timedOut?: boolean;
  retried?: boolean;
  circuitOpen?: boolean;
  safetyFlags?: string[];
  toolCount?: number;
  focus?: string;
  topic?: string;
};

export function logAiEvent(event: AiTelemetryEvent): void {
  try {
    logger.info('[ai]', {
      role: event.role,
      provider: event.provider,
      ok: event.ok,
      latencyMs: event.latencyMs,
      usedFallback: event.usedFallback || false,
      usedLocalKnowledge: event.usedLocalKnowledge || false,
      timedOut: event.timedOut || false,
      retried: event.retried || false,
      circuitOpen: event.circuitOpen || false,
      safetyFlags: event.safetyFlags?.length ? event.safetyFlags : undefined,
      toolCount: event.toolCount ?? 0,
      focus: event.focus,
      topic: event.topic,
    });
  } catch {
    /* never break chat on telemetry */
  }
}
