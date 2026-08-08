import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './types.js';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string,
    private readonly timeoutMs: number,
  ) {
    this.configured = Boolean(apiKey);
  }

  async completeChat(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const started = Date.now();
    const model = request.model || this.defaultModel;

    if (!this.apiKey) {
      return {
        ok: false,
        text: '',
        provider: this.name,
        model,
        error: 'OpenAI API key is not configured.',
        latencyMs: Date.now() - started,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxTokens ?? 1024,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      if (!response.ok) {
        return {
          ok: false,
          text: '',
          provider: this.name,
          model,
          error: payload.error?.message || `OpenAI request failed (${response.status})`,
          latencyMs: Date.now() - started,
        };
      }

      const text = String(payload.choices?.[0]?.message?.content || '').trim();
      return {
        ok: Boolean(text),
        text,
        provider: this.name,
        model,
        usage: payload.usage
          ? {
              promptTokens: payload.usage.prompt_tokens,
              completionTokens: payload.usage.completion_tokens,
              totalTokens: payload.usage.total_tokens,
            }
          : null,
        error: text ? undefined : 'OpenAI returned an empty response.',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        text: '',
        provider: this.name,
        model,
        error: aborted ? 'OpenAI request timed out.' : error instanceof Error ? error.message : 'OpenAI request failed.',
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
