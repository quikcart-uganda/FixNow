import { getPlatformKnowledgeBlock } from '../knowledge/fixnow.canon.js';
import { categoryMarketplaceService as categoryService } from '../../marketplace/category.service.js';
import { customerMarketplaceService as customerService } from '../../marketplace/customer.service.js';
import { jobMarketplaceService as jobService } from '../../marketplace/job.service.js';
import { technicianMarketplaceService as technicianService } from '../../marketplace/technician.service.js';
import { escrowService, paymentService } from '../../payments/payment.service.js';
import { reviewService } from '../../reviews/review.service.js';
import { asQueryRequest, asRecord, asRecords, summarizeJson, type AiToolContext, type AiToolResult } from './types.js';

/** Build a query request carrying the actor's auth so downstream filters respect dataEnvironment. */
function envScopedRequest(ctx: AiToolContext, query: Record<string, unknown> = {}) {
  return asQueryRequest(query, {
    userId: ctx.userId,
    role: ctx.role,
    dataEnvironment: ctx.dataEnvironment,
  });
}

export const CUSTOMER_TOOLS = [
  'searchTechnicians',
  'listCategories',
  'getMyJobs',
  'getJobDetails',
  'getTechnicianPublicProfile',
  'getEscrowStatus',
  'getWalletSummary',
  'getTechnicianReviews',
  'getPlatformKnowledge',
] as const;

export type CustomerToolName = (typeof CUSTOMER_TOOLS)[number];

