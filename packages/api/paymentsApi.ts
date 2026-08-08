import { apiDelete, apiGet, apiPost } from './client'

export const paymentsApi = {
  providers() {
    return apiGet<{ providers: string[]; defaultProvider: string }>('/payments/providers')
  },

  wallet() {
    return apiGet<{ wallet: Record<string, unknown> }>('/payments/wallet')
  },

  transactions(params?: Record<string, unknown>) {
    return apiGet<{ items: Record<string, unknown>[]; meta?: Record<string, unknown> }>(
      '/payments/transactions',
      params,
    )
  },

  getTransaction(id: string) {
    return apiGet<{ transaction: Record<string, unknown> }>(`/payments/transactions/${id}`)
  },

  receipt(id: string) {
    return apiGet<{ receipt: Record<string, unknown> }>(`/payments/transactions/${id}/receipt`)
  },

  pay(body: {
    jobId: string
    provider?: string
    msisdn?: string
    amount?: number
    idempotencyKey?: string
    useWallet?: boolean
  }) {
    return apiPost<{
      transaction: Record<string, unknown>
      escrow?: Record<string, unknown> | null
      idempotent?: boolean
    }>('/payments/pay', body)
  },

  listMethods() {
    return apiGet<{ items: Record<string, unknown>[] }>('/payments/methods')
  },

  upsertMethod(body: {
    provider: 'mtn' | 'airtel'
    msisdn: string
    accountName: string
    isDefault?: boolean
  }) {
    return apiPost<{ account: Record<string, unknown> }>('/payments/methods', body)
  },

  removeMethod(id: string) {
    return apiDelete(`/payments/methods/${id}`)
  },

  escrowForJob(jobId: string) {
    return apiGet<{ escrow: Record<string, unknown> | null; transactions: Record<string, unknown>[] }>(
      `/escrow/jobs/${jobId}`,
    )
  },

  listEscrow(params?: Record<string, unknown>) {
    return apiGet<{ items: Record<string, unknown>[]; meta?: Record<string, unknown> }>('/escrow', params)
  },

  requestRefund(body: { jobId: string; amount?: number; reason?: string }) {
    return apiPost('/escrow/refunds', body)
  },

  openDispute(body: { jobId: string; reason: string }) {
    return apiPost('/escrow/disputes', body)
  },

  earnings() {
    return apiGet<{
      wallet: Record<string, unknown>
      summary: Record<string, unknown>
      pendingPayouts: Record<string, unknown>[]
      completedPayouts: Record<string, unknown>[]
      ledger: Record<string, unknown>[]
    }>('/payouts/earnings')
  },

  requestPayout(body: { amount: number; msisdn?: string; provider?: string }) {
    return apiPost('/payouts/request', body)
  },

  adminPaymentDashboard() {
    return apiGet<{ dashboard: Record<string, unknown> }>('/admin/payments/dashboard')
  },

  adminPayments(params?: Record<string, unknown>) {
    return apiGet<{ items: Record<string, unknown>[]; meta?: Record<string, unknown> }>(
      '/admin/payments',
      params,
    )
  },

  adminPendingRefunds(params?: Record<string, unknown>) {
    return apiGet<{ items: Record<string, unknown>[]; meta?: Record<string, unknown> }>(
      '/admin/refunds/pending',
      params,
    )
  },

  adminEscrowDashboard() {
    return apiGet<{ dashboard: Record<string, unknown> }>('/admin/escrow/dashboard')
  },

  adminSettlements(days = 30) {
    return apiGet<{
      report: {
        period?: { days: number; since: string; until: string }
        summary?: Record<string, unknown>
        series?: Record<string, unknown>
        breakdowns?: Record<string, unknown>
        recent?: Record<string, unknown>[]
        /** @deprecated legacy debug shape — no longer returned */
        days?: number
        since?: string
        byType?: unknown[]
        escrowHeld?: unknown
      }
    }>('/admin/settlements', { days })
  },

  adminPendingPayouts(params?: Record<string, unknown>) {
    return apiGet<{ items: Record<string, unknown>[]; meta?: Record<string, unknown> }>(
      '/admin/payouts/pending',
      params,
    )
  },

  approvePayout(id: string) {
    return apiPost(`/admin/payouts/${id}/approve`, {})
  },

  approveRefund(id: string) {
    return apiPost(`/escrow/refunds/${id}/approve`, {})
  },

  resolveDispute(body: { jobId: string; action: 'release' | 'refund'; amount?: number; reason?: string }) {
    return apiPost('/escrow/disputes/resolve', body)
  },
}
