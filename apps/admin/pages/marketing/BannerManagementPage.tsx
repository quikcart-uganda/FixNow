import { useMemo, useState } from 'react'
import { getFriendlyErrorMessage, marketingApi, type SponsoredContent } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog, SponsoredHeroBanner } from '@fixnow/shared'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { Button, StatusBadge } from '../../components/ui'
import { MediaLibrary, type MediaAsset } from '../../components/cms/MediaLibrary'
import { ImageCropDialog } from '../../components/cms/ImageCropDialog'
import { safeArray } from '@fixnow/utils'

const TYPES = [
  'partner_ad',
  'educational_banner',
  'safety_campaign',
  'announcement',
  'tip',
  'community_notice',
] as const

type PreviewDevice = 'desktop' | 'tablet' | 'mobile'
type PreviewSurface = 'technician' | 'customer'
type PreviewTheme = 'light' | 'dark'

const emptyForm = () => {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 30)
  return {
    type: 'partner_ad' as (typeof TYPES)[number],
    title: '',
    subtitle: '',
    body: '',
    bannerImageUrl: '',
    sponsorLogoUrl: '',
    ctaLabel: 'Learn more',
    ctaHref: '/technician/marketing',
    placement: 'dashboard_hero',
    audience: 'technician',
    sponsorName: '',
    startsAt: start.toISOString().slice(0, 16),
    endsAt: end.toISOString().slice(0, 16),
    publish: true,
    priority: 10,
  }
}

/**
 * Dedicated Banner Management for dashboard_hero sponsored placements.
 * All content is API-driven via SponsoredContent — no hardcoded banners.
 */
