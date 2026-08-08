/**
 * Customer-confirmed job completion lifecycle.
 *
 * Flow:
 *   in_progress → (tech requestCompletion) → awaiting_confirmation
 *              → (customer confirmCompletion) → completed  [quota deducted HERE only]
 *              → (customer reportCompletionIssue) → in_progress
 *
 * Reviews and free-job accounting are gated on `completed` after customer confirm.
 */

import mongoose from 'mongoose'
import { Job, TechnicianProfile } from '../../models/index.js'
import { JOB_STATUS } from '../../models/shared/enums.js'
import { AppError } from '../../utils/AppError.js'
import { writeAuditLog } from '../../utils/audit.js'
import { createDbNotification } from '../../utils/notify.js'
import { jobMarketplaceService } from './job.service.js'
import { getFreeJobConfig, quotaSnapshot } from './freeJob.service.js'

type Meta = { ip?: string; userAgent?: string }

export type RequestCompletionInput = {
  notes?: string
  photoUrls?: string[]
  materialsUsed?: string
  completedAtEstimate?: string
  confirmedByTechnician: boolean
}

export type ReportIssueInput = {
  category: string
  description: string
  photoUrls?: string[]
  comments?: string
}

const ISSUE_CATEGORIES = [
  'incomplete_work',
  'quality_issue',
  'wrong_work',
  'parts_missing',
  'technician_no_show',
  'other',
] as const

