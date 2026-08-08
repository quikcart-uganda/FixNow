import { apiGet, apiPatch, apiPost, apiPut } from './client'

export const adminApi = {
  getDashboard() {
    return apiGet<Record<string, unknown>>('/admin/dashboard')
  },

  marketplaceMetrics(params?: { days?: number }) {
    return apiGet<Record<string, unknown>>('/admin/marketplace/metrics', params)
  },

  listUsers(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/admin/users', params)
  },

  getCustomer(id: string) {
    return apiGet(`/admin/customers/${id}`)
  },

  listTechnicians(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/admin/technicians', params)
  },

  getTechnician(id: string) {
    return apiGet(`/admin/technicians/${id}`)
  },

  updateTechnician(id: string, body: Record<string, unknown>) {
    return apiPatch(`/admin/technicians/${id}`, body)
  },

  suspendTechnician(id: string, reason?: string) {
    return apiPost(`/admin/technicians/${id}/suspend`, { reason })
  },

  lockTechnician(id: string, reason?: string) {
    return apiPost(`/admin/technicians/${id}/lock`, { reason })
  },

  unlockTechnician(id: string) {
    return apiPost(`/admin/technicians/${id}/unlock`)
  },

  overrideFreeJobs(
    id: string,
    body: {
      freeJobLimit?: number
      remainingFreeJobs?: number
      promotionalFreeJobs?: number
      grantBonusJobs?: number
      unlock?: boolean
      suspendMonetization?: boolean
      subscriptionPlanCode?: string | null
      subscriptionStatus?: string
    },
  ) {
    return apiPost(`/admin/technicians/${id}/free-jobs`, body)
  },

  resetTechnicianQuota(id: string) {
    return apiPost(`/admin/technicians/${id}/free-jobs/reset`)
  },

  grantBonusJobs(id: string, count: number) {
    return apiPost(`/admin/technicians/${id}/free-jobs/bonus`, { count })
  },

  getTechnicianQuota(id: string) {
    return apiGet<Record<string, unknown>>(`/admin/technicians/${id}/quota`)
  },

  updateFreeJobConfig(body: Record<string, unknown>) {
    return apiPut('/admin/settings/free-jobs', body)
  },

  getProfileCompletionConfig() {
    return apiGet<{
      reminderThreshold: number
      requireMinCompletionToApply: boolean
      minApplyPercent: number
      reminderFrequencyDays: number
    }>('/admin/settings/profile-completion')
  },

  updateProfileCompletionConfig(body: Record<string, unknown>) {
    return apiPut('/admin/settings/profile-completion', body)
  },

  listJobs(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/admin/jobs', params)
  },

  listApplications(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/admin/applications', params)
  },

  updateUserStatus(id: string, body: Record<string, unknown>) {
    return apiPatch(`/admin/users/${id}/status`, body)
  },

  suspendUser(id: string, reason?: string) {
    return apiPost(`/admin/users/${id}/suspend`, { reason })
  },

  unlockUser(id: string) {
    return apiPost(`/admin/users/${id}/unlock`)
  },

  forceLogout(id: string) {
    return apiPost(`/admin/users/${id}/force-logout`)
  },

  resetPassword(id: string, newPassword: string) {
    return apiPost(`/admin/users/${id}/reset-password`, { newPassword })
  },

  recomputeTrust(id: string) {
    return apiPost(`/technicians/${id}/trust-score/recompute`)
  },

  identityCatalogue() {
    return apiGet<{
      roles: Array<{ key: string; name: string; description: string; permissionKeys: string[] }>
      productionRoles: Array<{ key: string; name: string; description: string; permissionKeys: string[] }>
      permissions: Array<{ key: string; name: string; description: string; module: string }>
      statuses: string[]
    }>('/admin/identity/catalogue')
  },

  getDevelopmentAccess() {
    return apiGet<{
      transitionCompleted: boolean
      allowDevLogin: boolean
      loginEnabled: boolean
      envAllowsDevAdminLogin: boolean
      productionLocked: boolean
      statusLabel: string
      transitionCompletedAt?: string | null
      lastChangedAt?: string | null
      history: Array<{ at: string; actorId: string | null; action: string; reason?: string }>
    }>('/admin/security/development-access')
  },

  updateDevelopmentAccess(body: { allowDevLogin: boolean; reason?: string }) {
    return apiPut('/admin/security/development-access', body)
  },

  getDevelopmentLoginHistory() {
    return apiGet<{
      items: Array<{
        id: string
        email: string
        success: boolean
        reason?: string
        ip?: string
        userAgent?: string
        createdAt: string
      }>
    }>('/admin/security/development-access/login-history')
  },

  bootstrapStatus() {
    return apiGet<{
      completed: boolean
      devLoginEnabled: boolean
    }>('/admin/identity/bootstrap-status')
  },

  bootstrapFirstAdmin(body: { email: string; fullName: string; password: string; phone?: string }) {
    return apiPost<{
      userId: string
      adminUserId: string
      email: string
      bootstrapRecoveryKey: string
      message: string
    }>('/admin/identity/bootstrap', body)
  },

  listAdmins(params?: Record<string, unknown>) {
    return apiGet<{
      items: Array<{
        id: string
        userId: string
        email: string
        fullName: string
        phone: string
        department: string
        role: string
        permissions: string[]
        status: string
        isActive: boolean
        mfaEnabled: boolean
        lastLoginAt: string | null
        createdAt: string
      }>
      meta?: Record<string, unknown>
    }>('/admin/admins', params)
  },

  inviteAdmin(body: {
    email: string
    fullName: string
    phone?: string
    department?: string
    adminRoleKey: string
    permissionKeys?: string[]
  }) {
    return apiPost<{
      invitationId: string
      email: string
      role: string
      expiresAt: string
      acceptToken?: string
      acceptUrl?: string
    }>('/admin/admins/invite', body)
  },

  acceptAdminInvite(body: { token: string; password: string }) {
    return apiPost<{ userId: string; email: string; role: string; message: string }>(
      '/admin/admins/accept-invite',
      body,
    )
  },

  updateAdminStatus(id: string, status: string, reason?: string) {
    return apiPatch(`/admin/admins/${id}/status`, { status, reason })
  },

  updateAdminPermissions(
    id: string,
    body: { adminRoleKey?: string; permissionKeys?: string[]; department?: string },
  ) {
    return apiPatch(`/admin/admins/${id}/permissions`, body)
  },

  adminLoginHistory(id: string) {
    return apiGet<{ items: Array<Record<string, unknown>> }>(`/admin/admins/${id}/login-history`)
  },

  auditLogs(params?: {
    actorId?: string
    action?: string
    resourceType?: string
    severity?: 'info' | 'warning' | 'critical'
    page?: number
    limit?: number
  }) {
    return apiGet<{
      items: Array<{
        id: string
        actorId: string | null
        actorRole: string | null
        action: string
        resourceType: string
        resourceId: string | null
        ip: string | null
        severity: 'info' | 'warning' | 'critical'
        meta: Record<string, unknown> | null
        createdAt: string
      }>
      meta?: Record<string, unknown>
    }>('/audit-logs', params)
  },

  generateRecoveryCodes() {
    return apiPost<{ codes: string[]; message: string }>('/admin/me/recovery-codes')
  },

  completeAdminRecovery(body: { recoveryToken: string; newPassword: string }) {
    return apiPost('/admin/recovery/complete', body)
  },

  getSubscriptionCatalogue() {
    return apiGet<{
      plans: Array<Record<string, unknown>>
      featureMatrix: {
        flags: Array<{ feature: string; starter: boolean; professional: boolean; business: boolean }>
        limits: Array<{ feature: string; starter: number; professional: number; business: number }>
        plans: Array<Record<string, unknown>>
      }
      momo: Record<string, unknown>
      reminders: Record<string, unknown>
      discovery?: Record<string, unknown>
      billingPeriods?: {
        monthlyDays: number
        quarterlyDays: number
        halfYearlyDays: number
        yearlyDays: number
        defaultGracePeriodDays: number
        currency: string
      }
    }>('/admin/subscriptions/catalogue')
  },

  updateSubscriptionPlan(id: string, body: Record<string, unknown>) {
    return apiPatch(`/admin/subscriptions/plans/${id}`, body)
  },

  listSubscriptionPayments(params?: { status?: string; page?: number; limit?: number }) {
    return apiGet<{ items: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
      '/admin/subscriptions/payments',
      params,
    )
  },

  approveSubscriptionPayment(id: string, note?: string) {
    return apiPost(`/admin/subscriptions/payments/${id}/approve`, { note })
  },

  rejectSubscriptionPayment(id: string, note?: string) {
    return apiPost(`/admin/subscriptions/payments/${id}/reject`, { note })
  },

  listSubscriptions(params?: { status?: string; page?: number; limit?: number }) {
    return apiGet<{ items: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
      '/admin/subscriptions',
      params,
    )
  },

  manageTechnicianSubscription(userId: string, body: Record<string, unknown>) {
    return apiPost(`/admin/subscriptions/technicians/${userId}/manage`, body)
  },

  getSubscriptionMomo() {
    return apiGet<Record<string, unknown>>('/admin/subscriptions/momo')
  },

  updateSubscriptionMomo(body: Record<string, unknown>) {
    return apiPut('/admin/subscriptions/momo', body)
  },

  getSubscriptionReminders() {
    return apiGet<Record<string, unknown>>('/admin/subscriptions/reminders')
  },

  updateSubscriptionReminders(body: Record<string, unknown>) {
    return apiPut('/admin/subscriptions/reminders', body)
  },

  getSubscriptionAnalytics() {
    return apiGet<{
      revenue30d: number
      currency: string
      activeSubscriptions: number
      byPlan: Record<string, number>
      popularPlan: string | null
      pendingPayments: number
      expired: number
      gracePeriod: number
      renewals30d: number
      boosts: { pending: number; active: number; revenue: number }
    }>('/admin/subscriptions/analytics')
  },

  getSubscriptionDiscovery() {
    return apiGet<Record<string, unknown>>('/admin/subscriptions/discovery')
  },

  updateSubscriptionDiscovery(body: Record<string, unknown>) {
    return apiPut('/admin/subscriptions/discovery', body)
  },

  getSubscriptionBillingPeriods() {
    return apiGet<{
      monthlyDays: number
      quarterlyDays: number
      halfYearlyDays: number
      yearlyDays: number
      defaultGracePeriodDays: number
      currency: string
    }>('/admin/subscriptions/billing-periods')
  },

  updateSubscriptionBillingPeriods(body: Record<string, unknown>) {
    return apiPut('/admin/subscriptions/billing-periods', body)
  },

  listMarketingCreatives(params?: { status?: string; kind?: string; page?: number; limit?: number }) {
    return apiGet<{ items: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
      '/admin/marketing/creatives',
      params,
    )
  },

  moderateMarketingCreative(id: string, action: 'approve' | 'reject' | 'request_changes', note?: string) {
    return apiPost(`/admin/marketing/creatives/${id}/moderate`, { action, note })
  },
}

export const dashboardApi = {
  admin() {
    return adminApi.getDashboard()
  },
  adminMetrics(days?: number) {
    return adminApi.marketplaceMetrics({ days })
  },
  technician() {
    return apiGet<Record<string, unknown>>('/technicians/me/dashboard')
  },
  platformAnalytics() {
    return apiGet<Record<string, unknown>>('/analytics/platform')
  },
}
