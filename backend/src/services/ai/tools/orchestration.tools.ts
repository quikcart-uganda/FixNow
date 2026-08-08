/**
 * Orchestration tools — navigate, prepare confirmable writes, subscription guidance.
 * Writes never execute here; they create AiPendingAction for user confirmation,
 * then pendingAction.service calls existing marketplace services.
 */

import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { findNavigation, platformGraphSummary } from '../knowledge/platformGraph.js';
import { createPendingAction, recordAiAction } from '../orchestration/pendingAction.service.js';
import type { AiToolContext, AiToolResult } from './types.js';

export const ORCHESTRATION_TOOLS = [
  'navigateToScreen',
  'getWorkflowMap',
  'prepareCreateJob',
  'prepareCancelJob',
  'prepareAvailabilityUpdate',
  'guideSubscriptionUpgrade',
  'guideCreateOffer',
] as const;

export type OrchestrationToolName = (typeof ORCHESTRATION_TOOLS)[number];

const GUEST_ORCH_TOOLS = new Set(['navigateToScreen', 'getWorkflowMap']);

function inferCategoryHint(message: string): string {
  const t = message.toLowerCase();
  if (/electr/.test(t)) return 'Electrical';
  if (/plumb|sink|pipe|leak|toilet/.test(t)) return 'Plumbing';
  if (/paint/.test(t)) return 'Painting';
  if (/clean/.test(t)) return 'Cleaning';
  if (/carpent|wood|door|cabinet/.test(t)) return 'Carpentry';
  if (/ac|hvac|aircon|air.?con/.test(t)) return 'HVAC';
  return 'General';
}

