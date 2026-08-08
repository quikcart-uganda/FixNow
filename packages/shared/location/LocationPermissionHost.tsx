import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { customerApi, recordInfoDiagnostic, technicianApi } from '@fixnow/api'
import {
  canRequestLocationPermission,
  getCurrentPosition,
  getLocationPermissionStatus,
  loadLocationPermissionPrefs,
  markLocationPromptDismissed,
  markLocationPromptShown,
  openAppLocationSettings,
  requestLocationPermission,
  subscribeLocationPermission,
  type Coordinates,
  type LocationPermissionRole,
  type LocationPermissionStatus,
} from '@fixnow/native'
import {
  LOCATION_COPY,
  LOCATION_DEFER_MS,
  LOCATION_DISMISS_COOLDOWN_MS,
  LOCATION_SOFT_DENY_COOLDOWN_MS,
  isContextualTrigger,
  isLocationPromptBlockedPath,
  type LocationTrigger,
} from './locationPolicy'
import {
  LocationEducationSheet,
  LocationFallbackBanner,
  type LocationFlowStep,
} from './LocationEducationSheet'
import { reverseGeocodeCoords } from './reverseGeocode'

type EnsureResult = {
  status: LocationPermissionStatus
  coords: Coordinates | null
  prompted: boolean
  addressLabel?: string | null
}

type LocationPermissionContextValue = {
  role: LocationPermissionRole
  status: LocationPermissionStatus
  refreshing: boolean
  ensureLocation: (trigger: LocationTrigger) => Promise<EnsureResult>
  openLocationHelp: () => void
  refreshStatus: () => Promise<LocationPermissionStatus>
  showFallbackBanner: boolean
  lastCoords: Coordinates | null
  lastAddressLabel: string | null
}

const LocationPermissionContext = createContext<LocationPermissionContextValue | null>(null)

type Props = {
  role: LocationPermissionRole
  children?: ReactNode
  showBannerWhenUnavailable?: boolean
}

function logStatus(role: LocationPermissionRole, status: LocationPermissionStatus, reason: string) {
  try {
    recordInfoDiagnostic(`location_permission:${status}`, {
      category: 'location_permission',
      role,
      status,
      reason,
    })
  } catch {
    /* diagnostics must never break UX */
  }
}

function dispatchLocationUpdated(detail: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('fixnow:location-updated', { detail }))
  // Home already reloads on location-updated; avoid also firing fixnow:resync
  // (every useAsync listens to resync → duplicate full-rail refetch).
}

