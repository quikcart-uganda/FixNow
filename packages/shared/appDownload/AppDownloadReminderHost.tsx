import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  canShowAppDownloadPromptSurface,
  detectStorePlatform,
  type StorePlatform,
} from '@fixnow/native'
import { getAppDownloadConfig, isStorePublished, storeUrlForPlatform } from './appDownloadConfig'
import {
  APP_DOWNLOAD_COPY,
  APP_DOWNLOAD_DEFER_MS,
  APP_DOWNLOAD_LOCATION_STAGGER_MS,
  APP_DOWNLOAD_MIN_PAGE_VIEWS,
  deepLinkForRole,
  engagementTriggerFromPath,
  isAppDownloadPromptBlockedPath,
  type AppDownloadRole,
  type AppDownloadTrigger,
} from './appDownloadPolicy'
import {
  isAppDownloadSuppressed,
  markAppDownloadLater,
  markAppDownloadNever,
  markAppDownloadShown,
} from './appDownloadPrefs'
import { trackAppDownloadEvent } from './appDownloadAnalytics'
import { openNativeAppOrStore } from './openNativeAppOrStore'
import { AppDownloadSheet } from './AppDownloadSheet'

type Ctx = {
  role: AppDownloadRole
  /** Manually note a key action (post job, open chat, etc.). */
  signalEngagement: (trigger: AppDownloadTrigger) => void
}

const AppDownloadContext = createContext<Ctx | null>(null)

type Props = {
  role: AppDownloadRole
  children?: ReactNode
}

export function AppDownloadReminderHost({ role, children }: Props) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'download' | 'coming_soon'>('download')
  const [platform, setPlatform] = useState<StorePlatform>('unknown')

  const sessionShown = useRef(false)
  const pageViews = useRef(0)
  const seenPaths = useRef(new Set<string>())
  const startedAt = useRef(Date.now())
  const pendingTrigger = useRef<AppDownloadTrigger>('deferred')
  const eligibleSurface = useRef(canShowAppDownloadPromptSurface())

  const copy = APP_DOWNLOAD_COPY[role]
  const config = useMemo(() => getAppDownloadConfig(), [])

  const tryOpen = useCallback(
    async (trigger: AppDownloadTrigger) => {
      if (!eligibleSurface.current) return
      if (!config.enabled) return
      if (sessionShown.current || open) return
      if (isAppDownloadPromptBlockedPath(location.pathname)) return
      if (await isAppDownloadSuppressed(role)) return

      const storePlatform = detectStorePlatform()
      setPlatform(storePlatform)
      const published = isStorePublished(storePlatform, config)
      setMode(published ? 'download' : 'coming_soon')
      pendingTrigger.current = trigger
      sessionShown.current = true
      await markAppDownloadShown(role)
      setOpen(true)
      trackAppDownloadEvent(published ? 'prompt_displayed' : 'coming_soon_shown', {
        role,
        platform: storePlatform,
        trigger,
        storePublished: published,
      })
    },
    [config, location.pathname, open, role],
  )

  const signalEngagement = useCallback(
    (trigger: AppDownloadTrigger) => {
      void tryOpen(trigger)
    },
    [tryOpen],
  )

  // Track meaningful page views inside authenticated shells.
  useEffect(() => {
    if (!eligibleSurface.current) return
    const path = location.pathname.split('?')[0] || '/'
    if (isAppDownloadPromptBlockedPath(path)) return
    if (!seenPaths.current.has(path)) {
      seenPaths.current.add(path)
      pageViews.current += 1
    }

    const pathTrigger = engagementTriggerFromPath(path, role)
    if (pathTrigger) {
      // Key actions open sooner, still after a short settle.
      window.setTimeout(() => void tryOpen(pathTrigger), 1_200)
      return
    }

    if (pageViews.current >= APP_DOWNLOAD_MIN_PAGE_VIEWS) {
      const elapsed = Date.now() - startedAt.current
      if (elapsed >= Math.min(APP_DOWNLOAD_DEFER_MS, 90_000)) {
        void tryOpen('page_views')
      }
    }
  }, [location.pathname, role, tryOpen])

  // Deferred active-use timer (3–5 min band → 4 min + stagger).
  useEffect(() => {
    if (!eligibleSurface.current || !config.enabled) return
    const delay = APP_DOWNLOAD_DEFER_MS + APP_DOWNLOAD_LOCATION_STAGGER_MS
    const timer = window.setTimeout(() => {
      void tryOpen('deferred')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [config.enabled, tryOpen])

  const close = () => setOpen(false)

  const onLater = async () => {
    setBusy(true)
    try {
      await markAppDownloadLater(role)
      trackAppDownloadEvent('prompt_dismissed_later', {
        role,
        platform,
        trigger: pendingTrigger.current,
      })
      close()
    } finally {
      setBusy(false)
    }
  }

  const onNever = async () => {
    setBusy(true)
    try {
      await markAppDownloadNever(role)
      trackAppDownloadEvent('prompt_dismissed_never', {
        role,
        platform,
        trigger: pendingTrigger.current,
      })
      close()
    } finally {
      setBusy(false)
    }
  }

  const onDownload = async () => {
    setBusy(true)
    try {
      trackAppDownloadEvent('download_clicked', {
        role,
        platform,
        trigger: pendingTrigger.current,
        storePublished: mode === 'download',
      })
      const deepLink = deepLinkForRole(role, config.deepLinkBase)
      const storeUrl = storeUrlForPlatform(platform, config)
      const result = await openNativeAppOrStore({ deepLink, storeUrl })
      if (result === 'deep_link') {
        trackAppDownloadEvent('deep_link_opened', { role, platform, trigger: pendingTrigger.current })
      } else if (result === 'store') {
        trackAppDownloadEvent('store_opened', { role, platform, trigger: pendingTrigger.current })
      } else if (result === 'coming_soon') {
        setMode('coming_soon')
        trackAppDownloadEvent('coming_soon_shown', { role, platform, trigger: pendingTrigger.current })
        setBusy(false)
        return
      }
      close()
    } finally {
      setBusy(false)
    }
  }

  const value = useMemo<Ctx>(() => ({ role, signalEngagement }), [role, signalEngagement])

  // Native / desktop / PWA: render children only — zero UI cost.
  if (!eligibleSurface.current) {
    return <>{children}</>
  }

  return (
    <AppDownloadContext.Provider value={value}>
      {children}
      <AppDownloadSheet
        open={open}
        copy={copy}
        platform={platform}
        mode={mode}
        busy={busy}
        onDownload={() => void onDownload()}
        onLater={() => void onLater()}
        onNever={() => void onNever()}
        onClose={() => void onLater()}
      />
    </AppDownloadContext.Provider>
  )
}

export function useAppDownloadReminder(): Ctx {
  const ctx = useContext(AppDownloadContext)
  if (!ctx) {
    throw new Error('useAppDownloadReminder must be used within AppDownloadReminderHost')
  }
  return ctx
}

export function useOptionalAppDownloadReminder(): Ctx | null {
  return useContext(AppDownloadContext)
}
