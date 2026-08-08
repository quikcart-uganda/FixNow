import { apiGet, apiPost } from './client'

export type SeedSimulatorHistoryEntry = {
  at: string
  action: 'simulate' | 'reset'
  planCode: string
  actorId: string
  actorRole: 'admin' | 'technician'
  sessionId?: string
  note?: string
}

export type SeedSubscriptionSimulatorStatus = {
  available: boolean
  reason?: string
  platformMode?: string
  defaultPlan: string
  availablePlans: string[]
  developerTechnicianEmail?: string
  developerTechnician?: {
    userId: string
    email: string
    dataEnvironment?: string
    profilePlanCode?: string | null
    profileStatus?: string | null
  }
  current?: {
    planCode: string | null
    planName: string | null
    subscriptionSource: string
    hasPaidAccess: boolean
    previewActive: boolean
    simulationOnly: boolean
  }
  activeSession?: {
    id: string
    planCode: string
    cataloguePlanCode: string
    expiresAt: string
    activatedAt: string
  } | null
  history: SeedSimulatorHistoryEntry[]
  notes?: string[]
  message?: string
}

export type SeedPlatformOverview = {
  version: string
  seedTag: string
  environment: string
  sandboxEnabled: boolean
  counts: Record<string, number>
  workflowFixtures: Array<{ fixtureId: string; purpose: string; title: string; status: string }>
  developerTechnician: {
    exists: boolean
    email: string
    fullName?: string
    dataEnvironment?: string
    developer?: boolean
    accountStatus?: string
    seedAligned?: boolean
    documentedPassword?: string
    documentedPasswordApplies?: boolean
    passwordHint: string
    credentialNote?: string
    permanentDevelopmentTechnician?: boolean
  }
  developerCustomer?: {
    exists: boolean
    email: string
    fullName?: string
    role?: string
    dataEnvironment?: string
    accountStatus?: string
    seedAligned?: boolean
    passwordPolicy?: string
    passwordHint: string
    credentialNote?: string
    permanentDevelopmentCustomer?: boolean
    scenarioPermissions?: boolean
  }
  loginHints: {
    seedUserPassword: string
    developerPassword: string
    developerPasswordAppliesOnlyWhenSeedAligned?: boolean
    documentedSeedPasswordReference?: string
    developerCustomerPassword?: string
  }
  sandboxPayments?: {
    developmentTransactions?: string
    customerJobPipeline?: string
    productionModeBlocksSandboxTooling?: boolean
  }
  modules: string[]
  subscriptionSimulator?: SeedSubscriptionSimulatorStatus | null
  developmentTransactions?: Record<string, unknown> | null
  customerIntegrity?: { status: string; message: string; changes: string[]; userId?: string } | null
}

export type SeedGenerateResult = {
  version: string
  environment: string
  modules: string[]
  counts: Record<string, number>
  developerTechnician: { email: string; password: string; seedKey: string }
  loginHints: {
    customers: Array<{ email: string; password: string; name: string }>
    technicians: Array<{ email: string; password: string; name: string; developer?: boolean }>
  }
  fixtures: Array<{ fixtureId: string; purpose: string; title: string }>
}

