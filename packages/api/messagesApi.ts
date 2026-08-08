import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export const messagesApi = {
  listConversations(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/conversations', params)
  },

  ensureForJob(jobId: string) {
    return apiPost<{ conversation: Record<string, unknown> }>(`/conversations/job/${jobId}`)
  },

  getConversation(id: string, params?: Record<string, unknown>) {
    return apiGet<{
      conversation: Record<string, unknown>
      items: Array<{ message: Record<string, unknown>; attachments?: unknown[] }>
      participants?: unknown[]
      canSend?: boolean
      editWindowMs?: number
      meta?: Record<string, unknown>
    }>(`/conversations/${id}`, params)
  },

  listMessages(id: string, params?: Record<string, unknown>) {
    return apiGet(`/conversations/${id}/messages`, params)
  },

  send(body: {
    conversationId: string
    body: string
    type?: string
    clientMessageId?: string
    attachmentUrl?: string
    attachmentMimeType?: string
    location?: { lat: number; lng: number; label?: string }
  }) {
    return apiPost<{ message: Record<string, unknown>; conversation: Record<string, unknown> }>(
      '/messages',
      body,
    )
  },

  edit(id: string, body: string) {
    return apiPatch<{ message: Record<string, unknown> }>(`/messages/${id}`, { body })
  },

  remove(id: string) {
    return apiDelete<{ messageId: string }>(`/messages/${id}`)
  },

  markRead(conversationId: string) {
    return apiPost(`/conversations/${conversationId}/read`)
  },

  markDelivered(messageId: string) {
    return apiPost(`/messages/${messageId}/delivered`)
  },

  archive(conversationId: string) {
    return apiPost(`/conversations/${conversationId}/archive`)
  },

  reopen(conversationId: string) {
    return apiPost(`/conversations/${conversationId}/reopen`)
  },

  async uploadImage(file: File) {
    const { uploadMediaFile } = await import('./uploadMedia')
    return uploadMediaFile(file, 'chat')
  },
}
