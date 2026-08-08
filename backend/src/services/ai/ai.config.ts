import { env } from '../../config/env.js';
import { resolveAiProviderName } from '../../providers/ai/index.js';
import type { AiAssistantRole } from '../../models/ai/AiConversation.js';

export interface AiRuntimeConfig {
  enabled: boolean;
  /** External LLM configured and enabled. */
  providerConfigured: boolean;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  requestTimeoutMs: number;
  providerRetryCount: number;
  conversationHistoryEnabled: boolean;
  historyLimit: number;
  customerEnabled: boolean;
  technicianEnabled: boolean;
  adminEnabled: boolean;
  /** Assistants available via local knowledge even without an LLM. */
  localKnowledgeEnabled: boolean;
}

export function loadAiRuntimeConfig(): AiRuntimeConfig {
  const providerName = resolveAiProviderName();
  const providerConfigured = Boolean(env.AI_ENABLED && providerName !== 'console');
  return {
    enabled: env.AI_ENABLED,
    providerConfigured,
    provider: providerName,
    model: env.AI_MODEL,
    temperature: env.AI_TEMPERATURE,
    maxTokens: env.AI_MAX_TOKENS,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    providerRetryCount: env.AI_PROVIDER_RETRY_COUNT ?? 1,
    conversationHistoryEnabled: env.AI_CONVERSATION_HISTORY_ENABLED,
    historyLimit: env.AI_HISTORY_LIMIT,
    // Role flags remain independently toggleable; local knowledge keeps chat useful when LLM is off.
    customerEnabled: env.AI_CUSTOMER_ASSISTANT_ENABLED,
    technicianEnabled: env.AI_TECHNICIAN_ASSISTANT_ENABLED,
    adminEnabled: env.AI_ADMIN_ASSISTANT_ENABLED,
    localKnowledgeEnabled: true,
  };
}

export function roleAssistantEnabled(role: AiAssistantRole, config = loadAiRuntimeConfig()): boolean {
  if (role === 'customer') return config.customerEnabled;
  if (role === 'technician') return config.technicianEnabled;
  return config.adminEnabled;
}

/** Public, secret-free status for clients and health checks. */
export function publicAiStatus(config = loadAiRuntimeConfig()) {
  const anyRole =
    config.customerEnabled || config.technicianEnabled || config.adminEnabled;
  return {
    enabled: anyRole,
    provider: config.provider,
    providerConfigured: config.providerConfigured,
    mode: config.providerConfigured ? 'full' : 'local',
    model: config.providerConfigured ? config.model : 'local-knowledge',
    conversationHistoryEnabled: config.conversationHistoryEnabled,
    roles: {
      customer: config.customerEnabled,
      technician: config.technicianEnabled,
      admin: config.adminEnabled,
    },
    note: config.providerConfigured
      ? 'FixNow AI is available. Assistants only advise; marketplace actions stay in existing FixNow screens.'
      : 'FixNow assistants are available with built-in guidance. Deeper writing and analysis need the AI provider when configured.',
  };
}
