/**
 * Seed scenario engine — generates realistic jobs through the production job pipeline
 * (`jobMarketplaceService.create`) as the Permanent Seed Customer.
 * Never bypasses matching, applications, chat, completion, or review stages.
 */

import { Category } from '../../../models/index.js';
import { Job } from '../../../models/index.js';
import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../../utils/audit.js';
import { getPlatformModeState } from '../../platform/platformMode.service.js';
import { jobMarketplaceService } from '../../marketplace/job.service.js';
import { assertSandboxEnabled } from '../sandboxSettings.service.js';
import { DEVELOPER_CUSTOMER, SEED_TAG, buildSeedMeta } from './constants.js';
import { ensureDeveloperCustomerIntegrity } from './seedCustomer.integrity.js';

export type SeedScenarioId =
  | 'emergency_plumbing'
  | 'electrical_fault'
  | 'house_painting'
  | 'ac_repair'
  | 'carpentry'
  | 'cleaning'
  | 'mechanic'
  | 'appliance_repair'
  | 'civil_works'
  | 'home_maintenance'
  | 'single_applicant'
  | 'multiple_applicants'
  | 'priority_booking'
  | 'emergency_booking'
  | 'business_booking'
  | 'repeat_customer'
  | 'new_customer'
  | 'scheduled_booking'
  | 'cancelled_booking'
  | 'rejected_application'
  | 'accepted_technician'
  | 'late_technician'
  | 'completed_work'
  | 'disputed_work'
  | 'professional_booking'
  | 'starter_booking'
  | 'expired_subscription'
  | 'subscription_renewal'
  | 'failed_payment'
  | 'approved_payment'
  | 'admin_intervention'
  | 'marketing_campaign'
  | 'heavy_workload'
  | 'quiet_marketplace'

export type SeedScenarioDef = {
  id: SeedScenarioId
  label: string
  description: string
  categoryName: string
  title: string
  descriptionText: string
  budgetMin: number
  budgetMax: number
  urgency?: 'normal' | 'priority' | 'emergency'
  tags?: string[]
}

export const SCENARIO_SETTINGS_KEY = 'seed_scenario_disabled_ids'

