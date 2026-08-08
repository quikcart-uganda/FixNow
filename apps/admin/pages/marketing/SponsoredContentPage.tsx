import { useState } from 'react'
import { getFriendlyErrorMessage, marketingApi, type SponsoredContent, type SponsoredContentType } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { Button, StatusBadge } from '../../components/ui'
import { MediaLibrary, type MediaAsset } from '../../components/cms/MediaLibrary'
import { safeArray } from '@fixnow/utils'

const TYPES: SponsoredContentType[] = [
  'partner_ad',
  'sponsored_advertisement',
  'partner_promotion',
  'platform_announcement',
  'announcement',
  'educational_banner',
  'safety_campaign',
  'government_campaign',
  'seasonal_promotion',
  'technician_recruitment',
  'emergency_awareness',
  'referral_campaign',
  'tip',
  'community_notice',
]

const PLACEMENTS = ['home_hero', 'dashboard_hero', 'home', 'offers', 'search', 'profile', 'global'] as const

export function SponsoredContentPage({ adsOnly = false }: { adsOnly?: boolean }) {
  const typeFilter = adsOnly ? 'partner_ad' : undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SponsoredContent | null>(null)
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 21)
  const [form, setForm] = useState({
    type: (adsOnly ? 'partner_ad' : 'sponsored_advertisement') as SponsoredContentType,
    title: '',
    subtitle: '',
    body: '',
    bannerImageUrl: '',
    desktopImageUrl: '',
    mobileImageUrl: '',
    sponsorLogoUrl: '',
    badge: '',
    ctaLabel: 'Learn more',
    ctaHref: '/customer/home',
    placement: 'home_hero',
    audience: 'customer',
    sponsorName: '',
    startsAt: start.toISOString().slice(0, 16),
    endsAt: end.toISOString().slice(0, 16),
    publish: true,
    priority: 10,
    displayOrder: 0,
  })
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('mobile')

  const list = useAsync(
    async () => (await marketingApi.listSponsored({ limit: 50, type: typeFilter })).data.items,
    [typeFilter],
  )

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await marketingApi.createSponsored({
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      })
      setForm((f) => ({
        ...f,
        title: '',
        subtitle: '',
        body: '',
        sponsorName: '',
        badge: '',
        bannerImageUrl: '',
        desktopImageUrl: '',
        mobileImageUrl: '',
        sponsorLogoUrl: '',
      }))
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (item: SponsoredContent, status: 'active' | 'paused' | 'archived') => {
    try {
      await marketingApi.statusSponsored(item.id, status)
      await list.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  const previewImage =
    previewDevice === 'mobile'
      ? form.mobileImageUrl || form.bannerImageUrl || form.desktopImageUrl
      : form.desktopImageUrl || form.bannerImageUrl || form.mobileImageUrl

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <AsyncStateView
        status={list.status}
        error={list.error}
        onRetry={() => void list.reload()}
        emptyTitle={adsOnly ? 'No advertisements' : 'No sponsored campaigns'}
        emptyHint={
          adsOnly
            ? 'Publish partner advertisements that appear in customer placements.'
            : 'Publish hero banners, educational campaigns, safety notices, and partner promotions.'
        }
      >
        <div className="space-y-3">
          {safeArray<SponsoredContent>(list.data).map((item) => (
            <div key={item.id} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <button type="button" className="w-full text-left" onClick={() => setSelected(item)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {item.bannerImageUrl || item.desktopImageUrl || item.mobileImageUrl ? (
                      <div className="mb-3 h-28 overflow-hidden rounded-xl border border-border">
                        <LazyImage
                          src={resolveMediaUrl(
                            item.desktopImageUrl || item.bannerImageUrl || item.mobileImageUrl,
                            'campaigns.safety',
                          )}
                          alt=""
                          className="h-full w-full object-cover"
                          fallback={resolveMediaUrl(null, 'campaigns.safety')}
                        />
                      </div>
                    ) : null}
                    <p className="font-semibold text-ink-primary">{item.title}</p>
                    {item.subtitle ? <p className="mt-0.5 text-sm text-ink-secondary">{item.subtitle}</p> : null}
                    <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">{item.body}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {item.type.replace(/_/g, ' ')} · {item.placement}
                      {item.sponsorName ? ` · ${item.sponsorName}` : ''} · priority {item.priority}
                      {typeof item.displayOrder === 'number' ? ` · order ${item.displayOrder}` : ''} · CTR{' '}
                      {item.analytics.ctr}%
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
                    if (!window.confirm('Delete this content?')) return
                    setError(null)
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

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Campaign'}
        description="Preview, scheduling, audience, and campaign statistics"
        placement="end"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            {selected.bannerImageUrl || selected.desktopImageUrl || selected.mobileImageUrl ? (
              <div className="h-40 overflow-hidden rounded-xl border border-border">
                <LazyImage
                  src={resolveMediaUrl(
                    selected.desktopImageUrl || selected.bannerImageUrl || selected.mobileImageUrl,
                    'advertisements.bank',
                  )}
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={resolveMediaUrl(null, 'advertisements.bank')}
                />
              </div>
            ) : (
              <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt text-xs text-ink-muted">
                No banner media
              </div>
            )}
            {selected.subtitle ? <p className="font-medium text-ink-primary">{selected.subtitle}</p> : null}
            <p className="text-ink-secondary">{selected.body}</p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-ink-muted">Type / placement</dt>
                <dd className="font-medium">
                  {selected.type.replace(/_/g, ' ')} · {selected.placement}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Audience</dt>
                <dd className="font-medium">{selected.audience || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Schedule</dt>
                <dd className="text-xs tabular-nums">
                  {new Date(selected.startsAt).toLocaleString()} → {new Date(selected.endsAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Sponsor</dt>
                <dd>{selected.sponsorName || '—'}</dd>
              </div>
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
            </dl>
          </div>
        ) : null}
      </Dialog>

      <aside className="h-fit space-y-3 rounded-2xl border border-outline-variant bg-canvas-white p-4 lg:sticky lg:top-24">
        <h3 className="font-semibold text-ink-primary">{adsOnly ? 'Create advertisement' : 'Create sponsored content'}</h3>
        <p className="text-xs text-ink-muted">
          Use placement <strong>home_hero</strong> for the premium rotating banner on Customer Home.
        </p>
        {!adsOnly ? (
          <select
            className="h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SponsoredContentType }))}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        ) : null}
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Subtitle (short line under title)"
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
        />
        <textarea
          className="min-h-28 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
          placeholder="Rich description / body"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Sponsor / partner name"
          value={form.sponsorName}
          onChange={(e) => setForm((f) => ({ ...f, sponsorName: e.target.value }))}
        />
        <input
          className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          placeholder="Badge (e.g. Partner, Safety)"
          value={form.badge}
          onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
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
            placeholder="CTA link"
            value={form.ctaHref}
            onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
          />
        </div>
        <select
          className="h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
          value={form.placement}
          onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="h-10 w-full rounded-lg border border-outline-variant px-2 text-sm"
          value={form.audience}
          onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
        >
          {[
            ['customer', 'Customers only'],
            ['technician', 'Technicians only'],
            ['all', 'Both (customers + technicians)'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-muted">
            Priority
            <input
              type="number"
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="text-xs text-ink-muted">
            Display order
            <input
              type="number"
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
            />
          </label>
        </div>
        <div className="space-y-3 rounded-xl border border-dashed border-outline-variant p-3">
          <p className="text-xs font-semibold text-ink-muted">Images (upload or pick from library — no URL paste)</p>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-ink-secondary">Banner / background</p>
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
                className="text-xs font-semibold text-primary"
                onClick={() => setForm((f) => ({ ...f, bannerImageUrl: '' }))}
              >
                Clear banner
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-ink-secondary">Desktop crop (optional)</p>
            <MediaLibrary
              assets={assets}
              onAssetsChange={setAssets}
              selectedUrl={form.desktopImageUrl}
              onSelect={(asset) => setForm((f) => ({ ...f, desktopImageUrl: asset.url }))}
              compact
            />
            {form.desktopImageUrl ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => setForm((f) => ({ ...f, desktopImageUrl: '' }))}
              >
                Clear desktop image
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-ink-secondary">Mobile crop (optional)</p>
            <MediaLibrary
              assets={assets}
              onAssetsChange={setAssets}
              selectedUrl={form.mobileImageUrl}
              onSelect={(asset) => setForm((f) => ({ ...f, mobileImageUrl: asset.url }))}
              compact
            />
            {form.mobileImageUrl ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => setForm((f) => ({ ...f, mobileImageUrl: '' }))}
              >
                Clear mobile image
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-ink-secondary">Sponsor logo (optional)</p>
            <MediaLibrary
              assets={assets}
              onAssetsChange={setAssets}
              selectedUrl={form.sponsorLogoUrl}
              onSelect={(asset) => setForm((f) => ({ ...f, sponsorLogoUrl: asset.url }))}
              compact
            />
            {form.sponsorLogoUrl ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => setForm((f) => ({ ...f, sponsorLogoUrl: '' }))}
              >
                Clear logo
              </button>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-alt p-3">
          <div className="mb-2 flex gap-2">
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
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Live preview</p>
          <div
            className={`relative overflow-hidden rounded-xl border border-border bg-on-surface shadow-sm ${
              previewDevice === 'mobile' ? 'max-w-[220px] aspect-[4/5]' : 'w-full aspect-[21/9]'
            }`}
          >
            <LazyImage
              src={resolveMediaUrl(previewImage || null, 'campaigns.safety')}
              alt={form.title || 'Campaign preview'}
              className="absolute inset-0 h-full w-full object-cover"
              fallback={resolveMediaUrl(null, 'campaigns.safety')}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 space-y-1 p-3 text-white">
              {form.badge ? (
                <span className="inline-block rounded bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase">
                  {form.badge}
                </span>
              ) : null}
              <p className="text-sm font-bold">{form.title || 'Campaign title'}</p>
              <p className="line-clamp-2 text-[11px] text-white/85">
                {form.subtitle || form.body || 'Body copy updates live as you type.'}
              </p>
              {form.ctaLabel ? (
                <p className="pt-1 text-[10px] font-bold uppercase text-white">{form.ctaLabel} →</p>
              ) : null}
            </div>
          </div>
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
        <Button disabled={busy || !form.title.trim() || !form.body.trim()} onClick={() => void create()}>
          {busy ? 'Saving…' : form.publish ? 'Publish' : 'Save draft'}
        </Button>
      </aside>
    </div>
  )
}

export function AdvertisementsPage() {
  return <SponsoredContentPage adsOnly />
}
