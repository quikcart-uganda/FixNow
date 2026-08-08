import { apiDelete, apiGet, apiPost } from './client'
import { aiStatusCircuit, CircuitOpenError } from './reliability/circuitBreaker'

export type AiAssistantRole = 'customer' | 'technician' | 'admin'

export interface AiChatContext {
  screen?: string
  jobId?: string
  technicianId?: string
  categoryId?: string
  district?: string
  query?: string
  budgetMin?: number
  budgetMax?: number
  [key: string]: unknown
}

export type AiInputMode = 'text' | 'voice' | 'image'

export interface AiChatAttachment {
  kind: 'image' | 'file' | 'voice' | string
  name: string
  url?: string
  mimeType?: string
}

export interface AiChatResult {
  ok: boolean
  role: AiAssistantRole
  message: string
  provider: string
  model?: string
  disabled: boolean
  conversationId?: string
  intentTools: string[]
  toolResults: Array<{ tool: string; label?: string; ok: boolean; summary: string }>
  suggestions: string[]
  deepLinks?: Array<{ label: string; href: string }>
  pendingActions?: Array<{
    id: string
    tool: string
    workflowId: string
    title: string
    summary: string
    expiresAt: string
    status: string
  }>
  navigateTo?: string
  error?: string
  safetyFlags?: string[]
}

export type AiChatRequest = {
  message: string
  conversationId?: string
  context?: AiChatContext
  inputMode?: AiInputMode
  attachments?: AiChatAttachment[]
}

export interface AiStatus {
  enabled: boolean
  provider: string
  providerConfigured?: boolean
  mode?: 'full' | 'local' | string
  model: string
  conversationHistoryEnabled: boolean
  roles: {
    customer: boolean
    technician: boolean
    admin: boolean
  }
  note: string
}

const DISABLED_STATUS: AiStatus = {
  enabled: false,
  provider: 'none',
  model: '',
  conversationHistoryEnabled: false,
  roles: { customer: false, technician: false, admin: false },
  note: 'AI temporarily unavailable',
}

export const aiApi = {
  async status() {
    const circuit = aiStatusCircuit()
    if (!circuit.allow()) {
      return { data: DISABLED_STATUS, message: 'Circuit open', meta: { degraded: true } }
    }
    try {
      const res = await apiGet<AiStatus>('/ai/status', undefined, {
        timeoutMs: 8_000,
        skipRetry: false,
      })
      circuit.recordSuccess()
      return res
    } catch (err) {
      if (!(err instanceof CircuitOpenError)) circuit.recordFailure()
      return { data: DISABLED_STATUS, message: 'AI status unavailable', meta: { degraded: true } }
    }
  },

  chatCustomer(body: AiChatRequest, signal?: AbortSignal) {
    return apiPost<AiChatResult>('/ai/customer/chat', body, { timeoutMs: 60_000, signal, skipRetry: true })
  },

  chatGuest(
    body: AiChatRequest & { guestSessionId?: string },
    signal?: AbortSignal,
  ) {
    return apiPost<AiChatResult>('/ai/guest/chat', body, { timeoutMs: 60_000, signal, skipRetry: true })
  },

  chatTechnician(body: AiChatRequest, signal?: AbortSignal) {
    return apiPost<AiChatResult>('/ai/technician/chat', body, { timeoutMs: 60_000, signal, skipRetry: true })
  },

  chatAdmin(body: AiChatRequest, signal?: AbortSignal) {
    return apiPost<AiChatResult>('/ai/admin/chat', body, { timeoutMs: 60_000, signal, skipRetry: true })
  },

  listConversations() {
    return apiGet<{ items: Record<string, unknown>[] }>('/ai/conversations')
  },

  createConversation(title?: string) {
    return apiPost<Record<string, unknown>>('/ai/conversations', title ? { title } : {})
  },

  listMessages(conversationId: string) {
    return apiGet<{ items: Record<string, unknown>[] }>(`/ai/conversations/${conversationId}/messages`)
  },

  deleteConversation(conversationId: string) {
    return apiDelete<{ ok: boolean }>(`/ai/conversations/${conversationId}`)
  },

  confirmAction(actionId: string) {
    return apiPost<{
      action: Record<string, unknown>
      result: { summary: string; deepLinks?: Array<{ label: string; href: string }> }
    }>(`/ai/actions/${encodeURIComponent(actionId)}/confirm`, {})
  },

  cancelAction(actionId: string) {
    return apiPost<{ id: string; status: string }>(`/ai/actions/${encodeURIComponent(actionId)}/cancel`, {})
  },

  async transcribe(file: File, signal?: AbortSignal) {
    const form = new FormData()
    form.append('file', file, file.name || 'voice.webm')
    const { http } = await import('./client')
    const res = await http.post('/ai/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
      signal,
    })
    return res.data.data as {
      text: string
      provider: string
      model?: string
      upload: { url: string; mimeType?: string; id?: string }
    }
  },
}
