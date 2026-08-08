import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './types.js';

/**
 * Dev / kill-switch provider. Never calls an external LLM.
 * Signals local-only mode so ai.service uses the built-in knowledge engine.
 */
export class ConsoleAiProvider implements AiProvider {
  readonly name = 'console' as const;
  readonly configured = true;

  /**
   * Local-only provider. Returns ok:false so ai.service uses the built-in
   * knowledge / tool fallback path instead of a customer-biased stub reply.
   */
  async completeChat(_request: AiCompletionRequest): Promise<AiCompletionResult> {
    const started = Date.now();
    return {
      ok: false,
      text: '',
      provider: this.name,
      model: 'console',
      usage: null,
      error: 'local_only',
      latencyMs: Date.now() - started,
    };
  }
}
