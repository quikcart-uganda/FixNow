import { useState } from 'react'
import { getFriendlyErrorMessage, marketingApi, type PlatformPromotion } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { Button, StatusBadge } from '../../components/ui'
import { MediaLibrary, type MediaAsset } from '../../components/cms/MediaLibrary'
import { safeArray } from '@fixnow/utils'

const KINDS = ['holiday', 'welcome', 'referral', 'seasonal', 'announcement', 'custom'] as const

function emptyForm() {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 14)
  return {
    kind: 'holiday' as (typeof KINDS)[number],
    title: '',
    subtitle: '',
    description: '',
    terms: '',
    badge: '',
    code: '',
    discountType: 'percent',
    discountValue: 10,
    audience: 'customer',
    bannerImageUrl: '',
    startsAt: start.toISOString().slice(0, 16),
    endsAt: end.toISOString().slice(0, 16),
    publish: true,
    featured: true,
  }
}

export function PlatformPromotionsPage() {
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PlatformPromotion | null>(null)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [previewAudience, setPreviewAudience] = useState<'customer' | 'technician'>('customer')
  const list = useAsync(async () => (await marketingApi.listPlatformPromotions({ limit: 50 })).data.items, [])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await marketingApi.createPlatformPromotion({
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      })
      setForm(emptyForm())
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (item: PlatformPromotion, status: 'active' | 'paused' | 'archived') => {
    try {
      await marketingApi.statusPlatformPromotion(item.id, status)
      await list.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <AsyncStateView
        status={list.status}
        error={list.error}
        onRetry={() => void list.reload()}
        emptyTitle="No platform promotions"
        emptyHint="Create holiday, welcome, referral, or seasonal campaigns owned by FixNow."
      >
        <div className="space-y-3">
          {safeArray<PlatformPromotion>(list.data).map((item) => (
            <div key={item.id} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <button type="button" className="w-full text-left" onClick={() => setSelected(item)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {item.bannerImageUrl ? (
                      <div className="mb-3 h-28 overflow-hidden rounded-xl border border-border">
                        <LazyImage
                          src={resolveMediaUrl(item.bannerImageUrl, 'promotions.first-booking')}
                          alt=""
                          className="h-full w-full object-cover"
                          fallback={resolveMediaUrl(null, 'promotions.first-booking')}
                        />
                      </div>
                    ) : null}
                    <p className="font-semibold text-ink-primary">{item.title}</p>
                    <p className="mt-1 text-sm text-ink-secondary">{item.subtitle || item.description}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {item.kind} · {item.discountType} {item.discountValue}
                      {item.code ? ` · code ${item.code}` : ''}
                    </p>
                  </div>
                  <StatusBadge
                    label={item.status}
                    tone={item.status === 'active' ? 'success' : item.status === 'paused' ? 'warning' : 'neutral'}
                  />
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setSelected(item)}>
                  Details
                </Button>
                <Button variant="outline" onClick={() => void setStatus(item, 'active')}>
                  Activate
                </Button>
                <Button variant="outline" onClick={() => void setStatus(item, 'paused')}>
                  Pause
                </Button>
                <Button variant="outline" onClick={() => void setStatus(item, 'archived')}>
                  Archive
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (!window.confirm('Delete this platform promotion?')) return
                    setError(null)
                    void marketingApi
                      .deletePlatformPromotion(item.id)
                      .then(() => list.reload())
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

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Promotion'}
        description="Full detail, schedule, audience, and campaign statistics"
        placement="end"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            {selected.bannerImageUrl ? (
              <div className="h-40 overflow-hidden rounded-xl border border-border">
                <LazyImage
                  src={resolveMediaUrl(selected.bannerImageUrl, 'promotions.first-booking')}
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={resolveMediaUrl(null, 'promotions.first-booking')}
                />
              </div>
            ) : (
              <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt text-xs text-ink-muted">
                No banner media
              </div>
            )}
            <p className="text-ink-secondary">{selected.description}</p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-ink-muted">Audience</dt>
                <dd className="font-medium">{selected.audience}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Schedule</dt>
                <dd className="text-xs tabular-nums">
                  {new Date(selected.startsAt).toLocaleString()} → {new Date(selected.endsAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Views</dt>
                <dd className="font-semibold tabular-nums">{selected.analytics.views}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Clicks / CTR</dt>
                <dd className="font-semibold tabular-nums">
                  {selected.analytics.clicks} / {selected.analytics.ctr}%
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Redemptions</dt>
                <dd className="font-semibold tabular-nums">{selected.analytics.redemptions}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Featured</dt>
                <dd>{selected.featured ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>

      <aside className="h-fit space-y-3 rounded-2xl border border-outline-variant bg-canvas-white p-4 lg:sticky lg:top-24">
        <h3 className="font-semibold text-ink-primary">Create platform promotion</h3>
        <p className="text-xs text-ink-muted">Admin-owned — not tied to a technician.</p>
        <label className="block text-xs font-semibold text-ink-muted">
          Kind
          <select
            className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as (typeof KINDS)[number] }))}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink-muted">
          Audience
          <select
            className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
            value={form.audience}
            onChange={(e) => {
              const audience = e.target.value
              setForm((f) => ({ ...f, audience }))
              if (audience === 'technician' || audience === 'customer') {
                setPreviewAudience(audience)
              }
            }}
          >
            <option value="customer">Customer</option>
            <option value="technician">Technician</option>
            <option value="all">All</option>
          </select>
        </label>
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Subtitle"
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
        />
        <textarea
          className="min-h-24 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <div className="space-y-2 rounded-xl border border-dashed border-outline-variant p-3">
          <p className="text-xs font-semibold text-ink-muted">Banner image (JPG / PNG / WEBP)</p>
          <MediaLibrary
            assets={assets}
            onAssetsChange={setAssets}
            selectedUrl={form.bannerImageUrl}
            onSelect={(asset) => setForm((f) => ({ ...f, bannerImageUrl: asset.url }))}
            compact
          />
          {form.bannerImageUrl ? (
            <button
              type="button"
              className="text-xs font-semibold text-error"
              onClick={() => setForm((f) => ({ ...f, bannerImageUrl: '' }))}
            >
              Remove banner
            </button>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-surface-alt p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPreviewDevice(d)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                  previewDevice === d ? 'bg-primary text-white' : 'bg-canvas-white text-ink-muted'
                }`}
              >
                {d}
              </button>
            ))}
            {(['customer', 'technician'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setPreviewAudience(a)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                  previewAudience === a ? 'bg-primary text-white' : 'bg-canvas-white text-ink-muted'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Live preview</p>
          <div
            className={`overflow-hidden rounded-xl bg-primary text-white shadow-sm ${
              previewDevice === 'mobile' ? 'max-w-[220px]' : 'w-full'
            }`}
          >
            <div className="aspect-[16/9] w-full overflow-hidden bg-black/20">
              <LazyImage
                src={resolveMediaUrl(form.bannerImageUrl || null, 'promotions.first-booking')}
                alt={form.title || 'Promotion preview'}
                className="h-full w-full object-cover"
                fallback={resolveMediaUrl(null, 'promotions.first-booking')}
              />
            </div>
            <div className="space-y-1 p-3">
              <p className="text-[10px] font-bold uppercase opacity-80">{previewAudience} rail</p>
              <p className="text-sm font-bold">{form.title || 'Promotion title'}</p>
              <p className="line-clamp-2 text-xs opacity-90">
                {form.subtitle || form.description || 'Description appears here as you type.'}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            className="h-10 rounded-lg border border-outline-variant px-3 text-sm"
            value={form.discountValue}
            onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
          />
          <input
            className="h-10 rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Code (optional)"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            className="h-10 rounded-lg border border-outline-variant px-2 text-sm"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          />
          <input
            type="datetime-local"
            className="h-10 rounded-lg border border-outline-variant px-2 text-sm"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          />
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <Button disabled={busy || !form.title.trim()} onClick={() => void create()}>
          {busy ? 'Saving…' : 'Publish promotion'}
        </Button>
      </aside>
    </div>
  )
}
