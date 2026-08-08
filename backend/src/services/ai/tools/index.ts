import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import {
  detectDomainFocus,
  detectSocialIntent,
  isPlatformFaqMessage,
  type ConversationFocus,
} from '../conversation/conversational.core.js';
import { ADMIN_TOOLS, formatAdminToolResults, runAdminTool, type AdminToolName } from './admin.tools.js';
import {
  CUSTOMER_TOOLS,
  formatCustomerToolResults,
  runCustomerTool,
  type CustomerToolName,
} from './customer.tools.js';
import {
  formatTechnicianToolResults,
  runTechnicianTool,
  TECHNICIAN_TOOLS,
  type TechnicianToolName,
} from './technician.tools.js';
import {
  orchestrationToolsForRole,
  runOrchestrationTool,
  type OrchestrationToolName,
} from './orchestration.tools.js';
import type { AiToolContext, AiToolResult } from './types.js';
import { recordAiAction } from '../orchestration/pendingAction.service.js';

export type { AiToolContext, AiToolResult } from './types.js';

/** Guest Mode — public discovery only (also enforced at execute time). */
export const GUEST_CUSTOMER_TOOLS = [
  'searchTechnicians',
  'listCategories',
  'getTechnicianPublicProfile',
  'getTechnicianReviews',
  'getPlatformKnowledge',
  'navigateToScreen',
  'getWorkflowMap',
] as const;

const ROLE_TOOLS: Record<AiAssistantRole, readonly string[]> = {
  customer: [...CUSTOMER_TOOLS, ...orchestrationToolsForRole('customer')],
  technician: [...TECHNICIAN_TOOLS, ...orchestrationToolsForRole('technician')],
  admin: [...ADMIN_TOOLS, ...orchestrationToolsForRole('admin')],
};

/** Admin read tools gated by capability engine keys. */
const ADMIN_TOOL_CAPABILITIES: Record<string, string[]> = {
  getDashboard: ['CanViewReports'],
  getMarketplaceMetrics: ['CanViewReports'],
  getReviewAnalytics: ['CanManageSupport', 'CanViewReports'],
  listTechnicians: ['CanManageUsers', 'CanManageSupport'],
  listJobs: ['CanManageSupport', 'CanManageUsers'],
  getPaymentsOverview: ['CanManageFinance'],
  getEscrowOverview: ['CanManageFinance'],
  getPlatformKnowledge: [],
  navigateToScreen: [],
  getWorkflowMap: [],
};

export function allowedToolsForRole(role: AiAssistantRole): string[] {
  return [...ROLE_TOOLS[role]];
}

function pushUnique(selected: string[], ...tools: string[]) {
  for (const tool of tools) {
    if (!selected.includes(tool)) selected.push(tool);
  }
}

function adminMayUseTool(tool: string, capabilities?: Record<string, boolean> | null): boolean {
  const needed = ADMIN_TOOL_CAPABILITIES[tool];
  if (!needed || needed.length === 0) return true;
  if (!capabilities) return false;
  if (capabilities.CanManageDevelopmentAccess || capabilities.CanManageAdmins) return true;
  // Super Admin has all true from resolveCapabilities
  return needed.some((c) => capabilities[c] === true);
}

/**
 * Intent → allowlisted tools (read + orchestration). Social / FAQ paths stay light.
 */