export const SEED_SCENARIOS: SeedScenarioDef[] = [
  {
    id: 'emergency_plumbing',
    label: 'Emergency plumbing',
    description: 'Burst pipe / urgent leak — production POSTED job',
    categoryName: 'Plumbing',
    title: 'Emergency: burst pipe under kitchen sink',
    descriptionText:
      'Water is flooding the kitchen cabinet. Need a verified plumber ASAP in Kampala. Photos available on arrival.',
    budgetMin: 80000,
    budgetMax: 180000,
    urgency: 'emergency',
    tags: ['emergency', 'plumbing'],
  },
  {
    id: 'electrical_fault',
    label: 'Electrical fault',
    description: 'Power trip / socket fault',
    categoryName: 'Electrical',
    title: 'Sockets sparking in living room — need electrician',
    descriptionText: 'Two wall sockets trip the breaker when used. Looking for a licensed electrician today.',
    budgetMin: 70000,
    budgetMax: 150000,
    urgency: 'priority',
    tags: ['electrical'],
  },
  {
    id: 'house_painting',
    label: 'House painting',
    description: 'Interior repaint quote',
    categoryName: 'Painting',
    title: 'Repaint 2-bedroom apartment (interior)',
    descriptionText: 'Need a painting crew for walls and ceiling. Prefer weekend start. Materials can be discussed.',
    budgetMin: 400000,
    budgetMax: 900000,
    urgency: 'normal',
    tags: ['painting'],
  },
  {
    id: 'ac_repair',
    label: 'Air conditioner repair',
    description: 'AC not cooling',
    categoryName: 'Air Conditioning',
    title: 'Split AC not cooling — gas check / service',
    descriptionText: 'Bedroom split unit blows warm air. Last serviced over a year ago. Prefer same-day visit.',
    budgetMin: 100000,
    budgetMax: 250000,
    urgency: 'priority',
    tags: ['ac'],
  },
  {
    id: 'carpentry',
    label: 'Carpentry',
    description: 'Door / cupboard fix',
    categoryName: 'Carpentry',
    title: 'Wardrobe door off hinge + shelf repair',
    descriptionText: 'Need a carpenter for a broken wardrobe hinge and one loose shelf in the bedroom.',
    budgetMin: 50000,
    budgetMax: 120000,
    urgency: 'normal',
    tags: ['carpentry'],
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    description: 'Deep clean booking',
    categoryName: 'Cleaning',
    title: 'Deep clean 3-bedroom house after move-in',
    descriptionText: 'Full deep clean including kitchen and bathrooms. Flexible mid-week.',
    budgetMin: 150000,
    budgetMax: 350000,
    urgency: 'normal',
    tags: ['cleaning'],
  },
  {
    id: 'mechanic',
    label: 'Mechanic',
    description: 'Vehicle fault',
    categoryName: 'Mechanic',
    title: 'Car battery drain / alternator check',
    descriptionText: 'Vehicle struggles to start after overnight park. Need mobile mechanic diagnosis.',
    budgetMin: 80000,
    budgetMax: 200000,
    urgency: 'priority',
    tags: ['mechanic'],
  },
  {
    id: 'appliance_repair',
    label: 'Appliance repair',
    description: 'Fridge / washer',
    categoryName: 'Appliance Repair',
    title: 'Fridge not cooling — appliance technician',
    descriptionText: 'Fridge compartment warm; freezer still cold. Looking for appliance repair.',
    budgetMin: 90000,
    budgetMax: 220000,
    urgency: 'normal',
    tags: ['appliance'],
  },
  {
    id: 'civil_works',
    label: 'Civil works',
    description: 'Small masonry',
    categoryName: 'Civil Works',
    title: 'Repair cracked compound wall section',
    descriptionText: 'About 2 metres of compound wall needs remortar and plaster. Quote with materials.',
    budgetMin: 200000,
    budgetMax: 500000,
    urgency: 'normal',
    tags: ['civil'],
  },
  {
    id: 'home_maintenance',
    label: 'Home maintenance',
    description: 'General handyman',
    categoryName: 'Home Maintenance',
    title: 'General handyman — taps, locks, shelf install',
    descriptionText: 'Small maintenance list: dripping tap, sticky lock, and wall shelf install.',
    budgetMin: 60000,
    budgetMax: 140000,
    urgency: 'normal',
    tags: ['maintenance'],
  },
  {
    id: 'single_applicant',
    label: 'Single applicant scenario',
    description: 'Open job intended for one strong match (same create path)',
    categoryName: 'Plumbing',
    title: 'Replace kitchen mixer tap',
    descriptionText: 'Straightforward tap replacement. Looking for one nearby plumber with good reviews.',
    budgetMin: 50000,
    budgetMax: 100000,
    urgency: 'normal',
    tags: ['scenario:single_applicant'],
  },
  {
    id: 'multiple_applicants',
    label: 'Multiple applicants scenario',
    description: 'Broad job to attract several applications',
    categoryName: 'Electrical',
    title: 'Full house electrical inspection + quote',
    descriptionText: 'Need multiple quotes for a full electrical safety inspection of a 4-bedroom house.',
    budgetMin: 120000,
    budgetMax: 300000,
    urgency: 'normal',
    tags: ['scenario:multiple_applicants'],
  },
  {
    id: 'priority_booking',
    label: 'Priority booking',
    description: 'High-priority scheduled visit',
    categoryName: 'Plumbing',
    title: 'Priority: water heater install tomorrow morning',
    descriptionText: 'New electric water heater ready on site. Need install before 10am tomorrow.',
    budgetMin: 150000,
    budgetMax: 280000,
    urgency: 'priority',
    tags: ['priority'],
  },
  {
    id: 'emergency_booking',
    label: 'Emergency booking',
    description: 'Emergency same-day job',
    categoryName: 'Electrical',
    title: 'EMERGENCY: no power in half the house',
    descriptionText: 'Sudden blackout on one phase. Need emergency electrician now.',
    budgetMin: 100000,
    budgetMax: 250000,
    urgency: 'emergency',
    tags: ['emergency'],
  },
  {
    id: 'business_booking',
    label: 'Business booking',
    description: 'SME / shop booking',
    categoryName: 'Electrical',
    title: 'Shop lighting upgrade — small business',
    descriptionText: 'Retail shop needs LED lighting upgrade after hours. Business booking for verified company.',
    budgetMin: 300000,
    budgetMax: 800000,
    urgency: 'normal',
    tags: ['business'],
  },
  {
    id: 'repeat_customer',
    label: 'Repeat customer',
    description: 'Follow-up style booking from Seed Customer',
    categoryName: 'Plumbing',
    title: 'Follow-up: check bathroom seal after last repair',
    descriptionText: 'Repeat customer follow-up to verify bathroom seal and touch up if needed.',
    budgetMin: 40000,
    budgetMax: 90000,
    urgency: 'normal',
    tags: ['repeat'],
  },
  {
    id: 'new_customer',
    label: 'New customer',
    description: 'First-time booking style job',
    categoryName: 'Home Maintenance',
    title: 'First booking: general home maintenance check',
    descriptionText: 'New customer first job — general inspection and small fixes around the house.',
    budgetMin: 50000,
    budgetMax: 120000,
    urgency: 'normal',
    tags: ['new_customer'],
  },
  {
    id: 'scheduled_booking',
    label: 'Scheduled booking',
    description: 'Planned non-urgent visit',
    categoryName: 'Painting',
    title: 'Scheduled weekend interior touch-up',
    descriptionText: 'Prefer Saturday morning. Not urgent — schedule a crew for a planned visit.',
    budgetMin: 200000,
    budgetMax: 450000,
    urgency: 'normal',
    tags: ['scheduled'],
  },
  {
    id: 'cancelled_booking',
    label: 'Cancelled booking',
    description: 'Posted job intended for cancel-flow QA',
    categoryName: 'Cleaning',
    title: 'Deep clean — may cancel if dates slip',
    descriptionText: 'Seed scenario for cancel flow. Customer may cancel after posting.',
    budgetMin: 80000,
    budgetMax: 160000,
    urgency: 'normal',
    tags: ['cancel'],
  },
  {
    id: 'rejected_application',
    label: 'Rejected application',
    description: 'Job for reject-applicant QA',
    categoryName: 'Plumbing',
    title: 'Sink install — review applicants carefully',
    descriptionText: 'Seed scenario for rejecting an unsuitable applicant while keeping the job open.',
    budgetMin: 90000,
    budgetMax: 180000,
    urgency: 'normal',
    tags: ['reject_application'],
  },
  {
    id: 'accepted_technician',
    label: 'Accepted technician',
    description: 'Job for accept-applicant QA',
    categoryName: 'Electrical',
    title: 'Socket replacement — ready to accept a technician',
    descriptionText: 'Seed scenario for accepting a technician application and starting work.',
    budgetMin: 60000,
    budgetMax: 130000,
    urgency: 'normal',
    tags: ['accept'],
  },
  {
    id: 'late_technician',
    label: 'Late technician',
    description: 'Job for late-arrival / delay messaging QA',
    categoryName: 'Air Conditioning',
    title: 'AC service — arrival window sensitive',
    descriptionText: 'Customer expects on-time arrival. Use for late technician messaging QA.',
    budgetMin: 120000,
    budgetMax: 220000,
    urgency: 'priority',
    tags: ['late'],
  },
  {
    id: 'completed_work',
    label: 'Completed work',
    description: 'Job intended to run through completion + review',
    categoryName: 'Carpentry',
    title: 'Wardrobe hinge repair — complete end-to-end',
    descriptionText: 'Seed scenario for full completion and review after work is done.',
    budgetMin: 70000,
    budgetMax: 140000,
    urgency: 'normal',
    tags: ['complete'],
  },
  {
    id: 'disputed_work',
    label: 'Disputed work',
    description: 'Job for dispute / quality complaint QA',
    categoryName: 'Painting',
    title: 'Touch-up paint — quality dispute candidate',
    descriptionText: 'Seed scenario for disputed completion / quality complaint flows.',
    budgetMin: 150000,
    budgetMax: 300000,
    urgency: 'normal',
    tags: ['dispute'],
  },
  {
    id: 'professional_booking',
    label: 'Professional booking',
    description: 'Mid-tier professional plan style job',
    categoryName: 'Electrical',
    title: 'Office board inspection — professional tier',
    descriptionText: 'SME office electrical inspection suitable for Professional-plan technician QA.',
    budgetMin: 200000,
    budgetMax: 400000,
    urgency: 'normal',
    tags: ['professional'],
  },
  {
    id: 'starter_booking',
    label: 'Starter booking',
    description: 'Small job suitable for Starter-plan QA',
    categoryName: 'Home Maintenance',
    title: 'Replace door handle — small starter job',
    descriptionText: 'Small ticket job for Starter-plan technician free-job / entitlement QA.',
    budgetMin: 30000,
    budgetMax: 70000,
    urgency: 'normal',
    tags: ['starter'],
  },
  {
    id: 'expired_subscription',
    label: 'Expired subscription',
    description: 'Job visible while testing expired-plan technician limits',
    categoryName: 'Plumbing',
    title: 'Tap leak — expired subscription edge case',
    descriptionText: 'Use with an expired/simulated plan to verify entitlement gates on apply.',
    budgetMin: 50000,
    budgetMax: 100000,
    urgency: 'normal',
    tags: ['subscription', 'expired'],
  },
  {
    id: 'subscription_renewal',
    label: 'Subscription renewal',
    description: 'Job after renewal / Dev TX activation',
    categoryName: 'Solar',
    title: 'Solar inverter check after plan renewal',
    descriptionText: 'Exercise marketplace access after subscription renewal or Dev TX activation.',
    budgetMin: 150000,
    budgetMax: 350000,
    urgency: 'normal',
    tags: ['subscription', 'renewal'],
  },
  {
    id: 'failed_payment',
    label: 'Failed payment',
    description: 'Context job while testing failed payment UX',
    categoryName: 'Electrical',
    title: 'Lighting fix — payment failure companion',
    descriptionText: 'Companion job while QA exercises failed subscription payment paths (real payment APIs).',
    budgetMin: 80000,
    budgetMax: 150000,
    urgency: 'normal',
    tags: ['payment', 'failed'],
  },
  {
    id: 'approved_payment',
    label: 'Approved payment',
    description: 'Context job after approved payment / Dev TX',
    categoryName: 'Plumbing',
    title: 'Water heater service — after approved payment',
    descriptionText: 'Companion job after an approved payment or Development Transaction activation.',
    budgetMin: 100000,
    budgetMax: 220000,
    urgency: 'normal',
    tags: ['payment', 'approved'],
  },
  {
    id: 'admin_intervention',
    label: 'Admin intervention',
    description: 'Job for admin moderate / intervene QA',
    categoryName: 'Civil Works',
    title: 'Boundary wall crack — admin review candidate',
    descriptionText: 'Seed scenario for admin intervention, moderation, or support ticket linkage.',
    budgetMin: 500000,
    budgetMax: 1200000,
    urgency: 'priority',
    tags: ['admin'],
  },
  {
    id: 'marketing_campaign',
    label: 'Marketing campaign',
    description: 'Job coinciding with marketing/offer campaign QA',
    categoryName: 'Cleaning',
    title: 'Promo week: spring clean package',
    descriptionText: 'Use alongside Seed offers/marketing modules to verify campaign ↔ job discovery.',
    budgetMin: 90000,
    budgetMax: 200000,
    urgency: 'normal',
    tags: ['marketing'],
  },
  {
    id: 'heavy_workload',
    label: 'Heavy workload',
    description: 'Large multi-room job for busy marketplace QA',
    categoryName: 'Painting',
    title: 'Full house exterior + interior paint',
    descriptionText: 'Large scope job to stress matching, applications, and technician capacity.',
    budgetMin: 1500000,
    budgetMax: 4000000,
    urgency: 'normal',
    tags: ['heavy'],
  },
  {
    id: 'quiet_marketplace',
    label: 'Quiet marketplace',
    description: 'Low-urgency niche job for empty-state / sparse matching QA',
    categoryName: 'Appliance Repair',
    title: 'Niche: vintage radio repair (low urgency)',
    descriptionText: 'Sparse matching candidate — verify empty applicant states and quiet marketplace UX.',
    budgetMin: 40000,
    budgetMax: 90000,
    urgency: 'normal',
    tags: ['quiet'],
  },
]

