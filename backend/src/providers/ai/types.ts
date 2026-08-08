/**
 * AI chat provider contract.
 * Implementations: console (dev/disabled), openai, gemini — selected via env.
 * Providers only complete text; they never own marketplace business logic.
 */

export type AiProviderName = 'console' | 'openai' | 'gemini';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiCompletionResult {
  ok: boolean;
  text: string;
  provider: AiProviderName | string;
  model?: string;
  usage?: AiCompletionUsage | null;
  error?: string;
  latencyMs?: number;
}

export interface AiProvider {
  readonly name: AiProviderName | string;
  readonly configured: boolean;
  completeChat(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
