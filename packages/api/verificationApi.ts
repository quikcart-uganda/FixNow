import { apiGet, apiPost } from './client'

export type VerificationQueueItem = {
  id: string
  kind: 'identity' | 'skill' | 'certification'
  technicianId: string
  technicianName: string
  documentType: string
  verificationType: string
  documentUrls: string[]
  selfieUrl?: string
  status: string
  lc1Ready?: boolean
  lc1Reference?: string
  submittedAt?: string
  reviewedAt?: string
  reviewNotes?: string
  assignedReviewerId?: string
  assignedReviewer?: string
  history?: Array<{ at?: string; status: string; note?: string; by?: string }>
  name?: string
  issuer?: string
}

export const verificationApi = {
  list(params?: { status?: string; q?: string; page?: number; limit?: number }) {
    return apiGet<{
      items: VerificationQueueItem[]
      meta?: Record<string, unknown>
      capabilities?: { documentTypes: string[]; actions: string[] }
    }>('/verification/requests', params)
  },

  review(id: string, body: { decision: 'approve' | 'reject' | 'request_info'; notes?: string; kind?: string }) {
    return apiPost(`/verification/requests/${id}/review`, body)
  },

  submit(body: Record<string, unknown>) {
    return apiPost('/verification/requests', body)
  },
}
