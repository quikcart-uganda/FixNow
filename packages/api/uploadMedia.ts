/**
 * Shared authenticated upload helper — Cloudinary-backed via POST /uploads.
 * Queues small files offline on native/web when connectivity is unavailable.
 */

import { http } from './client'

export type UploadResponse = {
  upload: {
    id?: string
    url: string
    mimeType?: string
    filename?: string
    originalName?: string
    sizeBytes?: number
    storage?: string
    publicId?: string
    width?: number
    height?: number
    format?: string
    resourceType?: string
    duplicate?: boolean
  }
}

export type UploadMediaOptions = {
  /** When flushing the offline queue, do not re-enqueue on failure. */
  skipOfflineQueue?: boolean
}

export async function uploadMediaFile(
  file: File | Blob,
  purpose?: string,
  fileName?: string,
  opts?: UploadMediaOptions,
): Promise<UploadResponse> {
  const form = new FormData()
  const name = fileName || (file instanceof File ? file.name : 'upload.bin')
  form.append('file', file, name)
  if (purpose) form.append('purpose', purpose)

  const allowQueue = !opts?.skipOfflineQueue
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  if (allowQueue && offline) {
    try {
      const { enqueueOfflineUpload } = await import('@fixnow/native')
      const queued = await enqueueOfflineUpload({
        file,
        purpose,
        fileName: name,
        label: purpose || 'upload',
      })
      if (queued.queued) {
        throw Object.assign(new Error('Saved offline — will sync when online'), {
          status: 0,
          code: 'UPLOAD_QUEUED_OFFLINE',
          queued: true,
        })
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'UPLOAD_QUEUED_OFFLINE') {
        throw err
      }
      /* fall through to online attempt */
    }
  }

  try {
    const res = await http.post('/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data as UploadResponse
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'UPLOAD_QUEUED_OFFLINE') {
      throw err
    }
    const status =
      err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) : undefined
    const networkish = status === 0 || status === 408 || status === 502 || status === 503 || status === 504
    if (allowQueue && networkish && file.size <= 4 * 1024 * 1024) {
      try {
        const { enqueueOfflineUpload } = await import('@fixnow/native')
        const queued = await enqueueOfflineUpload({ file, purpose, fileName: name })
        if (queued.queued) {
          throw Object.assign(new Error('Saved offline — will sync when online'), {
            status: 0,
            code: 'UPLOAD_QUEUED_OFFLINE',
            queued: true,
          })
        }
      } catch (inner) {
        if (
          inner &&
          typeof inner === 'object' &&
          'code' in inner &&
          (inner as { code: string }).code === 'UPLOAD_QUEUED_OFFLINE'
        ) {
          throw inner
        }
      }
    }
    throw err
  }
}
