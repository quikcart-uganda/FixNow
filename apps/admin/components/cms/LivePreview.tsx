import { sanitizeContentHtml } from '@fixnow/shared'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { cn } from '@fixnow/utils'
import { Icon } from '../ui'
import { audienceLabel } from './labels'
import { markdownToPreviewHtml } from './previewHtml'

export type PreviewMode =
  | 'desktop'
  | 'customer'
  | 'technician'
  | 'tablet'
  | 'mobile'
  | 'banner'
  | 'card'
  | 'popup'
  | 'notification'

export type PreviewModel = {
  title: string
  excerpt?: string
  bodyMarkdown?: string
  bodyHtml?: string
  heroImageUrl?: string
  audience?: string
  ctaLabel?: string
  icon?: string
  status?: string
}

const MODES: Array<{ id: PreviewMode; label: string; icon: string }> = [
  { id: 'desktop', label: 'Desktop', icon: 'desktop_windows' },
  { id: 'customer', label: 'Customer app', icon: 'person' },
  { id: 'technician', label: 'Technician app', icon: 'engineering' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet_mac' },
  { id: 'mobile', label: 'Mobile', icon: 'smartphone' },
  { id: 'banner', label: 'Banner', icon: 'view_carousel' },
  { id: 'card', label: 'Card', icon: 'style' },
  { id: 'popup', label: 'Popup', icon: 'web_asset' },
  { id: 'notification', label: 'Notification', icon: 'notifications' },
]

type Props = {
  model: PreviewModel
  mode: PreviewMode
  onModeChange: (mode: PreviewMode) => void
}

function ArticleBody({ model }: { model: PreviewModel }) {
  let html = ''
  try {
    html = model.bodyHtml
      ? sanitizeContentHtml(model.bodyHtml)
      : markdownToPreviewHtml(model.bodyMarkdown || '')
  } catch {
    html = '<p class="text-ink-muted">Preview unavailable for this content.</p>'
  }
  return (
    <div className="space-y-3">
      {model.heroImageUrl ? (
        <div className="aspect-[16/9] overflow-hidden rounded-xl bg-surface-alt">
          <LazyImage
            src={resolveMediaUrl(model.heroImageUrl)}
            alt=""
            className="h-full w-full object-cover"
            emptyContent={<span className="flex h-full items-center justify-center text-ink-muted">Image</span>}
          />
        </div>
      ) : null}
      <div className="flex items-start gap-2">
        {model.icon ? (
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name={model.icon || 'article'} className="!text-[20px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink-primary">{model.title || 'Untitled'}</h3>
          {model.excerpt ? <p className="mt-1 text-sm text-ink-secondary">{model.excerpt}</p> : null}
          <p className="mt-1 text-[11px] text-ink-muted">Audience · {audienceLabel(model.audience || 'all')}</p>
        </div>
      </div>
      <div
        className="prose prose-sm max-w-none break-words text-ink-primary [&_img]:max-w-full [&_pre]:overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html || '<p></p>' }}
      />
      {model.ctaLabel ? (
        <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
          {model.ctaLabel}
        </button>
      ) : null}
    </div>
  )
}

export function LivePreview({ model, mode, onModeChange }: Props) {
  const frameClass =
    mode === 'desktop'
      ? 'max-w-none min-w-0'
      : mode === 'tablet'
        ? 'mx-auto w-full max-w-md min-w-0'
        : mode === 'mobile' || mode === 'customer' || mode === 'technician'
          ? 'mx-auto w-full max-w-[min(100%,320px)] min-w-0'
          : 'max-w-none min-w-0'

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold touch-manipulation',
              mode === m.id
                ? 'border-primary bg-primary text-white'
                : 'border-border text-ink-secondary hover:border-primary/40',
            )}
          >
            <Icon name={m.icon} className="!text-[14px]" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-alt/50 p-3 sm:mt-4 sm:p-4">
        <div className={cn('rounded-2xl border border-border bg-canvas p-3 shadow-sm sm:p-4', frameClass)}>
          {(mode === 'customer' || mode === 'technician') && (
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              <span>FixNow {mode === 'customer' ? 'Customer' : 'Technician'}</span>
              <span>9:41</span>
            </div>
          )}

          {mode === 'banner' ? (
            <div className="overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/70 p-4 text-white">
              <p className="text-xs font-semibold uppercase opacity-80">Homepage banner</p>
              <p className="mt-1 break-words text-lg font-bold">{model.title || 'Banner title'}</p>
              <p className="mt-1 break-words text-sm opacity-90">{model.excerpt || 'Supporting line'}</p>
              {model.ctaLabel ? (
                <span className="mt-3 inline-block rounded-md bg-white px-3 py-1 text-xs font-bold text-primary">
                  {model.ctaLabel}
                </span>
              ) : null}
            </div>
          ) : null}

          {mode === 'card' ? (
            <div className="rounded-xl border border-border p-4">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={model.icon || 'article'} />
                </span>
                <div className="min-w-0">
                  <p className="break-words font-semibold text-ink-primary">{model.title || 'Card title'}</p>
                  <p className="mt-1 line-clamp-3 break-words text-sm text-ink-secondary">
                    {model.excerpt || 'Card summary appears here.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'popup' ? (
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-border p-5 text-center shadow-lg">
              <Icon name={model.icon || 'campaign'} className="!text-[36px] text-primary" />
              <p className="mt-2 break-words text-lg font-bold">{model.title || 'Popup title'}</p>
              <p className="mt-2 break-words text-sm text-ink-secondary">{model.excerpt || 'Popup message'}</p>
              {model.ctaLabel ? (
                <button type="button" className="mt-4 min-h-11 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white touch-manipulation">
                  {model.ctaLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === 'notification' ? (
            <div className="flex min-w-0 gap-3 rounded-xl border border-border bg-surface-alt p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                <Icon name="notifications" className="!text-[20px]" />
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-ink-primary">{model.title || 'Notification title'}</p>
                <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-secondary">
                  {model.excerpt || 'Notification body preview'}
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">Just now</p>
              </div>
            </div>
          ) : null}

          {['desktop', 'customer', 'technician', 'tablet', 'mobile'].includes(mode) ? (
            <ArticleBody model={model} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
