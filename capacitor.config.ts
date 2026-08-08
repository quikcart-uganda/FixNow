import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for FixNow.
 *
 * `webDir` points at the Vite production build. Live-reload against a LAN
 * Vite server is enabled only when CAP_SERVER_URL is set (never in release).
 */
const serverUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.fixnow.app',
  appName: 'FixNow',
  webDir: 'dist',
  loggingBehavior: 'production',
  backgroundColor: '#002a74',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'app.fixnow.local',
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        }
      : {}),
  },
  plugins: {
    SplashScreen: {
      // Keep native splash until React asks to hide it (seamless handoff into HTML splash).
      launchShowDuration: 0,
      launchAutoHide: false,
      launchFadeOutDuration: 360,
      backgroundColor: '#002a74',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      // CENTER keeps the logo plate sharp; CENTER_CROP was stretching the mark.
      androidScaleType: 'CENTER',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#002a74',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#002a74',
    // Enable Chrome remote debugging for debug/live-reload sessions only.
    webContentsDebuggingEnabled:
      process.env.CAP_WEB_DEBUG === '1' ||
      process.env.CAP_WEB_DEBUG === 'true' ||
      Boolean(serverUrl),
  },
  ios: {
    backgroundColor: '#002a74',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
}

export default config