export function LocationPermissionHost({
  role,
  children,
  showBannerWhenUnavailable = true,
}: Props) {
  const location = useLocation()
  const [status, setStatus] = useState<LocationPermissionStatus>('not_requested')
  const [refreshing, setRefreshing] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'educate' | 'permanent' | 'progress' | 'denied'>('educate')
  const [flowStep, setFlowStep] = useState<LocationFlowStep>('idle')
  const [stepDetail, setStepDetail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showSoftNotice, setShowSoftNotice] = useState(false)
  const [lastCoords, setLastCoords] = useState<Coordinates | null>(null)
  const [lastAddressLabel, setLastAddressLabel] = useState<string | null>(null)
  const [cityHint, setCityHint] = useState('Kampala')

  const sessionPrompted = useRef(false)
  const activeStartedAt = useRef(Date.now())
  const pendingResolve = useRef<((result: EnsureResult) => void) | null>(null)
  const pendingTrigger = useRef<LocationTrigger>('deferred')

  useEffect(() => {
    return () => {
      pendingResolve.current?.({
        status: 'not_requested',
        coords: null,
        prompted: false,
      })
      pendingResolve.current = null
    }
  }, [])

  useEffect(() => {
    if (role !== 'customer') return
    void customerApi
      .getProfile()
      .then((res) => {
        const loc = (res.data.profile?.location ?? {}) as Record<string, unknown>
        const district = String(loc.district ?? '').trim()
        if (district) setCityHint(district)
      })
      .catch(() => undefined)
  }, [role])

  const copy = LOCATION_COPY[role]

  const refreshStatus = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await getLocationPermissionStatus(role)
      setStatus(next)
      return next
    } finally {
      setRefreshing(false)
    }
  }, [role])

  useEffect(() => {
    void refreshStatus()
    return subscribeLocationPermission((next, nextRole) => {
      if (nextRole === role) setStatus(next)
    })
  }, [refreshStatus, role])

  const pathBlocked = isLocationPromptBlockedPath(location.pathname)

  const canShowByPolicy = useCallback(
    async (trigger: LocationTrigger) => {
      if (pathBlocked) return false
      if (sessionPrompted.current && !isContextualTrigger(trigger)) return false

      const current = await getLocationPermissionStatus(role)
      if (current === 'granted' || current === 'unsupported') return false
      if (current === 'permanently_denied') {
        return isContextualTrigger(trigger) && !sessionPrompted.current
      }

      const prefs = await loadLocationPermissionPrefs(role)
      const now = Date.now()

      if (prefs.lastDismissAt && now - prefs.lastDismissAt < LOCATION_DISMISS_COOLDOWN_MS) {
        if (!isContextualTrigger(trigger)) return false
        if (now - prefs.lastDismissAt < LOCATION_DISMISS_COOLDOWN_MS / 2) return false
      }

      if (
        current === 'denied' &&
        prefs.lastPromptAt &&
        now - prefs.lastPromptAt < LOCATION_SOFT_DENY_COOLDOWN_MS &&
        !isContextualTrigger(trigger)
      ) {
        return false
      }

      if (trigger === 'deferred') {
        const elapsed = now - activeStartedAt.current
        if (elapsed < LOCATION_DEFER_MS[role]) return false
        if (sessionPrompted.current) return false
      }

      return canRequestLocationPermission(current)
    },
    [pathBlocked, role],
  )

  const openSheet = useCallback(
    async (trigger: LocationTrigger) => {
      const current = await getLocationPermissionStatus(role)
      setStatus(current)
      setFlowStep('idle')
      setStepDetail(null)
      setSheetMode(
        current === 'permanently_denied' ? 'permanent' : current === 'denied' ? 'denied' : 'educate',
      )
      pendingTrigger.current = trigger
      sessionPrompted.current = true
      await markLocationPromptShown(role)
      setSheetOpen(true)
      logStatus(role, current, `sheet_open:${trigger}`)
    },
    [role],
  )

  const settlePending = useCallback(
    async (prompted: boolean, coords: Coordinates | null = null, addressLabel?: string | null) => {
      const next = await getLocationPermissionStatus(role)
      setStatus(next)
      let resolved = coords
      if (!resolved && next === 'granted') {
        resolved = await getCurrentPosition(8_000, { requestPermission: false, role })
      }
      if (resolved) setLastCoords(resolved)
      if (addressLabel) setLastAddressLabel(addressLabel)
      pendingResolve.current?.({
        status: next,
        coords: resolved,
        prompted,
        addressLabel: addressLabel ?? null,
      })
      pendingResolve.current = null
    },
    [role],
  )

  const persistLocation = useCallback(
    async (coords: Coordinates, address: Awaited<ReturnType<typeof reverseGeocodeCoords>>) => {
      const locationPayload = {
        country: address?.countryCode || 'UG',
        district: address?.district || cityHint,
        city: address?.city || address?.district || cityHint,
        parish: address?.parish,
        village: address?.village,
        landmark: address?.landmark || address?.label,
        geo: {
          type: 'Point' as const,
          coordinates: [coords.longitude, coords.latitude] as [number, number],
          accuracyMeters: coords.accuracy,
          label: address?.label,
        },
      }
      if (role === 'customer') {
        await customerApi.updateProfileResilient({ location: locationPayload })
      } else if (role === 'technician') {
        await technicianApi.updateProfile({ location: locationPayload })
      }
      return locationPayload
    },
    [cityHint, role],
  )

  const runLocationPipeline = useCallback(async () => {
    setBusy(true)
    setSheetMode('progress')
    setFlowStep('requesting_permission')
    setStepDetail(null)
    try {
      const next = await requestLocationPermission(role)
      setStatus(next)
      logStatus(role, next, `enable:${pendingTrigger.current}`)

      if (next === 'permanently_denied') {
        setSheetMode('permanent')
        setFlowStep('denied')
        await settlePending(true, null)
        return
      }
      if (next !== 'granted') {
        setSheetMode('denied')
        setFlowStep('denied')
        await settlePending(true, null)
        return
      }

      setFlowStep('getting_gps')
      const coords = await getCurrentPosition(12_000, { requestPermission: false, role })
      if (!coords) {
        setFlowStep('error')
        setStepDetail('GPS unavailable. Check that location services are on, then retry.')
        setSheetMode('progress')
        await settlePending(true, null)
        return
      }
      setLastCoords(coords)

      setFlowStep('finding_address')
      const address = await reverseGeocodeCoords(coords.latitude, coords.longitude)
      const label = address?.label || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
      setLastAddressLabel(label)
      setStepDetail(label)

      setFlowStep('saving')
      try {
        await persistLocation(coords, address)
      } catch {
        /* offline queue may hold the write */
      }

      setFlowStep('refreshing')
      dispatchLocationUpdated({
        role,
        coords,
        district: address?.district || cityHint,
        label,
      })

      setFlowStep('success')
      setStepDetail(label)
      await settlePending(true, coords, label)
      window.setTimeout(() => {
        setSheetOpen(false)
        setSheetMode('educate')
        setFlowStep('idle')
      }, 1_600)
    } catch (err) {
      setFlowStep('error')
      setStepDetail(err instanceof Error ? err.message : 'Unable to update location')
      setSheetMode('progress')
      await settlePending(true, null)
    } finally {
      setBusy(false)
    }
  }, [cityHint, persistLocation, role, settlePending])

  const ensureLocation = useCallback(
    async (trigger: LocationTrigger): Promise<EnsureResult> => {
      const current = await getLocationPermissionStatus(role)
      setStatus(current)
      if (current === 'granted') {
        setSheetOpen(true)
        setSheetMode('progress')
        setFlowStep('getting_gps')
        setBusy(true)
        try {
          const coords = await getCurrentPosition(8_000, { requestPermission: false, role })
          if (!coords) {
            setFlowStep('error')
            setStepDetail('GPS unavailable right now.')
            return { status: current, coords: null, prompted: false }
          }
          setFlowStep('finding_address')
          const address = await reverseGeocodeCoords(coords.latitude, coords.longitude)
          const label = address?.label || null
          setFlowStep('saving')
          try {
            await persistLocation(coords, address)
          } catch {
            /* queued offline */
          }
          setFlowStep('refreshing')
          dispatchLocationUpdated({
            role,
            coords,
            district: address?.district || cityHint,
            label,
          })
          setFlowStep('success')
          setLastCoords(coords)
          setLastAddressLabel(label)
          window.setTimeout(() => {
            setSheetOpen(false)
            setFlowStep('idle')
          }, 1_200)
          return { status: current, coords, prompted: false, addressLabel: label }
        } finally {
          setBusy(false)
        }
      }

      const allowed = await canShowByPolicy(trigger)
      if (!allowed) {
        if (current === 'denied' || current === 'permanently_denied') {
          await openSheet(trigger)
          return new Promise<EnsureResult>((resolve) => {
            pendingResolve.current = resolve
          })
        }
        return { status: current, coords: null, prompted: false }
      }

      return new Promise<EnsureResult>((resolve) => {
        pendingResolve.current = resolve
        void openSheet(trigger)
      })
    },
    [canShowByPolicy, cityHint, openSheet, persistLocation, role],
  )

  const openLocationHelp = useCallback(() => {
    void openSheet('settings')
  }, [openSheet])

  useEffect(() => {
    if (pathBlocked || status === 'granted' || status === 'unsupported') return
    const delay = LOCATION_DEFER_MS[role]
    const timer = window.setTimeout(() => {
      void (async () => {
        if (await canShowByPolicy('deferred')) {
          void openSheet('deferred')
        }
      })()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [canShowByPolicy, openSheet, pathBlocked, role, status])

  useEffect(() => {
    if (pathBlocked) return
    const elapsed = Date.now() - activeStartedAt.current
    if (elapsed < LOCATION_DEFER_MS[role]) return
    void (async () => {
      if (await canShowByPolicy('deferred')) {
        void openSheet('deferred')
      }
    })()
  }, [canShowByPolicy, location.pathname, openSheet, pathBlocked, role])

  const onDismiss = async () => {
    setBusy(true)
    try {
      await markLocationPromptDismissed(role)
      logStatus(role, status, `dismiss:${pendingTrigger.current}`)
      setSheetOpen(false)
      setFlowStep('idle')
      await settlePending(true)
    } finally {
      setBusy(false)
    }
  }

  const onOpenSettings = () => {
    logStatus(role, 'permanently_denied', 'open_settings')
    openAppLocationSettings()
    setSheetOpen(false)
    void settlePending(true)
  }

  const onUseCity = async () => {
    setBusy(true)
    try {
      if (role === 'customer') {
        await customerApi.updateProfileResilient({
          location: { country: 'UG', district: cityHint, city: cityHint },
        })
      }
      dispatchLocationUpdated({ role, district: cityHint, source: 'city' })
      setSheetOpen(false)
      await settlePending(true)
    } catch {
      setStepDetail('Could not save city. Try again when online.')
    } finally {
      setBusy(false)
    }
  }

  const showFallbackBanner =
    showBannerWhenUnavailable &&
    !bannerDismissed &&
    !pathBlocked &&
    (status === 'permanently_denied' || (showSoftNotice && status === 'denied'))

  const value = useMemo<LocationPermissionContextValue>(
    () => ({
      role,
      status,
      refreshing,
      ensureLocation,
      openLocationHelp,
      refreshStatus,
      showFallbackBanner,
      lastCoords,
      lastAddressLabel,
    }),
    [
      ensureLocation,
      lastAddressLabel,
      lastCoords,
      openLocationHelp,
      refreshStatus,
      refreshing,
      role,
      showFallbackBanner,
      status,
    ],
  )

  return (
    <LocationPermissionContext.Provider value={value}>
      {children}
      {showFallbackBanner ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[55] md:bottom-4 md:left-24 md:right-4 lg:left-72"
          style={{
            bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="pointer-events-auto mx-auto max-w-lg px-4">
            <LocationFallbackBanner
              message={copy.fallbackNotice}
              actionLabel={status === 'permanently_denied' ? copy.openSettingsLabel : copy.enableLabel}
              onAction={() => {
                if (status === 'permanently_denied') openAppLocationSettings()
                else openLocationHelp()
              }}
              onDismiss={() => setBannerDismissed(true)}
            />
          </div>
        </div>
      ) : null}
      <LocationEducationSheet
        open={sheetOpen}
        copy={copy}
        mode={sheetMode}
        busy={busy}
        step={flowStep}
        stepDetail={stepDetail}
        onEnable={() => void runLocationPipeline()}
        onRetry={() => void runLocationPipeline()}
        onUseCity={() => void onUseCity()}
        cityLabel={`Use ${cityHint}`}
        onDismiss={() => {
          setShowSoftNotice(true)
          void onDismiss()
        }}
        onOpenSettings={onOpenSettings}
      />
    </LocationPermissionContext.Provider>
  )
}

export function useLocationPermission(): LocationPermissionContextValue {
  const ctx = useContext(LocationPermissionContext)
  if (!ctx) {
    throw new Error('useLocationPermission must be used within LocationPermissionHost')
  }
  return ctx
}

export function useOptionalLocationPermission(): LocationPermissionContextValue | null {
  return useContext(LocationPermissionContext)
}