export const jobCompletionService = {
  async requestCompletion(
    actor: { userId: string; role: string },
    jobId: string,
    input: RequestCompletionInput,
    meta: Meta = {},
  ) {
    if (!input.confirmedByTechnician) {
      throw AppError.badRequest('Confirm that the work is complete before submitting')
    }

    const job = await Job.findById(jobId)
    if (!job) throw AppError.notFound('Job not found')

    const isTech = job.assignedTechnicianId?.toString() === actor.userId
    const isAdmin = actor.role === 'admin'
    if (!isTech && !isAdmin) {
      throw AppError.forbidden('Only the assigned technician can request completion')
    }
    if (job.status !== JOB_STATUS.IN_PROGRESS && job.status !== JOB_STATUS.AWAITING_CONFIRMATION) {
      throw AppError.badRequest('Completion can only be requested while the job is in progress')
    }
    if (job.status === JOB_STATUS.AWAITING_CONFIRMATION && job.completionRequest?.requestedAt) {
      throw AppError.conflict('Completion was already requested. Waiting for customer confirmation.')
    }

    job.completionRequest = {
      requestedAt: new Date(),
      requestedBy: new mongoose.Types.ObjectId(actor.userId),
      notes: input.notes?.slice(0, 2000),
      photoUrls: (input.photoUrls ?? []).slice(0, 12),
      materialsUsed: input.materialsUsed?.slice(0, 1000),
      completedAtEstimate: input.completedAtEstimate ? new Date(input.completedAtEstimate) : new Date(),
      confirmedByTechnician: true,
    }
    job.completionIssue = undefined
    await job.save()

    const result = await jobMarketplaceService.transitionStatus(
      actor,
      jobId,
      JOB_STATUS.AWAITING_CONFIRMATION,
      input.notes?.slice(0, 500) || 'Technician requested completion',
      meta,
    )

    await createDbNotification({
      userId: job.customerId.toString(),
      type: 'job.completion_requested',
      title: 'Confirm job completion',
      body: `Your technician has marked "${job.title}" as completed. Please confirm or report an issue.`,
      jobId,
      bypassQuietHours: true,
    })

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'job.completion_requested',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: {
        notes: Boolean(input.notes),
        photoCount: (input.photoUrls ?? []).length,
        materialsUsed: Boolean(input.materialsUsed),
      },
    })

    return result
  },

  async confirmCompletion(
    actor: { userId: string; role: string },
    jobId: string,
    note?: string,
    meta: Meta = {},
  ) {
    const job = await Job.findById(jobId)
    if (!job) throw AppError.notFound('Job not found')

    const isCustomer = job.customerId.toString() === actor.userId
    const isAdmin = actor.role === 'admin'
    if (!isCustomer && !isAdmin) {
      throw AppError.forbidden('Only the customer can confirm completion')
    }
    if (job.status === JOB_STATUS.COMPLETED) {
      throw AppError.conflict('This job is already completed')
    }
    if (job.status !== JOB_STATUS.AWAITING_CONFIRMATION && !isAdmin) {
      throw AppError.badRequest('Job is not awaiting your confirmation')
    }
    if (
      isAdmin &&
      job.status !== JOB_STATUS.AWAITING_CONFIRMATION &&
      job.status !== JOB_STATUS.IN_PROGRESS &&
      job.status !== JOB_STATUS.DISPUTED
    ) {
      throw AppError.badRequest('Job cannot be force-completed from this status')
    }

    if (job.status === JOB_STATUS.IN_PROGRESS && isAdmin) {
      await jobMarketplaceService.transitionStatus(
        actor,
        jobId,
        JOB_STATUS.AWAITING_CONFIRMATION,
        'Admin advanced to confirmation',
        meta,
      )
    }

    const result = await jobMarketplaceService.transitionStatus(
      actor,
      jobId,
      JOB_STATUS.COMPLETED,
      note?.slice(0, 500) || 'Customer confirmed completion',
      meta,
    )

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'job.completion_confirmed',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: { force: isAdmin && !isCustomer },
    })

    try {
      await createDbNotification({
        userId: job.customerId.toString(),
        type: 'review.request',
        title: 'Rate your technician',
        body: `How was the work on "${job.title}"? Leave a quick review.`,
        jobId,
      })
      if (job.assignedTechnicianId) {
        await createDbNotification({
          userId: job.assignedTechnicianId.toString(),
          type: 'job.completion_confirmed',
          title: 'Customer confirmed completion',
          body: `The customer confirmed "${job.title}" as completed.`,
          jobId,
          bypassQuietHours: true,
        })
      }
    } catch {
      /* ignore */
    }

    return result
  },

  async reportIssue(
    actor: { userId: string; role: string },
    jobId: string,
    input: ReportIssueInput,
    meta: Meta = {},
  ) {
    if (!ISSUE_CATEGORIES.includes(input.category as (typeof ISSUE_CATEGORIES)[number])) {
      throw AppError.badRequest('Invalid issue category')
    }
    if (!input.description?.trim() || input.description.trim().length < 8) {
      throw AppError.badRequest('Please describe the issue (at least 8 characters)')
    }

    const job = await Job.findById(jobId)
    if (!job) throw AppError.notFound('Job not found')

    const isCustomer = job.customerId.toString() === actor.userId
    const isAdmin = actor.role === 'admin'
    if (!isCustomer && !isAdmin) {
      throw AppError.forbidden('Only the customer can report a completion issue')
    }
    if (job.status !== JOB_STATUS.AWAITING_CONFIRMATION) {
      throw AppError.badRequest('Issues can only be reported while awaiting confirmation')
    }

    job.completionIssue = {
      reportedAt: new Date(),
      reportedBy: new mongoose.Types.ObjectId(actor.userId),
      category: input.category,
      description: input.description.slice(0, 2000),
      photoUrls: (input.photoUrls ?? []).slice(0, 12),
      comments: input.comments?.slice(0, 2000),
    }
    await job.save()

    const result = await jobMarketplaceService.transitionStatus(
      actor,
      jobId,
      JOB_STATUS.IN_PROGRESS,
      `Issue reported: ${input.category} — ${input.description.slice(0, 200)}`,
      meta,
    )

    if (job.assignedTechnicianId) {
      await createDbNotification({
        userId: job.assignedTechnicianId.toString(),
        type: 'job.completion_issue',
        title: 'Customer reported an issue',
        body: `The customer reported an issue on "${job.title}". Please resolve and request completion again.`,
        jobId,
        bypassQuietHours: true,
      })
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'job.completion_issue_reported',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: { category: input.category },
    })

    return result
  },

  async getTechnicianQuota(technicianUserId: string) {
    const profile = await TechnicianProfile.findOne({ userId: technicianUserId })
    if (!profile) throw AppError.notFound('Technician profile not found')
    const config = await getFreeJobConfig()
    const history = await Job.find({
      assignedTechnicianId: technicianUserId,
      status: JOB_STATUS.COMPLETED,
      freeJobSlotConsumed: true,
    })
      .sort({ completedAt: -1 })
      .limit(50)
      .select('title publicJobReference completedAt freeJobConsumedAt categoryName')
      .lean()

    const snap = quotaSnapshot(profile)
    const { resolveEntitlements } = await import('./entitlements.service.js')
    const ent = await resolveEntitlements(technicianUserId)
    if (ent.hasPaidAccess) {
      snap.hasActiveSubscription = true
      snap.canApply = true
      snap.subscriptionPlan = ent.planCode
      snap.subscriptionStatus = ent.subscriptionStatus
      snap.subscriptionPeriodEnd = ent.subscriptionPeriodEnd
    }

    return {
      quota: {
        ...snap,
        subscriptionSource: ent.subscriptionSource,
        preview: ent.preview || null,
        simulationOnly: Boolean(ent.preview?.simulationOnly),
      },
      config: {
        enabled: config.enabled,
        requireCustomerConfirmation: config.requireCustomerConfirmation,
        subscriptionEnabled: config.subscriptionEnabled,
        freePlanEnabled: config.freePlanEnabled,
        monetizationSuspended: config.monetizationSuspended || profile.monetizationSuspended,
      },
      completedJobHistory: history.map((j) => ({
        id: j._id.toString(),
        title: j.title,
        reference: j.publicJobReference,
        categoryName: j.categoryName,
        completedAt: j.completedAt,
        countedTowardFreeQuota: true,
      })),
    }
  },

  async reopenCompleted(
    actor: { userId: string; role: string },
    jobId: string,
    reason?: string,
    meta: Meta = {},
  ) {
    if (actor.role !== 'admin') throw AppError.forbidden()
    const job = await Job.findById(jobId)
    if (!job) throw AppError.notFound('Job not found')
    if (job.status !== JOB_STATUS.COMPLETED) {
      throw AppError.badRequest('Only completed jobs can be reopened')
    }
    job.status = JOB_STATUS.IN_PROGRESS
    job.completedAt = undefined
    job.timeline.push({
      type: 'status:reopened',
      at: new Date(),
      actorId: new mongoose.Types.ObjectId(actor.userId),
      payload: { reason },
    })
    await job.save()
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'job.reopened',
      resourceType: 'Job',
      resourceId: jobId,
      ip: meta.ip,
      meta: { reason, freeJobSlotConsumed: job.freeJobSlotConsumed },
      severity: 'warning',
    })
    return { job }
  },
}