export const seedPlatformApi = {
  overview() {
    return apiGet<SeedPlatformOverview>('/admin/seed-platform')
  },
  generateAll() {
    return apiPost<SeedGenerateResult>('/admin/seed-platform/generate-all', {})
  },
  generate(modules: string[], regenerate = false) {
    return apiPost<SeedGenerateResult>('/admin/seed-platform/generate', { modules, regenerate })
  },
  reset() {
    return apiPost<SeedGenerateResult>('/admin/seed-platform/reset', {})
  },
  deleteSeeds() {
    return apiPost<{ users: number }>('/admin/seed-platform/delete', {})
  },
  archive() {
    return apiPost<{ archivedUsers: number; environment: string }>('/admin/seed-platform/archive', {})
  },
  exportData() {
    return apiGet<Record<string, unknown>>('/admin/seed-platform/export')
  },
  importData(body: Record<string, unknown> = {}) {
    return apiPost('/admin/seed-platform/import', body)
  },
  validate() {
    return apiGet<{ ok: boolean; missing: string[]; counts: Record<string, number> }>(
      '/admin/seed-platform/validate',
    )
  },
  listSection(section: string, limit = 40) {
    return apiGet<{ items: unknown[] }>(`/admin/seed-platform/sections/${section}`, { limit })
  },
  listSeedTechnicians() {
    return apiGet<{
      retainedSeedKeys: string[]
      items: Array<{
        userId: string
        seedKey: string
        email: string
        fullName: string
        companyName: string
        accountStatus: string
        isAvailableNow: boolean
        hiddenFromCustomers: boolean
        inActiveCatalogue: boolean
        permanentDeveloper: boolean
        ratingAverage?: number
        reviewCount?: number
        jobsCompleted?: number
        planCode?: string | null
        lifecycle: string
      }>
    }>('/admin/seed-platform/technicians')
  },
  setSeedTechnicianLifecycle(body: {
    userId?: string
    seedKey?: string
    action: 'suspend' | 'activate' | 'hide' | 'show' | 'available' | 'unavailable'
  }) {
    return apiPost('/admin/seed-platform/technicians/lifecycle', body)
  },
  pruneObsoleteSeedTechnicians() {
    return apiPost<{ pruned: number; retained: string[] }>(
      '/admin/seed-platform/technicians/prune-obsolete',
      {},
    )
  },
  simulatorStatus() {
    return apiGet<SeedSubscriptionSimulatorStatus>('/admin/seed-platform/subscription-simulator')
  },
  simulatorSimulate(planCode: string) {
    return apiPost<SeedSubscriptionSimulatorStatus>(
      '/admin/seed-platform/subscription-simulator/simulate',
      { planCode },
    )
  },
  simulatorReset() {
    return apiPost<SeedSubscriptionSimulatorStatus>(
      '/admin/seed-platform/subscription-simulator/reset',
      {},
    )
  },
  provisionPermanentDevelopmentTechnician() {
    return apiPost<{
      integrity: { status: string; userId?: string; message: string; changes: string[] }
      pool: { issued: number; available: Record<string, number> }
      passwordPreserved: boolean
      duplicateCreated: boolean
      email: string
      developmentTransactions?: Record<string, unknown>
    }>('/admin/seed-platform/provision-permanent-development-technician', {})
  },
  provisionPermanentDevelopmentCustomer() {
    return apiPost<{
      integrity: { status: string; userId?: string; message: string; changes: string[] }
      passwordPreserved: boolean
      duplicateCreated: boolean
      email: string
      message?: string
    }>('/admin/seed-platform/provision-permanent-development-customer', {})
  },
  listSeedCustomers() {
    return apiGet<{
      retainedSeedKeys: string[]
      permanentCustomerEmail: string
      items: Array<{
        userId: string
        seedKey: string
        email: string
        fullName: string
        accountStatus: string
        dataEnvironment?: string
        inActiveCatalogue: boolean
        permanentDeveloperCustomer: boolean
        scenarioPermissions: boolean
        jobsPosted: number
        jobsCompleted: number
        lifecycle: string
      }>
    }>('/admin/seed-platform/customers')
  },
  setSeedCustomerLifecycle(body: {
    userId?: string
    seedKey?: string
    action: 'suspend' | 'activate'
  }) {
    return apiPost('/admin/seed-platform/customers/lifecycle', body)
  },
  listSeedScenarios() {
    return apiGet<{
      scenarios: Array<{
        id: string
        label: string
        description: string
        categoryName: string
        urgency: string
        tags: string[]
      }>
      customerEmail: string
      pipeline: string
    }>('/admin/seed-platform/scenarios')
  },
  generateSeedScenarios(body: { scenarioIds?: string[]; all?: boolean } = {}) {
    return apiPost<{
      created: Array<{ scenarioId: string; jobId: string; title: string; status: string }>
      customerEmail: string
      customerUserId: string
      passwordPreserved: boolean
      usedProductionJobPipeline: boolean
      note?: string
    }>('/admin/seed-platform/scenarios/generate', body)
  },
  developmentTransactions() {
    return apiGet<Record<string, unknown>>('/admin/seed-platform/development-transactions')
  },
}

/** Technician self-service — only succeeds for the permanent Development Technician. */
export const developmentSubscriptionSimulatorApi = {
  status() {
    return apiGet<SeedSubscriptionSimulatorStatus>('/subscriptions/development-simulator')
  },
  simulate(planCode: string) {
    return apiPost<SeedSubscriptionSimulatorStatus>('/subscriptions/development-simulator/simulate', {
      planCode,
    })
  },
  reset() {
    return apiPost<SeedSubscriptionSimulatorStatus>('/subscriptions/development-simulator/reset', {})
  },
}
