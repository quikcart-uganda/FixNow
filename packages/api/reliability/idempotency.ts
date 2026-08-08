/**
 * Idempotency key helpers for client mutations.
 */

/** Stable per-job payment key for the lifetime of a browser tab session. */
export function paymentIdempotencyKey(jobId: string): string {
  const storageKey = `fixnow_idem_pay_${jobId}`
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const next = `ui-pay-${jobId}`
    sessionStorage.setItem(storageKey, next)
    return next
  } catch {
    return `ui-pay-${jobId}`
  }
}

/** Clear payment key after terminal success so a later re-pay can mint a new one if needed. */
export function clearPaymentIdempotencyKey(jobId: string): void {
  try {
    sessionStorage.removeItem(`fixnow_idem_pay_${jobId}`)
  } catch {
    /* ignore */
  }
}

export function newClientMessageId(prefix = 'c'): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${rand}`
}
