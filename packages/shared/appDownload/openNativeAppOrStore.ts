/**
 * Try opening the installed native app via deep link, then fall back to the store.
 * Uses blur/visibility heuristics — best-effort on mobile browsers.
 */

export type OpenAppResult = 'deep_link' | 'store' | 'coming_soon' | 'blocked'

function openUrl(url: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(url)
}

/**
 * Attempt deep link; if the page stays visible, open the store URL instead.
 */
export function openNativeAppOrStore(options: {
  deepLink: string
  storeUrl: string | null
  timeoutMs?: number
}): Promise<OpenAppResult> {
  const { deepLink, storeUrl, timeoutMs = 1_600 } = options

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(storeUrl ? 'store' : 'coming_soon')
  }

  return new Promise((resolve) => {
    let settled = false
    const started = Date.now()

    const finish = (result: OpenAppResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const onHide = () => {
      // Page hid quickly after deep-link attempt → assume app opened.
      if (Date.now() - started < timeoutMs + 400) finish('deep_link')
    }

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('blur', onHide)
    }

    const onVisibility = () => {
      if (document.hidden) onHide()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('blur', onHide)

    try {
      // Prefer iframe trick on Android Chrome; location works broadly.
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = deepLink
      document.body.appendChild(iframe)
      window.setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch {
          /* ignore */
        }
      }, 100)
    } catch {
      /* ignore */
    }

    try {
      window.location.href = deepLink
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      if (settled) return
      if (storeUrl) {
        openUrl(storeUrl)
        finish('store')
      } else {
        finish('coming_soon')
      }
    }, timeoutMs)
  })
}

export function openStoreOnly(storeUrl: string): void {
  openUrl(storeUrl)
}
