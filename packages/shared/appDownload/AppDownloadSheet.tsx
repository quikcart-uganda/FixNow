import { BottomSheet, Button, Icon } from '@fixnow/ui'
import type { AppDownloadCopy } from './appDownloadPolicy'
import type { StorePlatform } from '@fixnow/native'

type Props = {
  open: boolean
  copy: AppDownloadCopy
  platform: StorePlatform
  mode: 'download' | 'coming_soon'
  busy?: boolean
  onDownload: () => void
  onLater: () => void
  onNever: () => void
  onClose: () => void
}

function platformHint(platform: StorePlatform): string {
  if (platform === 'android') return 'Google Play'
  if (platform === 'ios') return 'App Store'
  return 'your app store'
}

/**
 * Non-blocking bottom sheet promoting the native FixNow apps on mobile web.
 */
export function AppDownloadSheet({
  open,
  copy,
  platform,
  mode,
  busy,
  onDownload,
  onLater,
  onNever,
  onClose,
}: Props) {
  const title = mode === 'coming_soon' ? copy.comingSoonTitle : copy.title
  const body = mode === 'coming_soon' ? copy.comingSoonBody : copy.body
  const storeName = platformHint(platform)

  return (
    <BottomSheet open={open} onClose={onClose} title={title} description={body}>
      <div className="space-y-4 px-1 pb-4 pt-1">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name={mode === 'coming_soon' ? 'schedule' : 'install_mobile'} className="text-[28px]" />
        </div>

        {mode === 'download' ? (
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Continues to {storeName}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {mode === 'download' ? (
            <>
              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={busy}
                onClick={onDownload}
                className="min-h-14 rounded-2xl"
                aria-label={`${copy.primaryLabel} from ${storeName}`}
              >
                <Icon name="download" />
                {copy.primaryLabel}
              </Button>
              <Button
                type="button"
                fullWidth
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={onLater}
                className="min-h-14 rounded-2xl"
              >
                {copy.laterLabel}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              fullWidth
              size="lg"
              disabled={busy}
              onClick={onLater}
              className="min-h-14 rounded-2xl"
            >
              Got it
            </Button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onNever}
            className="min-h-11 touch-manipulation rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant underline-offset-2 hover:text-on-surface hover:underline disabled:opacity-50"
          >
            {copy.neverLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
