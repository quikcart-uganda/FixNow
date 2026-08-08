import { useEffect, useState } from 'react'
import { devSettingsApi, type PublicDevSettings } from '@fixnow/api'

/**
 * Development settings are owned by the backend (env flags + admin overrides,
 * with production forced off). The frontend only reflects what the backend
 * reports — it never decides on its own that a dev affordance is safe to show.
 */

const PRODUCTION_SAFE_DEFAULT: PublicDevSettings = {
  environment: 'production',
  enableDevOtp: false,
  enableDevelopmentMode: false,
}

let inflight: Promise<PublicDevSettings> | null = null
let snapshot: PublicDevSettings | null = null

export function loadDevSettings(): Promise<PublicDevSettings> {
  if (snapshot) return Promise.resolve(snapshot)
  inflight ??= devSettingsApi
    .public()
    .then((res) => {
      snapshot = {
        environment: res.data.environment ?? 'production',
        enableDevOtp: res.data.enableDevOtp === true,
        enableDevelopmentMode: res.data.enableDevelopmentMode === true,
      }
      return snapshot
    })
    .catch(() => PRODUCTION_SAFE_DEFAULT)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Clears the cached snapshot (used after an admin changes the toggles). */
export function resetDevSettingsCache() {
  snapshot = null
  inflight = null
}

export function useDevSettings(): { settings: PublicDevSettings; loading: boolean } {
  const [settings, setSettings] = useState<PublicDevSettings>(snapshot ?? PRODUCTION_SAFE_DEFAULT)
  const [loading, setLoading] = useState(!snapshot)

  useEffect(() => {
    let cancelled = false
    void loadDevSettings()
      .then((value) => {
        if (cancelled) return
        setSettings(value)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading }
}

/**
 * Renders a verification code on screen only when the backend says OTP display
 * is enabled (never in production). Copy stays product-facing — no environment,
 * configuration, or “dev” labels.
 */
export function DevOtpNotice({ code, className }: { code?: string | null; className?: string }) {
  const { settings } = useDevSettings()

  if (!code) return null
  if (settings.environment === 'production' || !settings.enableDevOtp) return null

  return (
    <p
      data-testid="dev-otp-notice"
      className={
        className ??
        'rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-2 font-mono text-xs text-on-surface-variant'
      }
    >
      Your verification code: <span className="font-semibold tracking-widest">{code}</span>
    </p>
  )
}
