import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type PublicContentPage = {
  id: string
  title: string
  slug: string
  category: string
  audience: string
  bodyHtml: string
  bodyMarkdown?: string
  excerpt?: string
  heroImageUrl?: string
  attachments?: Array<{ name: string; url: string; mimeType?: string; sizeBytes?: number }>
  seoTitle?: string
  seoDescription?: string
  keywords?: string[]
  language: string
  version: number
  status: string
  publishedAt?: string | null
  updatedAt?: string
  sortOrder?: number
  scheduledPublishAt?: string | null
  archivedAt?: string | null
  createdBy?: string
  updatedBy?: string
  publishedBy?: string
  createdAt?: string
  isSystem?: boolean
  revisionHistory?: Array<{
    version: number
    title: string
    status: string
    snapshotAt: string
    actorId?: string
    note?: string
  }>
}

export type ContentWriteBody = {
  title?: string
  slug?: string
  category?: string
  audience?: string
  bodyHtml?: string
  bodyMarkdown?: string
  excerpt?: string
  heroImageUrl?: string
  seoTitle?: string
  seoDescription?: string
  keywords?: string[]
  language?: string
  status?: string
  scheduledPublishAt?: string | null
  sortOrder?: number
}

export const contentApi = {
  getPublic(slug: string, params?: { language?: string; audience?: string }) {
    return apiGet<{ page: PublicContentPage; cached?: boolean }>(`/public/content/${encodeURIComponent(slug)}`, params)
  },

  listPublic(params?: Record<string, unknown>) {
    return apiGet<{ items: PublicContentPage[]; meta?: Record<string, unknown> }>('/public/content', params)
  },

  search(params: { q: string; language?: string; audience?: string; category?: string }) {
    return apiGet<{ items: PublicContentPage[]; cached?: boolean }>('/public/content/search', params)
  },

  listAdmin(params?: Record<string, unknown>) {
    return apiGet<{ items: PublicContentPage[]; meta?: Record<string, unknown> }>('/admin/content', params)
  },

  getAdmin(id: string) {
    return apiGet<{ page: PublicContentPage }>(`/admin/content/${id}`)
  },

  create(body: ContentWriteBody & { title: string }) {
    return apiPost<{ page: PublicContentPage }>('/admin/content', body)
  },

  update(id: string, body: ContentWriteBody) {
    return apiPatch<{ page: PublicContentPage }>(`/admin/content/${id}`, body)
  },

  publish(id: string) {
    return apiPost<{ page: PublicContentPage }>(`/admin/content/${id}/publish`, {})
  },

  unpublish(id: string) {
    return apiPost<{ page: PublicContentPage }>(`/admin/content/${id}/unpublish`, {})
  },

  archive(id: string) {
    return apiPost<{ page: PublicContentPage }>(`/admin/content/${id}/archive`, {})
  },

  restore(id: string, version?: number) {
    return apiPost<{ page: PublicContentPage }>(`/admin/content/${id}/restore`, version ? { version } : {})
  },

  duplicate(id: string) {
    return apiPost<{ page: PublicContentPage }>(`/admin/content/${id}/duplicate`, {})
  },

  remove(id: string) {
    return apiDelete<{ ok: boolean }>(`/admin/content/${id}`)
  },

  seed() {
    return apiPost<{ created: number; total: number }>('/admin/content/seed', {})
  },
}

export const accountDeletionApi = {
  getPolicy(params?: { language?: string }) {
    return apiGet<{
      page: PublicContentPage
      confirmPhrase: string
      coolingOffHours: number
      deleted: string[]
      retained: string[]
      recoveryNote: string
      irreversibleNote: string
    }>('/public/account/deletion-policy', params)
  },

  getStatus() {
    return apiGet<{
      request: null | {
        id: string
        status: string
        coolingOffEndsAt?: string
        processedAt?: string
        completedAt?: string
        cancelledAt?: string
        policyVersion: number
        deletedSummary?: string[]
        retainedSummary?: string[]
        createdAt?: string
      }
    }>('/account/deletion')
  },

  request(body: { confirmPhrase: string; reason?: string }) {
    return apiPost<{ request: Record<string, unknown> }>('/account/deletion', body)
  },

  cancel() {
    return apiPost<{ request: { id: string; status: string } }>('/account/deletion/cancel', {})
  },

  listAdmin() {
    return apiGet<{ items: Array<Record<string, unknown>> }>('/admin/account-deletions')
  },

  processDue() {
    return apiPost<{ processed: number }>('/admin/account-deletions/process', {})
  },
}
