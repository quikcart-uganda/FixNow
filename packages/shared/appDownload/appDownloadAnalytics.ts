import { recordInfoDiagnostic } from '@fixnow/api'
import type { AppDownloadRole, AppDownloadTrigger } from './appDownloadPolicy'
import type { StorePlatform } from '@fixnow/native'

export type AppDownloadAnalyticsEvent =
  | 'prompt_displayed'
  | 'download_clicked'
  | 'store_opened'
  | 'deep_link_opened'
  | 'prompt_dismissed_later'
  | 'prompt_dismissed_never'
  | 'coming_soon_shown'

export function trackAppDownloadEvent(
  event: AppDownloadAnalyticsEvent,
  meta: {
    role: AppDownloadRole
    platform?: StorePlatform
    trigger?: AppDownloadTrigger
    storePublished?: boolean
  },
): void {
  try {
    recordInfoDiagnostic(`app_download:${event}`, {
      category: 'app_download',
      event,
      ...meta,
    })
  } catch {
    /* analytics must never break UX */
  }
}
