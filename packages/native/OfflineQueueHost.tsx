import { useEffect, useState } from 'react'
import { http } from '@fixnow/api'
import { uploadMediaFile } from '@fixnow/api/uploadMedia'
import {
  initAutoResync,
  listOfflineUploads,
  listQueued,
  setOfflineQueueExecutor,
  setOfflineUploadExecutor,
  subscribeOfflineQueue,
  subscribeOfflineUploads,
  triggerResync,
  type QueuedRequest,
} from '@fixnow/native'

async function executeQueued(item: QueuedRequest) {
  await http.request({
    method: item.method,
    url: item.url,
    data: item.body,
  })
}

export function OfflineQueueHost() {
  const [pending, setPending] = useState(0)

  useEffect(() => {
    setOfflineQueueExecutor(executeQueued)
    setOfflineUploadExecutor((file, purpose) =>
      uploadMediaFile(file, purpose, undefined, { skipOfflineQueue: true }),
    )
    initAutoResync()

    const refresh = async () => {
      try {
        const [mutations, uploads] = await Promise.all([listQueued(), listOfflineUploads()])
        setPending((Array.isArray(mutations) ? mutations.length : 0) + (Array.isArray(uploads) ? uploads.length : 0))
      } catch {
        setPending(0)
      }
    }

    void refresh()
    const unsubA = subscribeOfflineQueue(() => void refresh())
    const unsubB = subscribeOfflineUploads(() => void refresh())
    return () => {
      unsubA()
      unsubB()
    }
  }, [])

  if (pending <= 0) return null

  return (
    <button
      type="button"
      onClick={() => void triggerResync('manual')}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[65] -translate-x-1/2 rounded-full bg-ink-black px-3 py-1.5 text-[11px] font-semibold text-white shadow-float md:bottom-6"
      aria-live="polite"
    >
      {pending} offline change{pending === 1 ? '' : 's'} · Tap to sync
    </button>
  )
}
