/**
 * Mobile-web helpers for the App Download Reminder.
 * Never treat Capacitor WebViews as "mobile web".
 */

import { isNativePlatform } from './platform'

const MOBILE_UA =
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Windows Phone/i

export type StorePlatform = 'android' | 'ios' | 'unknown'

/** True when running inside the installed PWA (home-screen / standalone). */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone === true) return true
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Coarse mobile browser detection for download-prompt eligibility.
 * Desktop browsers are excluded even if the window is narrow.
 */
export function isMobileWebBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (isNativePlatform()) return false
  if (isPwaStandalone()) return false

  const ua = navigator.userAgent || ''
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  const uaSaysMobile = uaData?.mobile === true || MOBILE_UA.test(ua)

  // iPadOS 13+ desktop UA — treat as tablet/mobile for store prompt.
  const iPadDesktopUa =
    navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1

  if (!uaSaysMobile && !iPadDesktopUa) return false

  // Extra guard: very large "desktop-like" widths with non-mobile UA already excluded;
  // keep tablets eligible.
  return true
}

export function detectStorePlatform(): StorePlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) return 'ios'
  return 'unknown'
}

/**
 * Eligibility gate used by the download reminder host.
 */
export function canShowAppDownloadPromptSurface(): boolean {
  return isMobileWebBrowser() && !isNativePlatform() && !isPwaStandalone()
}
