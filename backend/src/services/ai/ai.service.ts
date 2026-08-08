import type { AiAssistantRole } from '../../models/ai/AiConversation.js';
import { getAiProvider, getAiProviderAsync } from '../../providers/ai/index.js';
import { aiCircuit, CircuitOpenError } from '../../utils/circuitBreaker.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { loadAiRuntimeConfig, publicAiStatus, roleAssistantEnabled } from './ai.config.js';
import {
  buildMemoryGuidance,
  detectDomainFocus,
  detectSocialIntent,
  inferConversationFocus,
  isCorrectionMessage,
  socialShortCircuitReply,
} from './conversation/conversational.core.js';
import {
  buildRoleContext,
  formatContextForPrompt,
  type AiChatContextInput,
} from './context/context.manager.js';
import {
  composeToolGroundedFallback,
  publicProviderFailureMessage,
  scrubProviderErrorForClient,
} from './fallback/smartFallback.js';
import {
  answerFromLocalKnowledge,
  isAdvancedAiRequest,
  shouldPreferLocalKnowledge,
} from './knowledge/localKnowledge.engine.js';
import { aiConversationMemory } from './memory/conversation.service.js';
import { logAiEvent } from './observability/ai.telemetry.js';
import { buildProviderMessages } from './prompts/prompt.manager.js';
import {
  detectCrossRoleViolation,
  detectPromptInjection,
  publicToolLabel,
  sanitizeAndValidateResponse,
} from './safety/response.validator.js';
import {
  detectToolsForMessage,
  formatToolResultsForPrompt,
  runAllowlistedTools,
  type AiToolResult,
} from './tools/index.js';

export interface AiChatInput {
  role: AiAssistantRole;
  userId: string;
  message: string;
  conversationId?: string;
  context?: AiChatContextInput;
  inputMode?: 'text' | 'voice' | 'image';
  attachments?: Array<{ kind: string; name: string; url?: string; mimeType?: string }>;
  /** Anonymous guest discovery — no JWT, no Mongo conversation owner. */
  guest?: boolean;
  guestSessionId?: string;
}

export interface AiChatResponse {
  ok: boolean
  role: AiAssistantRole
  message: string
  provider: string
  model?: string
  disabled: boolean
  conversationId?: string
  intentTools: string[]
  toolResults: Array<{ tool: string; label: string; ok: boolean; summary: string }>
  suggestions: string[]
  deepLinks?: Array<{ label: string; href: string }>
  /** Confirmable write intents — executed only via existing platform services after user confirms. */
  pendingActions?: Array<{
    id: string
    tool: string
    workflowId: string
    title: string
    summary: string
    expiresAt: string
    status: string
  }>
  navigateTo?: string
  error?: string
  safetyFlags?: string[]
}

const ROLE_DISABLED_MESSAGES: Record<AiAssistantRole, string> = {
  customer:
    'The assistant is currently unavailable. You can still search technicians, post jobs, and manage bookings in FixNow.',
  technician:
    'The assistant is currently unavailable. Your profile, nearby jobs, and applications still work normally.',
  admin:
    'The assistant is currently unavailable. Dashboards, moderation, and marketplace controls remain available.',
};

