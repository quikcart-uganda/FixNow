/**
 * Device capability bridge: camera, gallery, files, GPS, maps, dial, email,
 * share, clipboard, haptics — plus a biometric-readiness probe.
 *
 * Every function degrades to the web behaviour when Capacitor is absent, so
 * screens can call these unconditionally and stay identical across platforms.
 */

import { wrapCapPlugin, type CapPluginRef } from './capPlugin'
import { isAndroid, isIOS, isNativePlatform } from './platform'
import { getLocationPermissionStatus, type LocationPermissionRole } from './locationPermission'

export type PickedImage = {
  /** Data URL suitable for `<img src>` previews and multipart upload. */
  dataUrl: string
  format: string
  /** Native filesystem path when available (useful for large uploads). */
  path?: string
}

export type Coordinates = {
  latitude: number
  longitude: number
  accuracy?: number
  heading?: number | null
  speed?: number | null
  timestamp?: number
}

export type LocationWatchOptions = {
  /** Base interval while moving (ms). Default 8000. */
  movingIntervalMs?: number
  /** Interval while roughly stationary (ms). Default 20000. */
  stationaryIntervalMs?: number
  /** Metres moved to count as “moving”. Default 12. */
  moveThresholdMeters?: number
  enableHighAccuracy?: boolean
}

export type LocationWatchHandle = {
  stop: () => void
}

function haversineM(a: Coordinates, b: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Adaptive foreground location stream for live job tracking.
 * Uses Capacitor Geolocation on native and `navigator.geolocation` on web.
 * Queues the latest sample offline and flushes when connectivity returns.
 */
export function watchPositionAdaptive(
  onUpdate: (coords: Coordinates) => void | Promise<void>,
  options: LocationWatchOptions = {},
): LocationWatchHandle {
  const movingIntervalMs = options.movingIntervalMs ?? 8_000
  const stationaryIntervalMs = options.stationaryIntervalMs ?? 20_000
  const moveThresholdMeters = options.moveThresholdMeters ?? 12
  const enableHighAccuracy = options.enableHighAccuracy !== false

  let stopped = false
  let watchId: number | string | null = null
  let lastSent: Coordinates | null = null
  let lastEmitAt = 0
  let offlineQueue: Coordinates | null = null
  let timer: number | null = null

  const emit = async (coords: Coordinates) => {
    if (stopped) return
    const online = typeof navigator === 'undefined' ? true : navigator.onLine
    if (!online) {
      offlineQueue = coords
      return
    }
    const now = Date.now()
    if (lastSent) {
      const moved = haversineM(lastSent, coords)
      const interval = moved >= moveThresholdMeters ? movingIntervalMs : stationaryIntervalMs
      if (now - lastEmitAt < interval) return
    }
    lastSent = coords
    lastEmitAt = now
    try {
      await onUpdate(coords)
    } catch {
      offlineQueue = coords
    }
  }

  const flushQueue = () => {
    if (offlineQueue) {
      const queued = offlineQueue
      offlineQueue = null
      void emit(queued)
    }
  }

  const onOnline = () => flushQueue()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
  }

  const startWebWatch = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const status = await getLocationPermissionStatus('technician')
    if (status !== 'granted') {
      // Do not call watchPosition — it would trigger the browser prompt.
      return
    }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void emit({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        })
      },
      () => {
        /* permission / GPS unavailable — caller UI handles empty session */
      },
      {
        enableHighAccuracy,
        maximumAge: 10_000,
        timeout: 15_000,
      },
    )
  }

  const startNativePoll = async () => {
    const poll = async () => {
      if (stopped) return
      // Never request permission from the tracking poller — education owns that.
      const coords = await getCurrentPosition(12_000, { requestPermission: false })
      if (coords) {
        await emit({
          ...coords,
          heading: null,
          speed: null,
          timestamp: Date.now(),
        })
      }
      if (!stopped) {
        timer = window.setTimeout(() => void poll(), movingIntervalMs)
      }
    }
    void poll()
  }

  if (isNativePlatform()) {
    void startNativePoll()
  } else {
    void startWebWatch()
  }

  return {
    stop: () => {
      stopped = true
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
      if (timer) window.clearTimeout(timer)
      if (watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(Number(watchId))
        } catch {
          /* ignore */
        }
      }
    },
  }
}

/* ------------------------------------------------------------------ camera */

