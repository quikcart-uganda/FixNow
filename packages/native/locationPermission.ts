/**
 * Production location permission bridge.
 *
 * Rules:
 * - Never request OS permission at cold start.
 * - Prefer check-only reads; request only after in-app education.
 * - Persist soft-deny / permanent-deny UX state for retry policy.
 * - Log transitions for diagnostics only (not user-facing).
 */

import { wrapCapPlugin, type CapPluginRef } from './capPlugin'
import { cacheGet, cacheSet } from './offlineCache'
import { isAndroid, isIOS, isNativePlatform } from './platform'

function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return
  if (isNativePlatform()) {
    window.open(url, '_system')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type LocationPermissionStatus =
  | 'not_requested'
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'unsupported'

export type LocationPermissionRole = 'customer' | 'technician'

type OsLocationState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown'

type GeolocationPlugin = {
  checkPermissions: () => Promise<{ location: OsLocationState; coarseLocation?: OsLocationState }>
  requestPermissions: () => Promise<{ location: OsLocationState; coarseLocation?: OsLocationState }>
}

export type LocationPermissionPrefs = {
  /** Last time the educational sheet was shown. */
  lastPromptAt?: number
  /** Last time the user tapped Not Now / Later. */
  lastDismissAt?: number
  /** How many times we invoked the native request dialog. */
  nativeRequestCount: number
  /** Sticky flag once OS indicates permanent deny. */
  permanentlyDenied: boolean
  /** Last mapped status for diagnostics. */
  lastStatus?: LocationPermissionStatus
  updatedAt?: number
}

const PREF_KEYS: Record<LocationPermissionRole, string> = {
  customer: 'fixnow.location.permission.customer.v1',
  technician: 'fixnow.location.permission.technician.v1',
}

const EMPTY_PREFS: LocationPermissionPrefs = {
  nativeRequestCount: 0,
  permanentlyDenied: false,
}

type StatusListener = (status: LocationPermissionStatus, role: LocationPermissionRole) => void

const listeners = new Set<StatusListener>()

function emit(status: LocationPermissionStatus, role: LocationPermissionRole) {
  for (const listener of listeners) {
    try {
      listener(status, role)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeLocationPermission(listener: StatusListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function geolocationPlugin(): Promise<CapPluginRef<GeolocationPlugin>> {
  if (!isNativePlatform()) return wrapCapPlugin<GeolocationPlugin>(null)
  try {
    const mod = await import('@capacitor/geolocation')
    return wrapCapPlugin((mod as unknown as { Geolocation: GeolocationPlugin }).Geolocation)
  } catch {
    return wrapCapPlugin<GeolocationPlugin>(null)
  }
}

function mapOsState(raw: string | undefined): OsLocationState {
  if (raw === 'granted' || raw === 'prompt' || raw === 'prompt-with-rationale' || raw === 'denied') {
    return raw
  }
  return 'unknown'
}

async function readOsState(): Promise<OsLocationState> {
  const { plugin } = await geolocationPlugin()
  if (plugin) {
    try {
      const result = await plugin.checkPermissions()
      return mapOsState(result.location)
    } catch {
      return 'unknown'
    }
  }

  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    if (typeof navigator !== 'undefined' && navigator.geolocation) return 'prompt'
    return 'unknown'
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (result.state === 'granted') return 'granted'
    if (result.state === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return typeof navigator !== 'undefined' && navigator.geolocation ? 'prompt' : 'unknown'
  }
}

export async function loadLocationPermissionPrefs(
  role: LocationPermissionRole,
): Promise<LocationPermissionPrefs> {
  const stored = await cacheGet<LocationPermissionPrefs>(PREF_KEYS[role])
  if (!stored || typeof stored !== 'object') return { ...EMPTY_PREFS }
  return {
    ...EMPTY_PREFS,
    ...stored,
    nativeRequestCount: Number(stored.nativeRequestCount) || 0,
    permanentlyDenied: Boolean(stored.permanentlyDenied),
  }
}

export async function saveLocationPermissionPrefs(
  role: LocationPermissionRole,
  patch: Partial<LocationPermissionPrefs>,
): Promise<LocationPermissionPrefs> {
  const current = await loadLocationPermissionPrefs(role)
  const next: LocationPermissionPrefs = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  await cacheSet(PREF_KEYS[role], next, 365 * 24 * 60 * 60_000)
  return next
}

/**
 * Resolve the product permission status without triggering the OS dialog.
 */
export async function getLocationPermissionStatus(
  role: LocationPermissionRole = 'customer',
): Promise<LocationPermissionStatus> {
  const prefs = await loadLocationPermissionPrefs(role)
  if (prefs.permanentlyDenied) return 'permanently_denied'

  const os = await readOsState()
  if (os === 'granted') return 'granted'

  if (os === 'denied') {
    // After at least one native ask, a hard OS deny is treated as permanent.
    if (prefs.nativeRequestCount > 0) return 'permanently_denied'
    return 'denied'
  }

  if (os === 'prompt' || os === 'prompt-with-rationale') {
    return prefs.nativeRequestCount > 0 ? 'denied' : 'not_requested'
  }

  if (!isNativePlatform() && typeof navigator !== 'undefined' && !navigator.geolocation) {
    return 'unsupported'
  }

  return prefs.nativeRequestCount > 0 ? 'denied' : 'not_requested'
}

/**
 * Ask the OS for location permission. Call only after in-app education.
 */
export async function requestLocationPermission(
  role: LocationPermissionRole,
): Promise<LocationPermissionStatus> {
  const prefs = await loadLocationPermissionPrefs(role)
  if (prefs.permanentlyDenied) {
    const status: LocationPermissionStatus = 'permanently_denied'
    emit(status, role)
    return status
  }

  const before = await readOsState()
  if (before === 'granted') {
    const status: LocationPermissionStatus = 'granted'
    await saveLocationPermissionPrefs(role, { lastStatus: status, permanentlyDenied: false })
    emit(status, role)
    return status
  }

  const { plugin } = await geolocationPlugin()
  let after: OsLocationState = before

  if (plugin) {
    try {
      const result = await plugin.requestPermissions()
      after = mapOsState(result.location)
    } catch {
      after = 'denied'
    }
  } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
    after = await new Promise<OsLocationState>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => {
          // PERMISSION_DENIED = 1
          if (err.code === 1) resolve('denied')
          else resolve(before === 'prompt' ? 'denied' : before)
        },
        { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
      )
    })
  } else {
    const status: LocationPermissionStatus = 'unsupported'
    await saveLocationPermissionPrefs(role, { lastStatus: status })
    emit(status, role)
    return status
  }

  const nextCount = prefs.nativeRequestCount + 1
  let status: LocationPermissionStatus
  let permanentlyDenied = false

  if (after === 'granted') {
    status = 'granted'
  } else if (after === 'denied' || after === 'unknown') {
    // Second hard deny / no rationale → treat as permanent for UX.
    permanentlyDenied = nextCount >= 2 || before === 'denied'
    status = permanentlyDenied ? 'permanently_denied' : 'denied'
  } else {
    status = 'denied'
  }

  await saveLocationPermissionPrefs(role, {
    nativeRequestCount: nextCount,
    permanentlyDenied,
    lastStatus: status,
    lastPromptAt: Date.now(),
  })
  emit(status, role)
  return status
}

export async function markLocationPromptShown(role: LocationPermissionRole): Promise<void> {
  await saveLocationPermissionPrefs(role, { lastPromptAt: Date.now() })
}

export async function markLocationPromptDismissed(role: LocationPermissionRole): Promise<void> {
  await saveLocationPermissionPrefs(role, {
    lastDismissAt: Date.now(),
    lastPromptAt: Date.now(),
  })
}

/**
 * Open OS settings so the user can re-enable location for FixNow.
 * Best-effort across platforms; always safe to call.
 */
export function openAppLocationSettings(): void {
  if (isIOS()) {
    openExternalUrl('app-settings:')
    return
  }
  if (isAndroid()) {
    // App details — user can enable Location permission for com.fixnow.app
    openExternalUrl(
      'intent://#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.fixnow.app;end',
    )
    return
  }
  // Web / desktop: browser site settings aren't reliably deep-linkable.
  if (typeof window !== 'undefined') {
    window.alert(
      'Location is blocked in this browser. Open site settings for this page and allow Location, then try again.',
    )
  }
}

export function isLocationGranted(status: LocationPermissionStatus): boolean {
  return status === 'granted'
}

export function canRequestLocationPermission(status: LocationPermissionStatus): boolean {
  return status === 'not_requested' || status === 'denied'
}
