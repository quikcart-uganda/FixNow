import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, DataTable, Th } from '@fixnow/shared'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { safeArray } from '@fixnow/utils'
import { Button, PageHeader, StatusBadge, Surface } from '../components/ui'

function severityTone(s: string) {
  if (s === 'critical') return 'danger' as const
  if (s === 'warning') return 'warning' as const
  return 'neutral' as const
}

export function AuditPage() {
  const [action, setAction] = useState('')
  const [exportHint, setExportHint] = useState<string | null>(null)

  const list = useAsync(async () => {
    const res = await adminApi.auditLogs({
      action: action.trim() || undefined,
      limit: 100,
    })
    return safeArray(res.data?.items)
  }, [action])

  function exportCsv() {
    const rows = safeArray(list.data)
    if (!rows.length) {
      setExportHint('Nothing to export yet.')
      return
    }
    const header = ['createdAt', 'action', 'actorId', 'resourceType', 'resourceId', 'severity', 'ip']
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.createdAt,
          r.action,
          r.actorId,
          r.resourceType,
          r.resourceId,
          r.severity,
          r.ip,
        ]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fixnow-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportHint(`Exported ${rows.length} rows.`)
  }

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
          <li className="font-semibold text-ink-primary">Audit Logs</li>
        </ol>
      </nav>

      <PageHeader
        title="Audit Logs"
        subtitle="Every administrator action is recorded for compliance, security review, and marketplace governance."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      {exportHint ? <p className="text-sm text-ink-muted">{exportHint}</p> : null}
      {list.error ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {getFriendlyErrorMessage(list.error)}
        </p>
      ) : null}

      <Surface className="p-4">
        <label className="grid max-w-md gap-1 text-sm">
          <span className="font-semibold text-ink-secondary">Filter by action</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. admin.lock, verification.approve"
            aria-label="Filter audit actions"
          />
        </label>
      </Surface>

      <AsyncStateView
        status={list.status}
        error={list.error}
        onRetry={() => void list.reload()}
        emptyTitle="No audit events match"
        emptyHint="Governance actions written by the server appear here as administrators lock accounts, approve verifications, and change settings."
        emptyIcon="history"
      >
        <Surface className="overflow-hidden">
          <DataTable caption="Administrator audit trail">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Severity</Th>
                <Th>Actor</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {safeArray(list.data).map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-3 text-xs tabular-nums text-ink-secondary">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-ink-primary">{row.action}</td>
                  <td className="px-6 py-3 text-xs text-ink-muted">
                    {row.resourceType}
                    {row.resourceId ? ` · ${String(row.resourceId).slice(-8)}` : ''}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge label={row.severity} tone={severityTone(row.severity)} />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-ink-muted">
                    {row.actorId ? String(row.actorId).slice(-8) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Surface>
      </AsyncStateView>
    </div>
  )
}