async function findCategoryId(name: string) {
  const exact = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).select('_id name')
  if (exact) return exact
  const fuzzy = await Category.findOne({ name: new RegExp(name.split(/\s+/)[0] || name, 'i') }).select('_id name')
  return fuzzy
}

async function loadDisabledIds(): Promise<Set<string>> {
  const { PlatformSetting } = await import('../../../models/platform/AuditSettings.js')
  const doc = await PlatformSetting.findOne({
    key: SCENARIO_SETTINGS_KEY,
    isDeleted: { $ne: true },
  })
    .select('value')
    .lean()
  const ids = Array.isArray((doc?.value as { ids?: unknown } | undefined)?.ids)
    ? ((doc!.value as { ids: string[] }).ids || []).map(String)
    : []
  return new Set(ids)
}

async function saveDisabledIds(ids: string[], actorId: string) {
  const { PlatformSetting } = await import('../../../models/platform/AuditSettings.js')
  await PlatformSetting.findOneAndUpdate(
    { key: SCENARIO_SETTINGS_KEY },
    {
      $set: {
        key: SCENARIO_SETTINGS_KEY,
        value: { ids, updatedAt: new Date().toISOString(), updatedBy: actorId },
        isDeleted: false,
      },
      $unset: { deletedAt: 1 },
    },
    { upsert: true },
  )
}

