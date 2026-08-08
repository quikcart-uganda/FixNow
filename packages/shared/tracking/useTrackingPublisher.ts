import { useEffect, useRef, useState } from 'react'
import { getFriendlyErrorMessage, trackingApi, type TrackingSession } from '@fixnow/api'
import {
  getLocationPermissionStatus,
  watchPositionAdaptive,
  type LocationWatchHandle,
} from '@fixnow/native'
import { useOptionalLocationPermission } from '../location'

/**
 * Technician-side publisher: starts session (if needed) and streams adaptive GPS pings.
 * Location is only watched after permission is granted; never prompts from this hook.
 * Streaming stops automatically when `enabled` becomes false (offline / job complete).
 */
export function useTrackingPublisher(jobId: string, enabled: boolean) {
  const locationPermission = useOptionalLocationPermission()
  const ensureRef = useRef(locationPermission?.ensureLocation)
  ensureRef.current = locationPermission?.ensureLocation
  const [session, setSession] = useState<TrackingSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [permissionBlocked, setPermissionBlocked] = useState(false)
  const handle = useRef<LocationWatchHandle | null>(null)
  const ensuredForJob = useRef<string | null>(null)

  useEffect(() => {
    if (!jobId || !enabled) {
      handle.current?.stop()
      handle.current = null
      setPublishing(false)
      setPermissionBlocked(false)
      ensuredForJob.current = null
      return
    }

    let cancelled = false
    setError(null)
    setPublishing(true)

    void (async () => {
      try {
        // Educate + request once when live tracking becomes required for this job.
        if (ensuredForJob.current !== jobId) {
          ensuredForJob.current = jobId
          const ensure = ensureRef.current
          if (ensure) {
            const ensured = await ensure('live_tracking')
            if (cancelled) return
            if (ensured.status !== 'granted') {
              setPermissionBlocked(true)
              setPublishing(false)
              setError(
                ensured.status === 'permanently_denied'
                  ? 'Location is disabled. Enable it in device settings for live tracking.'
                  : 'Location is needed for live tracking. You can enable it anytime from Settings.',
              )
              return
            }
          } else {
            const status = await getLocationPermissionStatus('technician')
            if (cancelled) return
            if (status !== 'granted') {
              setPermissionBlocked(true)
              setPublishing(false)
              setError('Location permission is required for live tracking.')
              return
            }
          }
        }

        const status = await getLocationPermissionStatus('technician')
        if (cancelled) return
        if (status !== 'granted') {
          setPermissionBlocked(true)
          setPublishing(false)
          return
        }

        const started = await trackingApi.start(jobId)
        if (cancelled) return
        setSession(started.data.session)
        setPermissionBlocked(false)
      } catch (err) {
        if (!cancelled) setError(getFriendlyErrorMessage(err))
      }

      if (cancelled) return

      handle.current = watchPositionAdaptive(async (coords) => {
        try {
          const res = await trackingApi.ping(jobId, {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: coords.accuracy,
            heading: coords.heading ?? undefined,
            speedMps: coords.speed ?? undefined,
            recordedAt: new Date(coords.timestamp || Date.now()).toISOString(),
          })
          if (!cancelled) setSession(res.data.session)
        } catch (err) {
          if (!cancelled) setError(getFriendlyErrorMessage(err))
        }
      })
    })()

    return () => {
      cancelled = true
      handle.current?.stop()
      handle.current = null
      setPublishing(false)
    }
  }, [jobId, enabled])

  return { session, error, publishing, permissionBlocked, setSession }
}
