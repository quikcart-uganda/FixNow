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
]

async function findCategoryId(name: string) {
  const exact = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).select('_id name')
  if (exact) return exact
  const fuzzy = await Category.findOne({ name: new RegExp(name.split(/\s+/)[0] || name, 'i') }).select('_id name')
  return fuzzy
}

export const seedScenarioService = {
  listScenarios() {
    return {
      scenarios: SEED_SCENARIOS.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        categoryName: s.categoryName,
        urgency: s.urgency || 'normal',
        tags: s.tags || [],
      })),
      customerEmail: DEVELOPER_CUSTOMER.email,
      pipeline: 'jobMarketplaceService.create → matching → applications → chat → completion → review',
    }
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

    const selected = body.all
      ? SEED_SCENARIOS
      : SEED_SCENARIOS.filter((s) => (body.scenarioIds || []).includes(s.id))
    if (!selected.length) {
      throw AppError.badRequest('Select at least one scenario (or pass all: true)')
    }

    const created: Array<{ scenarioId: string; jobId: string; title: string; status: string }> = []

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
      if (!jobId) throw AppError.internal('Seed scenario job create did not return a job id')

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
      },
    })

    return {
      created,
      customerEmail: DEVELOPER_CUSTOMER.email,
      customerUserId: integrity.userId,
      passwordPreserved: true,
      usedProductionJobPipeline: true,
      seedTag: SEED_TAG,
      note: 'Jobs created via jobMarketplaceService.create and stamped sandbox for Seed Platform isolation.',
    }
  },
}