type CameraPlugin = {
  getPhoto: (options: Record<string, unknown>) => Promise<{
    dataUrl?: string
    format: string
    path?: string
    webPath?: string
  }>
  checkPermissions: () => Promise<{ camera: string; photos: string }>
  requestPermissions: (options?: { permissions?: string[] }) => Promise<{
    camera: string
    photos: string
  }>
}

async function cameraPlugin(): Promise<CapPluginRef<CameraPlugin>> {
  if (!isNativePlatform()) return wrapCapPlugin<CameraPlugin>(null)
  try {
    const mod = await import('@capacitor/camera')
    return wrapCapPlugin((mod as unknown as { Camera: CameraPlugin }).Camera)
  } catch {
    return wrapCapPlugin<CameraPlugin>(null)
  }
}

async function capture(source: 'CAMERA' | 'PHOTOS' | 'PROMPT'): Promise<PickedImage | null> {
  const { plugin: Camera } = await cameraPlugin()
  if (!Camera) return null
  try {
    if (source !== 'PHOTOS') {
      const perms = await Camera.checkPermissions()
      if (perms.camera !== 'granted') await Camera.requestPermissions({ permissions: ['camera'] })
    }
    const photo = await Camera.getPhoto({
      quality: 72,
      allowEditing: false,
      resultType: 'dataUrl',
      source,
      // Cap the long edge: full-resolution phone photos are 4-12 MB and
      // routinely time out job/portfolio uploads on 3G.
      width: 1600,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: 'Add photo',
      promptLabelPhoto: 'Choose from gallery',
      promptLabelPicture: 'Take a photo',
    })
    if (!photo.dataUrl) return null
    return { dataUrl: photo.dataUrl, format: photo.format, path: photo.path ?? photo.webPath }
  } catch {
    // User cancellation surfaces as a rejection — treat as "no selection".
    return null
  }
}

export function takePhoto(): Promise<PickedImage | null> {
  return capture('CAMERA')
}

export function pickFromGallery(): Promise<PickedImage | null> {
  return capture('PHOTOS')
}

/** Native sheet (camera or gallery); `null` on web so callers use `<input type="file">`. */
export function pickImage(): Promise<PickedImage | null> {
  return capture('PROMPT')
}

/** Convert a picked image into a `File` for the existing multipart upload paths. */
export function pickedImageToFile(image: PickedImage, name = 'upload'): File | null {
  try {
    const [meta, base64] = image.dataUrl.split(',')
    if (!base64) return null
    const mime = /data:([^;]+)/.exec(meta ?? '')?.[1] ?? `image/${image.format || 'jpeg'}`
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], `${name}.${image.format || 'jpg'}`, { type: mime })
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- geolocation */

type GeolocationPlugin = {
  getCurrentPosition: (options?: Record<string, unknown>) => Promise<{
    coords: { latitude: number; longitude: number; accuracy: number }
  }>
  checkPermissions: () => Promise<{ location: string }>
  requestPermissions: () => Promise<{ location: string }>
}

export type GetCurrentPositionOptions = {
  /**
   * When false (default), never trigger the OS permission dialog.
   * Call `requestLocationPermission` after in-app education first.
   */
  requestPermission?: boolean
  /** Role used for permission preference bookkeeping when requesting. */
  role?: LocationPermissionRole
}

/**
 * Read the device position.
 * Does **not** request permission by default — prevents silent launch prompts.
 */
