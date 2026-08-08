import { env } from '../../config/env.js';
import { ConsoleAiProvider } from './console.provider.js';
import { GeminiAiProvider } from './gemini.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import type { AiProvider, AiProviderName } from './types.js';

export type { AiChatMessage, AiCompletionRequest, AiCompletionResult, AiProvider, AiProviderName } from './types.js';

let cached: AiProvider | null = null;
let cachedId: string | null = null;
let resolving: Promise<string> | null = null;

async function resolveActiveAiId(): Promise<string> {
  try {
    const { providerManager } = await import('../../services/providers/provider.manager.js');
    return providerManager.resolveRuntimeId('ai');
  } catch {
    if (!env.AI_ENABLED) return 'console';
    return env.AI_PROVIDER || 'console';
  }
}

function buildProvider(id: string): AiProvider {
  if (id === 'none' || id === 'console' || !env.AI_ENABLED) {
    return new ConsoleAiProvider();
  }
  if (id === 'openai') {
    const key = env.OPENAI_API_KEY || env.AI_API_KEY || '';
    return key
      ? new OpenAiProvider(key, env.AI_MODEL_OPENAI || env.AI_MODEL, env.AI_REQUEST_TIMEOUT_MS)
      : new ConsoleAiProvider();
  }
  if (id === 'gemini') {
    const key = env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || env.AI_API_KEY || '';
    return key
      ? new GeminiAiProvider(key, env.AI_MODEL_GEMINI || env.AI_MODEL, env.AI_REQUEST_TIMEOUT_MS)
      : new ConsoleAiProvider();
  }
  return new ConsoleAiProvider();
}

/**
 * Resolve the active AI provider via Provider Manager (DB selection) with env fallback.
 */
export function getAiProvider(): AiProvider {
  if (cached && cachedId) return cached;

  // Sync path: use last known / env until async warm completes
  const fallbackId = !env.AI_ENABLED ? 'console' : env.AI_PROVIDER || 'console';
  cached = buildProvider(fallbackId);
  cachedId = fallbackId;

  if (!resolving) {
    resolving = resolveActiveAiId()
      .then((id) => {
        if (id !== cachedId) {
          cached = buildProvider(id);
          cachedId = id;
        }
        return id;
      })
      .finally(() => {
        resolving = null;
      });
  }

  return cached;
}

/** Awaitable resolve — preferred inside request handlers. */
export async function getAiProviderAsync(): Promise<AiProvider> {
  const id = await resolveActiveAiId();
  if (!cached || cachedId !== id) {
    cached = buildProvider(id);
    cachedId = id;
  }
  return cached;
}

export function resetAiProviderCache(): void {
  cached = null;
  cachedId = null;
  resolving = null;
}

export function resolveAiProviderName(): AiProviderName {
  if (!env.AI_ENABLED && !cachedId) return 'console';
  const id = cachedId || env.AI_PROVIDER || 'console';
  if (id === 'openai' || id === 'gemini' || id === 'console') return id;
  return 'console';
}
