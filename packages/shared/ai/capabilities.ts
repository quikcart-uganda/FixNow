import { isNativePlatform } from '@fixnow/native'
import type { AiMediaCapabilities } from './types'

function hasMediaDevices(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== 'undefined'
}

function hasSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      .SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  )
}

function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Capability probe for composer controls.
 * Unsupported features stay soft-disabled rather than fake.
 */
export function detectAiMediaCapabilities(): AiMediaCapabilities {
  const native = (() => {
    try {
      return isNativePlatform()
    } catch {
      return false
    }
  })()

  const images = typeof FileReader !== 'undefined'
  const camera = native || hasMediaDevices() || (typeof document !== 'undefined' && 'capture' in document.createElement('input'))
  const voiceRecord = hasMediaDevices() && hasMediaRecorder()
  const speechRecognition = hasSpeechRecognition()
  const fileAttach = typeof File !== 'undefined' && typeof FormData !== 'undefined'
  const dragDrop = typeof window !== 'undefined' && !isCoarsePointer()
  const pasteImages = typeof window !== 'undefined' && typeof ClipboardEvent !== 'undefined'

  return {
    images,
    camera,
    voiceRecord,
    speechRecognition,
    fileAttach,
    dragDrop,
    pasteImages,
  }
}

export function acceptImageMime(file: File): boolean {
  return /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)
}

export function acceptAttachMime(file: File, allowFiles: boolean): boolean {
  if (acceptImageMime(file)) return true
  if (!allowFiles) return false
  return (
    /^application\/(pdf|msword|vnd\.)/i.test(file.type) ||
    /^text\//i.test(file.type) ||
    /\.(pdf|doc|docx|txt|csv)$/i.test(file.name)
  )
}

export const MAX_AI_ATTACHMENTS = 4
export const MAX_AI_FILE_BYTES = 8 * 1024 * 1024
