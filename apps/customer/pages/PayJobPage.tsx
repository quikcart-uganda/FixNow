import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  clearPaymentIdempotencyKey,
  getFriendlyErrorMessage,
  jobsApi,
  mapAssignedJob,
  paymentIdempotencyKey,
  paymentsApi,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'
import { Button, Icon } from '@fixnow/ui'

export function PayJobPage() {
  const { id: routeId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const jobId = routeId ?? searchParams.get('jobId') ?? ''
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn')
  const [msisdn, setMsisdn] = useState('')
  const [paying, setPaying] = useState(false)

  const jobQuery = useAsync(async () => {
    if (!jobId) throw new Error('No job selected')
    const res = await jobsApi.getById(jobId)
    const raw = res.data.job as Record<string, unknown>
    return {
      mapped: mapAssignedJob(res.data.job, res.data.customer),
      amount: Number(raw.budgetMax ?? raw.budgetMin ?? 0) || 0,
    }
  }, [jobId])

  const methods = useAsync(async () => safeArray((await paymentsApi.listMethods()).data?.items), [])
  const escrow = useAsync(async () => {
    if (!jobId) return null
    return (await paymentsApi.escrowForJob(jobId)).data
  }, [jobId])

  const pay = async () => {
    if (!jobId) return
    setPaying(true)
    try {
      const res = await paymentsApi.pay({
        jobId,
        provider,
        msisdn: msisdn || undefined,
        idempotencyKey: paymentIdempotencyKey(jobId),
      })
      const tx = res.data.transaction as Record<string, unknown>
      const txId = String(tx._id ?? tx.id)
      const txStatus = String(tx.status ?? '').toLowerCase()

      if (txStatus === 'succeeded' || txStatus === 'completed' || txStatus === 'paid' || txStatus === 'held') {
        clearPaymentIdempotencyKey(jobId)
      }

      try {
        const { extractHostedCheckoutUrl, openHostedPayment, showNativeError } = await import(
          '@fixnow/native'
        )
        const checkoutUrl = extractHostedCheckoutUrl(tx.meta ?? tx)
        if (checkoutUrl) {
          const result = await openHostedPayment(checkoutUrl)
          if (result.status === 'returned') {
            navigate(
              result.path.startsWith('/')
                ? result.path
                : `/customer/payments/success?tx=${txId}&jobId=${jobId}`,
            )
            return
          }
          if (result.status === 'dismissed') {
            showNativeError({
              title: 'Payment interrupted',
              message: 'You closed the payment window. If money left your wallet, escrow will update automatically — check Tracking.',
              actionLabel: 'Check status',
              onAction: () => navigate(`/customer/tracking/${jobId}`),
            })
            return
          }
        }
      } catch {
        /* hosted browser unavailable */
      }

      if (txStatus === 'failed') {
        const { showNativeError } = await import('@fixnow/native')
        showNativeError({
          title: 'Payment failed',
          message: 'This payment was declined. Try another number or payment method.',
        })
        return
      }

      if (txStatus === 'pending' || txStatus === 'processing') {
        navigate(`/customer/payments/success?tx=${txId}&jobId=${jobId}&pending=1`)
        return
      }

      navigate(`/customer/payments/success?tx=${txId}&jobId=${jobId}`)
    } catch (err) {
      try {
        const { showNativeError } = await import('@fixnow/native')
        showNativeError(getFriendlyErrorMessage(err))
      } catch {
        window.alert(getFriendlyErrorMessage(err))
      }
    } finally {
      setPaying(false)
    }
  }

  const alreadyFunded = Boolean(escrow.data?.escrow)
  const amountLabel = jobQuery.data?.mapped.budget ?? '—'

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <button type="button" onClick={() => navigate(-1)} className="text-on-surface-variant">
          <Icon name="arrow_back" />
        </button>
        <h1 className="text-title-md">Select payment method</h1>
      </header>

      <section className="space-y-6 p-4 pb-28">
        <AsyncStateView status={jobQuery.status} error={jobQuery.error} onRetry={() => void jobQuery.reload()}>
          {jobQuery.data ? (
            <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
              <p className="text-caps text-outline">Pay for job</p>
              <h2 className="mt-1 text-title-md">{jobQuery.data.mapped.title}</h2>
              <p className="mt-3 text-display-mobile text-primary">{amountLabel}</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">Held in escrow until you confirm completion</p>
            </div>
          ) : null}
        </AsyncStateView>

        {alreadyFunded ? (
          <div className="rounded-xl border border-success-green/30 bg-success-green/10 p-4 text-sm">
            Escrow already funded for this job.{' '}
            <Link className="font-semibold text-primary" to={`/customer/tracking/${jobId}`}>
              Back to tracking
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {(
                [
                  { id: 'mtn' as const, label: 'MTN Mobile Money', color: 'bg-[#FFCC00] text-[#004F9F]' },
                  { id: 'airtel' as const, label: 'Airtel Money', color: 'bg-[#FF0000] text-white' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProvider(opt.id)}
                  className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                    provider === opt.id
                      ? 'border-primary bg-surface-container-low'
                      : 'border-border-subtle bg-canvas-white'
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-xs font-bold ${opt.color}`}>
                    {opt.id === 'mtn' ? 'MTN' : 'ATL'}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-body-sm text-on-surface-variant">Secure escrow payment</p>
                  </div>
                  <span
                    className={`h-5 w-5 rounded-full border-2 ${
                      provider === opt.id ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_#fff]' : 'border-outline'
                    }`}
                  />
                </button>
              ))}
            </div>

            <AsyncStateView status={methods.status} error={methods.error} onRetry={() => void methods.reload()}>
              {safeArray(methods.data).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-caps text-outline">Saved numbers</p>
                  {safeArray(methods.data).map((m) => (
                    <button
                      key={String(m._id)}
                      type="button"
                      className="w-full rounded-xl border border-border-subtle bg-canvas-white px-4 py-3 text-left text-sm"
                      onClick={() => {
                        setMsisdn(String(m.msisdn ?? ''))
                        setProvider(String(m.provider) === 'airtel' ? 'airtel' : 'mtn')
                      }}
                    >
                      {String(m.provider).toUpperCase()} · {String(m.msisdn)} · {String(m.accountName)}
                    </button>
                  ))}
                </div>
              ) : null}
            </AsyncStateView>

            <input
              className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-3 py-3"
              placeholder="MSISDN (optional)"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
            />
          </>
        )}
      </section>

      {!alreadyFunded ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-canvas-white p-4 pb-[max(1rem,calc(4.75rem+env(safe-area-inset-bottom,0px)))] md:pl-20 md:pb-4">
          <Button fullWidth disabled={paying || !jobId} onClick={() => void pay()}>
            {paying ? 'Processing…' : `Pay ${amountLabel}`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
