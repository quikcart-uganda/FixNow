import type { Request } from 'express';
import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import type { SafeAiRoleContext } from '../context/context.manager.js';
import type { DataEnvironment } from '../../../constants/dataEnvironment.js';

export interface AiToolResult {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

export interface AiToolContext {
  role: AiAssistantRole;
  userId: string;
  roleContext: SafeAiRoleContext;
  /** Minimal Express-like query bag for marketplace services that accept Request. */
  query?: Record<string, unknown>;
  guest?: boolean;
  /** Authoritative data environment — determined by backend, never by LLM. */
  dataEnvironment: DataEnvironment;
}

/**
 * Build a minimal Express-like Request for marketplace services.
 * When `auth` is provided, downstream services can resolve the actor's environment.
 */
export function asQueryRequest(
  query: Record<string, unknown> = {},
  auth?: { userId?: string; role?: string; dataEnvironment?: DataEnvironment },
): Request {
  return { query, auth } as unknown as Request;
}

export function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item));
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && 'toObject' in value && typeof (value as { toObject?: () => unknown }).toObject === 'function') {
    return (value as { toObject: () => Record<string, unknown> }).toObject();
  }
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

export function summarizeJson(value: unknown, max = 1800): string {
  try {
    const text = JSON.stringify(value, null, 0);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return String(value);
  }
}
