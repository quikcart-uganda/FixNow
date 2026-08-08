import { getPlatformKnowledgeBlock } from '../knowledge/fixnow.canon.js';
import { adminMarketplaceService as adminService } from '../../marketplace/admin.service.js';
import { escrowService, paymentService } from '../../payments/payment.service.js';
import { reviewService } from '../../reviews/review.service.js';
import { asQueryRequest, asRecords, summarizeJson, type AiToolContext, type AiToolResult } from './types.js';

function envScopedRequest(ctx: AiToolContext, query: Record<string, unknown> = {}) {
  return asQueryRequest(query, {
    userId: ctx.userId,
    role: ctx.role,
    dataEnvironment: ctx.dataEnvironment,
  });
}

export const ADMIN_TOOLS = [
  'getDashboard',
  'getMarketplaceMetrics',
  'getReviewAnalytics',
  'listTechnicians',
  'listJobs',
  'getPaymentsOverview',
  'getEscrowOverview',
  'getPlatformKnowledge',
] as const;

export type AdminToolName = (typeof ADMIN_TOOLS)[number];

export async function runAdminTool(tool: AdminToolName, ctx: AiToolContext): Promise<AiToolResult> {
  try {
    switch (tool) {
      case 'getDashboard': {
        const data = await adminService.dashboard();
        return {
          tool,
          ok: true,
          summary: 'Loaded admin dashboard snapshot.',
          data,
        };
      }
      case 'getMarketplaceMetrics': {
        const data = await adminService.marketplaceMetrics(
          envScopedRequest(ctx, { days: String(ctx.query?.days || '30') }),
        );
        return {
          tool,
          ok: true,
          summary: 'Loaded marketplace metrics.',
          data,
        };
      }
      case 'getReviewAnalytics': {
        const data = await reviewService.analytics();
        return {
          tool,
          ok: true,
          summary: 'Loaded review moderation analytics.',
          data,
        };
      }
      case 'listTechnicians': {
        const data = await adminService.listTechnicians(
          envScopedRequest(ctx, {
            q: ctx.roleContext.query || ctx.query?.q,
            limit: '10',
          }),
        );
        const items = asRecords(data.items).slice(0, 10);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} technicians for ops review.`,
          data: {
            technicians: items.map((t) => ({
              id: t._id || t.id || t.userId,
              fullName: t.fullName,
              trustScore: t.trustScore,
              accountStatus: t.accountStatus,
              ratingAverage: t.ratingAverage,
            })),
          },
        };
      }
      case 'listJobs': {
        const data = await adminService.listJobs(
          envScopedRequest(ctx, {
            q: ctx.roleContext.query || ctx.query?.q,
            status: ctx.query?.status,
            limit: '10',
          }),
        );
        const items = asRecords(data.items).slice(0, 10);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} jobs.`,
          data: {
            jobs: items.map((j) => ({
              id: j._id || j.id,
              title: j.title,
              status: j.status,
              budgetMin: j.budgetMin,
              budgetMax: j.budgetMax,
            })),
          },
        };
      }
      case 'getPaymentsOverview': {
        const data = await paymentService.adminDashboard();
        return {
          tool,
          ok: true,
          summary: 'Loaded payments overview.',
          data,
        };
      }
      case 'getEscrowOverview': {
        const data = await escrowService.adminDashboard();
        return {
          tool,
          ok: true,
          summary: 'Loaded escrow overview.',
          data,
        };
      }
      case 'getPlatformKnowledge': {
        return {
          tool,
          ok: true,
          summary: 'Loaded FixNow platform guide.',
          data: { guide: getPlatformKnowledgeBlock().slice(0, 3500) },
        };
      }
      default:
        return { tool, ok: false, summary: 'Unknown tool.', error: 'unknown_tool' };
    }
  } catch (error) {
    return {
      tool,
      ok: false,
      summary: 'Tool failed.',
      error: error instanceof Error ? error.message : 'Tool failed',
    };
  }
}

export function formatAdminToolResults(results: AiToolResult[]): string {
  if (!results.length) return 'No tool results.';
  return results
    .map((r) => `${r.tool}: ${r.ok ? r.summary : r.error || r.summary}\n${r.data ? summarizeJson(r.data) : ''}`)
    .join('\n\n');
}