function extractBudget(message: string): number | undefined {
  const m = message.replace(/,/g, '').match(/(?:ugx|budget|around|upto|up to)?\s*(\d{4,7})/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export async function runOrchestrationTool(
  tool: OrchestrationToolName,
  ctx: AiToolContext,
  message: string,
  options: { conversationId?: string; adminCapabilities?: Record<string, boolean> | null } = {},
): Promise<AiToolResult> {
  if (ctx.guest && !GUEST_ORCH_TOOLS.has(tool)) {
    return {
      tool,
      ok: false,
      summary: 'Sign in to FixNow to run this action.',
      error: 'guest_forbidden',
    };
  }

  try {
    switch (tool) {
      case 'navigateToScreen': {
        const node = findNavigation(ctx.role, message, options.adminCapabilities);
        if (!node?.href) {
          return {
            tool,
            ok: true,
            summary: 'No matching screen found for that request in your allowed navigation.',
            data: { deepLinks: [] },
          };
        }
        await recordAiAction({
          userId: ctx.guest ? undefined : ctx.userId,
          role: ctx.guest ? 'guest' : ctx.role,
          guest: ctx.guest,
          dataEnvironment: ctx.dataEnvironment,
          tool,
          action: 'navigation',
          ok: true,
          meta: { href: node.href, label: node.label },
        });
        return {
          tool,
          ok: true,
          summary: `Open ${node.label}: ${node.description}`,
          data: {
            navigateTo: node.href,
            deepLinks: [{ label: node.label, href: node.href }],
          },
        };
      }
      case 'getWorkflowMap': {
        const map = platformGraphSummary(ctx.role, options.adminCapabilities);
        return {
          tool,
          ok: true,
          summary: `Loaded ${map.screens.length} screens and ${map.workflows.length} workflows for your role.`,
          data: map,
        };
      }
      case 'prepareCreateJob': {
        if (ctx.role !== 'customer') {
          return { tool, ok: false, summary: 'Only customers can create jobs.', error: 'forbidden_tool' };
        }
        const categoryHint = inferCategoryHint(message);
        const budget = extractBudget(message);
        const title =
          String(ctx.roleContext.query || '').trim() ||
          `${categoryHint} request`;
        const description = message.slice(0, 800);
        const missing: string[] = [];
        if (!/district|parish|entebbe|kampala|near|location|at\s/i.test(message)) {
          missing.push('location (district / parish)');
        }
        if (!/(tomorrow|today|monday|friday|morning|afternoon|evening|\d{4}-\d{2}-\d{2})/i.test(message)) {
          missing.push('preferred date/time');
        }
        if (missing.length) {
          return {
            tool,
            ok: true,
            summary: `I can prepare this job, but still need: ${missing.join(', ')}. Reply with those details.`,
            data: {
              needsInput: missing,
              draft: { title, description, categoryHint, budgetMax: budget },
            },
          };
        }
        const pending = await createPendingAction({
          userId: ctx.userId,
          role: 'customer',
          conversationId: options.conversationId,
          tool,
          workflowId: 'customer.createJob',
          title: 'Create job',
          summary: `Create job "${title}" (${categoryHint})${budget ? ` · budget up to UGX ${budget}` : ''} [env: ${ctx.dataEnvironment}]. Confirm to submit through FixNow job APIs.`,
          payload: {
            title,
            description,
            budgetMax: budget,
            preferredDate: undefined,
            location: ctx.roleContext.district
              ? { district: ctx.roleContext.district }
              : undefined,
            publish: true,
            categoryHint,
            dataEnvironment: ctx.dataEnvironment,
          },
        });
        return {
          tool,
          ok: true,
          summary: pending.summary,
          data: { pendingAction: pending, requiresConfirmation: true },
        };
      }
      case 'prepareCancelJob': {
        if (ctx.role !== 'customer') {
          return { tool, ok: false, summary: 'Only customers can cancel their jobs.', error: 'forbidden_tool' };
        }
        const jobId = ctx.roleContext.jobId || String(ctx.query?.jobId || '');
        if (!jobId) {
          return {
            tool,
            ok: true,
            summary:
              'Tell me which job to cancel, or open the job first so I can see the job id. Cancelling may affect escrow and applications.',
            data: {
              deepLinks: [{ label: 'My Jobs', href: '/customer/jobs' }],
              needsInput: ['jobId'],
            },
          };
        }
        const pending = await createPendingAction({
          userId: ctx.userId,
          role: 'customer',
          conversationId: options.conversationId,
          tool,
          workflowId: 'customer.cancelJob',
          title: 'Cancel job',
          summary: `Cancel job ${jobId} [env: ${ctx.dataEnvironment}]. This uses the standard FixNow cancellation rules. Confirm to proceed.`,
          payload: { jobId, reason: 'Cancelled via FixNow AI (user confirmed)', dataEnvironment: ctx.dataEnvironment },
        });
        return {
          tool,
          ok: true,
          summary: pending.summary,
          data: { pendingAction: pending, requiresConfirmation: true },
        };
      }
      case 'prepareAvailabilityUpdate': {
        if (ctx.role !== 'technician') {
          return { tool, ok: false, summary: 'Only technicians can change availability.', error: 'forbidden_tool' };
        }
        const t = message.toLowerCase();
        let status: 'available' | 'busy' | 'offline' = 'offline';
        if (/available|online|open for work/.test(t)) status = 'available';
        else if (/busy|on.?job/.test(t)) status = 'busy';
        else if (/hide|offline|unavailable|until monday|away/.test(t)) status = 'offline';
        const pending = await createPendingAction({
          userId: ctx.userId,
          role: 'technician',
          conversationId: options.conversationId,
          tool,
          workflowId: 'technician.availability',
          title: 'Update availability',
          summary: `Set availability to "${status}" [env: ${ctx.dataEnvironment}] via the existing availability API. Confirm to apply.`,
          payload: {
            status,
            notes: message.slice(0, 200),
            dataEnvironment: ctx.dataEnvironment,
          },
        });
        return {
          tool,
          ok: true,
          summary: pending.summary,
          data: { pendingAction: pending, requiresConfirmation: true },
        };
      }
      case 'guideSubscriptionUpgrade': {
        if (ctx.role !== 'technician') {
          return { tool, ok: false, summary: 'Subscription upgrades are for technicians.', error: 'forbidden_tool' };
        }
        return {
          tool,
          ok: true,
          summary:
            'I can open Upgrade Plan for you. Paid access activates only after Mobile Money payment and Admin verification — I never unlock subscriptions myself.',
          data: {
            navigateTo: '/technician/upgrade',
            deepLinks: [
              { label: 'Upgrade Plan', href: '/technician/upgrade' },
              { label: 'Subscription Centre', href: '/technician/subscription' },
            ],
            planHints: ['Free', 'Starter', 'Professional', 'Business'],
          },
        };
      }
      case 'guideCreateOffer': {
        if (ctx.role !== 'technician') {
          return { tool, ok: false, summary: 'Offers are for technicians.', error: 'forbidden_tool' };
        }
        return {
          tool,
          ok: true,
          summary:
            'Offers require your plan entitlements and Admin approval before publish. Open Marketing to create a draft — I will not publish without the platform approval workflow.',
          data: {
            navigateTo: '/technician/marketing/create',
            deepLinks: [
              { label: 'Create offer', href: '/technician/marketing/create' },
              { label: 'Marketing Centre', href: '/technician/marketing' },
            ],
          },
        };
      }
      default:
        return { tool, ok: false, summary: 'Unknown orchestration tool.', error: 'unknown_tool' };
    }
  } catch (err) {
    return {
      tool,
      ok: false,
      summary: 'Could not prepare that action.',
      error: err instanceof Error ? err.message : 'failed',
    };
  }
}

export function orchestrationToolsForRole(role: AiAssistantRole, guest = false): string[] {
  if (guest) return ['navigateToScreen', 'getWorkflowMap'];
  if (role === 'customer') {
    return [
      'navigateToScreen',
      'getWorkflowMap',
      'prepareCreateJob',
      'prepareCancelJob',
    ];
  }
  if (role === 'technician') {
    return [
      'navigateToScreen',
      'getWorkflowMap',
      'prepareAvailabilityUpdate',
      'guideSubscriptionUpgrade',
      'guideCreateOffer',
    ];
  }
  return ['navigateToScreen', 'getWorkflowMap'];
}
