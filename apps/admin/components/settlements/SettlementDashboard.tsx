import { useMemo, useState } from 'react'
import { formatUgx } from '@fixnow/api'
import { DataTable, Th } from '@fixnow/shared'
import { Button } from '@fixnow/ui'
import { cn, safeArray } from '@fixnow/utils'
import {
  BreakdownList,
  MetricCards,
  SimpleBarChart,
  TimelineList,
  type BreakdownRow,
  type ChartPoint,
} from '../analytics'
import { CopyableId } from '../CopyableId'

export type SettlementAmount = { count: number; amount: number }

export type SettlementRow = {
  settlementId: string
  job: string
  customer: string
  technician: string
  amount: number
  currency?: string
  fee: number
  platformCommission: number
  releaseDate: string | null
  status: string
  type: string
  typeLabel: string
  paymentMethod?: string
  category?: string
  district?: string
}

export type SettlementReport = {
  period?: { days: number; since: string; until: string }
  summary?: {
    totalSettlements?: number
    totalReleased?: SettlementAmount
    totalHeld?: SettlementAmount
    totalRefunded?: SettlementAmount
    totalDebits?: SettlementAmount
    totalCredits?: SettlementAmount
    totalPayouts?: SettlementAmount
    totalFees?: SettlementAmount
  }
  series?: {
    daily?: ChartPoint[]
    weekly?: ChartPoint[]
    monthly?: ChartPoint[]
  }
  breakdowns?: {
    byType?: BreakdownRow[]
    byPaymentMethod?: BreakdownRow[]
    byTechnician?: BreakdownRow[]
    byCustomer?: BreakdownRow[]
    byCategory?: BreakdownRow[]
    byDistrict?: BreakdownRow[]
    byStatus?: BreakdownRow[]
  }
  recent?: SettlementRow[]
}

type SortKey =
  | 'settlementId'
  | 'job'
  | 'customer'
  | 'technician'
  | 'amount'
  | 'fee'
  | 'platformCommission'
  | 'releaseDate'
  | 'status'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toCsv(rows: SettlementRow[]) {
  const header = [
    'Settlement ID',
    'Job',
    'Customer',
    'Technician',
    'Amount',
    'Fee',
    'Platform commission',
    'Release date',
    'Status',
    'Type',
  ]
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.settlementId,
        r.job,
        r.customer,
        r.technician,
        String(r.amount),
        String(r.fee),
        String(r.platformCommission),
        r.releaseDate ? new Date(r.releaseDate).toISOString() : '',
        r.status,
        r.typeLabel,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ]
  return lines.join('\n')
}

