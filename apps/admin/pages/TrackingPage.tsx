import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, ClickableRow, DataTable, Dialog, FormError, Th, TrackingMap } from '@fixnow/shared'
import {
  formatTrackingDistance,
  formatTrackingEta,
  getFriendlyErrorMessage,
  trackingApi,
  type TrackingSession,
} from '@fixnow/api/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'
import { CopyableId } from '../components/CopyableId'
import { cn, safeArray } from '@fixnow/utils'

function tone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'warning'
  if (status === 'arrived') return 'info'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

type FocusKey = 'active' | 'travelling' | 'paused' | 'eta'

export function TrackingPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const [status, setStatus] = useState(() => params.get('status') ?? 'travelling')
  const [focus, setFocus] = useState<FocusKey>('travelling')
  const [selected, setSelected] = useState<TrackingSession | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const listQuery = useAsync(async () => {
    const res = await trackingApi.listAdmin({ status, q: q || undefined })
    return res.data
  }, [status, q])

  useRealtimeReload(() => void listQuery.reload(), [
    SOCKET_EVENTS.TRACKING_STARTED,
    SOCKET_EVENTS.TRACKING_UPDATE,
    SOCKET_EVENTS.TRACKING_PAUSED,
    SOCKET_EVENTS.TRACKING_RESUMED,
    SOCKET_EVENTS.TRACKING_ARRIVED,
    SOCKET_EVENTS.TRACKING_STOPPED,
  ])

  useEffect(() => {
    const next = new URLSearchParams()
    if (q.trim()) next.set('q', q.trim())
    if (status && status !== 'travelling') next.set('status', status)
    setParams(next, { replace: true })
  }, [q, status, setParams])

  const items = safeArray<TrackingSession>(listQuery.data?.items)
  const analytics = listQuery.data?.analytics

  const cards: Array<{ key: FocusKey; label: string; value: string | number; filter: string; hint: string }> = [
    {
      key: 'active',
      label: 'Active',
      value: analytics?.activeSessions ?? 0,
      filter: 'active',
      hint: 'Every active journey',
    },
    {
      key: 'travelling',
      label: 'Travelling',
      value: analytics?.travelling ?? 0,
      filter: 'travelling',
      hint: 'Technicians currently moving',
    },
    {
      key: 'paused',
      label: 'Paused',
      value: analytics?.paused ?? 0,
      filter: 'paused',
      hint: 'Paused sessions',
    },
    {
      key: 'eta',
      label: 'Avg ETA',
      value: formatTrackingEta(analytics?.averageEtaSeconds),
      filter: 'travelling',
      hint: 'ETA analytics',
    },
  ]

  function openFocus(card: (typeof cards)[number]) {
    setFocus(card.key)
    setStatus(card.filter)
  }

  async function runSessionAction(fn: () => Promise<unknown>) {
    if (!selected) return
    setActing(true)
    setActionError(null)
    try {
      await fn()
      await listQuery.reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const selectedCoords = useMemo(() => {
    const tech = selected?.technicianLocation
    const dest = selected?.destination
    return {
      techLabel:
        tech?.lat != null && tech?.lng != null
          ? `${Number(tech.lat).toFixed(5)}, ${Number(tech.lng).toFixed(5)}`
          : '—',
      destLabel: dest?.label || 'Destination on file',
    }
  }, [selected])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live Tracking"
        subtitle="Monitor active technician journeys, customer routes and travel progress in real time."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              void trackingApi
                .purge()
                .then(() => listQuery.reload())
                .catch((err) => setActionError(getFriendlyErrorMessage(err)))
            }
          >
            <Icon name="delete_sweep" className="!text-[18px]" /> Purge expired
          </Button>
        }
      />

      {actionError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {actionError}
        </FormError>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            aria-pressed={focus === card.key}
            onClick={() => openFocus(card)}
            className={cn(
              'rounded-2xl border bg-canvas p-4 text-left transition duration-200',
              'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99]',
              focus === card.key ? 'border-primary ring-1 ring-primary/20' : 'border-border',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-ink-muted">{card.label}</p>
              <Icon name="chevron_right" className="!text-[16px] text-ink-muted" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
          </button>
        ))}
      </div>

      <Surface className="grid gap-3 p-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-semibold text-ink-secondary">Search</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Job reference / technician / customer id…"
            aria-label="Search tracking sessions"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Filter</span>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              if (e.target.value === 'paused') setFocus('paused')
              else if (e.target.value === 'active') setFocus('active')
              else setFocus('travelling')
            }}
          >
            <option value="travelling">Travelling / live</option>
            <option value="active">Active only</option>
            <option value="paused">Paused</option>
            <option value="arrived">Arrived</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
        </label>
      </Surface>

      {focus === 'eta' ? (
        <Surface className="p-5">
          <h2 className="font-semibold text-ink-primary">ETA analytics</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Average ETA across travelling sessions: {formatTrackingEta(analytics?.averageEtaSeconds)}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-ink-muted">Active</p>
              <p className="text-xl font-bold tabular-nums">{analytics?.activeSessions ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-ink-muted">Travelling</p>
              <p className="text-xl font-bold tabular-nums">{analytics?.travelling ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-ink-muted">Paused</p>
              <p className="text-xl font-bold tabular-nums">{analytics?.paused ?? 0}</p>
            </div>
          </div>
        </Surface>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <AsyncStateView
          status={listQuery.status}
          error={listQuery.error}
          errorTitle={listQuery.errorTitle}
          onRetry={() => void listQuery.reload()}
        >
          <div className="overflow-hidden rounded-2xl border border-border">
            <DataTable caption="Live tracking sessions">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <Th>Job</Th>
                  <Th>Status</Th>
                  <Th>ETA</Th>
                  <Th>Distance</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <ClickableRow
                    key={row.id}
                    label={`Open tracking session for ${row.publicJobReference || row.jobId.slice(-8)}`}
                    onActivate={() => setSelected(row)}
                    className="border-t border-border"
                  >
                    <td className="max-w-[16rem] px-3 py-3 sm:px-4">
                      <CopyableId
                        value={row.publicJobReference || row.jobId}
                        label="Job reference"
                        onOpen={() => setSelected(row)}
                      />
                      {row.jobTitle ? (
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{row.jobTitle}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={row.status} tone={tone(row.status)} />
                    </td>
                    <td className="px-4 py-3">{formatTrackingEta(row.etaSeconds)}</td>
                    <td className="px-4 py-3">{formatTrackingDistance(row.distanceMeters)}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">
                      {row.lastPingAt ? new Date(row.lastPingAt).toLocaleTimeString() : '—'}
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </DataTable>
            {!items.length ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No data available</p>
            ) : null}
          </div>
        </AsyncStateView>

        <Surface className="space-y-4 p-4">
          <h2 className="font-semibold">Session map</h2>
          {selected ? (
            <>
              <TrackingMap
                technician={selected.technicianLocation || null}
                customer={
                  selected.destination?.lat != null && selected.destination?.lng != null
                    ? {
                        lat: Number(selected.destination.lat),
                        lng: Number(selected.destination.lng),
                        label: selected.destination.label,
                      }
                    : null
                }
                route={selected.routePolyline || []}
                heightClassName="h-72"
              />
              <p className="text-sm text-ink-muted">
                {selected.publicJobReference || `Job ${selected.jobId.slice(-8)}`} · Tech{' '}
                {selected.technicianId.slice(-6)} · Customer {selected.customerId.slice(-6)}
              </p>
              <p className="text-sm">{selectedCoords.destLabel}</p>
              <Button variant="outline" onClick={() => setSelected(selected)}>
                Expand session
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Select a session to preview the live map.</p>
          )}
        </Surface>
      </div>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Tracking session"
        description={
          selected
            ? selected.publicJobReference || selected.jobTitle || `Job ${selected.jobId.slice(-8)}`
            : undefined
        }
        placement="end"
        panelClassName="md:!max-w-lg"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={selected.status} tone={tone(selected.status)} />
              {selected.publicJobReference ? (
                <CopyableId value={selected.publicJobReference} label="Job reference" />
              ) : null}
              <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                ETA {formatTrackingEta(selected.etaSeconds)}
              </span>
              <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                {formatTrackingDistance(selected.distanceMeters)} remaining
              </span>
            </div>

            <TrackingMap
              technician={selected.technicianLocation || null}
              customer={
                selected.destination?.lat != null && selected.destination?.lng != null
                  ? {
                      lat: Number(selected.destination.lat),
                      lng: Number(selected.destination.lng),
                      label: selected.destination.label,
                    }
                  : null
              }
              route={selected.routePolyline || []}
              heightClassName="h-64"
            />

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Job</dt>
                <dd className="mt-0.5">
                  <CopyableId
                    value={selected.publicJobReference || selected.jobId}
                    label="Job reference"
                  />
                </dd>
                {selected.jobTitle ? <dd className="text-sm text-ink-primary">{selected.jobTitle}</dd> : null}
                <Link
                  to={`/admin/jobs?q=${encodeURIComponent(selected.publicJobReference || selected.jobId)}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open job
                </Link>
              </div>
              <div>
                <dt className="text-ink-muted">Technician</dt>
                <dd className="mt-0.5">
                  <CopyableId value={selected.technicianId} label="Technician ID" />
                </dd>
                <Link
                  to={`/admin/technicians?q=${encodeURIComponent(selected.technicianId)}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open profile
                </Link>
              </div>
              <div>
                <dt className="text-ink-muted">Customer</dt>
                <dd className="mt-0.5">
                  <CopyableId value={selected.customerId} label="Customer ID" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Coordinates</dt>
                <dd className="font-mono text-xs">{selectedCoords.techLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Destination</dt>
                <dd className="text-ink-primary">{selectedCoords.destLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Last update</dt>
                <dd className="tabular-nums">
                  {selected.lastPingAt ? new Date(selected.lastPingAt).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">GPS accuracy</dt>
                <dd>{selected.accuracyMeters != null ? `${selected.accuracyMeters} m` : '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Speed</dt>
                <dd>
                  {selected.speedMps != null && Number.isFinite(selected.speedMps)
                    ? `${(selected.speedMps * 3.6).toFixed(1)} km/h`
                    : '—'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                disabled={acting || selected.status === 'paused'}
                onClick={() => void runSessionAction(() => trackingApi.pause(selected.jobId))}
              >
                Pause
              </Button>
              <Button
                variant="outline"
                disabled={acting || selected.status !== 'paused'}
                onClick={() => void runSessionAction(() => trackingApi.resume(selected.jobId))}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                disabled={acting}
                onClick={() => void runSessionAction(() => trackingApi.stop(selected.jobId, 'admin_terminate'))}
              >
                Terminate
              </Button>
              <Link
                to={`/admin/jobs?q=${encodeURIComponent(selected.publicJobReference || selected.jobId)}`}
                className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white"
              >
                Open full job
              </Link>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
