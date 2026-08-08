/**
 * Offline banner — thin strip that appears above the Stitch chrome when the
 * device loses connectivity. Does not redesign any screen.
 */

import { useEffect, useState } from 'react'
import { useNetworkStatus } from '@fixnow/shared'
import { getNetworkState, subscribeNetwork } from './nativeNetwork'
import { isNativePlatform } from './platform'
import { listQueued } from './offlineQueue'
import { triggerResync } from './resync'

export function OfflineBanner() {
  const webStatus = useNetworkStatus()
  const [nativeOnline, setNativeOnline] = useState(() => getNetworkState().connected)
  const [restoredFlash, setRestoredFlash] = useState(false)
  const [queued, setQueued] = useState(0)

  useEffect(() => {
    void listQueued()
      .then((items) => setQueued(Array.isArray(items) ? items.length : 0))
      .catch(() => setQueued(0))
  }, [restoredFlash, webStatus, nativeOnline])

  useEffect(() => {
    if (!isNativePlatform()) return
    return subscribeNetwork((s) => {
      setNativeOnline((prev) => {
        if (!prev && s.connected) {
          setRestoredFlash(true)
          window.setTimeout(() => setRestoredFlash(false), 2200)
        }
        return s.connected
      })
    })
  }, [])

  const online = isNativePlatform() ? nativeOnline : webStatus !== 'offline'

  // Checking/Unknown are not Offline — banner stays hidden until conclusive offline.
  if (online && !restoredFlash) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[70] px-3 py-2 text-center text-xs font-semibold tracking-wide text-white ${
        restoredFlash ? 'bg-emerald-600' : 'bg-ink-black/90'
      }`}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      {restoredFlash ? (
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => void triggerResync('manual')}>
          Back online — updating{queued > 0 ? ` ${queued} change${queued === 1 ? '' : 's'}` : ''}…
        </button>
      ) : (
        <span>
          You are offline.
          {queued > 0 ? ` ${queued} change${queued === 1 ? '' : 's'} will send when you reconnect.` : ' Changes will sync when connection returns.'}
        </span>
      )}
    </div>
  )
}
