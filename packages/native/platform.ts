/**
 * Native platform detection.
 *
 * The FixNow bundle is shared by web, Android and iOS. Everything in
 * `packages/native` must stay safe to import from a plain browser build:
 * Capacitor plugin modules are only touched behind `isNativePlatform()`.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  isPluginAvailable?: (name: string) => boolean
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap ?? null
}

export type NativePlatform = 'android' | 'ios' | 'web'

export function getPlatform(): NativePlatform {
  const p = capacitor()?.getPlatform?.()
  if (p === 'android' || p === 'ios') return p
  return 'web'
}

export function isNativePlatform(): boolean {
  return capacitor()?.isNativePlatform?.() === true
}

export function isAndroid(): boolean {
  return getPlatform() === 'android'
}

export function isIOS(): boolean {
  return getPlatform() === 'ios'
}

export function isPluginAvailable(name: string): boolean {
  return capacitor()?.isPluginAvailable?.(name) === true
}

/** Platform tag accepted by the backend device/session APIs. */
export function platformTag(): 'web' | 'ios' | 'android' {
  return getPlatform()
}
