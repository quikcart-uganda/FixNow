import type { AiAssistantRole, AiChatContext } from '@fixnow/api'

export type { AiAssistantRole, AiChatContext }

export type AiAttachmentKind = 'image' | 'file' | 'voice'

export type AiAttachment = {
  id: string
  kind: AiAttachmentKind
  name: string
  mimeType: string
  sizeBytes?: number
  /** Local preview URL (blob:) — revoked after send when possible */
  previewUrl?: string
  /** Uploaded CDN/server URL when available */
  url?: string
  /** Voice-only: duration in seconds */
  durationSec?: number
  /** Upload progress 0–100 */
  progress?: number
  uploading?: boolean
  error?: string
}

export type AiTurn = {
  id: string
  sender: 'user' | 'assistant'
  text: string
  createdAt: string
  attachments?: AiAttachment[]
  inputMode?: 'text' | 'voice' | 'image'
  tools?: Array<{ tool: string; label?: string; ok: boolean; summary: string }>
  suggestions?: string[]
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
}

export type AiConversationSummary = {
  id: string
  title: string
  updatedAt?: string
  pinned?: boolean
}

export type AiPanelMode = 'landing' | 'conversation'

export type AiComposerPayload = {
  text: string
  attachments: AiAttachment[]
  inputMode: 'text' | 'voice' | 'image'
}

export type AiMediaCapabilities = {
  images: boolean
  camera: boolean
  voiceRecord: boolean
  speechRecognition: boolean
  fileAttach: boolean
  dragDrop: boolean
  pasteImages: boolean
}

export type AiLocalPrefs = {
  showMic: boolean
  showCamera: boolean
  compactComposer: boolean
}
