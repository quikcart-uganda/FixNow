import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export const categoriesApi = {
  list(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/categories', params)
  },

  create(body: {
    name: string
    icon?: string
    description?: string
    sortOrder?: number
    slug?: string
    bannerImageUrl?: string
    accentColor?: string
    status?: 'active' | 'suspended' | 'archived'
    isActive?: boolean
  }) {
    return apiPost<{ category: Record<string, unknown> }>('/categories', body)
  },

  update(id: string, body: Record<string, unknown>) {
    return apiPatch<{ category: Record<string, unknown> }>(`/categories/${id}`, body)
  },

  remove(id: string) {
    return apiDelete<{ ok: boolean; category?: Record<string, unknown> }>(`/categories/${id}`)
  },

  reorder(orderedIds: string[]) {
    return apiPost<{ items: unknown[] }>('/categories/reorder', { orderedIds })
  },

  usage(id: string) {
    return apiGet<{ usage: Record<string, number>; category: Record<string, unknown> }>(
      `/categories/${id}/usage`,
    )
  },

  async uploadImage(file: File) {
    const { uploadMediaFile } = await import('./uploadMedia')
    return uploadMediaFile(file, 'category')
  },

  createSubcategory(body: Record<string, unknown>) {
    return apiPost<{ subcategory: Record<string, unknown> }>('/categories/subcategories', body)
  },

  updateSubcategory(id: string, body: Record<string, unknown>) {
    return apiPatch<{ subcategory: Record<string, unknown> }>(`/categories/subcategories/${id}`, body)
  },
}
