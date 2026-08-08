import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import {
  getFriendlyErrorMessage,
  technicianMarketingApi,
  type MarketingCreative,
  type MarketingCreativeKind,
} from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { BannerUploader } from './BannerUploader'

const KINDS: Array<{ id: MarketingCreativeKind; label: string; hint: string }> = [
  { id: 'slide', label: 'Advertising slides', hint: 'Rotating customer homepage slider' },
  { id: 'banner', label: 'Promotional banners', hint: 'Image + headline + CTA' },
  { id: 'announcement', label: 'Announcements', hint: 'Short promotional notices' },
  { id: 'portfolio_campaign', label: 'Portfolio campaigns', hint: 'Highlight case work' },
]

export function MarketingCreativesPage() {
  const [kind, setKind] = useState<MarketingCreativeKind>('slide')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    headline: '',
    description: '',
    imageUrl: '',
    ctaLabel: 'Book now',
    promotionText: '',
  })

  const query = useAsync(async () => {
    const res = await technicianMarketingApi.listMine()
    return res.data
  }, [])

  const items = useMemo(
    () => (query.data?.items || []).filter((i) => i.kind === kind),
    [query.data, kind],
  )
  const limits = query.data?.entitlements.limits || {}
  const flags = query.data?.entitlements.featureFlags || {}

  const limitForKind =
    kind === 'slide'
      ? Number(limits.maxAdvertisingSlides || 0)
      : kind === 'banner'
        ? Number(limits.maxPromotionalBanners || 0)
        : kind === 'announcement'
          ? Number(limits.maxAnnouncements || 0)
          : 3

  const allowed =
    kind === 'slide'
      ? flags.advertisingSlides
      : kind === 'banner'
        ? flags.promotionalBanner || flags.advertisingBanner
        : kind === 'announcement'
          ? flags.promotionalAnnouncements
          : flags.portfolioCampaigns

  async function createCreative() {
    setSaving(true)
    setError(null)
    try {
      await technicianMarketingApi.create({ kind, ...draft })
      setDraft({
        title: '',
        headline: '',
        description: '',
        imageUrl: '',
        ctaLabel: 'Book now',
        promotionText: '',
      })
      await query.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function submit(id: string) {
    setError(null)
    try {
      await technicianMarketingApi.submit(id)
      await query.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  async function pause(id: string) {
    try {
      await technicianMarketingApi.pause(id)
      await query.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline">Marketing studio</h1>
          <p className="text-body text-on-surface-variant">
            Create slides, banners, and announcements. FixNow must approve before customers see them.
          </p>
        </div>
        <Link to="/technician/marketing">
          <Button variant="outline" className="min-h-11">
            Offers dashboard
          </Button>
        </Link>
      </div>

      {!query.data?.entitlements.featureFlags.advertisingSlides &&
      !query.data?.entitlements.featureFlags.promotionalBanner ? (
        <Card className="border-primary/15 bg-primary/[0.03] p-5">
          <p className="text-caps text-primary">Locked preview</p>
          <p className="text-title">Professional marketing tools</p>
          <p className="mt-2 text-label text-on-surface-variant">
            Advertising slides and expanded banners unlock on Professional. You can still manage offers on Starter
            within plan limits. Upgrade to unlock the studio chrome shown here.
          </p>
          <Link to="/technician/upgrade" className="mt-4 inline-block">
            <Button className="min-h-11 fn-pressable">View Professional plan</Button>
          </Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`rounded-full px-4 py-2 text-label ${
              kind === k.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-3 p-5">
            <h2 className="text-title">Create {kind.replace('_', ' ')}</h2>
            <p className="text-label text-on-surface-variant">
              {KINDS.find((k) => k.id === kind)?.hint} · Limit {limitForKind}
              {!allowed ? ' · Not enabled on your plan' : ''}
            </p>
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              disabled={!allowed}
            />
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
              placeholder="Headline"
              value={draft.headline}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
              disabled={!allowed}
            />
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
              placeholder="Description"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              disabled={!allowed}
            />
            <BannerUploader
              value={draft.imageUrl}
              onChange={(url) => setDraft({ ...draft, imageUrl: url })}
            />
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
              placeholder="Button label"
              value={draft.ctaLabel}
              onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
              disabled={!allowed}
            />
            <Button
              className="min-h-11"
              fullWidth
              disabled={!allowed || saving || !draft.title.trim()}
              onClick={() => void createCreative()}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
          </Card>

          <div className="space-y-3">
            <h2 className="text-title">Your {kind.replace('_', ' ')}s</h2>
            {items.length === 0 ? (
              <Card className="p-5 text-label text-on-surface-variant">No creatives yet.</Card>
            ) : (
              items.map((item) => <CreativeRow key={item.id} item={item} onSubmit={submit} onPause={pause} />)
            )}
          </div>
        </div>
      </AsyncStateView>
    </div>
  )
}

function CreativeRow({
  item,
  onSubmit,
  onPause,
}: {
  item: MarketingCreative
  onSubmit: (id: string) => void
  onPause: (id: string) => void
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-surface-container">
            <Icon name="image" />
          </div>
        )}
        <div>
          <p className="text-label font-semibold">{item.title}</p>
          <p className="text-caps capitalize text-on-surface-variant">{item.status}</p>
          {item.rejectionReason ? (
            <p className="text-label text-warning">{item.rejectionReason}</p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        {['draft', 'rejected', 'changes_requested'].includes(item.status) ? (
          <Button className="min-h-10" onClick={() => onSubmit(item.id)}>
            Submit
          </Button>
        ) : null}
        {item.status === 'approved' ? (
          <Button variant="outline" className="min-h-10" onClick={() => onPause(item.id)}>
            Pause
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export default MarketingCreativesPage
