import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUgx, getFriendlyErrorMessage, paymentsApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Icon } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

function maskMsisdn(msisdn: string) {
  if (msisdn.length < 4) return msisdn
  return `•••• ${msisdn.slice(-3)}`
}

export function PaymentMethodsPage() {
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn')
  const [msisdn, setMsisdn] = useState('')
  const [accountName, setAccountName] = useState('')
  const [saving, setSaving] = useState(false)

  const methods = useAsync(async () => safeArray((await paymentsApi.listMethods()).data?.items), [], {
    cacheKey: 'customer.payment-methods.v1',
  })
  const wallet = useAsync(async () => (await paymentsApi.wallet()).data.wallet, [], {
    cacheKey: 'customer.wallet.v1',
  })
  const history = useAsync(async () => safeArray((await paymentsApi.transactions({ limit: 20 })).data?.items), [], {
    cacheKey: 'customer.transactions.v1',
  })

  useRealtimeReload(
    () => {
      void methods.reload()
      void wallet.reload()
      void history.reload()
    },
    [
      SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
      SOCKET_EVENTS.PAYMENT_FAILED,
      SOCKET_EVENTS.REFUND_APPROVED,
      SOCKET_EVENTS.ESCROW_RELEASED,
    ],
  )

  const saveMethod = async () => {
    setSaving(true)
    try {
      await paymentsApi.upsertMethod({
        provider,
        msisdn,
        accountName,
        isDefault: true,
      })
      setMsisdn('')
      setAccountName('')
      await methods.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to="/customer/profile" className="text-on-surface-variant">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-title-md">Payment methods</h1>
      </header>

      <section className="space-y-6 p-4">
        <AsyncStateView status={wallet.status} error={wallet.error} onRetry={() => void wallet.reload()}>
          {wallet.data ? (
            <div className="rounded-2xl bg-primary p-5 text-on-primary shadow-sm">
              <p className="text-caps text-primary-fixed/80">Wallet balance</p>
              <p className="mt-2 text-display-mobile">
                {formatUgx(Number(wallet.data.availableBalance ?? 0))}
              </p>
              <p className="mt-1 text-body-sm text-on-primary-container">
                Held {formatUgx(Number(wallet.data.heldBalance ?? 0))} · {String(wallet.data.currency ?? 'UGX')}
              </p>
            </div>
          ) : null}
        </AsyncStateView>

        <div>
          <h2 className="mb-3 text-caps uppercase tracking-widest text-outline">Mobile Money wallets</h2>
          <AsyncStateView
            status={methods.status}
            error={methods.error}
            onRetry={() => void methods.reload()}
            emptyTitle="No payment methods yet"
            emptyHint="Add MTN MoMo or Airtel Money to pay for jobs."
          >
            <div className="space-y-3">
              {safeArray(methods.data).map((item) => {
                const id = String(item._id ?? item.id)
                const isMtn = String(item.provider) === 'mtn'
                return (
                  <div
                    key={id}
                    className="flex items-center gap-4 rounded-xl border border-border-subtle bg-canvas-white p-4"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold ${
                        isMtn ? 'bg-[#FFCC00] text-[#004F9F]' : 'bg-[#FF0000] text-white'
                      }`}
                    >
                      {isMtn ? 'MTN' : 'ATL'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-on-surface">
                        {isMtn ? 'MTN MoMo' : 'Airtel Money'} {maskMsisdn(String(item.msisdn ?? ''))}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">{String(item.accountName ?? '')}</p>
                    </div>
                    {item.isDefault ? (
                      <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-caps text-primary">Default</span>
                    ) : null}
                    <button
                      type="button"
                      className="text-outline hover:text-error"
                      onClick={() => {
                        void paymentsApi
                          .removeMethod(id)
                          .then(() => methods.reload())
                          .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                      }}
                    >
                      <Icon name="delete" />
                    </button>
                  </div>
                )
              })}
            </div>
          </AsyncStateView>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4 space-y-3">
          <h2 className="text-title">Add Mobile Money</h2>
          <div className="flex gap-2">
            {(['mtn', 'airtel'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  provider === p
                    ? 'border-primary bg-surface-container-low text-primary'
                    : 'border-border-subtle text-on-surface-variant'
                }`}
              >
                {p === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
              </button>
            ))}
          </div>
          <input
            className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-3 py-2"
            placeholder="Account name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-3 py-2"
            placeholder="MSISDN e.g. 2567..."
            value={msisdn}
            onChange={(e) => setMsisdn(e.target.value)}
          />
          <Button fullWidth disabled={saving || !msisdn || !accountName} onClick={() => void saveMethod()}>
            Save method
          </Button>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-title">Payment history</h2>
          </div>
          <AsyncStateView
            status={history.status}
            error={history.error}
            onRetry={() => void history.reload()}
            emptyTitle="No payments yet"
          >
            <div className="space-y-2">
              {safeArray(history.data).map((tx) => {
                const id = String(tx._id ?? tx.id)
                const status = String(tx.status ?? '').toLowerCase()
                const type = String(tx.type ?? '').toLowerCase()
                const jobId = String(tx.jobId ?? '')
                const canRetry = type === 'debit' && status === 'failed' && Boolean(jobId)
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-canvas-white p-4"
                  >
                    <Link
                      to={`/customer/payments/receipt/${id}`}
                      className="min-w-0 flex-1 transition hover:opacity-80"
                    >
                      <p className="font-semibold capitalize">
                        {String(tx.type)} · {String(tx.status)}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">{String(tx.reference)}</p>
                    </Link>
                    <div className="flex flex-col items-end gap-1">
                      <p className="font-semibold">{formatUgx(Number(tx.amount ?? 0))}</p>
                      {canRetry ? (
                        <Link
                          to={`/customer/payments/pay/${jobId}`}
                          className="text-caps font-semibold text-primary"
                        >
                          Retry
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </AsyncStateView>
        </div>
      </section>
    </div>
  )
}