function exportExcel(rows: SettlementRow[]) {
  const escape = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const th = [
    'Settlement ID',
    'Job',
    'Customer',
    'Technician',
    'Amount',
    'Fee',
    'Commission',
    'Release date',
    'Status',
    'Type',
  ]
  const body = rows
    .map(
      (r) =>
        `<tr>${[
          r.settlementId,
          r.job,
          r.customer,
          r.technician,
          r.amount,
          r.fee,
          r.platformCommission,
          r.releaseDate ? new Date(r.releaseDate).toLocaleString() : '',
          r.status,
          r.typeLabel,
        ]
          .map((c) => `<td>${escape(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${th
    .map((h) => `<th>${h}</th>`)
    .join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`
  downloadBlob(
    `fixnow-settlements-${Date.now()}.xls`,
    new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
  )
}

function exportPdf(rows: SettlementRow[], periodLabel: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
  if (!win) {
    window.alert('Allow pop-ups to export PDF.')
    return
  }
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>
          <td>${r.settlementId}</td>
          <td>${r.job}</td>
          <td>${r.customer}</td>
          <td>${r.technician}</td>
          <td>${formatUgx(r.amount)}</td>
          <td>${formatUgx(r.fee)}</td>
          <td>${formatUgx(r.platformCommission)}</td>
          <td>${r.releaseDate ? new Date(r.releaseDate).toLocaleString() : '—'}</td>
          <td>${r.status}</td>
        </tr>`,
    )
    .join('')
  win.document.write(`<!DOCTYPE html><html><head><title>Settlement report</title>
    <style>
      body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#555;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f4f4f5}
    </style></head><body>
    <h1>FixNow settlement report</h1>
    <p>${periodLabel} · ${rows.length} rows · generated ${new Date().toLocaleString()}</p>
    <table><thead><tr>
      <th>Settlement ID</th><th>Job</th><th>Customer</th><th>Technician</th>
      <th>Amount</th><th>Fee</th><th>Commission</th><th>Release date</th><th>Status</th>
    </tr></thead><tbody>${rowsHtml}</tbody></table>
    <script>window.onload=()=>{window.print()}</script>
    </body></html>`)
  win.document.close()
}

function amt(v?: SettlementAmount) {
  return Number(v?.amount ?? 0)
}

function cnt(v?: SettlementAmount) {
  return Number(v?.count ?? 0)
}

export function SettlementDashboard({ report }: { report: SettlementReport | null | undefined }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('releaseDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const summary = report?.summary
  const days = report?.period?.days ?? 30
  const periodLabel = `Last ${days} days`

  const metrics = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total settlements',
        value: Number(summary?.totalSettlements ?? 0),
        hint: periodLabel,
        icon: 'receipt_long',
        accent: 'primary' as const,
      },
      {
        key: 'released',
        label: 'Total released',
        value: formatUgx(amt(summary?.totalReleased)),
        hint: `${cnt(summary?.totalReleased)} releases`,
        icon: 'lock_open',
        accent: 'secondary' as const,
      },
      {
        key: 'held',
        label: 'Total held',
        value: formatUgx(amt(summary?.totalHeld)),
        hint: `${cnt(summary?.totalHeld)} in escrow`,
        icon: 'account_balance_wallet',
        accent: 'tertiary' as const,
      },
      {
        key: 'refunded',
        label: 'Total refunded',
        value: formatUgx(amt(summary?.totalRefunded)),
        hint: `${cnt(summary?.totalRefunded)} refunds`,
        icon: 'undo',
        accent: 'danger' as const,
      },
      {
        key: 'debits',
        label: 'Total debits',
        value: formatUgx(amt(summary?.totalDebits)),
        hint: `${cnt(summary?.totalDebits)} collections`,
        icon: 'south_west',
        accent: 'primary' as const,
      },
      {
        key: 'credits',
        label: 'Total credits',
        value: formatUgx(amt(summary?.totalCredits)),
        hint: `${cnt(summary?.totalCredits)} credits`,
        icon: 'north_east',
        accent: 'secondary' as const,
      },
    ],
    [summary, periodLabel],
  )

  const allRows = safeArray(report?.recent)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = allRows
    if (statusFilter) {
      rows = rows.filter((r) => String(r.status).toLowerCase() === statusFilter.toLowerCase())
    }
    if (typeFilter) {
      rows = rows.filter((r) => String(r.type).toLowerCase() === typeFilter.toLowerCase())
    }
    if (q) {
      rows = rows.filter((r) =>
        [r.settlementId, r.job, r.customer, r.technician, r.status, r.typeLabel]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [allRows, query, statusFilter, typeFilter, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageSafe = Math.min(page, pageCount)
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  const statuses = useMemo(
    () => [...new Set(allRows.map((r) => r.status).filter(Boolean))],
    [allRows],
  )
  const types = useMemo(
    () => [...new Set(allRows.map((r) => r.type).filter(Boolean))],
    [allRows],
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'releaseDate' || key === 'amount' ? 'desc' : 'asc')
    }
  }

  const SortTh = ({ k, children }: { k: SortKey; children: string }) => (
    <Th>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold"
        onClick={() => toggleSort(k)}
      >
        {children}
        {sortKey === k ? (
          <span className="text-[10px] text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
        ) : null}
      </button>
    </Th>
  )

  const timeline = pageRows.slice(0, 6).map((r) => ({
    id: r.settlementId,
    title: `${r.typeLabel} · ${formatUgx(r.amount)}`,
    subtitle: `${r.job} · ${r.customer}`,
    at: r.releaseDate,
    tone:
      r.type === 'refund'
        ? ('danger' as const)
        : r.type === 'release'
          ? ('success' as const)
          : ('default' as const),
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Settlement report</h2>
          <p className="text-sm text-ink-muted">
            {periodLabel}
            {report?.period?.since
              ? ` · since ${new Date(report.period.since).toLocaleDateString()}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadBlob(
                `fixnow-settlements-${Date.now()}.csv`,
                new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' }),
              )
            }
          >
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => exportExcel(filtered)}>
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => exportPdf(filtered, periodLabel)}>
            Export PDF
          </Button>
        </div>
      </div>

      <MetricCards items={metrics} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SimpleBarChart title="Daily settlements" points={safeArray(report?.series?.daily)} />
        <SimpleBarChart title="Weekly settlements" points={safeArray(report?.series?.weekly)} />
        <SimpleBarChart title="Monthly settlements" points={safeArray(report?.series?.monthly)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BreakdownList title="By payment method" rows={safeArray(report?.breakdowns?.byPaymentMethod)} />
        <BreakdownList title="By technician" rows={safeArray(report?.breakdowns?.byTechnician)} />
        <BreakdownList title="By customer" rows={safeArray(report?.breakdowns?.byCustomer)} />
        <BreakdownList title="By category" rows={safeArray(report?.breakdowns?.byCategory)} />
        <BreakdownList title="By district" rows={safeArray(report?.breakdowns?.byDistrict)} />
        <BreakdownList title="By status" rows={safeArray(report?.breakdowns?.byStatus)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-[180px] flex-1 rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              placeholder="Search settlement, job, customer…"
              aria-label="Search settlements"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
            <select
              className="rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-border-subtle bg-canvas-white px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-canvas-white">
            <DataTable caption="Recent settlements">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-container-low">
                  <SortTh k="settlementId">Settlement ID</SortTh>
                  <SortTh k="job">Job</SortTh>
                  <SortTh k="customer">Customer</SortTh>
                  <SortTh k="technician">Technician</SortTh>
                  <SortTh k="amount">Amount</SortTh>
                  <SortTh k="fee">Fee</SortTh>
                  <SortTh k="platformCommission">Commission</SortTh>
                  <SortTh k="releaseDate">Release date</SortTh>
                  <SortTh k="status">Status</SortTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.settlementId} className="border-t border-border-subtle">
                    <td className="max-w-[12rem] px-3 py-2.5">
                      <CopyableId value={r.settlementId} label="Settlement ID" />
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-sm">{r.job}</td>
                    <td className="px-3 py-2.5 text-sm">{r.customer}</td>
                    <td className="px-3 py-2.5 text-sm">{r.technician}</td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">{formatUgx(r.amount)}</td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">{formatUgx(r.fee)}</td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">
                      {formatUgx(r.platformCommission)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">
                      {r.releaseDate ? new Date(r.releaseDate).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                          r.status === 'completed'
                            ? 'bg-secondary/10 text-secondary'
                            : 'bg-surface-alt text-ink-secondary',
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button
                        variant="outline"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => exportPdf([r], `Settlement ${r.settlementId}`)}
                      >
                        Receipt
                      </Button>
                    </td>
                  </tr>
                ))}
                {!pageRows.length ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-ink-muted">
                      No settlements match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>
              Showing {pageRows.length ? (pageSafe - 1) * pageSize + 1 : 0}–
              {Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={pageSafe >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        <TimelineList title="Recent activity" events={timeline} />
      </div>
    </div>
  )
}
