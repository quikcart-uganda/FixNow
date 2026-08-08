/** Env-driven store + deep-link config for the App Download Reminder. */

function readEnv(key: string): string {
  try {
    const env = import.meta.env as Record<string, string | boolean | undefined>
    const raw = env[key]
    if (typeof raw === 'string') return raw.trim()
    return ''
  } catch {
    return ''
  }
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = readEnv(key).toLowerCase()
  if (!raw) return fallback
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return fallback
}

export type AppDownloadConfig = {
  enabled: boolean
  playStoreUrl: string
  appStoreUrl: string
  /** Bumped on major releases to re-allow "Don't show again". */
  releaseVersion: string
  /** Custom scheme / universal link used to open the installed native app. */
  deepLinkBase: string
}

export function getAppDownloadConfig(): AppDownloadConfig {
  return {
    enabled: readBool('VITE_APP_DOWNLOAD_PROMPT_ENABLED', true),
    playStoreUrl: readEnv('VITE_PLAY_STORE_URL') || readEnv('VITE_ANDROID_STORE_URL'),
    appStoreUrl: readEnv('VITE_APP_STORE_URL') || readEnv('VITE_IOS_STORE_URL'),
    releaseVersion: readEnv('VITE_APP_RELEASE_VERSION') || '1.0.0',
    deepLinkBase: readEnv('VITE_APP_DOWNLOAD_DEEP_LINK') || 'fixnow://',
  }
}

export function storeUrlForPlatform(
  platform: 'android' | 'ios' | 'unknown',
  config: AppDownloadConfig = getAppDownloadConfig(),
): string | null {
  if (platform === 'android') return config.playStoreUrl || null
  if (platform === 'ios') return config.appStoreUrl || null
  return config.playStoreUrl || config.appStoreUrl || null
}

export function isStorePublished(
  platform: 'android' | 'ios' | 'unknown',
  config: AppDownloadConfig = getAppDownloadConfig(),
): boolean {
  return Boolean(storeUrlForPlatform(platform, config))
}
