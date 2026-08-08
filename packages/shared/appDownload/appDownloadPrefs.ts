/**
 * Persistent prefs for App Download Reminder suppression.
 */

import { cacheGet, cacheSet } from '@fixnow/native'
import type { AppDownloadRole } from './appDownloadPolicy'
import { APP_DOWNLOAD_LATER_MS } from './appDownloadPolicy'
import { getAppDownloadConfig } from './appDownloadConfig'

export type AppDownloadPrefs = {
  lastShownAt?: number
  laterUntil?: number
  /** When set and matches current release, never show. */
  neverShowForVersion?: string
  updatedAt?: number
}

const PREF_KEYS: Record<AppDownloadRole, string> = {
  customer: 'fixnow.app.download.prompt.customer.v1',
  technician: 'fixnow.app.download.prompt.technician.v1',
}

const EMPTY: AppDownloadPrefs = {}

export async function loadAppDownloadPrefs(role: AppDownloadRole): Promise<AppDownloadPrefs> {
  const stored = await cacheGet<AppDownloadPrefs>(PREF_KEYS[role])
  if (!stored || typeof stored !== 'object') return { ...EMPTY }
  return { ...EMPTY, ...stored }
}

export async function saveAppDownloadPrefs(
  role: AppDownloadRole,
  patch: Partial<AppDownloadPrefs>,
): Promise<AppDownloadPrefs> {
  const current = await loadAppDownloadPrefs(role)
  const next: AppDownloadPrefs = { ...current, ...patch, updatedAt: Date.now() }
  await cacheSet(PREF_KEYS[role], next, 400 * 24 * 60 * 60_000)
  return next
}

export async function markAppDownloadLater(role: AppDownloadRole): Promise<void> {
  await saveAppDownloadPrefs(role, {
    laterUntil: Date.now() + APP_DOWNLOAD_LATER_MS,
    lastShownAt: Date.now(),
  })
}

export async function markAppDownloadNever(role: AppDownloadRole): Promise<void> {
  const version = getAppDownloadConfig().releaseVersion
  await saveAppDownloadPrefs(role, {
    neverShowForVersion: version,
    lastShownAt: Date.now(),
  })
}

export async function markAppDownloadShown(role: AppDownloadRole): Promise<void> {
  await saveAppDownloadPrefs(role, { lastShownAt: Date.now() })
}

export async function isAppDownloadSuppressed(role: AppDownloadRole): Promise<boolean> {
  const prefs = await loadAppDownloadPrefs(role)
  const version = getAppDownloadConfig().releaseVersion
  if (prefs.neverShowForVersion && prefs.neverShowForVersion === version) return true
  if (prefs.laterUntil && Date.now() < prefs.laterUntil) return true
  return false
}