export function detectToolsForMessage(
  role: AiAssistantRole,
  message: string,
  context: AiToolContext,
  options: {
    focus?: ConversationFocus;
    historyFocus?: ConversationFocus;
    adminCapabilities?: Record<string, boolean> | null;
  } = {},
): string[] {
  const text = String(message || '').toLowerCase();
  const selected: string[] = [];
  const social = detectSocialIntent(message);
  if (social && social !== 'help') return [];

  const focus = options.focus || detectDomainFocus(message, role) || options.historyFocus || 'general';

  // Navigation / orchestration intents
  if (
    /\b(take me|open|go to|show me|navigate|launch)\b/.test(text) ||
    /\b(subscription|upgrade|portfolio|advert|offer|boost|availability|settings|analytics|payment|revenue)\b/.test(
      text,
    )
  ) {
    pushUnique(selected, 'navigateToScreen');
  }
  if (/\b(what can you|workflow|how do i|capabilities|what screens)\b/.test(text)) {
    pushUnique(selected, 'getWorkflowMap');
  }

  if (isPlatformFaqMessage(message) || focus === 'platform_faq') {
    pushUnique(selected, 'getPlatformKnowledge');
    return filterSelected(role, selected, context, options.adminCapabilities).slice(0, 4);
  }

  if (role === 'customer') {
    if (context.guest) {
      if (focus === 'reviews_trust' || /\b(trust|review|rating|reputation)\b/.test(text)) {
        if (context.roleContext.technicianId) {
          pushUnique(selected, 'getTechnicianPublicProfile', 'getTechnicianReviews');
        } else {
          pushUnique(selected, 'getPlatformKnowledge');
        }
      }
      if (
        focus === 'find_technician' ||
        focus === 'pricing' ||
        focus === 'booking' ||
        /\b(technician|plumber|electrician|mechanic|find|search|near|recommend|fix|sink|cost|price|budget|estimate)\b/.test(
          text,
        )
      ) {
        pushUnique(selected, 'searchTechnicians', 'listCategories', 'getPlatformKnowledge');
      }
      if (context.roleContext.technicianId) {
        pushUnique(selected, 'getTechnicianPublicProfile', 'getTechnicianReviews');
      }
      if (/\b(categor|service type|what can|services|how does|safety|escrow)\b/.test(text)) {
        pushUnique(selected, 'listCategories', 'getPlatformKnowledge');
      }
      if (!selected.length) pushUnique(selected, 'getPlatformKnowledge', 'listCategories');
      return filterSelected(role, selected, context, options.adminCapabilities).slice(0, 4);
    }

    if (
      /\b(need|book|post|create).{0,40}(job|electrician|plumber|technician|handyman)|i need an?\b/.test(text) ||
      (focus === 'booking' && /\b(need|book|tomorrow|morning|create)\b/.test(text))
    ) {
      pushUnique(selected, 'prepareCreateJob', 'listCategories');
    }
    if (/\b(cancel).{0,20}(job|booking|appointment)\b/.test(text)) {
      pushUnique(selected, 'prepareCancelJob', 'getMyJobs');
    }

    if (focus === 'payments_escrow' || /\b(escrow|pay|payment|refund)\b/.test(text)) {
      pushUnique(selected, 'getEscrowStatus', 'getWalletSummary', 'getPlatformKnowledge');
    }
    if (focus === 'reviews_trust' || /\b(trust|review|rating|reputation)\b/.test(text)) {
      if (context.roleContext.technicianId) {
        pushUnique(selected, 'getTechnicianPublicProfile', 'getTechnicianReviews');
      } else {
        pushUnique(selected, 'getPlatformKnowledge');
      }
    }
    if (focus === 'tracking' || /\b(track|status|progress|en route)\b/.test(text) || context.roleContext.jobId) {
      pushUnique(selected, context.roleContext.jobId ? 'getJobDetails' : 'getMyJobs');
      if (context.roleContext.jobId) pushUnique(selected, 'getEscrowStatus');
    }
    if (focus === 'quotations' || /\b(quote|quotation|application)\b/.test(text)) {
      pushUnique(selected, context.roleContext.jobId ? 'getJobDetails' : 'getMyJobs');
    }
    if (
      focus === 'find_technician' ||
      focus === 'pricing' ||
      focus === 'booking' ||
      /\b(technician|plumber|electrician|mechanic|find|search|near|recommend|fix|sink|cost|price|budget|estimate)\b/.test(
        text,
      )
    ) {
      pushUnique(selected, 'searchTechnicians', 'listCategories');
    }
    if (context.roleContext.technicianId) {
      pushUnique(selected, 'getTechnicianPublicProfile', 'getTechnicianReviews');
    }
    if (/\b(categor|service type|what can|services)\b/.test(text)) pushUnique(selected, 'listCategories');
    if (!selected.length && social === 'help') pushUnique(selected, 'getPlatformKnowledge', 'getWorkflowMap');
    if (!selected.length) pushUnique(selected, 'listCategories');
  }

  if (role === 'technician') {
    if (/\b(upgrade|starter|professional|business|subscription|plan)\b/.test(text)) {
      pushUnique(selected, 'guideSubscriptionUpgrade', 'navigateToScreen');
    }
    if (/\b(offer|advert|weekend.?deal|promotion|campaign)\b/.test(text)) {
      pushUnique(selected, 'guideCreateOffer', 'navigateToScreen');
    }
    if (/\b(availab|offline|busy|hide.*(until|me)|away until)\b/.test(text)) {
      pushUnique(selected, 'prepareAvailabilityUpdate');
    }
    if (focus === 'earnings' || /\b(earn|payout|wallet|escrow)\b/.test(text)) {
      pushUnique(selected, 'getEarnings', 'getEscrowStatus');
    }
    if (focus === 'profile' || /\b(profile|bio|headline|pricing|rate)\b/.test(text)) {
      pushUnique(selected, 'getMyProfile');
    }
    if (focus === 'nearby_jobs' || /\b(job|nearby|lead|recommend|available work|apply)\b/.test(text)) {
      pushUnique(selected, 'listNearbyJobs');
    }
    if (/\b(application|quote|proposal)\b/.test(text)) pushUnique(selected, 'listMyApplications');
    if (focus === 'reviews_trust' || /\b(review|trust|reputation|badge)\b/.test(text)) {
      pushUnique(selected, 'getMyReviews', 'getMyProfile');
    }
    if (/\b(dashboard|summary|performance|work summary)\b/.test(text)) pushUnique(selected, 'getDashboard');
    if (context.roleContext.jobId) pushUnique(selected, 'getJobDetails', 'getEscrowStatus');
    if (!selected.length && social === 'help') pushUnique(selected, 'getPlatformKnowledge', 'getWorkflowMap');
    if (!selected.length) pushUnique(selected, 'getDashboard', 'listNearbyJobs');
  }

  if (role === 'admin') {
    if (focus === 'analytics' || /\b(dashboard|overview|health|metric|analytics|growth|volume)\b/.test(text)) {
      pushUnique(selected, 'getDashboard', 'getMarketplaceMetrics');
    }
    if (focus === 'moderation' || /\b(review|moderat|flag|reputation)\b/.test(text)) {
      pushUnique(selected, 'getReviewAnalytics');
    }
    if (focus === 'reviews_trust' || /\b(trust|risk|technician)\b/.test(text)) {
      pushUnique(selected, 'listTechnicians');
    }
    if (focus === 'payments_escrow' || /\b(escrow|payment|refund|payout|settlement|revenue|invoice)\b/.test(text)) {
      pushUnique(selected, 'getPaymentsOverview', 'getEscrowOverview');
    }
    if (/\b(job|booking)\b/.test(text)) pushUnique(selected, 'listJobs');
    if (/\b(admin user|role|super admin|invite admin)\b/.test(text)) {
      pushUnique(selected, 'navigateToScreen');
    }
    if (!selected.length && social === 'help') pushUnique(selected, 'getPlatformKnowledge', 'getWorkflowMap');
    if (!selected.length) pushUnique(selected, 'getDashboard', 'getMarketplaceMetrics');
  }

  return filterSelected(role, selected, context, options.adminCapabilities).slice(0, 4);
}

