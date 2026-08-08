/**
 * Natural-language degradation paths. Never expose provider/stack details.
 */

import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { softProviderUnavailable } from '../knowledge/localKnowledge.engine.js';
import type { AiToolResult } from '../tools/types.js';

export function publicProviderFailureMessage(role: AiAssistantRole): string {
  return softProviderUnavailable(role);
}

export function composeToolGroundedFallback(
  role: AiAssistantRole,
  message: string,
  toolResults: AiToolResult[],
): string {
  const okResults = toolResults.filter((t) => t.ok && t.summary);
  if (!okResults.length) {
    return publicProviderFailureMessage(role);
  }
  const snippet = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 72);
  const lines = okResults.map((t) => `• ${t.summary}`);
  const intro =
    role === 'technician'
      ? 'Here is what I can see in your FixNow Pro workspace'
      : role === 'admin'
        ? 'Here is what I can see from admin data'
        : 'Here is what I can see in your FixNow account';
  return `${intro}${snippet ? ` for “${snippet}”` : ''}:\n${lines.join('\n')}\nAsk a follow-up if you want this explained. Marketplace changes still happen in FixNow screens.`;
}

/** Strip any vendor/internal error before it could reach a client field. */
export function scrubProviderErrorForClient(_error?: string): undefined {
  return undefined;
}
