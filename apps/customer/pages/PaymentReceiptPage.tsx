import { Link, useParams } from 'react-router-dom'
import { formatUgx, paymentsApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Icon } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

export function PaymentReceiptPage() {
  const { id } = useParams()
  const receipt = useAsync(async () => {
    if (!id) throw new Error('Missing receipt id')
    return (await paymentsApi.receipt(id)).data.receipt
  }, [id])

  const timeline = useAsync(async () => {
    const job = receipt.data?.job as { id?: string; _id?: string } | null
    const jobId = String(job?.id ?? job?._id ?? '')
    if (!jobId) return [] as Record<string, unknown>[]
    try {
      const data = (await paymentsApi.escrowForJob(jobId)).data
      return safeArray<Record<string, unknown>>(data.transactions)
    } catch {
      return []
    }
  }, [receipt.data])

  const download = () => {
    if (!receipt.data) return
    const blob = new Blob([JSON.stringify(receipt.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fixnow-receipt-${String(receipt.data.reference)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to="/customer/payments" className="text-on-surface-variant">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-title-md">Receipt</h1>
      </header>

      <section className="space-y-4 p-4">
        <AsyncStateView status={receipt.status} error={receipt.error} onRetry={() => void receipt.reload()}>
          {receipt.data ? (
            <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5 space-y-3">
              <p className="text-caps text-outline">FixNow receipt</p>
              <p className="text-display-mobile text-primary">{formatUgx(Number(receipt.data.amount ?? 0))}</p>
              <dl className="space-y-2 text-sm">
                {[
                  ['Reference', String(receipt.data.reference)],
                  ['Status', String(receipt.data.status)],
                  ['Type', String(receipt.data.type)],
                  ['Job', String((receipt.data.job as { title?: string } | null)?.title ?? '—')],
                  [
                    'Escrow',
                    String((receipt.data.escrow as { status?: string } | null)?.status ?? '—'),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-border-subtle py-2">
                    <dt className="text-on-surface-variant">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <Button fullWidth variant="outline" onClick={download}>
                <Icon name="download" /> Download receipt
              </Button>
            </div>
          ) : null}
        </AsyncStateView>

        <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
          <h2 className="text-title-md">Payment timeline</h2>
          <AsyncStateView
            status={timeline.status}
            error={timeline.error}
            onRetry={() => void timeline.reload()}
            emptyTitle="No escrow ledger yet"
          >
            <div className="mt-3 space-y-2">
              {safeArray(timeline.data).map((tx) => (
                <div
                  key={String(tx._id ?? tx.reference)}
                  className="flex items-start justify-between gap-3 border-b border-border-subtle py-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold capitalize">
                      {String(tx.type)} · {String(tx.status)}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                      {String(tx.description || tx.reference)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                </div>
              ))}
            </div>
          </AsyncStateView>
        </div>
      </section>
    </div>
  )
}
