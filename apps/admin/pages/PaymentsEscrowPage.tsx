import { useMemo, useState } from 'react'
import { formatUgx, getFriendlyErrorMessage, paymentsApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, DataTable, Th } from '@fixnow/shared'
import { Button } from '@fixnow/ui'
import { cn, safeArray } from '@fixnow/utils'
import { Icon, PageHeader } from '../components/ui'
import { CopyableId } from '../components/CopyableId'
import {
  SettlementDashboard,
  type SettlementReport,
} from '../components/settlements/SettlementDashboard'

type FocusKey =
  | 'payments'
  | 'volume'
  | 'escrow'
  | 'held'
  | 'disputed'
  | 'refunded-escrow'
  | 'payouts'
  | 'refunds'

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

export function PaymentsEscrowPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [focus, setFocus] = useState<FocusKey>('payments')
  const [escrowStatus, setEscrowStatus] = useState('')

  const paymentsDash = useAsync(async () => (await paymentsApi.adminPaymentDashboard()).data.dashboard, [])
  const escrowDash = useAsync(async () => (await paymentsApi.adminEscrowDashboard()).data.dashboard, [])
  const payments = useAsync(
    async () =>
      safeArray(
        (
          await paymentsApi.adminPayments({
            limit: 50,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(appliedSearch ? { q: appliedSearch } : {}),
          })
        ).data?.items,
      ),
    [statusFilter, appliedSearch],
  )
  const escrows = useAsync(async () => safeArray((await paymentsApi.listEscrow({ limit: 50 })).data?.items), [])
  const pendingPayouts = useAsync(
    async () => safeArray((await paymentsApi.adminPendingPayouts({ limit: 30 })).data?.items),
    [],
  )
  const pendingRefunds = useAsync(
    async () => safeArray((await paymentsApi.adminPendingRefunds({ limit: 30 })).data?.items),
    [],
  )
  const settlements = useAsync(
    async () => (await paymentsApi.adminSettlements(30)).data.report as SettlementReport,
    [],
  )

  const reloadAll = () => {
    void paymentsDash.reload()
    void escrowDash.reload()
    void payments.reload()
    void escrows.reload()
    void pendingPayouts.reload()
    void pendingRefunds.reload()
    void settlements.reload()
  }

  useRealtimeReload(reloadAll, [
    SOCKET_EVENTS.PAYMENT_CREATED,
    SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
    SOCKET_EVENTS.PAYMENT_FAILED,
    SOCKET_EVENTS.ESCROW_FUNDED,
    SOCKET_EVENTS.ESCROW_RELEASED,
    SOCKET_EVENTS.REFUND_REQUESTED,
    SOCKET_EVENTS.REFUND_APPROVED,
    SOCKET_EVENTS.PAYOUT_COMPLETED,
  ])

  const filteredEscrows = useMemo(() => {
    const rows = safeArray(escrows.data)
    if (!escrowStatus) return rows
    return rows.filter((e) => String(e.status).toLowerCase() === escrowStatus.toLowerCase())
  }, [escrows.data, escrowStatus])

  const exportCsv = () => {
    const rows = safeArray(payments.data)
    const header = ['reference', 'amount', 'currency', 'status', 'type', 'createdAt', 'jobId', 'userId']
    const lines = [
      header.join(','),
      ...rows.map((tx) =>
        [
          String(tx.reference ?? ''),
          String(tx.amount ?? ''),
          String(tx.currency ?? 'UGX'),
          String(tx.status ?? ''),
          String(tx.type ?? ''),
          String(tx.createdAt ?? ''),
          String(tx.jobId ?? ''),
          String(tx.userId ?? tx.customerId ?? ''),
        ]
          .map((cell) => `"${cell.replace(/"/g, '""')}"`)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fixnow-payments-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openFocus(next: FocusKey) {
    setFocus(next)
    switch (next) {
      case 'payments':
        setStatusFilter('')
        scrollToId('payments-ledger')
        break
      case 'volume':
        setStatusFilter('successful')
        scrollToId('payments-ledger')
        break
      case 'escrow':
      case 'held':
        setEscrowStatus(next === 'held' ? 'held' : '')
        scrollToId('escrow-workspace')
        break
      case 'disputed':
        setEscrowStatus('disputed')
        scrollToId('escrow-workspace')
        break
      case 'refunded-escrow':
        setEscrowStatus('refunded')
        scrollToId('escrow-workspace')
        break
      case 'payouts':
        scrollToId('payouts-workspace')
        break
      case 'refunds':
        scrollToId('refunds-workspace')
        break
    }
  }

  const cards: Array<{ key: FocusKey; label: string; value: string | number; hint: string }> = [
    {
      key: 'payments',
      label: 'Payments',
      value: Number(paymentsDash.data?.payments ?? 0),
      hint: 'All payment transactions',
    },
    {
      key: 'volume',
      label: 'Volume collected',
      value: formatUgx(Number(paymentsDash.data?.volumeCollected ?? 0)),
      hint: 'Revenue history',
    },
    {
      key: 'escrow',
      label: 'Escrow held',
      value: Number(escrowDash.data?.held ?? 0),
      hint: 'Escrow records',
    },
    {
      key: 'held',
      label: 'Held amount',
      value: formatUgx(Number(escrowDash.data?.heldAmount ?? 0)),
      hint: 'Current held balances',
    },
    {
      key: 'disputed',
      label: 'Disputed',
      value: Number(escrowDash.data?.disputed ?? 0),
      hint: 'Dispute manager',
    },
    {
      key: 'refunded-escrow',
      label: 'Refunded escrows',
      value: Number(escrowDash.data?.refunded ?? 0),
      hint: 'Refund history',
    },
    {
      key: 'payouts',
      label: 'Payouts completed',
      value: Number(paymentsDash.data?.payoutsCompleted ?? 0),
      hint: 'Payout ledger',
    },
    {
      key: 'refunds',
      label: 'Refund txs',
      value: Number(paymentsDash.data?.refunds ?? 0),
      hint: 'Refund details',
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payments & escrow"
        subtitle="Monitor collections, escrow balances, refunds, disputes, payouts and settlement activity."
      />

      <AsyncStateView status={paymentsDash.status} error={paymentsDash.error} onRetry={reloadAll}>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              aria-pressed={focus === card.key}
              onClick={() => openFocus(card.key)}
              className={cn(
                'group rounded-2xl border bg-canvas-white p-4 text-left transition duration-200',
                'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99]',
                focus === card.key ? 'border-primary ring-1 ring-primary/20' : 'border-border-subtle',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-ink-muted">{card.label}</p>
                <Icon
                  name="chevron_right"
                  className="!text-[18px] text-ink-muted opacity-0 transition group-hover:opacity-100"
                />
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink-primary">{card.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
            </button>
          ))}
        </div>
      </AsyncStateView>

      <section id="refunds-workspace" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Pending refund approvals</h2>
          {focus === 'refunds' ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Focused from Refund txs
            </span>
          ) : null}
        </div>
        <AsyncStateView
          status={pendingRefunds.status}
          error={pendingRefunds.error}
          onRetry={() => void pendingRefunds.reload()}
          emptyTitle="No pending refunds"
        >
          <div className="space-y-2">
            {safeArray(pendingRefunds.data).map((tx) => (
              <div
                key={String(tx._id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4"
              >
                <div>
                  <p className="font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                    <CopyableId value={String(tx.reference ?? '')} label="Refund reference" />
                    <span>· {String(tx.description || tx.status)}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void paymentsApi
                      .approveRefund(String(tx._id))
                      .then(reloadAll)
                      .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                  }}
                >
                  Approve refund
                </Button>
              </div>
            ))}
          </div>
        </AsyncStateView>
      </section>

      <section id="payouts-workspace" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Pending payout approvals</h2>
          {focus === 'payouts' ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Focused from Completed payouts
            </span>
          ) : null}
        </div>
        <AsyncStateView
          status={pendingPayouts.status}
          error={pendingPayouts.error}
          onRetry={() => void pendingPayouts.reload()}
          emptyTitle="No pending payouts"
        >
          <div className="space-y-2">
            {safeArray(pendingPayouts.data).map((tx) => (
              <div
                key={String(tx._id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4"
              >
                <div>
                  <p className="font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                    <CopyableId value={String(tx.reference ?? '')} label="Payout reference" />
                    <span>· {String(tx.status)}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void paymentsApi
                      .approvePayout(String(tx._id))
                      .then(reloadAll)
                      .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                  }}
                >
                  Approve payout
                </Button>
              </div>
            ))}
          </div>
        </AsyncStateView>
      </section>

      <section id="escrow-workspace" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Escrow & disputes</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              value={escrowStatus}
              onChange={(e) => setEscrowStatus(e.target.value)}
              aria-label="Filter escrow status"
            >
              <option value="">All statuses</option>
              <option value="held">Held</option>
              <option value="disputed">Disputed</option>
              <option value="refunded">Refunded</option>
              <option value="released">Released</option>
            </select>
          </div>
        </div>
        <AsyncStateView status={escrows.status} error={escrows.error} onRetry={() => void escrows.reload()}>
          <div className="space-y-2">
            {filteredEscrows.map((e) => {
              const id = String(e._id)
              const jobId = String(e.jobId)
              const status = String(e.status)
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {formatUgx(Number(e.amount ?? 0))} · {status}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {String(e.jobTitle || 'Job')}
                      {e.customerName ? ` · ${String(e.customerName)}` : ''}
                      {e.technicianName ? ` · ${String(e.technicianName)}` : ''}
                    </p>
                    {e.disputeReason ? (
                      <p className="mt-1 text-sm text-error">Dispute: {String(e.disputeReason)}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === 'disputed' || status === 'held' ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            void paymentsApi
                              .resolveDispute({ jobId, action: 'release' })
                              .then(reloadAll)
                              .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                          }}
                        >
                          Release
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            void paymentsApi
                              .resolveDispute({ jobId, action: 'refund', reason: 'Admin intervention' })
                              .then(reloadAll)
                              .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                          }}
                        >
                          Refund
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {!filteredEscrows.length ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                No data available
              </p>
            ) : null}
          </div>
        </AsyncStateView>
      </section>

      <section id="payments-ledger" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {focus === 'volume' ? 'Revenue history' : 'Recent payments'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              placeholder="Search reference…"
              aria-label="Search payment reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedSearch(search.trim())
              }}
            />
            <select
              className="rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter payment status"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setAppliedSearch(search.trim())
              }}
            >
              Search
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </div>
        <AsyncStateView status={payments.status} error={payments.error} onRetry={() => void payments.reload()}>
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-canvas-white">
            <DataTable caption="Recent payments">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-container-low">
                  <Th className="min-w-[11rem]">Reference</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Type</Th>
                  <Th className="hidden md:table-cell">Created</Th>
                </tr>
              </thead>
              <tbody>
                {safeArray(payments.data).map((tx) => (
                  <tr key={String(tx._id)} className="border-t border-border-subtle">
                    <td className="max-w-[14rem] px-3 py-3 sm:px-4">
                      <CopyableId value={String(tx.reference ?? '')} label="Payment reference" />
                    </td>
                    <td className="px-3 py-3 sm:px-4">{formatUgx(Number(tx.amount ?? 0))}</td>
                    <td className="px-3 py-3 capitalize sm:px-4">{String(tx.status)}</td>
                    <td className="hidden px-3 py-3 text-sm text-ink-muted sm:table-cell sm:px-4">
                      {String(tx.type ?? '—')}
                    </td>
                    <td className="hidden px-3 py-3 text-sm text-ink-muted md:table-cell md:px-4">
                      {tx.createdAt ? new Date(String(tx.createdAt)).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </AsyncStateView>
      </section>

      <section id="settlement-report" className="scroll-mt-24 space-y-3">
        <AsyncStateView
          status={settlements.status}
          error={settlements.error}
          onRetry={() => void settlements.reload()}
          emptyTitle="No settlement activity"
          emptyHint="Completed payments, releases, refunds and payouts will appear here."
        >
          <SettlementDashboard report={settlements.data} />
        </AsyncStateView>
      </section>
    </div>
  )
}