export async function runCustomerTool(
  tool: CustomerToolName,
  ctx: AiToolContext,
): Promise<AiToolResult> {
  try {
    switch (tool) {
      case 'searchTechnicians': {
        const data = await technicianService.search(
          envScopedRequest(ctx, {
            q: ctx.roleContext.query || ctx.query?.q,
            district: ctx.roleContext.district || ctx.query?.district,
            categoryId: ctx.roleContext.categoryId || ctx.query?.categoryId,
            available: 'true',
            limit: '8',
            sort: '-trustScore',
            lat: ctx.query?.lat ?? ctx.roleContext.lat,
            lng: ctx.query?.lng ?? ctx.roleContext.lng,
          }),
        );
        const items = asRecords(data.items).slice(0, 8);
        return {
          tool,
          ok: true,
          summary: `Found ${items.length} technicians matching the search (ranked by FixNow recommendation engine).`,
          data: {
            count: items.length,
            technicians: items.map((item) => ({
              id: item.id || item.userId,
              fullName: item.fullName || item.name,
              headline: item.headline,
              district: (item.location as { district?: string } | undefined)?.district,
              trustScore: item.trustScore,
              ratingAverage: item.ratingAverage,
              skills: item.skills,
              rankingScore: item.rankingScore,
              distanceKm: item.distanceKm,
              etaLabel: item.etaLabel,
              indicators: item.indicators,
              jobsCompleted: item.jobsCompleted,
              verificationStatus: item.verificationStatus,
              isAvailableNow: item.isAvailableNow,
              responseTimeLabel: item.responseTimeLabel,
            })),
          },
        };
      }
      case 'listCategories': {
        const data = await categoryService.list(envScopedRequest(ctx, { limit: '30', active: 'true' }));
        const items = asRecords(data.items).slice(0, 20);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} service categories.`,
          data: {
            categories: items.map((c) => ({
              id: c._id || c.id,
              name: c.name,
              slug: c.slug,
            })),
          },
        };
      }
      case 'getMyJobs': {
        const history = await customerService.jobHistory(ctx.userId, envScopedRequest(ctx, { limit: '10' }));
        const items = asRecords(history.items).slice(0, 10);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} of your jobs.`,
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
      case 'getJobDetails': {
        const jobId = String(ctx.roleContext.jobId || ctx.query?.jobId || '');
        if (!jobId) {
          return { tool, ok: false, summary: 'No job id provided.', error: 'jobId required' };
        }
        const data = await jobService.getById(jobId, { userId: ctx.userId, role: 'customer' });
        const job = asRecord(data.job);
        return {
          tool,
          ok: true,
          summary: `Loaded job "${String(job.title || '')}".`,
          data: {
            job: {
              id: job._id || job.id,
              title: job.title,
              status: job.status,
              description: String(job.description || '').slice(0, 500),
              budgetMin: job.budgetMin,
              budgetMax: job.budgetMax,
              district: (job.location as { district?: string } | undefined)?.district,
            },
          },
        };
      }
      case 'getTechnicianPublicProfile': {
        const technicianId = String(ctx.roleContext.technicianId || ctx.query?.technicianId || '');
        if (!technicianId) {
          return {
            tool,
            ok: false,
            summary: 'No technician id provided.',
            error: 'technicianId required',
          };
        }
        const data = await technicianService.getPublicProfile(technicianId, {
          userId: ctx.userId,
          role: 'customer',
        });
        return {
          tool,
          ok: true,
          summary: 'Loaded public technician profile.',
          data: sanitizePublicTechnician(data),
        };
      }
      case 'getEscrowStatus': {
        const jobId = String(ctx.roleContext.jobId || ctx.query?.jobId || '');
        if (!jobId) {
          const list = await escrowService.list({ userId: ctx.userId, role: 'customer' }, { limit: 5 });
          const items = asRecords(list.items).slice(0, 5);
          return {
            tool,
            ok: true,
            summary: `Loaded ${items.length} escrow records for your jobs.`,
            data: {
              escrows: items.map((e) => ({
                status: e.status,
                amount: e.amount,
                currency: e.currency,
                jobId: e.jobId,
              })),
            },
          };
        }
        const data = await escrowService.getForJob({ userId: ctx.userId, role: 'customer' }, jobId);
        const escrow = asRecord(data.escrow || {});
        return {
          tool,
          ok: true,
          summary: escrow.status
            ? `Escrow status for this job: ${String(escrow.status)}.`
            : 'No escrow found for this job yet.',
          data: {
            status: escrow.status,
            amount: escrow.amount,
            currency: escrow.currency,
            heldAt: escrow.heldAt,
            releasedAt: escrow.releasedAt,
          },
        };
      }
      case 'getWalletSummary': {
        const data = await paymentService.getWallet(ctx.userId);
        const wallet = asRecord(data.wallet);
        return {
          tool,
          ok: true,
          summary: 'Loaded your wallet summary.',
          data: {
            availableBalance: wallet.availableBalance,
            heldBalance: wallet.heldBalance,
            currency: wallet.currency,
            status: wallet.status,
          },
        };
      }
      case 'getTechnicianReviews': {
        const technicianId = String(ctx.roleContext.technicianId || ctx.query?.technicianId || '');
        if (!technicianId) {
          return {
            tool,
            ok: false,
            summary: 'No technician id provided for reviews.',
            error: 'technicianId required',
          };
        }
        const data = await reviewService.listForTechnician(
          technicianId,
          envScopedRequest(ctx, { limit: '5' }),
        );
        const items = asRecords(data.items).slice(0, 5);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} public reviews.`,
          data: {
            summary: data.summary,
            reviews: items.map((row) => {
              const review = asRecord(row.review || row);
              return {
                overallRating: review.overallRating ?? review.rating,
                comment: String(review.comment || '').slice(0, 220),
                createdAt: review.createdAt,
              };
            }),
          },
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

function sanitizePublicTechnician(data: unknown) {
  const raw = data as {
    profile?: Record<string, unknown>;
    user?: Record<string, unknown>;
    technician?: Record<string, unknown>;
  };
  const profile = raw.profile || raw.technician || (data as Record<string, unknown>);
  const user = raw.user || {};
  return {
    id: profile.userId || profile.id || user._id,
    fullName: user.fullName || profile.fullName,
    headline: profile.headline,
    skills: profile.skills,
    trustScore: profile.trustScore,
    ratingAverage: profile.ratingAverage,
    jobsCompleted: profile.jobsCompleted,
    district: (profile.location as { district?: string } | undefined)?.district,
  };
}

export function formatCustomerToolResults(results: AiToolResult[]): string {
  if (!results.length) return 'No tool results.';
  return results
    .map((r) => `${r.tool}: ${r.ok ? r.summary : r.error || r.summary}\n${r.data ? summarizeJson(r.data) : ''}`)
    .join('\n\n');
}
