import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './types.js';

function toGeminiContents(messages: AiCompletionRequest['messages']) {
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join('\n\n') }] }
      : undefined,
    contents,
  };
}

export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini' as const;
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
        error: 'Gemini API key is not configured.',
        latencyMs: Date.now() - started,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const { systemInstruction, contents } = toGeminiContents(request.messages);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.4,
            maxOutputTokens: request.maxTokens ?? 1024,
          },
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      if (!response.ok) {
        return {
          ok: false,
          text: '',
          provider: this.name,
          model,
          error: payload.error?.message || `Gemini request failed (${response.status})`,
          latencyMs: Date.now() - started,
        };
      }

      const text = String(
        payload.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '',
      ).trim();

      return {
        ok: Boolean(text),
        text,
        provider: this.name,
        model,
        usage: payload.usageMetadata
          ? {
              promptTokens: payload.usageMetadata.promptTokenCount,
              completionTokens: payload.usageMetadata.candidatesTokenCount,
              totalTokens: payload.usageMetadata.totalTokenCount,
            }
          : null,
        error: text ? undefined : 'Gemini returned an empty response.',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        text: '',
        provider: this.name,
        model,
        error: aborted ? 'Gemini request timed out.' : error instanceof Error ? error.message : 'Gemini request failed.',
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
