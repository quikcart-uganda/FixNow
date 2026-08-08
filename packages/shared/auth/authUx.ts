/** Frontend-only auth UX helpers. Does not change API contracts or token handling. */

const REMEMBERED_EMAIL_KEY = 'fixnow_remembered_email'
const CUSTOMER_ONBOARDED_KEY = 'fn_customer_onboarded'

export function maskEmail(email: string): string {
  const value = String(email || '').trim()
  const at = value.indexOf('@')
  if (at <= 1) return value || 'your email'
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`
}

export function passwordValidationMessage(password: string): string | null {
  if (!password) return 'Please enter a password.'
  if (password.length < 8) return 'Use at least 8 characters with a letter and a number.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least 8 characters with a letter and a number.'
  }
  return null
}

export function passwordsMatchMessage(password: string, confirm: string): string | null {
  if (!confirm) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}

export function getRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export function persistRememberedEmail(email: string, remember: boolean) {
  try {
    const trimmed = email.trim()
    if (remember && trimmed) localStorage.setItem(REMEMBERED_EMAIL_KEY, trimmed)
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY)
  } catch {
    /* ignore storage failures */
  }
}

export function isCustomerOnboarded(): boolean {
  try {
    return localStorage.getItem(CUSTOMER_ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

export function setCustomerOnboarded(value = true) {
  try {
    localStorage.setItem(CUSTOMER_ONBOARDED_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function authFieldClassName(extra = '') {
  return [
    'h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-4 text-body-lg text-on-surface outline-none transition-all',
    'focus:border-primary focus:ring-4 focus:ring-primary/10',
    'disabled:opacity-60',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared auth action button chrome.
 * Typography/height/radius stay identical across Guest / Google / Email —
 * only colour treatment differentiates primary vs secondary vs outline.
 */
export const authActionButtonBase =
  'flex h-12 min-h-12 w-full touch-manip select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-[transform,opacity,background-color,box-shadow] duration-100 ease-out [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

export const authActionPrimaryClass = `${authActionButtonBase} bg-primary text-white shadow-sm hover:bg-primary-container`

export const authActionSecondaryClass = `${authActionButtonBase} border border-border-subtle bg-canvas-white text-on-surface shadow-sm hover:bg-surface-container-low`

export const authActionOutlineClass = `${authActionButtonBase} border-2 border-primary bg-primary/5 text-primary hover:bg-primary/10`

/** Smooth expand panel for email credentials below the Email CTA. */
export const authExpandPanelClass =
  'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none'

export function authExpandPanelState(open: boolean) {
  return open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
}
