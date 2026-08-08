import { apiGet, apiPost, apiPatch, apiPut } from './client'

export type BoostProductDto = {
  id: string
  code: string
  type: string
  name: string
  description: string
  benefits: string[]
  currency: string
  price: number
  durationHours: number
  durationLabel: string
  weight: number
  priority: number
  sortOrder: number
  isActive: boolean
  isVisible: boolean
  eligiblePlans: string[]
  districts: string[]
  allowTechnicianDistrictPick: boolean
  maxConcurrentPurchases: number
  estimatedVisibilityLiftPercent: number
  placements: string[]
}

export const boostsApi = {
  listProducts() {
    return apiGet<{
      enabled: boolean
      maxCombinedWeight: number
      eligibilityPlan: string
      products: BoostProductDto[]
      payment: Record<string, unknown>
    }>('/boosts/products')
  },

  listMine() {
    return apiGet<{
      enabled: boolean
      maxCombinedWeight: number
      eligibilityPlan: string
      products: BoostProductDto[]
      payment: Record<string, unknown>
      active: Array<Record<string, unknown>>
      pending: Array<Record<string, unknown>>
      history: Array<Record<string, unknown>>
    }>('/boosts/me')
  },

  submitPurchase(body: {
    productId: string
    network: 'mtn' | 'airtel'
    payerMsisdn: string
    transactionId: string
    districts?: string[]
    screenshotUrl?: string
  }) {
    return apiPost<{ purchase: Record<string, unknown>; message: string }>('/boosts/purchases', body)
  },

  track(id: string, event: 'view' | 'click' | 'enquiry' | 'application' | 'conversion') {
    return apiPost(`/boosts/purchases/${id}/track`, { event })
  },
}

export const adminBoostsApi = {
  catalogue() {
    return apiGet<{
      settings: { enabled: boolean; maxCombinedWeight: number; currency: string }
      products: BoostProductDto[]
    }>('/admin/boosts/catalogue')
  },

  updateProduct(id: string, body: Record<string, unknown>) {
    return apiPatch(`/admin/boosts/products/${id}`, body)
  },

  updateSettings(body: Record<string, unknown>) {
    return apiPut('/admin/boosts/settings', body)
  },

  listPurchases(params?: { status?: string; page?: number; limit?: number }) {
    return apiGet<{ items: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
      '/admin/boosts/purchases',
      params,
    )
  },

  approve(id: string, note?: string) {
    return apiPost(`/admin/boosts/purchases/${id}/approve`, { note })
  },

  reject(id: string, note?: string) {
    return apiPost(`/admin/boosts/purchases/${id}/reject`, { note })
  },
}
