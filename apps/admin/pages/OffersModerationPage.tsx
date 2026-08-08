import { useEffect, useMemo, useState } from 'react'
import {
  formatUgx,
  getFriendlyErrorMessage,
  offersApi,
  OFFER_TYPE_LABELS,
  type OfferModerationAction,
  type TechnicianOffer,
} from '@fixnow/api'
import { resolveMediaUrl } from '@fixnow/assets'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { LazyImage } from '@fixnow/ui'
import { Button, Icon, PageHeader, StatusBadge } from '../components/ui'
import { safeArray } from '@fixnow/utils'

const QUEUES = ['pending', 'active', 'scheduled', 'rejected', 'expired', 'archived'] as const
type Queue = (typeof QUEUES)[number]

const LIFECYCLE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  scheduled: 'info',
  pending: 'warning',
  rejected: 'danger',
  expired: 'neutral',
  draft: 'neutral',
  archived: 'neutral',
}

/** Faithful render of what the customer app shows for an approved offer. */
function CustomerPreview({ offer }: { offer: TechnicianOffer }) {
  const accent = offer.promotionColor || '#0F766E'
  const discount =
    offer.discountValue == null
      ? null
      : offer.type === 'percentage_discount'
        ? `${offer.discountValue}% off`
        : offer.type === 'fixed_discount'
          ? `${formatUgx(offer.discountValue)} off`
          : `Value ${offer.discountValue}`

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-outline-variant bg-canvas-white shadow-sm">
      <div className="border-b border-outline-variant bg-surface-alt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Customer app preview
      </div>
      <div style={{ borderTopColor: accent, borderTopWidth: 4 }}>
        <div className="relative h-32 w-full bg-surface-alt">
          <LazyImage
            alt=""
            className="h-32 w-full object-cover"
            src={
              offer.bannerImageUrl
                ? resolveMediaUrl(offer.bannerImageUrl, 'promotions.first-booking')
                : resolveMediaUrl(null, 'promotions.first-booking')
            }
            fallback={resolveMediaUrl(null, 'promotions.first-booking')}
            emptyContent={
              <span className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-primary/15 to-secondary/10 text-primary">
                <Icon name="image" className="!text-[36px]" />
              </span>
            }
          />
        </div>
        <div className="space-y-2.5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink-primary">{offer.title}</h3>
            {offer.badge ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                style={{ backgroundColor: accent }}
              >
                {offer.badge}
              </span>
            ) : null}
          </div>
          {offer.subtitle ? <p className="text-sm text-ink-secondary">{offer.subtitle}</p> : null}
          {discount ? (
            <p className="text-xl font-bold" style={{ color: accent }}>
              {discount}
            </p>
          ) : null}
          <p className="whitespace-pre-line text-sm text-ink-secondary">{offer.description}</p>
          {offer.terms ? (
            <p className="whitespace-pre-line rounded-lg bg-surface-alt px-3 py-2 text-xs text-ink-muted">
              {offer.terms}
            </p>
          ) : null}
          <p className="text-[11px] text-ink-muted">
            {new Date(offer.startsAt).toLocaleDateString()} – {new Date(offer.endsAt).toLocaleDateString()}
            {offer.serviceAreaDistricts?.length ? ` · ${offer.serviceAreaDistricts.join(', ')}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Change & approval timeline derived from the offer's own lifecycle stamps. */
function AuditTrail({ offer }: { offer: TechnicianOffer }) {
  const events = useMemo(() => {
    const rows: Array<{ label: string; at?: string; detail?: string; icon: string }> = [
      { label: 'Draft created', at: offer.createdAt, icon: 'edit_note' },
      { label: 'Submitted for approval', at: offer.submittedAt, icon: 'send' },
    ]
    if (offer.publishedAt) rows.push({ label: 'Approved & published', at: offer.publishedAt, icon: 'verified' })
    if (offer.lifecycle === 'rejected') {
      rows.push({
        label: 'Rejected',
        at: offer.reviewedAt,
        detail: offer.rejectionReason,
        icon: 'block',
      })
    }
    if (offer.lifecycle === 'archived') {
      rows.push({
        label: 'Archived / suspended',
        at: offer.reviewedAt,
        detail: offer.rejectionReason,
        icon: 'inventory_2',
      })
    }
    if (offer.featured) rows.push({ label: 'Featured by admin', at: offer.reviewedAt, icon: 'star' })
    rows.push({ label: 'Last modified', at: offer.updatedAt, icon: 'history' })
    return rows.filter((r) => r.at)
  }, [offer])

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-alt p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Audit trail</p>
      <ol className="mt-2 space-y-2">
        {events.map((e) => (
          <li key={`${e.label}-${e.at}`} className="flex items-start gap-2 text-xs">
            <Icon name={e.icon} className="!text-[15px] mt-0.5 text-ink-muted" />
            <div>
              <p className="font-medium text-ink-primary">{e.label}</p>
              <p className="text-ink-muted">{e.at ? new Date(e.at).toLocaleString() : '—'}</p>
              {e.detail ? <p className="mt-0.5 text-ink-secondary">“{e.detail}”</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function OffersModerationPage({ initialQueue = 'pending' }: { initialQueue?: Queue }) {
  const [queue, setQueue] = useState<Queue>(initialQueue)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setQueue(initialQueue)
  }, [initialQueue])

  const list = useAsync(async () => {
    const res = await offersApi.adminList({
      lifecycle: queue,
      limit: 50,
    })
    return safeArray<TechnicianOffer>(res.data?.items)
  }, [queue])

  const offers = useMemo(() => {
    const rows = safeArray<TechnicianOffer>(list.data)
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((o) => {
      const hay = `${o.title} ${o.subtitle || ''} ${o.description || ''} ${o.rejectionReason || ''} ${(o.serviceAreaDistricts || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [list.data, search])
  const selected = useMemo(
    () => offers.find((o) => o.id === selectedId) ?? offers[0] ?? null,
    [offers, selectedId],
  )

  useEffect(() => {
    setSelectedId(null)
    setSelectedIds(new Set())
    setComment('')
    setError(null)
  }, [queue])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === offers.length) return new Set()
      return new Set(offers.map((o) => o.id))
    })
  }

  const moderate = async (offer: TechnicianOffer, action: OfferModerationAction) => {
    const needsReason = action === 'reject' || action === 'suspend'
    const reason = comment.trim()
    if (needsReason && !reason) {
      setError('Add a comment explaining this decision — the technician will see it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await offersApi.adminModerate(offer.id, action, reason || undefined)
      setComment('')
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const bulkModerate = async (action: 'approve' | 'reject' | 'archive') => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if ((action === 'reject') && !comment.trim()) {
      setError('Add a rejection reason before bulk rejecting.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      for (const id of ids) {
        await offersApi.adminModerate(id, action, comment.trim() || undefined)
      }
      setSelectedIds(new Set())
      setComment('')
      await list.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Technician offers"
        subtitle="Review promotions before customers see them. Pending offers are never public."
      />

      <div className="flex flex-wrap gap-2">
        {QUEUES.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={queue === key}
            onClick={() => setQueue(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
              queue === key
                ? 'border-primary bg-primary text-white'
                : 'border-outline-variant text-ink-secondary hover:border-primary/40'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search offers</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 !text-[18px] -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, technician, district…"
            className="min-h-11 w-full rounded-xl border border-outline-variant bg-canvas-white py-2 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {offers.length ? (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="min-h-11 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-ink-secondary hover:border-primary/40"
          >
            {selectedIds.size === offers.length ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
        {selectedIds.size > 0 && queue === 'pending' ? (
          <>
            <Button disabled={busy} onClick={() => void bulkModerate('approve')}>
              Bulk approve ({selectedIds.size})
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void bulkModerate('reject')}>
              Bulk reject
            </Button>
          </>
        ) : null}
        {selectedIds.size > 0 && queue === 'rejected' ? (
          <Button disabled={busy} onClick={() => void bulkModerate('approve')}>
            Restore ({selectedIds.size})
          </Button>
        ) : null}
        {selectedIds.size > 0 && (queue === 'active' || queue === 'scheduled') ? (
          <Button variant="outline" disabled={busy} onClick={() => void bulkModerate('archive')}>
            Archive selected
          </Button>
        ) : null}
      </div>

      <AsyncStateView
        status={list.status}
        error={list.error}
        onRetry={() => void list.reload()}
        emptyTitle="No offers in this queue"
        emptyHint="Technician submissions awaiting review will appear here."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-2">
            {offers.map((offer) => {
              const isSelected = selected?.id === offer.id
              const checked = selectedIds.has(offer.id)
              return (
                <div
                  key={offer.id}
                  className={`flex gap-2 rounded-2xl border p-3 transition ${
                    isSelected
                      ? 'border-primary bg-surface-alt'
                      : 'border-border-subtle bg-canvas-white hover:border-primary/40'
                  }`}
                >
                  <label className="flex items-start pt-1">
                    <span className="sr-only">Select {offer.title}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(offer.id)}
                      className="mt-1 h-4 w-4 rounded border-outline-variant"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setSelectedId(offer.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-primary">
                          {offer.title}
                          {offer.featured ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                              <Icon name="star" className="!text-[12px]" />
                              Featured
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">
                          {offer.subtitle || offer.description}
                        </p>
                        <p className="mt-2 text-xs text-ink-muted">
                          {OFFER_TYPE_LABELS[offer.type]} ·{' '}
                          {new Date(offer.startsAt).toLocaleDateString()} →{' '}
                          {new Date(offer.endsAt).toLocaleDateString()}
                          {offer.customerVisible ? ' · public' : ' · not public'}
                          {offer.rejectionReason ? ` · ${offer.rejectionReason}` : ''}
                        </p>
                      </div>
                      <StatusBadge
                        label={offer.lifecycle}
                        tone={LIFECYCLE_TONE[offer.lifecycle] ?? 'neutral'}
                      />
                    </div>
                  </button>
                </div>
              )
            })}
          </div>

          {selected ? (
            <aside className="space-y-3 lg:sticky lg:top-24 lg:h-fit">
              <CustomerPreview offer={selected} />

              <div className="rounded-xl border border-outline-variant bg-canvas-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Review notes
                </p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Comment or revision request shown to the technician…"
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-alt px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />

                {error ? (
                  <p role="alert" className="mt-2 text-sm text-error">
                    {error}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.lifecycle === 'pending' ? (
                    <>
                      <Button disabled={busy} onClick={() => void moderate(selected, 'approve')}>
                        <Icon name="check_circle" className="!text-[16px]" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => void moderate(selected, 'reject')}
                      >
                        <Icon name="block" className="!text-[16px]" />
                        Reject
                      </Button>
                    </>
                  ) : null}

                  {selected.featured ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void moderate(selected, 'unfeature')}
                    >
                      <Icon name="star_border" className="!text-[16px]" />
                      Unfeature
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void moderate(selected, 'feature')}
                    >
                      <Icon name="star" className="!text-[16px]" />
                      Feature
                    </Button>
                  )}

                  {selected.customerVisible ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void moderate(selected, 'suspend')}
                    >
                      <Icon name="pause_circle" className="!text-[16px]" />
                      Suspend
                    </Button>
                  ) : null}

                  {selected.lifecycle !== 'archived' && selected.lifecycle !== 'pending' ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void moderate(selected, 'archive')}
                    >
                      <Icon name="inventory_2" className="!text-[16px]" />
                      Archive
                    </Button>
                  ) : null}

                  {selected.lifecycle === 'active' || selected.lifecycle === 'scheduled' ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void moderate(selected, 'expire')}
                    >
                      <Icon name="timer_off" className="!text-[16px]" />
                      Expire
                    </Button>
                  ) : null}

                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void offersApi
                        .adminDuplicate(selected.id)
                        .then(() => list.reload())
                        .catch((err) => setError(getFriendlyErrorMessage(err)))
                    }}
                  >
                    <Icon name="content_copy" className="!text-[16px]" />
                    Duplicate
                  </Button>

                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm('Delete this offer permanently from public queues?')) return
                      void moderate(selected, 'delete')
                    }}
                  >
                    <Icon name="delete" className="!text-[16px]" />
                    Delete
                  </Button>
                </div>

                <p className="mt-2 text-[11px] text-ink-muted">
                  Rejecting or suspending requires a comment. Approving publishes the offer when its
                  schedule window opens.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['Views', selected.analytics.views],
                    ['Clicks', selected.analytics.clicks],
                    ['Bookings', selected.analytics.bookings],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-outline-variant bg-canvas-white p-3 text-center"
                  >
                    <p className="text-[11px] text-ink-muted">{label}</p>
                    <p className="text-lg font-bold text-ink-primary">{value}</p>
                  </div>
                ))}
              </div>

              <AuditTrail offer={selected} />
            </aside>
          ) : null}
        </div>
      </AsyncStateView>
    </div>
  )
}
