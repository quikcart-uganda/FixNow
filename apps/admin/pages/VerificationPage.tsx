import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import {
  getFriendlyErrorMessage,
  verificationApi,
  type VerificationQueueItem,
} from '@fixnow/api/admin'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage, ProfileAvatar } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'

function toneFor(status: string) {
  if (status === 'approved') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'under_review' || status === 'pending') return 'warning' as const
  return 'neutral' as const
}

function DocThumb({ url, label }: { url: string; label: string }) {
  const src = resolveMediaUrl(url)
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-alt"
      title={`View ${label}`}
    >
      <LazyImage
        src={src}
        alt={label}
        className="h-full w-full object-cover"
        emptyContent={
          <span className="flex h-full flex-col items-center justify-center gap-1 text-ink-muted">
            <Icon name="description" className="!text-[28px]" />
            <span className="text-[10px]">Open file</span>
          </span>
        }
      />
      <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
        Zoom / download
      </span>
    </a>
  )
}

export function VerificationPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('queue')
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)

  const list = useAsync(async () => {
    try {
      const res = await verificationApi.list({ status, q: q.trim() || undefined, limit: 100 })
      return { items: safeArray(res.data?.items), apiReady: true as const }
    } catch (err) {
      const msg = getFriendlyErrorMessage(err)
      // Degraded path when verification API returns not-implemented.
      if (/not implemented|501|coming soon/i.test(msg)) {
        return { items: [] as VerificationQueueItem[], apiReady: false as const, fallbackReason: msg }
      }
      throw err
    }
  }, [status, q])

  const items = safeArray(list.data?.items)
  const counts = useMemo(() => {
    const all = items
    return {
      pending: all.filter((i) => i.status === 'pending' || i.status === 'under_review').length,
      identity: all.filter((i) => i.kind === 'identity').length,
      skill: all.filter((i) => i.kind !== 'identity').length,
    }
  }, [items])

  async function review(decision: 'approve' | 'reject' | 'request_info') {
    if (!selected) return
    setActing(true)
    setActionError(null)
    try {
      await verificationApi.review(selected.id, {
        decision,
        notes: notes.trim() || undefined,
        kind: selected.kind,
      })
      setSelected(null)
      setNotes('')
      await list.reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const apiReady = list.data?.apiReady !== false

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/admin/dashboard" className="hover:text-primary hover:underline">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-ink-primary">Verification</li>
        </ol>
      </nav>

      <PageHeader
        title="Verification Center"
        subtitle="Review and approve technician identity and compliance documents before they become eligible for customer bookings."
      />

      {!apiReady ? (
        <Surface className="border-warning/30 bg-warning/5 p-5">
          <p className="text-sm font-semibold text-ink-primary">Verification queue unavailable</p>
          <p className="mt-1 text-sm text-ink-secondary">
            Document review is temporarily unavailable. Use Technician Management to triage
            verification status until the queue is restored.
          </p>
          <Link
            to="/admin/technicians?verification=pending"
            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white"
          >
            Open pending technicians
          </Link>
        </Surface>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Surface className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">In queue</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{counts.pending}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Identity docs</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{counts.identity}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Skills / certs</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{counts.skill}</p>
        </Surface>
      </div>

      <Surface className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Search</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Technician, document type…"
            aria-label="Search verification queue"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Status</span>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="queue">Pending / under review</option>
            <option value="pending">Pending only</option>
            <option value="under_review">Under review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </label>
      </Surface>

      <AsyncStateView
        status={list.status}
        error={list.error}
        errorTitle={list.errorTitle}
        onRetry={() => void list.reload()}
        emptyTitle="No verification submissions in this filter"
        emptyHint="National IDs, selfies, certificates, LC1 letters, police clearance, and business documents appear here when technicians submit them."
        emptyIcon="verified_user"
      >
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => {
                setSelected(item)
                setNotes(item.reviewNotes || '')
                setCompareMode(false)
                setActionError(null)
              }}
              className="flex w-full min-w-0 items-start gap-3 rounded-2xl border border-border bg-canvas p-3 text-left transition touch-manipulation hover:border-primary/30 hover:shadow-sm sm:gap-4 sm:p-4"
            >
              <ProfileAvatar
                alt={item.technicianName}
                role="technician"
                className="h-12 w-12 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-primary">{item.technicianName}</span>
                  <StatusBadge label={item.status.replace(/_/g, ' ')} tone={toneFor(item.status)} />
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-muted">
                    {item.verificationType}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-ink-muted">
                  Submitted{' '}
                  {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : '—'}
                  {item.assignedReviewer ? ` · Reviewer ${item.assignedReviewer}` : ''}
                  {` · ${item.documentUrls.length + (item.selfieUrl ? 1 : 0)} file(s)`}
                </span>
              </span>
              <Icon name="chevron_right" className="!text-[20px] text-ink-muted" />
            </button>
          ))}
        </div>
      </AsyncStateView>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Verification review"
        description={selected?.technicianName}
        placement="end"
        panelClassName="md:!max-w-xl"
      >
        {selected ? (
          <div className="space-y-5">
            {actionError ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{actionError}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <StatusBadge label={selected.status.replace(/_/g, ' ')} tone={toneFor(selected.status)} />
              <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold capitalize text-ink-muted">
                {selected.kind} · {selected.verificationType}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Technician</dt>
                <dd className="font-medium">{selected.technicianName}</dd>
                <Link
                  to={`/admin/technicians?q=${encodeURIComponent(selected.technicianName)}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open profile
                </Link>
              </div>
              <div>
                <dt className="text-ink-muted">Submitted</dt>
                <dd className="tabular-nums">
                  {selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Assigned reviewer</dt>
                <dd>{selected.assignedReviewer || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">LC1</dt>
                <dd>
                  {selected.lc1Ready ? 'Ready' : '—'}
                  {selected.lc1Reference ? ` · ${selected.lc1Reference}` : ''}
                </dd>
              </div>
            </dl>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-primary">Submitted documents</h3>
                {selected.selfieUrl && selected.documentUrls.length ? (
                  <Button size="sm" variant="outline" onClick={() => setCompareMode((v) => !v)}>
                    {compareMode ? 'Grid view' : 'Compare ID / selfie'}
                  </Button>
                ) : null}
              </div>
              {compareMode && selected.selfieUrl ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-ink-muted">ID / document</p>
                    <DocThumb url={selected.documentUrls[0] || ''} label="ID document" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-ink-muted">Selfie</p>
                    <DocThumb url={selected.selfieUrl} label="Selfie" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selected.documentUrls.map((url) => (
                    <DocThumb key={url} url={url} label="Document" />
                  ))}
                  {selected.selfieUrl ? <DocThumb url={selected.selfieUrl} label="Selfie" /> : null}
                  {!selected.documentUrls.length && !selected.selfieUrl ? (
                    <p className="col-span-full text-sm text-ink-muted">No media attached</p>
                  ) : null}
                </div>
              )}
            </section>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-ink-secondary">Review notes</span>
              <textarea
                className="min-h-24 rounded-lg border border-border bg-surface px-3 py-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes for approve, reject, or request more information…"
              />
            </label>

            {selected.history?.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink-primary">History</h3>
                <ol className="space-y-2">
                  {selected.history.map((h, i) => (
                    <li key={`${h.status}-${i}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <p className="font-semibold capitalize">{h.status.replace(/_/g, ' ')}</p>
                      <p className="text-ink-muted">
                        {h.at ? new Date(h.at).toLocaleString() : '—'}
                        {h.by ? ` · ${h.by}` : ''}
                        {h.note ? ` · ${h.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button disabled={acting} onClick={() => void review('approve')}>
                Approve
              </Button>
              <Button variant="outline" disabled={acting} onClick={() => void review('request_info')}>
                Request information
              </Button>
              <Button variant="danger" disabled={acting} onClick={() => void review('reject')}>
                Reject
              </Button>
              <Link
                to="/admin/audit"
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-alt"
              >
                Audit trail
              </Link>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