function cleanMessage(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function suggestionsForRole(role: AiAssistantRole, focus?: string, guest = false): string[] {
  if (role === 'customer' && guest) {
    return [
      'Find a plumber near me',
      'How does FixNow work?',
      'What services are available?',
      'How is payment protected?',
      'Safety tips for hiring',
    ];
  }
  if (role === 'customer') {
    if (focus === 'payments_escrow') {
      return ['How does escrow work?', 'Where do I pay for a job?', 'What happens after I confirm completion?'];
    }
    if (focus === 'reviews_trust') {
      return ['What does trust score mean?', 'How do reviews work?', 'How do I leave a review?'];
    }
    if (focus === 'tracking') {
      return ['Track my job', 'Open My Jobs', 'Message my technician'];
    }
    return [
      'Book a technician',
      'Track my job',
      'Post a job',
      'View applications',
      'How escrow works',
      'Support',
    ];
  }
  if (role === 'technician') {
    if (focus === 'nearby_jobs') {
      return ['Nearby jobs', 'My applications', 'Improve my quotation'];
    }
    if (focus === 'earnings') {
      return ['My earnings', 'When do I get paid?', 'Escrow explained'];
    }
    if (focus === 'profile') {
      return ['Improve my profile', 'Upload portfolio', 'Set availability'];
    }
    return [
      'Nearby jobs',
      'My applications',
      'Improve my profile',
      'Set availability',
      'Pricing tips',
      'My earnings',
    ];
  }
  if (focus === 'moderation') {
    return ['Pending verifications', 'Review reports', 'Disputes'];
  }
  if (focus === 'payments_escrow') {
    return ['Payments overview', 'Escrow overview', 'Disputes'];
  }
  return [
    'Platform health',
    'Pending verifications',
    'Review reports',
    'Marketing',
    'Analytics',
    'Disputes',
  ];
}

function deepLinksForRole(role: AiAssistantRole, focus?: string): Array<{ label: string; href: string }> {
  if (role === 'customer') {
    if (focus === 'payments_escrow') return [{ label: 'Open My Jobs', href: '/customer/jobs' }];
    if (focus === 'find_technician') return [{ label: 'Search technicians', href: '/customer/search' }];
    if (focus === 'booking') return [{ label: 'Post a job', href: '/customer/post-job' }];
    if (focus === 'tracking') return [{ label: 'My Jobs', href: '/customer/jobs' }];
    return [
      { label: 'Home', href: '/customer/home' },
      { label: 'Post a job', href: '/customer/post-job' },
      { label: 'My Jobs', href: '/customer/jobs' },
    ];
  }
  if (role === 'technician') {
    if (focus === 'nearby_jobs') return [{ label: 'Nearby jobs', href: '/technician/jobs' }];
    if (focus === 'earnings') return [{ label: 'Earnings', href: '/technician/earnings' }];
    if (focus === 'profile') return [{ label: 'Profile / settings', href: '/technician/settings' }];
    return [
      { label: 'Dashboard', href: '/technician/dashboard' },
      { label: 'Nearby jobs', href: '/technician/jobs' },
      { label: 'Earnings', href: '/technician/earnings' },
    ];
  }
  if (focus === 'moderation') return [{ label: 'Reviews moderation', href: '/admin/reviews' }];
  if (focus === 'payments_escrow') return [{ label: 'Payments & Escrow', href: '/admin/payments' }];
  return [
    { label: 'Admin dashboard', href: '/admin/dashboard' },
    { label: 'Analytics', href: '/admin/analytics' },
  ];
}

function mapPublicToolResults(toolResults: AiToolResult[]) {
  return toolResults.map((t) => ({
    tool: t.tool,
    label: publicToolLabel(t.tool),
    ok: t.ok,
    summary: t.summary,
  }))
}

function extractOrchestrationExtras(toolResults: AiToolResult[]) {
  const pendingActions: NonNullable<AiChatResponse['pendingActions']> = []
  const deepLinks: Array<{ label: string; href: string }> = []
  let navigateTo: string | undefined
  for (const t of toolResults) {
    const data = (t.data && typeof t.data === 'object' ? t.data : {}) as Record<string, unknown>
    if (data.pendingAction && typeof data.pendingAction === 'object') {
      pendingActions.push(data.pendingAction as NonNullable<AiChatResponse['pendingActions']>[number])
    }
    if (typeof data.navigateTo === 'string' && data.navigateTo) {
      navigateTo = data.navigateTo
    }
    if (Array.isArray(data.deepLinks)) {
      for (const link of data.deepLinks) {
        if (link && typeof link === 'object' && 'href' in link && 'label' in link) {
          deepLinks.push(link as { label: string; href: string })
        }
      }
    }
  }
  return { pendingActions, deepLinks, navigateTo }
}

function withOrchestrationExtras(
  role: AiAssistantRole,
  focus: string | undefined,
  orch: ReturnType<typeof extractOrchestrationExtras>,
): Pick<AiChatResponse, 'deepLinks' | 'pendingActions' | 'navigateTo'> {
  const base = deepLinksForRole(role, focus)
  const seen = new Set(base.map((d) => d.href))
  const merged = [...base]
  for (const link of orch.deepLinks) {
    if (!seen.has(link.href)) {
      seen.add(link.href)
      merged.push(link)
    }
  }
  return {
    deepLinks: merged,
    pendingActions: orch.pendingActions.length ? orch.pendingActions : undefined,
    navigateTo: orch.navigateTo,
  }
}

async function loadAdminCapabilities(userId: string): Promise<Record<string, boolean> | null> {
  try {
    const { AdminUser } = await import('../../models/index.js')
    const { resolveCapabilities } = await import('../admin/adminCapabilities.js')
    const profile = await AdminUser.findOne({
      userId,
      status: 'active',
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select('adminRoleKey permissionKeys')
      .lean()
    if (!profile) return null
    return resolveCapabilities(profile)
  } catch {
    return null
  }
}

function isRetryableProviderFailure(error?: string): boolean {
  const e = String(error || '').toLowerCase();
  return (
    e.includes('timed out') ||
    e.includes('timeout') ||
    e.includes('abort') ||
    e.includes('network') ||
    e.includes('econnreset') ||
    e.includes('fetch failed') ||
    e.includes('503') ||
    e.includes('429') ||
    e.includes('temporarily')
  );
}

async function completeWithRetry(
  provider: ReturnType<typeof getAiProvider>,
  request: Parameters<ReturnType<typeof getAiProvider>['completeChat']>[0],
  retries: number,
): Promise<{
  completion: Awaited<ReturnType<typeof provider.completeChat>>;
  retried: boolean;
  circuitOpen: boolean;
}> {
  let retried = false;
  let circuitOpen = false;
  let completion: Awaited<ReturnType<typeof provider.completeChat>>;

  try {
    completion = await aiCircuit.exec(() => provider.completeChat(request));
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      circuitOpen = true;
      return {
        completion: {
          ok: false,
          text: '',
          provider: provider.name,
          error: 'circuit_open',
        },
        retried: false,
        circuitOpen: true,
      };
    }
    throw err;
  }

  if (!completion.ok && retries > 0 && isRetryableProviderFailure(completion.error)) {
    retried = true;
    await new Promise((r) => setTimeout(r, 400));
    try {
      completion = await aiCircuit.exec(() => provider.completeChat(request));
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        circuitOpen = true;
        completion = {
          ok: false,
          text: '',
          provider: provider.name,
          error: 'circuit_open',
        };
      } else {
        throw err;
      }
    }
  }

  return { completion, retried, circuitOpen };
}

/**
 * Central AI orchestration. Assist-only: tools call existing marketplace services;
 * the LLM never becomes the source of truth for jobs, payments, or moderation.
 */
export const aiService = {
  status() {
    return publicAiStatus();
  },

  async chat(input: AiChatInput): Promise<AiChatResponse> {
    const started = Date.now();
    const role = input.role;
    const message = cleanMessage(input.message);
    if (!message) throw AppError.badRequest('Message is required');

    const injection = detectPromptInjection(message);
    if (injection.blocked) {
      logAiEvent({
        role,
        provider: 'safety',
        ok: true,
        latencyMs: Date.now() - started,
        safetyFlags: [injection.reason || 'blocked'],
      });
      return {
        ok: true,
        role,
        message: injection.safeMessage || 'I can only help with FixNow.',
        provider: 'safety',
        disabled: false,
        conversationId: input.conversationId,
        intentTools: [],
        toolResults: [],
        suggestions: suggestionsForRole(role, undefined, Boolean(input.guest)),
        safetyFlags: [injection.reason || 'blocked'],
      };
    }

    const crossRole = detectCrossRoleViolation(role, message);
    if (crossRole.blocked) {
      logAiEvent({
        role,
        provider: 'safety',
        ok: true,
        latencyMs: Date.now() - started,
        safetyFlags: [crossRole.reason || 'blocked'],
      });
      return {
        ok: true,
        role,
        message: crossRole.safeMessage || 'That request is outside your role.',
        provider: 'safety',
        disabled: false,
        conversationId: input.conversationId,
        intentTools: [],
        toolResults: [],
        suggestions: suggestionsForRole(role, undefined, Boolean(input.guest)),
        safetyFlags: [crossRole.reason || 'blocked'],
      };
    }

    const config = loadAiRuntimeConfig();
    const roleContext = await buildRoleContext(role, input.userId, {
      ...(input.context || {}),
      inputMode: input.inputMode || input.context?.inputMode,
      attachments: input.attachments || input.context?.attachments,
    }, { guest: Boolean(input.guest) });
    const memory = input.guest
      ? {
          enabled: false,
          conversationId: '',
          historyForProvider: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
        }
      : await aiConversationMemory.prepareForChat({
          ownerUserId: input.userId,
          role,
          conversationId: input.conversationId,
          userMessage: message,
        });

    const historyFocus = inferConversationFocus(memory.historyForProvider);
    const focus = detectDomainFocus(message, role) || historyFocus || 'general';
    const isCorrection = isCorrectionMessage(message);
    const social = detectSocialIntent(message);

    const toolCtx = {
      role,
      userId: input.userId,
      roleContext,
      guest: Boolean(input.guest),
      dataEnvironment: roleContext.dataEnvironment,
      query: {
        q: roleContext.query || message,
        district: roleContext.district,
        categoryId: roleContext.categoryId,
        jobId: roleContext.jobId,
        technicianId: roleContext.technicianId,
        lat: roleContext.lat,
        lng: roleContext.lng,
      },
    };

    if (!roleAssistantEnabled(role, config)) {
      const response: AiChatResponse = {
        ok: true,
        role,
        message: ROLE_DISABLED_MESSAGES[role],
        provider: 'none',
        disabled: true,
        conversationId: memory.conversationId || undefined,
        intentTools: [],
        toolResults: [],
        suggestions: suggestionsForRole(role, focus, Boolean(input.guest)),
        deepLinks: deepLinksForRole(role, focus),
      };
      if (memory.enabled && memory.conversationId) {
        await aiConversationMemory.recordTurn({
          conversationId: memory.conversationId,
          ownerUserId: input.userId,
          role,
          userMessage: message,
          assistantMessage: response.message,
          metadata: { disabled: true, provider: 'none', focus },
        });
      }
      return response;
    }

    // Deterministic social short-circuit — no tools / no LLM
    if (social && social !== 'help') {
      const reply =
        socialShortCircuitReply({
          social,
          role,
          displayName: roleContext.displayName,
          seed: `${memory.conversationId || ''}:${message}`,
        }) || 'Hello — how can I help on FixNow?';
      const validated = sanitizeAndValidateResponse(reply);
      const response: AiChatResponse = {
        ok: true,
        role,
        message: validated.text,
        provider: 'conversational',
        disabled: false,
        conversationId: memory.conversationId || undefined,
        intentTools: [],
        toolResults: [],
        suggestions: suggestionsForRole(role, focus, Boolean(input.guest)),
        deepLinks: deepLinksForRole(role, focus),
        safetyFlags: validated.flags,
      };
      if (memory.enabled && memory.conversationId) {
        await aiConversationMemory.recordTurn({
          conversationId: memory.conversationId,
          ownerUserId: input.userId,
          role,
          userMessage: message,
          assistantMessage: response.message,
          metadata: { provider: 'conversational', focus, social },
        });
      }
      logAiEvent({
        role,
        provider: 'conversational',
        ok: true,
        latencyMs: Date.now() - started,
        focus,
        usedLocalKnowledge: true,
      });
      return response;
    }

    const adminCapabilities =
      role === 'admin' && !input.guest ? await loadAdminCapabilities(input.userId) : null

    const intentTools = detectToolsForMessage(role, message, toolCtx, {
      focus,
      historyFocus,
      adminCapabilities,
    })
    const toolResults = await runAllowlistedTools(role, intentTools, toolCtx, {
      conversationId: memory.conversationId || input.conversationId,
      adminCapabilities,
      message,
    })
    const orch = extractOrchestrationExtras(toolResults)

    const localHit = answerFromLocalKnowledge(role, message, {
      context: roleContext,
      toolResults,
    });

    const provider = await getAiProviderAsync();
    const localOnly = !config.providerConfigured || provider.name === 'console';
    const preferLocal = shouldPreferLocalKnowledge(message) && Boolean(localHit?.answered && !localHit.needsAdvanced);

    // Local knowledge path — immediate, no provider wait
    if (preferLocal || (localOnly && localHit?.answered && !localHit.needsAdvanced)) {
      const validated = sanitizeAndValidateResponse(localHit!.text);
      const response: AiChatResponse = {
        ok: true,
        role,
        message: validated.text,
        provider: 'local-knowledge',
        model: 'fixnow-canon',
        disabled: false,
        conversationId: memory.conversationId || undefined,
        intentTools,
        toolResults: mapPublicToolResults(toolResults),
        suggestions: suggestionsForRole(role, focus, Boolean(input.guest)),
        ...withOrchestrationExtras(role, focus, orch),
        safetyFlags: validated.flags,
        error: scrubProviderErrorForClient(),
      };
      if (memory.enabled && memory.conversationId) {
        await aiConversationMemory.recordTurn({
          conversationId: memory.conversationId,
          ownerUserId: input.userId,
          role,
          userMessage: message,
          assistantMessage: response.message,
          metadata: {
            provider: 'local-knowledge',
            focus,
            tools: intentTools,
            topic: localHit?.topic,
            inputMode: input.inputMode || 'text',
          },
        });
      }
      logAiEvent({
        role,
        provider: 'local-knowledge',
        ok: true,
        latencyMs: Date.now() - started,
        usedLocalKnowledge: true,
        toolCount: intentTools.length,
        focus,
        topic: localHit?.topic,
        safetyFlags: validated.flags,
      });
      return response;
    }

    // Local-only / advanced request without provider — natural soft message
    if (localOnly) {
      const soft =
        localHit?.needsAdvanced || isAdvancedAiRequest(message)
          ? publicProviderFailureMessage(role)
          : localHit?.text ||
            composeToolGroundedFallback(role, message, toolResults) ||
            publicProviderFailureMessage(role);
      const validated = sanitizeAndValidateResponse(soft);
      const response: AiChatResponse = {
        ok: true,
        role,
        message: validated.text,
        provider: 'local-knowledge',
        model: 'fixnow-canon',
        disabled: false,
        conversationId: memory.conversationId || undefined,
        intentTools,
        toolResults: mapPublicToolResults(toolResults),
        suggestions: suggestionsForRole(role, focus, Boolean(input.guest)),
        ...withOrchestrationExtras(role, focus, orch),
        safetyFlags: validated.flags,
      };
      if (memory.enabled && memory.conversationId) {
        await aiConversationMemory.recordTurn({
          conversationId: memory.conversationId,
          ownerUserId: input.userId,
          role,
          userMessage: message,
          assistantMessage: response.message,
          metadata: { provider: 'local-knowledge', focus, tools: intentTools, usedFallback: true },
        });
      }
      logAiEvent({
        role,
        provider: 'local-knowledge',
        ok: true,
        latencyMs: Date.now() - started,
        usedLocalKnowledge: true,
        usedFallback: true,
        toolCount: intentTools.length,
        focus,
      });
      return response;
    }

    const toolSummary = formatToolResultsForPrompt(role, toolResults);
    const memoryGuidance = buildMemoryGuidance({
      message,
      focus,
      historyFocus,
      isCorrection,
    });

    const retryCount = Math.max(0, config.providerRetryCount ?? env.AI_PROVIDER_RETRY_COUNT ?? 1);
    const { completion, retried, circuitOpen } = await completeWithRetry(
      provider,
      {
        messages: buildProviderMessages({
          role,
          systemExtras: [
            `Safe role context:\n${formatContextForPrompt(roleContext)}`,
            memoryGuidance,
            `You are the ${role} assistant only. Never suggest workflows from other FixNow portals.`,
            'If tool results are empty or failed, say what is missing and ask a short follow-up. Do not invent FixNow data.',
            `Active data environment: ${roleContext.dataEnvironment}. All tool results are already filtered to this environment. Never mention or reference data from other environments.`,
            roleContext.dataEnvironment !== 'production'
              ? `NON-PRODUCTION SESSION (${roleContext.dataEnvironment}): When describing results, note they are ${roleContext.dataEnvironment} data. Do not claim these are real production records.`
              : '',
          ].filter(Boolean),
          history: memory.historyForProvider,
          userMessage: message,
          toolSummary,
        }),
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      },
      retryCount,
    );

    const timedOut = Boolean(completion.error && /timed out|timeout|abort/i.test(completion.error));
    let usedFallback = false;
    let rawText = '';
    let responseProvider = completion.provider;

    if (completion.ok && completion.text) {
      rawText = completion.text;
    } else {
      usedFallback = true;
      const localAgain = answerFromLocalKnowledge(role, message, { context: roleContext, toolResults });
      if (localAgain?.answered && !localAgain.needsAdvanced) {
        rawText = localAgain.text;
        responseProvider = 'local-knowledge';
      } else if (toolResults.some((t) => t.ok)) {
        rawText = composeToolGroundedFallback(role, message, toolResults);
        responseProvider = 'tool-fallback';
      } else {
        rawText = publicProviderFailureMessage(role);
        responseProvider = 'fallback';
      }
    }

    const validated = sanitizeAndValidateResponse(rawText);

    const response: AiChatResponse = {
      ok: true,
      role,
      message: validated.text,
      provider: responseProvider,
      model: completion.ok ? completion.model : undefined,
      disabled: false,
      conversationId: memory.conversationId || undefined,
      intentTools,
      toolResults: mapPublicToolResults(toolResults),
      suggestions: suggestionsForRole(role, focus, Boolean(input.guest)),
      ...withOrchestrationExtras(role, focus, orch),
      error: scrubProviderErrorForClient(completion.error),
      safetyFlags: validated.flags,
    };

    if (memory.enabled && memory.conversationId) {
      await aiConversationMemory.recordTurn({
        conversationId: memory.conversationId,
        ownerUserId: input.userId,
        role,
        userMessage: message,
        assistantMessage: response.message,
        metadata: {
          provider: response.provider,
          model: response.model,
          tools: intentTools,
          focus,
          disabled: false,
          safetyFlags: validated.flags,
          inputMode: input.inputMode || 'text',
          attachmentCount: roleContext.attachmentCount || 0,
          usedFallback,
          retried,
          timedOut,
        },
      });
    }

    logAiEvent({
      role,
      provider: response.provider,
      ok: true,
      latencyMs: Date.now() - started,
      usedFallback,
      usedLocalKnowledge: responseProvider === 'local-knowledge',
      timedOut,
      retried,
      circuitOpen,
      toolCount: intentTools.length,
      focus,
      safetyFlags: validated.flags,
    });

    return response;
  },

  conversations: {
    list: (userId: string, role: AiAssistantRole) => aiConversationMemory.list(userId, role),
    create: (userId: string, role: AiAssistantRole, title?: string) =>
      aiConversationMemory.create(userId, role, title),
    messages: (conversationId: string, userId: string, role: AiAssistantRole) =>
      aiConversationMemory.listMessages(conversationId, userId, role),
    remove: (conversationId: string, userId: string, role: AiAssistantRole) =>
      aiConversationMemory.softDelete(conversationId, userId, role),
  },
};
