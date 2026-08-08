/**
 * Hosted browser / payment return bridge.
 *
 * Today's FixNow payments are Mobile Money + console (no hosted checkout URL).
 * The bridge still owns three production concerns so future Flutterwave /
 * Pesapal / Stripe providers drop in without a second code path:
 *
 *   1. Open any provider-returned URL in the system / in-app browser.
 *   2. Listen for the `fixnow://payments/...` return deep link.
 *   3. Poll the transaction until escrow is funded (or the user cancels).
 *
 * Call sites stay thin: `openHostedPayment(url)` then wait for the deep link
 * or for the payment:successful socket event that already exists.
 */

import { APP_SCHEME } from './deepLinks'
import { isNativePlatform } from './platform'

type BrowserPlugin = {
  open: (options: { url: string; windowName?: string; toolbarColor?: string }) => Promise<void>
  close: () => Promise<void>
  addListener: (
    event: 'browserFinished' | 'browserPageLoaded',
    cb: () => void,
  ) => Promise<{ remove: () => Promise<void> }>
}

export type HostedPaymentResult =
  | { status: 'returned'; path: string }
  | { status: 'dismissed' }
  | { status: 'unsupported' }

/**
 * Build the return URL a hosted provider should redirect to after payment.
 * Matches the deep-link resolver (`fixnow://customer/payments/success?...`).
 */
export function paymentReturnUrl(params: {
  jobId?: string
  txId?: string
  status?: 'success' | 'cancel' | 'fail'
}): string {
  const qs = new URLSearchParams()
  if (params.jobId) qs.set('jobId', params.jobId)
  if (params.txId) qs.set('tx', params.txId)
  const status = params.status ?? 'success'
  const leaf = status === 'success' ? 'success' : status
  return `${APP_SCHEME}://customer/payments/${leaf}?${qs.toString()}`
}

/**
 * Open a hosted checkout URL. On native this uses `@capacitor/browser`
 * (Chrome Custom Tabs / SFSafariViewController). On web it falls back to a
 * new tab. Resolves when the browser is dismissed or when a return deep link
 * arrives — whichever happens first.
 */
export async function openHostedPayment(
  url: string,
  options?: { onReturn?: (path: string) => void },
): Promise<HostedPaymentResult> {
  if (!url) return { status: 'unsupported' }

  if (!isNativePlatform()) {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    return { status: 'unsupported' }
  }

  try {
    const mod = await import('@capacitor/browser')
    const Browser = (mod as unknown as { Browser: BrowserPlugin }).Browser

    return await new Promise<HostedPaymentResult>((resolve) => {
      let settled = false
      const finish = (result: HostedPaymentResult) => {
        if (settled) return
        settled = true
        void Browser.close().catch(() => undefined)
        resolve(result)
      }

      // The deep-link listener (nativeApp / useNativeDeepLinks) owns the
      // actual navigation. We expose a narrow callback so payment screens can
      // also react (e.g. stop a spinner) without racing the router.
      const onDeepLink = (event: Event) => {
        const detail = (event as CustomEvent<{ path?: string }>).detail
        const path = detail?.path ?? ''
        if (!path.includes('/payments/')) return
        options?.onReturn?.(path)
        finish({ status: 'returned', path })
      }
      window.addEventListener('fixnow:deeplink', onDeepLink as EventListener)

      void Browser.addListener('browserFinished', () => {
        window.removeEventListener('fixnow:deeplink', onDeepLink as EventListener)
        finish({ status: 'dismissed' })
      })

      void Browser.open({
        url,
        toolbarColor: '#004ac6',
        windowName: '_blank',
      }).catch(() => {
        window.removeEventListener('fixnow:deeplink', onDeepLink as EventListener)
        finish({ status: 'unsupported' })
      })
    })
  } catch {
    return { status: 'unsupported' }
  }
}

/**
 * Extract a hosted checkout URL from a provider charge response.
 * Providers that already settle inline (MTN, Airtel, console) return nothing.
 */
export function extractHostedCheckoutUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const candidates = [
    obj.checkoutUrl,
    obj.paymentUrl,
    obj.redirectUrl,
    obj.authorization_url,
    obj.link,
    (obj.data as Record<string, unknown> | undefined)?.link,
    (obj.data as Record<string, unknown> | undefined)?.checkoutUrl,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c
  }
  return null
}