function filterSelected(
  role: AiAssistantRole,
  selected: string[],
  context: AiToolContext,
  adminCapabilities?: Record<string, boolean> | null,
): string[] {
  return selected.filter((t) => {
    if (context.guest) {
      return (GUEST_CUSTOMER_TOOLS as readonly string[]).includes(t);
    }
    if (!ROLE_TOOLS[role].includes(t)) return false;
    if (role === 'admin' && !adminMayUseTool(t, adminCapabilities)) return false;
    return true;
  });
}

export async function runAllowlistedTools(
  role: AiAssistantRole,
  tools: string[],
  ctx: AiToolContext,
  options: {
    conversationId?: string;
    adminCapabilities?: Record<string, boolean> | null;
    message?: string;
  } = {},
): Promise<AiToolResult[]> {
  const results: AiToolResult[] = [];
  const message = options.message || String(ctx.roleContext.query || '');
  for (const tool of tools) {
    if (ctx.guest && !(GUEST_CUSTOMER_TOOLS as readonly string[]).includes(tool)) {
      results.push({
        tool,
        ok: false,
        summary: 'Guest Mode cannot access this tool. Sign in to continue.',
        error: 'guest_forbidden',
      });
      continue;
    }
    if (!ROLE_TOOLS[role].includes(tool)) {
      results.push({ tool, ok: false, summary: 'Tool not allowed for this role.', error: 'forbidden_tool' });
      continue;
    }
    if (role === 'admin' && !adminMayUseTool(tool, options.adminCapabilities)) {
      results.push({
        tool,
        ok: false,
        summary: 'Your administrator role does not include this module.',
        error: 'capability_denied',
      });
      await recordAiAction({
        userId: ctx.userId,
        role: 'admin',
        dataEnvironment: ctx.dataEnvironment,
        tool,
        action: 'tool_run',
        ok: false,
        errorCode: 'capability_denied',
      });
      continue;
    }

    let result: AiToolResult;
    if ((orchestrationToolsForRole(role, Boolean(ctx.guest)) as string[]).includes(tool)) {
      result = await runOrchestrationTool(tool as OrchestrationToolName, ctx, message, {
        conversationId: options.conversationId,
        adminCapabilities: options.adminCapabilities,
      });
    } else if (role === 'customer') {
      result = await runCustomerTool(tool as CustomerToolName, ctx);
    } else if (role === 'technician') {
      result = await runTechnicianTool(tool as TechnicianToolName, ctx);
    } else {
      result = await runAdminTool(tool as AdminToolName, ctx);
    }
    results.push(result);
    await recordAiAction({
      userId: ctx.guest ? undefined : ctx.userId,
      role: ctx.guest ? 'guest' : role,
      guest: ctx.guest,
      dataEnvironment: ctx.dataEnvironment,
      conversationId: options.conversationId,
      tool,
      action: 'tool_run',
      ok: result.ok,
      errorCode: result.error,
    });
  }
  return results;
}

export function formatToolResultsForPrompt(role: AiAssistantRole, results: AiToolResult[]): string {
  const orch = results.filter((r) =>
    (ORCH_SET as Set<string>).has(r.tool),
  );
  const rest = results.filter((r) => !(ORCH_SET as Set<string>).has(r.tool));
  const orchBlock = orch.length
    ? `Orchestration:\n${orch.map((r) => `- ${r.tool}: ${r.summary}`).join('\n')}`
    : '';
  const base =
    role === 'customer'
      ? formatCustomerToolResults(rest)
      : role === 'technician'
        ? formatTechnicianToolResults(rest)
        : formatAdminToolResults(rest);
  return [orchBlock, base].filter(Boolean).join('\n\n');
}

const ORCH_SET = new Set(orchestrationToolsForRole('customer').concat(orchestrationToolsForRole('technician'), orchestrationToolsForRole('admin')));
