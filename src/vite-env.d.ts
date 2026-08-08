/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SOCKET_URL?: string
  readonly VITE_FCM_WEB_TOKEN?: string
  /** Reserved — not read by runtime code yet */
  readonly VITE_FCM_VAPID_KEY?: string
  /** Reserved — no @sentry/* frontend package wired yet */
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_AUTH_BRIDGE_ORIGIN?: string
  /** Documented override; runtime client ID normally comes from GET /auth/google/config */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string
  /** Google Play listing URL — leave empty until published */
  readonly VITE_PLAY_STORE_URL?: string
  /** Alias for VITE_PLAY_STORE_URL */
  readonly VITE_ANDROID_STORE_URL?: string
  /** Apple App Store listing URL — leave empty until published */
  readonly VITE_APP_STORE_URL?: string
  /** Alias for VITE_APP_STORE_URL */
  readonly VITE_IOS_STORE_URL?: string
  /** Kill switch for mobile-web App Download Reminder */
  readonly VITE_APP_DOWNLOAD_PROMPT_ENABLED?: string
  /** Bump on major releases to re-prompt users who chose "Don't show again" */
  readonly VITE_APP_RELEASE_VERSION?: string
  /** Deep link / custom scheme used to open the installed native app */
  readonly VITE_APP_DOWNLOAD_DEEP_LINK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