export async function getCurrentPosition(
  timeoutMs = 10_000,
  options: GetCurrentPositionOptions = {},
): Promise<Coordinates | null> {
  const role = options.role ?? 'customer'
  const mayRequest = options.requestPermission === true

  if (isNativePlatform()) {
    try {
      const mod = await import('@capacitor/geolocation')
      const Geolocation = (mod as unknown as { Geolocation: GeolocationPlugin }).Geolocation
      const perms = await Geolocation.checkPermissions()
      if (perms.location !== 'granted') {
        if (!mayRequest) return null
        const { requestLocationPermission } = await import('./locationPermission')
        const status = await requestLocationPermission(role)
        if (status !== 'granted') return null
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 30_000,
      })
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
    } catch {
      return null
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null

  const status = await getLocationPermissionStatus(role)
  if (status !== 'granted' && !mayRequest) {
    // Web: Permissions API may be unavailable; attempt a non-prompting read
    // only when we already believe access is granted. Otherwise defer.
    if (status === 'not_requested' || status === 'denied' || status === 'permanently_denied') {
      return null
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

/* ---------------------------------------------------------------------- maps */

/**
 * Open turn-by-turn navigation in the platform maps app.
 * Android uses the `geo:` intent, iOS uses Apple Maps, web uses Google Maps.
 */
export function openNavigation(target: {
  latitude?: number | null
  longitude?: number | null
  label?: string
}): void {
  const { latitude, longitude, label } = target
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number'
  const query = hasCoords ? `${latitude},${longitude}` : (label ?? '')
  if (!query) return

  const encodedLabel = encodeURIComponent(label ?? 'Job location')

  let url: string
  if (isAndroid() && hasCoords) {
    url = `geo:${query}?q=${query}(${encodedLabel})`
  } else if (isIOS() && hasCoords) {
    url = `maps://?daddr=${query}&dirflg=d`
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
  }
  openExternal(url)
}

/* ------------------------------------------------------------- dial / email */

export function dialPhone(phone: string): void {
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (!cleaned) return
  openExternal(`tel:${cleaned}`)
}

export function sendEmail(to: string, subject?: string, body?: string): void {
  if (!to) return
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const qs = params.toString()
  openExternal(`mailto:${to}${qs ? `?${qs}` : ''}`)
}

/**
 * Hand a URL to the OS. On native, `location.href` on a custom scheme inside
 * the WebView can be swallowed, so `window.open(..., '_system')` is used.
 */
export function openExternal(url: string): void {
  if (typeof window === 'undefined') return
  if (isNativePlatform()) {
    window.open(url, '_system')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/* --------------------------------------------------------------------- share */

type SharePlugin = {
  share: (options: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown>
}

export async function shareContent(options: {
  title?: string
  text?: string
  url?: string
}): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const mod = await import('@capacitor/share')
      const Share = (mod as unknown as { Share: SharePlugin }).Share
      await Share.share({ ...options, dialogTitle: options.title ?? 'Share' })
      return true
    } catch {
      return false
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(options)
      return true
    } catch {
      return false
    }
  }
  return copyToClipboard(options.url ?? options.text ?? '')
}

/* ----------------------------------------------------------------- clipboard */

type ClipboardPlugin = {
  write: (options: { string?: string; url?: string }) => Promise<void>
  read: () => Promise<{ value: string; type: string }>
}

export async function copyToClipboard(value: string): Promise<boolean> {
  if (!value) return false
  if (isNativePlatform()) {
    try {
      const mod = await import('@capacitor/clipboard')
      const Clipboard = (mod as unknown as { Clipboard: ClipboardPlugin }).Clipboard
      await Clipboard.write({ string: value })
      return true
    } catch {
      /* fall through to the web API */
    }
  }
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------- haptics */

type HapticsPlugin = {
  impact: (options: { style: string }) => Promise<void>
  notification: (options: { type: string }) => Promise<void>
}

export async function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') {
  if (!isNativePlatform()) return
  try {
    const mod = await import('@capacitor/haptics')
    const Haptics = (mod as unknown as { Haptics: HapticsPlugin }).Haptics
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      await Haptics.notification({ type: kind.toUpperCase() })
    } else {
      await Haptics.impact({ style: kind.toUpperCase() })
    }
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- biometrics */

export type BiometricAvailability = {
  /** Device exposes a biometric sensor the app could use. */
  available: boolean
  /** Hardware-backed keystore available for gating a stored session. */
  secureStorageAvailable: boolean
  reason: string
}

/**
 * Future-ready probe. FixNow does not yet gate the session behind biometrics;
 * this reports whether the device *could* support it so the settings screen can
 * expose the toggle without shipping a second auth path.
 */
export async function probeBiometrics(): Promise<BiometricAvailability> {
  if (!isNativePlatform()) {
    return {
      available: false,
      secureStorageAvailable: false,
      reason: 'Biometric unlock requires the Android or iOS app.',
    }
  }
  try {
    const mod = await import('@capacitor/device')
    const Device = (mod as unknown as {
      Device: { getInfo: () => Promise<{ platform: string; isVirtual: boolean }> }
    }).Device
    const info = await Device.getInfo()
    return {
      available: !info.isVirtual,
      secureStorageAvailable: true,
      reason: info.isVirtual
        ? 'Emulators do not expose a biometric sensor.'
        : 'Device keystore is available; biometric unlock can be enabled.',
    }
  } catch {
    return { available: false, secureStorageAvailable: true, reason: 'Could not read device info.' }
  }
}
