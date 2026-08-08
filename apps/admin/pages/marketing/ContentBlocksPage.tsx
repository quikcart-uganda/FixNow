import { useMemo, useState } from 'react'
import {
  contentBlocksApi,
  getFriendlyErrorMessage,
  uploadMediaFile,
  type AdminContentBlock,
  type ContentBlockAudience,
  type ContentBlockStatus,
  type ContentBlockType,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, StatusBadge } from '../../components/ui'
import { safeArray } from '@fixnow/utils'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'

const TYPES: ContentBlockType[] = [
  'hero_headline',
  'hero_description',
  'welcome_message',
  'promo_banner',
  'announcement',
  'sponsored_campaign',
  'advertisement',
  'educational',
  'safety_tip',
  'service_awareness',
  'referral_campaign',
  'seasonal_campaign',
  'recruitment_campaign',
  'technician_onboarding',
  'customer_onboarding',
  'feature_announcement',
  'feature_card',
]

const AUDIENCES: ContentBlockAudience[] = [
  'customers',
  'technicians',
  'both',
  'guests',
  'logged_in',
  'new_users',
  'returning_users',
]

const PAGES = [
  'global',
  'customer.splash',
  'customer.onboarding',
  'customer.login',
  'customer.register',
  'customer.home',
  'customer.dashboard',
  'customer.bookings',
  'customer.checkout',
  'customer.notifications',
  'technician.splash',
  'technician.landing',
  'technician.onboarding',
  'technician.login',
  'technician.register',
  'technician.dashboard',
  'technician.jobs',
  'technician.wallet',
  'technician.profile',
  'admin.marketing_preview',
  'admin.content_preview',
]

type FormState = {
  type: ContentBlockType
  audience: ContentBlockAudience
  page: string
  section: string
  title: string
  subtitle: string
  body: string
  icon: string
  imageUrl: string
  ctaLabel: string
  ctaHref: string
  color: string
  badge: string
  priority: number
  displayOrder: number
  weight: number
  maxImpressions: string
  startsAt: string
  endsAt: string
  publish: boolean
}

