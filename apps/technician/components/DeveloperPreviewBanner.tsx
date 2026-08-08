import { Link } from 'react-router-dom'
import { Button } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'
import { UX_DEVELOPMENT, uxText } from '@fixnow/shared'
import { developerPreviewApi, getFriendlyErrorMessage } from '@fixnow/api'
import { useState } from 'react'

/**
 * Persistent Developer Preview chrome — simulation badge + exit.
 * Shown only when a Developer Preview session is active.
 */
export function DeveloperPreviewBanner() {
  const { previewActive, entitlementPlanCode, refreshProfile } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!previewActive) return null

  const plan = String(entitlementPlanCode || 'Preview').replace('_', ' + ')

  async function exit() {
    setBusy(true)
    setError(null)
    try {
      await developerPreviewApi.exit()
      await refreshProfile()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-teal-700/30 bg-teal-700/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-caps text-teal-900">{uxText(UX_DEVELOPMENT.previewBannerTitle)}</p>
          <p className="text-label text-on-surface-variant">
            {uxText(UX_DEVELOPMENT.previewBannerBody(plan))}
          </p>
          {error ? <p className="mt-1 text-label text-error">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/technician/upgrade">
            <Button variant="outline" className="min-h-10">
              Switch preview
            </Button>
          </Link>
          <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => void exit()}>
            {busy ? 'Exiting…' : 'Exit Preview'}
          </Button>
        </div>
      </div>
    </div>
  )
}
