import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUgx, paymentsApi } from '@fixnow/api'
import { useAsync, useSocketEvent, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Icon } from '@fixnow/ui'

export function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const txId = params.get('tx') ?? ''
  const jobId = params.get('jobId') ?? ''
  const initiallyPending = params.get('pending') === '1'
  const [pending, setPending] = useState(initiallyPending)

  const receipt = useAsync(async () => {
    if (!txId) return null
    return (await paymentsApi.receipt(txId)).data.receipt
  }, [txId])

  useEffect(() => {
    if (!pending || !txId) return
    const tick = () => {
      void receipt.reload()
    }
    const id = window.setInterval(tick, 2_500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, txId])

  useEffect(() => {
    const status = String(
      (receipt.data as { status?: string; escrow?: { status?: string } } | null)?.status ?? '',
    ).toLowerCase()
    const escrow = String(
      (receipt.data as { escrow?: { status?: string } } | null)?.escrow?.status ?? '',
    ).toLowerCase()
    if (status === 'completed' || status === 'successful' || escrow === 'held' || escrow === 'funded') {
      setPending(false)
    }
  }, [receipt.data])

  useSocketEvent(
    [SOCKET_EVENTS.PAYMENT_SUCCESSFUL, SOCKET_EVENTS.ESCROW_FUNDED, SOCKET_EVENTS.PAYMENT_FAILED],
    () => {
      void receipt.reload()
    },
    Boolean(txId),
  )

  return (
    <div className="">
      <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-6 text-center">
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full ${
            pending ? 'bg-warning/15 text-warning' : 'bg-success-green/15 text-success-green'
          }`}
        >
          <Icon name={pending ? 'hourglass_top' : 'check_circle'} className="text-5xl" />
        </div>
        <div>
          <h1 className="text-headline">{pending ? 'Confirming payment…' : 'Payment successful'}</h1>
          <p className="mt-2 text-body text-on-surface-variant">
            {pending
              ? 'Waiting for payment confirmation. This usually takes a few seconds.'
              : 'Funds are held in escrow until the job is confirmed complete.'}
          </p>
        </div>

        <AsyncStateView status={receipt.status} error={receipt.error} onRetry={() => void receipt.reload()}>
          {receipt.data ? (
            <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-canvas-white p-5 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Amount</span>
                <span className="font-semibold">{formatUgx(Number(receipt.data.amount ?? 0))}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-on-surface-variant">Reference</span>
                <span className="font-mono text-xs">{String(receipt.data.reference)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-on-surface-variant">Escrow</span>
                <span className="capitalize">
                  {String((receipt.data.escrow as { status?: string } | null)?.status ?? '—')}
                </span>
              </div>
            </div>
          ) : null}
        </AsyncStateView>

        <div className="flex w-full max-w-md flex-col gap-3">
          {jobId ? (
            <Link to={`/customer/tracking/${jobId}`}>
              <Button fullWidth>{pending ? 'Track while waiting' : 'Track job'}</Button>
            </Link>
          ) : null}
          {txId ? (
            <Link to={`/customer/payments/receipt/${txId}`}>
              <Button fullWidth variant="outline">
                View receipt
              </Button>
            </Link>
          ) : null}
          <Link to="/customer/payments" className="text-sm font-semibold text-primary">
            Payment methods & history
          </Link>
        </div>
      </section>
    </div>
  )
}