const EMPTY_FORM: FormState = {
  type: 'hero_headline',
  audience: 'guests',
  page: 'customer.register',
  section: 'hero',
  title: '',
  subtitle: '',
  body: '',
  icon: '',
  imageUrl: '',
  ctaLabel: '',
  ctaHref: '',
  color: '',
  badge: '',
  priority: 0,
  displayOrder: 0,
  weight: 1,
  maxImpressions: '',
  startsAt: '',
  endsAt: '',
  publish: true,
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function statusTone(status: ContentBlockStatus) {
  if (status === 'published') return 'success' as const
  if (status === 'scheduled') return 'info' as const
  if (status === 'draft') return 'warning' as const
  return 'neutral' as const
}

export function ContentBlocksPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pageFilter, setPageFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const analytics = useAsync(async () => (await contentBlocksApi.analytics()).data, [])
  const list = useAsync(
    async () =>
      (
        await contentBlocksApi.listAdmin({
          limit: 100,
          page: pageFilter || undefined,
          status: statusFilter || undefined,
        })
      ).data.items,
    [pageFilter, statusFilter],
  )

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError(null)
  }

  const beginEdit = (block: AdminContentBlock) => {
    setEditingId(block.id)
    setError(null)
    setForm({
      type: block.type,
      audience: block.audience,
      page: block.page,
      section: block.section,
      title: block.title ?? '',
      subtitle: block.subtitle ?? '',
      body: block.body ?? '',
      icon: block.icon ?? '',
      imageUrl: block.imageUrl ?? '',
      ctaLabel: block.ctaLabel ?? '',
      ctaHref: block.ctaHref ?? '',
      color: block.color ?? '',
      badge: block.badge ?? '',
      priority: block.priority ?? 0,
      displayOrder: block.displayOrder ?? 0,
      weight: block.weight ?? 1,
      maxImpressions: block.maxImpressions != null ? String(block.maxImpressions) : '',
      startsAt: block.startsAt ? new Date(block.startsAt).toISOString().slice(0, 16) : '',
      endsAt: block.endsAt ? new Date(block.endsAt).toISOString().slice(0, 16) : '',
      publish: block.status === 'published' || block.status === 'scheduled',
    })
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        type: form.type,
        audience: form.audience,
        page: form.page,
        section: form.section.trim().toLowerCase(),
        title: form.title || undefined,
        subtitle: form.subtitle || undefined,
        body: form.body || undefined,
        icon: form.icon || undefined,
        imageUrl: form.imageUrl || undefined,
        ctaLabel: form.ctaLabel || undefined,
        ctaHref: form.ctaHref || undefined,
        color: form.color || undefined,
        badge: form.badge || undefined,
        priority: Number(form.priority) || 0,
        displayOrder: Number(form.displayOrder) || 0,
        weight: Number(form.weight) || 1,
        maxImpressions: form.maxImpressions ? Number(form.maxImpressions) : null,
        startsAt: toIsoOrNull(form.startsAt),
        endsAt: toIsoOrNull(form.endsAt),
        publish: form.publish,
      }
      if (editingId) await contentBlocksApi.update(editingId, payload)
      else await contentBlocksApi.create(payload)
      resetForm()
      await Promise.all([list.reload(), analytics.reload()])
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (block: AdminContentBlock, status: ContentBlockStatus) => {
    try {
      await contentBlocksApi.setStatus(block.id, status)
      await Promise.all([list.reload(), analytics.reload()])
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  const seedDefaults = async () => {
    try {
      const res = await contentBlocksApi.seed()
      window.alert(`Seeded ${res.data.created} of ${res.data.total} default blocks.`)
      await Promise.all([list.reload(), analytics.reload()])
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  const totals = analytics.data?.totals
  const previewBlock = useMemo<FormState>(() => form, [form])

  function focusBlocks(next: { status?: string; metric?: 'impressions' | 'clicks' | 'ctr' | 'all' }) {
    if (next.status !== undefined) setStatusFilter(next.status)
    const el = document.getElementById('content-blocks-workspace')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const kpiCards: Array<{
    label: string
    value: string | number
    onSelect: () => void
  }> = [
    {
      label: 'Total blocks',
      value: totals?.blocks ?? 0,
      onSelect: () => focusBlocks({ status: '', metric: 'all' }),
    },
    {
      label: 'Live',
      value: totals?.live ?? 0,
      onSelect: () => focusBlocks({ status: 'published' }),
    },
    {
      label: 'Scheduled',
      value: totals?.scheduled ?? 0,
      onSelect: () => focusBlocks({ status: 'scheduled' }),
    },
    {
      label: 'Drafts',
      value: totals?.draft ?? 0,
      onSelect: () => focusBlocks({ status: 'draft' }),
    },
    {
      label: 'Impressions',
      value: totals?.impressions ?? 0,
      onSelect: () => focusBlocks({ status: 'published', metric: 'impressions' }),
    },
    {
      label: 'Clicks',
      value: totals?.clicks ?? 0,
      onSelect: () => focusBlocks({ status: 'published', metric: 'clicks' }),
    },
    {
      label: 'CTR',
      value: `${totals?.ctr ?? 0}%`,
      onSelect: () => focusBlocks({ status: 'published', metric: 'ctr' }),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onSelect}
            className="group rounded-2xl border border-border-subtle bg-canvas-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-ink-muted">{card.label}</p>
              <span className="material-symbols-outlined text-[16px] text-ink-muted opacity-0 transition group-hover:opacity-100">
                chevron_right
              </span>
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-outline-variant px-2 text-sm"
          value={pageFilter}
          onChange={(e) => setPageFilter(e.target.value)}
        >
          <option value="">All pages</option>
          {PAGES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-lg border border-outline-variant px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {['draft', 'scheduled', 'published', 'expired', 'archived'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => void seedDefaults()}>
          Seed defaults
        </Button>
      </div>

      <div id="content-blocks-workspace" className="scroll-mt-24 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <AsyncStateView
          status={list.status}
          error={list.error}
          onRetry={() => void list.reload()}
          emptyTitle="No content blocks"
          emptyHint="Create audience- and page-targeted content, or seed the platform defaults."
        >
          <div className="space-y-3">
            {safeArray<AdminContentBlock>(list.data).map((item) => (
              <div key={item.id} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-primary">
                      {item.title || item.body || `(${item.type})`}
                    </p>
                    {item.subtitle || item.body ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">{item.subtitle || item.body}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-ink-muted">
                      {item.type.replace(/_/g, ' ')} · {item.page} / {item.section} · {item.audience} · P{item.priority}
                      {item.maxImpressions ? ` · cap ${item.maxImpressions}` : ''} · {item.analytics.impressions} views ·{' '}
                      {item.analytics.clicks} clicks · CTR {item.analytics.ctr}%
                    </p>
                  </div>
                  <StatusBadge label={item.status} tone={statusTone(item.status)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => beginEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => void changeStatus(item, 'published')}>
                    Publish
                  </Button>
                  <Button variant="outline" onClick={() => void changeStatus(item, 'draft')}>
                    Draft
                  </Button>
                  <Button variant="outline" onClick={() => void changeStatus(item, 'archived')}>
                    Archive
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null)
                      void contentBlocksApi
                        .duplicate(item.id)
                        .then(() => list.reload())
                        .catch((err) => setError(getFriendlyErrorMessage(err)))
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (!window.confirm('Delete this content block?')) return
                      setError(null)
                      void contentBlocksApi
                        .remove(item.id)
                        .then(() => Promise.all([list.reload(), analytics.reload()]))
                        .catch((err) => setError(getFriendlyErrorMessage(err)))
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </AsyncStateView>

        <aside className="h-fit space-y-3 rounded-2xl border border-outline-variant bg-canvas-white p-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink-primary">{editingId ? 'Edit content block' : 'Create content block'}</h3>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-primary" onClick={resetForm}>
                New
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-muted">
              Type
              <select
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.type}
                onChange={(e) => set('type', e.target.value as ContentBlockType)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-muted">
              Audience
              <select
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.audience}
                onChange={(e) => set('audience', e.target.value as ContentBlockAudience)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-muted">
              Page
              <select
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.page}
                onChange={(e) => set('page', e.target.value)}
              >
                {PAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-muted">
              Section (slot)
              <input
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
                placeholder="hero / feature / slide"
                value={form.section}
                onChange={(e) => set('section', e.target.value)}
              />
            </label>
          </div>

          <input
            className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <input
            className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Subtitle"
            value={form.subtitle}
            onChange={(e) => set('subtitle', e.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            placeholder="Body"
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="Icon (material name)"
              value={form.icon}
              onChange={(e) => set('icon', e.target.value)}
            />
            <input
              className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="Badge"
              value={form.badge}
              onChange={(e) => set('badge', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="CTA label"
              value={form.ctaLabel}
              onChange={(e) => set('ctaLabel', e.target.value)}
            />
            <input
              className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="CTA href"
              value={form.ctaHref}
              onChange={(e) => set('ctaHref', e.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-dashed border-outline-variant p-3">
            <p className="text-xs font-semibold text-ink-muted">Block image (optional)</p>
            {form.imageUrl ? (
              <LazyImage
                src={resolveMediaUrl(form.imageUrl, 'campaigns.safety')}
                fallback={resolveMediaUrl(null, 'campaigns.safety')}
                alt="Block image preview"
                className="h-24 w-full rounded-lg object-cover"
              />
            ) : null}
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              className="block w-full text-sm text-ink-secondary"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void (async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    const uploaded = await uploadMediaFile(file, 'content-block', file.name)
                    const url = uploaded.upload?.url
                    if (!url) throw new Error('Upload failed')
                    set('imageUrl', url)
                  } catch (err) {
                    setError(getFriendlyErrorMessage(err))
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            />
            {form.imageUrl ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => set('imageUrl', '')}
              >
                Remove image
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-ink-muted">
              Priority
              <input
                type="number"
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.priority}
                onChange={(e) => set('priority', Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-ink-muted">
              Order
              <input
                type="number"
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.displayOrder}
                onChange={(e) => set('displayOrder', Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-ink-muted">
              Weight
              <input
                type="number"
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.weight}
                onChange={(e) => set('weight', Number(e.target.value))}
              />
            </label>
          </div>

          <label className="block text-xs text-ink-muted">
            Max impressions (blank = unlimited)
            <input
              type="number"
              className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
              value={form.maxImpressions}
              onChange={(e) => set('maxImpressions', e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-muted">
              Starts (optional)
              <input
                type="datetime-local"
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </label>
            <label className="text-xs text-ink-muted">
              Ends (optional)
              <input
                type="datetime-local"
                className="mt-1 h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input type="checkbox" checked={form.publish} onChange={(e) => set('publish', e.target.checked)} />
            Publish immediately (schedule-aware)
          </label>

          {/* Live preview */}
          <div className="rounded-xl border border-dashed border-outline-variant bg-black/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Preview</p>
            {previewBlock.imageUrl ? (
              <div className="mb-2 h-24 overflow-hidden rounded-lg border border-border">
                <LazyImage
                  src={resolveMediaUrl(previewBlock.imageUrl, 'campaigns.safety')}
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={resolveMediaUrl(null, 'campaigns.safety')}
                />
              </div>
            ) : null}
            <div
              className="rounded-lg p-3"
              style={previewBlock.color ? { background: previewBlock.color, color: '#fff' } : undefined}
            >
              {previewBlock.badge ? (
                <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                  {previewBlock.badge}
                </span>
              ) : null}
              <p className="text-sm font-semibold">{previewBlock.title || '(title)'}</p>
              {previewBlock.subtitle ? <p className="text-xs opacity-90">{previewBlock.subtitle}</p> : null}
              {previewBlock.body ? <p className="mt-1 text-xs opacity-80">{previewBlock.body}</p> : null}
              {previewBlock.ctaLabel ? (
                <span className="mt-2 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white">
                  {previewBlock.ctaLabel}
                </span>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create block'}
          </Button>
        </aside>
      </div>
    </div>
  )
}
