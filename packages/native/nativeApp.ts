/**
 * App shell / lifecycle bridge.
 *
 * Owns the native chrome that the Stitch UI assumes but a WebView does not
 * provide for free:
 *   - status bar style + edge-to-edge safe areas
 *   - keyboard resize behaviour (so bottom nav / composer are not covered)
 *   - hardware back button semantics on Android
 *   - resume/pause hooks used for socket + badge recovery
 *   - hiding the native splash once React has painted
 */

import { wrapCapPlugin, type CapPluginRef } from './capPlugin'
import { isAndroid, isNativePlatform } from './platform'

type AppStatePlugin = {
  addListener: (
    event: string,
    cb: (payload: never) => void,
  ) => Promise<{ remove: () => Promise<void> }>
  exitApp: () => Promise<void>
  getLaunchUrl: () => Promise<{ url: string } | null>
}

type StatusBarPlugin = {
  setStyle: (options: { style: string }) => Promise<void>
  setBackgroundColor: (options: { color: string }) => Promise<void>
  setOverlaysWebView: (options: { overlay: boolean }) => Promise<void>
}

type KeyboardPlugin = {
  setResizeMode: (options: { mode: string }) => Promise<void>
  setScroll: (options: { isDisabled: boolean }) => Promise<void>
  addListener: (event: string, cb: (info: never) => void) => Promise<{ remove: () => Promise<void> }>
}

type SplashPlugin = {
  hide: (options?: { fadeOutDuration?: number }) => Promise<void>
}

export type AppLifecycleHandlers = {
  onResume?: () => void
  onPause?: () => void
  onBack?: (canGoBack: boolean) => void
  onDeepLink?: (url: string) => void
}

let started = false
let handlers: AppLifecycleHandlers = {}

async function appPlugin(): Promise<CapPluginRef<AppStatePlugin>> {
  if (!isNativePlatform()) return wrapCapPlugin<AppStatePlugin>(null)
  try {
    const mod = await import('@capacitor/app')
    // Do not return App directly — Capacitor proxies are thenables and hang await.
    return wrapCapPlugin((mod as unknown as { App: AppStatePlugin }).App)
  } catch {
    return wrapCapPlugin<AppStatePlugin>(null)
  }
}

/** Hide the native splash screen; called once the React tree has painted. */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const mod = await import('@capacitor/splash-screen')
    const SplashScreen = (mod as unknown as { SplashScreen: SplashPlugin }).SplashScreen
    // Match the React splash leave timing so native → HTML feels continuous.
    await SplashScreen.hide({ fadeOutDuration: 360 })
  } catch {
    /* ignore */
  }
}

async function configureChrome(): Promise<void> {
  if (!isNativePlatform()) return

  try {
    const mod = await import('@capacitor/status-bar')
    const StatusBar = (mod as unknown as { StatusBar: StatusBarPlugin }).StatusBar
    // FixNow surfaces are light after splash; use dark content on a white bar.
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: 'LIGHT' })
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#FFFFFF' })
    }
  } catch {
    /* ignore */
  }

  try {
    const mod = await import('@capacitor/keyboard')
    const Keyboard = (mod as unknown as { Keyboard: KeyboardPlugin }).Keyboard
    // `native` resize keeps sticky headers/footers inside the visible viewport
    // instead of letting the keyboard slide them off-screen.
    await Keyboard.setResizeMode({ mode: 'native' })
    await Keyboard.setScroll({ isDisabled: false })
    await Keyboard.addListener('keyboardWillShow', ((info: { keyboardHeight: number }) => {
      document.documentElement.style.setProperty('--fixnow-keyboard-height', `${info.keyboardHeight}px`)
      document.documentElement.classList.add('fixnow-keyboard-open')
    }) as never)
    await Keyboard.addListener('keyboardWillHide', (() => {
      document.documentElement.style.setProperty('--fixnow-keyboard-height', '0px')
      document.documentElement.classList.remove('fixnow-keyboard-open')
    }) as never)
  } catch {
    /* ignore */
  }
}

export async function initNativeApp(next: AppLifecycleHandlers): Promise<void> {
  handlers = { ...handlers, ...next }
  if (started || !isNativePlatform()) return
  const { plugin: App } = await appPlugin()
  if (!App) return
  started = true

  document.documentElement.classList.add('fixnow-native')
  document.documentElement.dataset.fixnowPlatform = isAndroid() ? 'android' : 'ios'

  await configureChrome()

  await App.addListener('appStateChange', ((state: { isActive: boolean }) => {
    if (state.isActive) {
      handlers.onResume?.()
      window.dispatchEvent(new CustomEvent('fixnow:resume'))
      window.dispatchEvent(new CustomEvent('fixnow:app-resume'))
    } else {
      handlers.onPause?.()
      window.dispatchEvent(new CustomEvent('fixnow:pause'))
    }
  }) as never)

  await App.addListener('appUrlOpen', ((event: { url: string }) => {
    if (!event?.url) return
    handlers.onDeepLink?.(event.url)
    dispatchDeepLink(event.url)
  }) as never)

  if (isAndroid()) {
    await App.addListener('backButton', ((event: { canGoBack: boolean }) => {
      const canGoBack = Boolean(event?.canGoBack)
      handlers.onBack?.(canGoBack)
      window.dispatchEvent(new CustomEvent('fixnow:back', { detail: { canGoBack } }))
    }) as never)
  }

  // Cold start from a link: `appUrlOpen` may have fired before listeners existed.
  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) {
      handlers.onDeepLink?.(launch.url)
      dispatchDeepLink(launch.url)
    }
  } catch {
    /* ignore */
  }
}

function dispatchDeepLink(url: string) {
  // Lazy-resolve so nativeApp does not import the router-aware deepLinks module
  // at load time (keeps the native chrome usable before React mounts).
  void import('./deepLinks').then(({ resolveDeepLink }) => {
    const path = resolveDeepLink(url)
    window.dispatchEvent(new CustomEvent('fixnow:deeplink', { detail: { url, path } }))
  })
}

export async function exitNativeApp(): Promise<void> {
  const { plugin: App } = await appPlugin()
  await App?.exitApp()
}