export function BannerManagementPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SponsoredContent | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [logoAssets, setLogoAssets] = useState<MediaAsset[]>([])
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>('technician')
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('dark')
  const [cropOpen, setCropOpen] = useState(false)

  const list = useAsync(
    async () => (await marketingApi.listSponsored({ limit: 80, placement: 'dashboard_hero' })).data.items,
    [],
  )

  const previewItem = useMemo(
    () => ({
      id: editingId || 'preview',
      title: form.title || 'Banner headline',
      subtitle: form.subtitle || 'Supporting line',
      body: form.body || 'Short description for technicians or customers.',
      bannerImageUrl: form.bannerImageUrl,
      sponsorLogoUrl: form.sponsorLogoUrl,
      ctaLabel: form.ctaLabel,
      ctaHref: form.ctaHref,
      sponsorName: form.sponsorName || 'Sponsor',
      placement: 'dashboard_hero',
      priority: form.priority,
    }),
    [editingId, form],
  )

  const loadIntoForm = (item: SponsoredContent) => {
    setEditingId(item.id)
    setForm({
      type: (TYPES.includes(item.type as (typeof TYPES)[number])
        ? item.type
        : 'announcement') as (typeof TYPES)[number],
      title: item.title,
      subtitle: item.subtitle || '',
      body: item.body,
      bannerImageUrl: item.bannerImageUrl || '',
      sponsorLogoUrl: item.sponsorLogoUrl || '',
      ctaLabel: item.ctaLabel || 'Learn more',
      ctaHref: item.ctaHref || '/technician/marketing',
      placement: 'dashboard_hero',
      audience: item.audience || 'technician',
      sponsorName: item.sponsorName || '',
      startsAt: new Date(item.startsAt).toISOString().slice(0, 16),
      endsAt: new Date(item.endsAt).toISOString().slice(0, 16),
      publish: item.status === 'active',
      priority: item.priority ?? 10,
    })
    setSelected(null)
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm())
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        ...form,
        placement: 'dashboard_hero',
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      }
      if (editingId) {
        await marketingApi.updateSponsored(editingId, body)
        if (form.publish) await marketingApi.statusSponsored(editingId, 'active')
      } else {
        await marketingApi.createSponsored(body)
      }
      resetForm()
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (item: SponsoredContent) => {
    setBusy(true)
    setError(null)
    try {
      await marketingApi.createSponsored({
        type: item.type,
        title: `${item.title} (copy)`,
        subtitle: item.subtitle,
        body: item.body,
        bannerImageUrl: item.bannerImageUrl,
        sponsorLogoUrl: item.sponsorLogoUrl,
        ctaLabel: item.ctaLabel,
        ctaHref: item.ctaHref,
        placement: 'dashboard_hero',
        audience: item.audience || 'technician',
        sponsorName: item.sponsorName,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        priority: item.priority,
        publish: false,
      })
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (item: SponsoredContent, status: 'active' | 'paused' | 'archived' | 'draft') => {
    try {
      await marketingApi.statusSponsored(item.id, status)
      await list.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  const uploadCropped = async (blob: Blob) => {
    const file = new File([blob], `hero-crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('purpose', 'cms-banners')
    const { http } = await import('@fixnow/api/client')
    const res = await http.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const url = (res.data.data as { upload: { url: string } }).upload.url
    setForm((f) => ({ ...f, bannerImageUrl: url }))
    setAssets((prev) => [
      {
        id: `crop-${Date.now()}`,
        url,
        name: file.name,
        folder: 'Banners',
        uploadedAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const frameWidth =
    previewDevice === 'mobile' ? 'max-w-[320px]' : previewDevice === 'tablet' ? 'max-w-[560px]' : 'max-w-none'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink-primary">Banner Management</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Create and schedule sponsored hero banners for technician and customer dashboards. Content is served live from
          the API — nothing is hardcoded in the apps.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <AsyncStateView
          status={list.status}
          error={list.error}
          onRetry={() => void list.reload()}
          emptyTitle="No hero banners yet"
          emptyHint="Create your first dashboard hero campaign. Upload photography, set schedule, and publish."
        >
          <div className="space-y-3">
            {safeArray<SponsoredContent>(list.data).map((item) => (
              <div key={item.id} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                <button type="button" className="w-full text-left" onClick={() => setSelected(item)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {item.bannerImageUrl ? (
                        <div className="mb-3 aspect-[21/9] overflow-hidden rounded-xl border border-border">
                          <LazyImage
                            src={resolveMediaUrl(item.bannerImageUrl, 'campaigns.safety')}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={resolveMediaUrl(null, 'campaigns.safety')}
                          />
                        </div>
                      ) : null}
                      <p className="font-semibold text-ink-primary">{item.title}</p>
                      {item.subtitle ? <p className="text-sm text-ink-secondary">{item.subtitle}</p> : null}
                      <p className="mt-2 text-xs text-ink-muted">
                        {item.audience || 'technician'} · priority {item.priority} · CTR {item.analytics.ctr}% ·{' '}
                        {item.analytics.impressions} impressions
                        {item.analytics.dismissals != null ? ` · ${item.analytics.dismissals} dismissals` : ''}
                      </p>
                    </div>
                    <StatusBadge
                      label={item.status}
                      tone={
                        item.status === 'active' ? 'success' : item.status === 'paused' ? 'warning' : 'neutral'
                      }
                    />
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => loadIntoForm(item)}>
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => void duplicate(item)}>
                    Duplicate
                  </Button>
                  <Button variant="outline" onClick={() => void setStatus(item, 'active')}>
                    Activate
                  </Button>
                  <Button variant="outline" onClick={() => void setStatus(item, 'paused')}>
                    Deactivate
                  </Button>
                  <Button variant="outline" onClick={() => void setStatus(item, 'archived')}>
                    Archive
                  </Button>
                  <Button variant="outline" onClick={() => void setStatus(item, 'draft')}>
                    Restore draft
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (!window.confirm('Delete this banner?')) return
                      void marketingApi
                        .deleteSponsored(item.id)
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

        <aside className="h-fit space-y-3 rounded-2xl border border-outline-variant bg-canvas-white p-4 xl:sticky xl:top-24">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink-primary">{editingId ? 'Edit banner' : 'Create banner'}</h3>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-primary" onClick={resetForm}>
                New banner
              </button>
            ) : null}
          </div>

          <select
            className="h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as (typeof TYPES)[number] }))}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <input
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Headline"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Subtitle (optional)"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            placeholder="Short description"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
          <input
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Sponsor name"
            value={form.sponsorName}
            onChange={(e) => setForm((f) => ({ ...f, sponsorName: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-10 rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="CTA label"
              value={form.ctaLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
            />
            <input
              className="h-10 rounded-lg border border-outline-variant px-3 text-sm"
              placeholder="CTA URL / route"
              value={form.ctaHref}
              onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
            />
          </div>

          <select
            className="h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
            value={form.audience}
            onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
          >
            <option value="technician">Technicians only</option>
            <option value="customer">Customers only</option>
            <option value="all">Both</option>
          </select>

          <input
            type="number"
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            placeholder="Priority (higher first)"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
          />

          <div className="space-y-2 rounded-xl border border-dashed border-outline-variant p-3">
            <p className="text-xs font-semibold text-ink-muted">Hero image (JPG / PNG / WEBP)</p>
            <MediaLibrary
              assets={assets}
              onAssetsChange={setAssets}
              selectedUrl={form.bannerImageUrl}
              onSelect={(asset) => setForm((f) => ({ ...f, bannerImageUrl: asset.url }))}
              compact
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!form.bannerImageUrl}
                onClick={() => setCropOpen(true)}
              >
                Crop image
              </Button>
              <Button
                variant="outline"
                disabled={!form.bannerImageUrl}
                onClick={() => setForm((f) => ({ ...f, bannerImageUrl: '' }))}
              >
                Replace / clear
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-outline-variant p-3">
            <p className="text-xs font-semibold text-ink-muted">Sponsor logo (optional)</p>
            <MediaLibrary
              assets={logoAssets}
              onAssetsChange={setLogoAssets}
              selectedUrl={form.sponsorLogoUrl}
              onSelect={(asset) => setForm((f) => ({ ...f, sponsorLogoUrl: asset.url }))}
              compact
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

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
            />
            Publish when saved
          </label>

          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button disabled={busy || !form.title.trim() || !form.body.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : editingId ? 'Update banner' : 'Create banner'}
          </Button>

          <div className="space-y-2 rounded-xl border border-border bg-surface-alt p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Live preview</p>
            <div className="flex flex-wrap gap-1">
              {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPreviewDevice(d)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                    previewDevice === d ? 'bg-primary text-white' : 'bg-canvas-white text-ink-muted'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(['technician', 'customer'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPreviewSurface(s)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                    previewSurface === s ? 'bg-primary text-white' : 'bg-canvas-white text-ink-muted'
                  }`}
                >
                  {s} dashboard
                </button>
              ))}
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPreviewTheme(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                    previewTheme === t ? 'bg-primary text-white' : 'bg-canvas-white text-ink-muted'
                  }`}
                >
                  {t} bg
                </button>
              ))}
            </div>
            <div
              className={`mx-auto overflow-hidden rounded-xl border border-border p-3 ${frameWidth} ${
                previewTheme === 'dark' ? 'bg-slate-900' : 'bg-slate-100'
              }`}
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                FixNow · {previewSurface} · {previewDevice}
              </p>
              <SponsoredHeroBanner
                items={[previewItem]}
                fallbackHref={previewSurface === 'customer' ? '/customer/home' : '/technician/marketing'}
              />
            </div>
          </div>
        </aside>
      </div>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Banner'}
        description="Campaign analytics and schedule"
        placement="end"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            {selected.bannerImageUrl ? (
              <div className="aspect-[21/9] overflow-hidden rounded-xl border border-border">
                <LazyImage
                  src={resolveMediaUrl(selected.bannerImageUrl, 'campaigns.safety')}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-ink-muted">Impressions</dt>
                <dd className="font-semibold tabular-nums">{selected.analytics.impressions}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Clicks / CTR</dt>
                <dd className="font-semibold tabular-nums">
                  {selected.analytics.clicks} / {selected.analytics.ctr}%
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Dismissals</dt>
                <dd className="font-semibold tabular-nums">{selected.analytics.dismissals ?? 0}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Schedule</dt>
                <dd className="text-xs tabular-nums">
                  {new Date(selected.startsAt).toLocaleString()} → {new Date(selected.endsAt).toLocaleString()}
                </dd>
              </div>
            </dl>
            <Button onClick={() => loadIntoForm(selected)}>Edit in form</Button>
          </div>
        ) : null}
      </Dialog>

      <ImageCropDialog
        open={cropOpen}
        imageUrl={resolveMediaUrl(form.bannerImageUrl || null, 'campaigns.safety')}
        onClose={() => setCropOpen(false)}
        onCropped={(blob) => void uploadCropped(blob)}
      />
    </div>
  )
}
