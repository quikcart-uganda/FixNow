import { useCallback, useEffect, useRef, useState } from 'react'
import { messagesApi } from '@fixnow/api'
import { isNativePlatform, pickFromGallery, pickedImageToFile, takePhoto } from '@fixnow/native'
import {
  acceptAttachMime,
  acceptImageMime,
  MAX_AI_ATTACHMENTS,
  MAX_AI_FILE_BYTES,
} from './capabilities'
import { newAiId } from './roleCopy'
import type { AiAttachment } from './types'

function revokePreview(att: AiAttachment) {
  if (att.previewUrl?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(att.previewUrl)
    } catch {
      /* ignore */
    }
  }
}

async function uploadFile(file: File): Promise<{ url: string; mimeType?: string }> {
  const uploaded = await messagesApi.uploadImage(file)
  return { url: uploaded.upload.url, mimeType: uploaded.upload.mimeType }
}

export function useAiAttachments(options?: { allowFiles?: boolean; enabled?: boolean }) {
  const allowFiles = options?.allowFiles ?? false
  const enabled = options?.enabled ?? true
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(revokePreview)
    }
  }, [])

  const clear = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach(revokePreview)
      return []
    })
    setError(null)
  }, [])

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) revokePreview(target)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const enqueueFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!enabled) return
      setError(null)
      const list = Array.from(files)
      const room = MAX_AI_ATTACHMENTS - attachmentsRef.current.length
      if (room <= 0) {
        setError(`You can attach up to ${MAX_AI_ATTACHMENTS} files.`)
        return
      }

      const accepted = list.slice(0, room).filter((f) => {
        if (!acceptAttachMime(f, allowFiles)) {
          setError('That file type is not supported here.')
          return false
        }
        if (f.size > MAX_AI_FILE_BYTES) {
          setError('Each file must be under 8 MB.')
          return false
        }
        return true
      })

      for (const file of accepted) {
        const id = newAiId('att')
        const kind = acceptImageMime(file) ? 'image' : 'file'
        const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined
        const draft: AiAttachment = {
          id,
          kind,
          name: file.name || (kind === 'image' ? 'Photo' : 'Attachment'),
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          previewUrl,
          uploading: true,
          progress: 10,
        }
        setAttachments((prev) => [...prev, draft])

        try {
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, progress: 55 } : a)),
          )
          const uploaded = await uploadFile(file)
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    url: uploaded.url,
                    mimeType: uploaded.mimeType || a.mimeType,
                    uploading: false,
                    progress: 100,
                  }
                : a,
            ),
          )
        } catch {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, uploading: false, progress: 0, error: 'Upload failed' }
                : a,
            ),
          )
          setError('Could not upload attachment. Try again.')
        }
      }
    },
    [allowFiles, enabled],
  )

  const addFromCamera = useCallback(async () => {
    if (!enabled) return
    setError(null)
    try {
      if (isNativePlatform()) {
        const photo = await takePhoto()
        if (!photo) return
        const file = pickedImageToFile(photo, 'camera')
        if (file) await enqueueFiles([file])
        return
      }
      // Web: use capture input — callers should also provide a hidden input.
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment'
      input.onchange = () => {
        if (input.files?.length) void enqueueFiles(input.files)
      }
      input.click()
    } catch {
      setError('Camera permission was denied or unavailable.')
    }
  }, [enabled, enqueueFiles])

  const addFromGallery = useCallback(async () => {
    if (!enabled) return
    setError(null)
    try {
      if (isNativePlatform()) {
        const photo = await pickFromGallery()
        if (!photo) return
        const file = pickedImageToFile(photo, 'gallery')
        if (file) await enqueueFiles([file])
        return
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = allowFiles ? 'image/*,.pdf,.doc,.docx,.txt' : 'image/*'
      input.multiple = true
      input.onchange = () => {
        if (input.files?.length) void enqueueFiles(input.files)
      }
      input.click()
    } catch {
      setError('Could not open your photo library.')
    }
  }, [allowFiles, enabled, enqueueFiles])

  const readyAttachments = attachments.filter((a) => a.url && !a.uploading && !a.error)
  const busy = attachments.some((a) => a.uploading)

  return {
    attachments,
    readyAttachments,
    busy,
    error,
    setError,
    clear,
    remove,
    enqueueFiles,
    addFromCamera,
    addFromGallery,
  }
}
