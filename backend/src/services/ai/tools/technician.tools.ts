import { getPlatformKnowledgeBlock } from '../knowledge/fixnow.canon.js';
import {
  applicationMarketplaceService as applicationService,
  jobMarketplaceService as jobService,
} from '../../marketplace/job.service.js';
import { technicianMarketplaceService as technicianService } from '../../marketplace/technician.service.js';
import { escrowService, payoutService } from '../../payments/payment.service.js';
import { reviewService } from '../../reviews/review.service.js';
import { asQueryRequest, asRecord, asRecords, summarizeJson, type AiToolContext, type AiToolResult } from './types.js';

function envScopedRequest(ctx: AiToolContext, query: Record<string, unknown> = {}) {
  return asQueryRequest(query, {
    userId: ctx.userId,
    role: ctx.role,
    dataEnvironment: ctx.dataEnvironment,
  });
}

export const TECHNICIAN_TOOLS = [
  'getMyProfile',
  'getDashboard',
  'listNearbyJobs',
  'listMyApplications',
  'getJobDetails',
  'getEarnings',
  'getEscrowStatus',
  'getMyReviews',
  'getPlatformKnowledge',
] as const;

export type TechnicianToolName = (typeof TECHNICIAN_TOOLS)[number];

export async function runTechnicianTool(
  tool: TechnicianToolName,
  ctx: AiToolContext,
): Promise<AiToolResult> {
  try {
    switch (tool) {
      case 'getMyProfile': {
        const data = await technicianService.getProfile(ctx.userId);
        const profile = (data as { profile?: Record<string, unknown> }).profile || (data as Record<string, unknown>);
        return {
          tool,
          ok: true,
          summary: 'Loaded your technician profile.',
          data: {
            headline: profile.headline,
            skills: profile.skills,
            trustScore: profile.trustScore,
            ratingAverage: profile.ratingAverage,
            jobsCompleted: profile.jobsCompleted,
            isAvailableNow: profile.isAvailableNow,
            district: (profile.location as { district?: string } | undefined)?.district,
            bio: String(profile.bio || '').slice(0, 400),
          },
        };
      }
      case 'getDashboard': {
        const data = await technicianService.dashboard(ctx.userId);
        return {
          tool,
          ok: true,
          summary: 'Loaded technician dashboard snapshot.',
          data,
        };
      }
      case 'listNearbyJobs': {
        const data = await jobService.nearby(
          ctx.userId,
          envScopedRequest(ctx, {
            district: ctx.roleContext.district || ctx.query?.district,
            q: ctx.roleContext.query || ctx.query?.q,
            limit: '8',
            lat: ctx.query?.lat ?? ctx.roleContext.lat,
            lng: ctx.query?.lng ?? ctx.roleContext.lng,
          }),
        );
        const items = asRecords(data.items).slice(0, 8);
        return {
          tool,
          ok: true,
          summary: `Found ${items.length} nearby/open jobs (ranked by FixNow recommendation engine).`,
          data: {
            jobs: items.map((j) => ({
              id: j._id || j.id,
              title: j.title,
              status: j.status,
              budgetMin: j.budgetMin,
              budgetMax: j.budgetMax,
              district: (j.location as { district?: string } | undefined)?.district,
              distanceKm: j.distanceKm,
              etaLabel: j.etaLabel,
              matchScore: j.matchScore,
              matchReasons: j.matchReasons,
              urgent: j.urgent,
            })),
          },
        };
      }
      case 'listMyApplications': {
        const data = await applicationService.listMine(ctx.userId, envScopedRequest(ctx, { limit: '10' }));
        const items = asRecords(data.items).slice(0, 10);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} of your applications.`,
          data: {
            applications: items.map((a) => ({
              id: a._id || a.id,
              status: a.status,
              jobId: a.jobId,
              proposedPrice: a.proposedPrice,
            })),
          },
        };
      }
      case 'getJobDetails': {
        const jobId = String(ctx.roleContext.jobId || ctx.query?.jobId || '');
        if (!jobId) {
          return { tool, ok: false, summary: 'No job id provided.', error: 'jobId required' };
        }
        const data = await jobService.getById(jobId, { userId: ctx.userId, role: 'technician' });
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
            },
          },
        };
      }
      case 'getEarnings': {
        const data = await payoutService.earnings(ctx.userId);
        return {
          tool,
          ok: true,
          summary: 'Loaded your earnings snapshot.',
          data,
        };
      }
      case 'getEscrowStatus': {
        const jobId = String(ctx.roleContext.jobId || ctx.query?.jobId || '');
        if (!jobId) {
          const list = await escrowService.list({ userId: ctx.userId, role: 'technician' }, { limit: 5 });
          const items = asRecords(list.items).slice(0, 5);
          return {
            tool,
            ok: true,
            summary: `Loaded ${items.length} escrow records.`,
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
        const data = await escrowService.getForJob({ userId: ctx.userId, role: 'technician' }, jobId);
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
          },
        };
      }
      case 'getMyReviews': {
        const data = await reviewService.listForTechnician(
          ctx.userId,
          envScopedRequest(ctx, { limit: '8' }),
        );
        const items = asRecords(data.items).slice(0, 8);
        return {
          tool,
          ok: true,
          summary: `Loaded ${items.length} reviews about you.`,
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

export function formatTechnicianToolResults(results: AiToolResult[]): string {
  if (!results.length) return 'No tool results.';
  return results
    .map((r) => `${r.tool}: ${r.ok ? r.summary : r.error || r.summary}\n${r.data ? summarizeJson(r.data) : ''}`)
    .join('\n\n');
}