export const seedScenarioService = {
  async listDisabledScenarioIds() {
    return [...(await loadDisabledIds())]
  },

  async listScenarios() {
    const disabled = await loadDisabledIds()
    return {
      scenarios: SEED_SCENARIOS.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        categoryName: s.categoryName,
        urgency: s.urgency || 'normal',
        tags: s.tags || [],
        enabled: !disabled.has(s.id),
      })),
      customerEmail: DEVELOPER_CUSTOMER.email,
      pipeline:
        'jobMarketplaceService.create → matching → applications → chat → completion → review (manual stages via real apps)',
      note: 'Scenarios create real POSTED jobs. Downstream stages use production customer/technician/admin UIs — no fake shortcuts.',
      disabledCount: disabled.size,
    }
  },

  async setScenarioEnabled(
    actor: { userId: string },
    body: { scenarioId: string; enabled: boolean },
  ) {
    await assertSandboxEnabled()
    const id = String(body.scenarioId || '')
    if (!SEED_SCENARIOS.some((s) => s.id === id)) {
      throw AppError.badRequest('Unknown scenario id')
    }
    const disabled = await loadDisabledIds()
    if (body.enabled) disabled.delete(id)
    else disabled.add(id)
    const ids = [...disabled]
    await saveDisabledIds(ids, actor.userId)
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: body.enabled ? 'seed.scenarios.enable' : 'seed.scenarios.disable',
      resourceType: 'SeedPlatform',
      resourceId: id,
      meta: { scenarioId: id, enabled: body.enabled },
    })
    return this.listScenarios()
  },

  /**
   * Create one or more scenario jobs as the Permanent Seed Customer
   * using the production job creation service (publish=true).
   */
  async generate(
    actor: { userId: string },
    body: { scenarioIds?: SeedScenarioId[]; all?: boolean } = {},
  ) {
    await assertSandboxEnabled()
    const mode = await getPlatformModeState()
    if (String(mode.mode || '').toLowerCase() === 'production') {
      throw AppError.forbidden('Seed scenario generation is disabled in Platform Mode Production')
    }

    const integrity = await ensureDeveloperCustomerIntegrity()
    if (integrity.status === 'missing' || integrity.status === 'conflict' || !integrity.userId) {
      throw AppError.badRequest(
        integrity.message ||
          `Permanent Seed Customer ${DEVELOPER_CUSTOMER.email} not found. Register/login once, then provision.`,
      )
    }

    const disabled = await loadDisabledIds()
    const selected = (body.all
      ? SEED_SCENARIOS
      : SEED_SCENARIOS.filter((s) => (body.scenarioIds || []).includes(s.id))
    ).filter((s) => !disabled.has(s.id))

    if (!selected.length) {
      throw AppError.badRequest(
        body.all
          ? 'All scenarios are disabled — enable at least one in Seed Management'
          : 'Select at least one enabled scenario (or pass all: true)',
      )
    }

    const created: Array<{ scenarioId: string; jobId: string; title: string; status: string }> = []
    const skippedDisabled = (body.scenarioIds || []).filter((id) => disabled.has(id))

    for (const scenario of selected) {
      const category = await findCategoryId(scenario.categoryName)
      const createdJob = await jobMarketplaceService.create(
        integrity.userId,
        {
          title: scenario.title,
          description: scenario.descriptionText,
          categoryId: category?._id?.toString(),
          budgetMin: scenario.budgetMin,
          budgetMax: scenario.budgetMax,
          currency: 'UGX',
          publish: true,
          location: {
            country: 'UG',
            district: DEVELOPER_CUSTOMER.district,
            city: DEVELOPER_CUSTOMER.city,
            landmark: DEVELOPER_CUSTOMER.landmark,
            geo: {
              type: 'Point',
              coordinates: [DEVELOPER_CUSTOMER.lng, DEVELOPER_CUSTOMER.lat],
            },
          },
        },
        { ip: 'seed-scenario' },
      )

      const jobDoc = (createdJob as { job?: { _id?: unknown; id?: string; status?: string; title?: string } }).job
      const jobId = String(jobDoc?.id || jobDoc?._id || '')
      if (!jobId) throw new AppError('Seed scenario job create did not return a job id')

      await Job.updateOne(
        { _id: jobId },
        {
          $set: {
            dataEnvironment: 'sandbox',
            metadata: buildSeedMeta({
              seedKey: DEVELOPER_CUSTOMER.seedKey,
              fixtureId: `scenario:${scenario.id}`,
              developer: true,
            }),
            searchText: `${scenario.title} ${scenario.descriptionText} ${scenario.categoryName} seed-scenario`,
          },
        },
      )

      created.push({
        scenarioId: scenario.id,
        jobId,
        title: scenario.title,
        status: String(jobDoc?.status || 'posted'),
      })
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: 'admin',
      action: 'seed.scenarios.generate',
      resourceType: 'SeedPlatform',
      meta: {
        customerUserId: integrity.userId,
        count: created.length,
        scenarioIds: created.map((c) => c.scenarioId),
        skippedDisabled,
      },
    })

    return {
      created,
      skippedDisabled,
      customerEmail: DEVELOPER_CUSTOMER.email,
      customerUserId: integrity.userId,
      passwordPreserved: true,
      usedProductionJobPipeline: true,
      seedTag: SEED_TAG,
      note: 'Jobs created via jobMarketplaceService.create and stamped sandbox for Seed Platform isolation. Continue matching/chat/completion in real apps.',
    }
  },
}
