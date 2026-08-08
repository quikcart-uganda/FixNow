import { apiGet, apiPost, apiPut, apiDelete } from './client'

export type BillingPeriod = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'

export type SubscriptionBadgeDto = {
  enabled?: boolean
  name?: string
  text?: string
  icon?: string
  color?: string
  borderColor?: string
  glow?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export type SubscriptionPlanDto = {
  id: string
  code: string
  name: string
  description: string
  currency: string
  priceMonthly: number
  priceQuarterly: number
  priceHalfYear?: number
  priceYearly: number
  price: number
  gracePeriodDays: number
  autoRenew: boolean
  features: string[]
  featureFlags: Record<string, boolean>
  limits: Record<string, number>
  isActive: boolean
  isDefault: boolean
  isVisible?: boolean
  sortOrder: number
  badge?: SubscriptionBadgeDto | null
  durationDays?: {
    monthly: number
    quarterly: number
    half_yearly: number
    yearly: number
  }
}

export type SubscriptionBillingPeriodsDto = {
  monthlyDays: number
  quarterlyDays: number
  halfYearlyDays: number
  yearlyDays: number
  defaultGracePeriodDays: number
  currency: string
}

export type SubscriptionDiscoveryDto = {
  upgradesEnabled: boolean
  showFreePlan: boolean
  featuredPlanCode: string | null
  recommendedPlanCode: string | null
  popularPlanCode: string | null
  allowDowngrade: boolean
  heroTitle: string
  heroSubtitle: string
}

export type PlanComparisonRow = {
  key: string
  label: string
  values: Record<string, string | number | boolean>
}

export type MomoNetworkDto = {
  code: 'mtn' | 'airtel'
  label: string
  accountName: string
  phoneNumber: string
  instructions: string
}

export const subscriptionsApi = {
  listPlans() {
    return apiGet<{
      discovery: SubscriptionDiscoveryDto
      billingPeriods: SubscriptionBillingPeriodsDto
      plans: SubscriptionPlanDto[]
      comparison: PlanComparisonRow[]
      payment: {
        enabled: boolean
        currency: string
        networks: MomoNetworkDto[]
        referenceFormat: string
        paymentInstructions: string
      }
      starter: SubscriptionPlanDto
      professional: SubscriptionPlanDto | null
      business: SubscriptionPlanDto | null
      free: SubscriptionPlanDto | null
    }>('/subscriptions/plans')
  },

  getPlanDetail(code: string) {
    return apiGet<{
      discovery: SubscriptionDiscoveryDto
      plan: SubscriptionPlanDto & {
        overview?: string
        idealCustomer?: string
        whyUpgrade?: string
        supportLevel?: string
        faq?: Array<{ q: string; a: string }>
      }
    }>(`/subscriptions/plans/${encodeURIComponent(code)}`)
  },

  getMine() {
    return apiGet<{
      subscription: Record<string, unknown> | null
      schedule?: {
        type: 'downgrade' | 'cancel'
        planCode: string | null
        effectiveAt: string | Date | null
        scheduledAt: string | Date | null
        currentPlanCode: string | null
      } | null
      currentSubscription?: {
        planCode: string | null
        planName: string | null
        status: string
        activatedOn: string | Date | null
        expiresOn: string | Date | null
        nextScheduledPlanCode: string | null
        nextScheduledAction: 'downgrade' | 'cancel' | null
        nextScheduledAt: string | Date | null
        autoRenew: boolean
        willNotRenew: boolean
        source: string | null
      } | null
      profile: Record<string, unknown>
      entitlements: Record<string, unknown> & {
        canApply: boolean
        hasActiveSubscription: boolean
        unlimitedCompletedJobs: boolean
        daysRemaining: number | null
        capabilities?: Record<string, boolean>
        limits?: Record<string, number>
        featureFlags?: Record<string, boolean>
        planName?: string | null
        planCode?: string | null
        lifecycleStatus?: string
      }
      timeline?: Record<string, unknown>
      badge?: SubscriptionBadgeDto | null
      plans: SubscriptionPlanDto[]
      starter: SubscriptionPlanDto | null
      payment: {
        enabled: boolean
        currency: string
        networks: MomoNetworkDto[]
        referenceFormat: string
        paymentInstructions: string
      }
      payments: Array<Record<string, unknown>>
      pendingPayment: { id: string; status: 'pending'; message: string } | null
      reminders: Record<string, unknown>
      developmentTransaction?: {
        enabled: boolean
        reason?: string
        platformMode?: string
        instructions?: string
        items: Array<{
          id: string
          code: string
          planCode: string
          status: string
          expiresAt: string
        }>
      }
    }>('/subscriptions/me')
  },

  scheduleDowngrade(planCode: string) {
    return apiPost<{
      subscription: Record<string, unknown> | null
      currentSubscription?: Record<string, unknown> | null
      schedule?: Record<string, unknown> | null
    }>('/subscriptions/me/schedule-downgrade', { planCode })
  },

  scheduleCancel() {
    return apiPost<{
      subscription: Record<string, unknown> | null
      currentSubscription?: Record<string, unknown> | null
      schedule?: Record<string, unknown> | null
    }>('/subscriptions/me/cancel', {})
  },

  clearScheduledChange() {
    return apiDelete<{
      subscription: Record<string, unknown> | null
      currentSubscription?: Record<string, unknown> | null
      schedule?: Record<string, unknown> | null
    }>('/subscriptions/me/scheduled-change')
  },

  listDevelopmentTransactions(planCode?: string) {
    return apiGet<{
      enabled: boolean
      reason?: string
      platformMode?: string
      instructions?: string
      items: Array<{
        id: string
        code: string
        planCode: string
        status: string
        expiresAt: string
      }>
    }>('/subscriptions/development-transactions', planCode ? { planCode } : undefined)
  },

  submitPayment(body: {
    planCode?: string
    billingPeriod?: BillingPeriod
    network: 'mtn' | 'airtel'
    payerMsisdn: string
    transactionId: string
    amount?: number
    screenshotUrl?: string
  }) {
    return apiPost<{
      payment: Record<string, unknown>
      message: string
      autoVerified?: boolean
      subscription?: Record<string, unknown>
    }>('/subscriptions/payments', body)
  },

  reminders() {
    return apiGet<{
      reminders: Array<{ key: string; title: string; body: string; severity: 'info' | 'warning' }>
    }>('/subscriptions/reminders')
  },
}
