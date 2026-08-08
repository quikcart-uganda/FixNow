import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import {
  boostsApi,
  formatUgx,
  getFriendlyErrorMessage,
  type BoostProductDto,
} from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { PlanWorkspaceShell } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { safeArray } from '@fixnow/utils'

type Step = 'market' | 'checkout' | 'pending'

/**
 * Boost Marketplace — optional marketing products (not subscription plans).
 */
export function BoostMarketplacePage() {
  const { profile } = useApp()
  const [step, setStep] = useState<Step>('market')
  const [selected, setSelected] = useState<BoostProductDto | null>(null)
  const [network, setNetwork] = useState<'mtn' | 'airtel'>('mtn')
  const [payerMsisdn, setPayerMsisdn] = useState(profile.phone || '')
  const [transactionId, setTransactionId] = useState('')
  const [districts, setDistricts] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const query = useAsync(async () => (await boostsApi.listMine()).data, [])

  const networks = useMemo(() => {
    const payment = query.data?.payment as
      | { networks?: Array<{ code: 'mtn' | 'airtel'; label: string; phoneNumber: string; accountName: string; instructions: string }> }
      | undefined
    return safeArray(payment?.networks)
  }, [query.data])

  const selectedNetwork = networks.find((n) => n.code === network) || networks[0]

  async function purchase() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await boostsApi.submitPurchase({
        productId: selected.id,
        network,
        payerMsisdn,
        transactionId,
        districts: selected.allowTechnicianDistrictPick
          ? districts
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean)
          : undefined,
      })
      setPendingMessage(res.data?.message || 'Payment submitted for verification.')
      setStep('pending')
      await query.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <PlanWorkspaceShell page="boosts" className="mx-auto max-w-4xl">
          <div>
            <p className="text-label text-on-surface-variant">
              Temporary visibility products — not a subscription. Trust and customer ratings still rank first.
              Soft lift only (max combined weight {query.data.maxCombinedWeight}).
            </p>
            <p className="mt-1 text-label text-on-surface-variant">
              Your eligibility: <span className="font-semibold text-on-surface">{query.data.eligibilityPlan}</span>
            </p>
          </div>

          {safeArray(query.data.active).length ? (
            <Card className="space-y-3 p-5">
              <h2 className="text-title">Active boosts</h2>
              {safeArray(query.data.active).map((b) => (
                <div
                  key={String(b.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">{String(b.productName)}</p>
                    <p className="text-label text-on-surface-variant">
                      {b.daysRemaining != null ? `${b.daysRemaining} days left` : 'Active'}
                      {b.endsAt ? ` · ends ${new Date(String(b.endsAt)).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className="rounded-md bg-tertiary/15 px-2 py-1 text-caps text-tertiary">Live</span>
                </div>
              ))}
            </Card>
          ) : null}

          {step === 'pending' ? (
            <Card className="space-y-4 p-6 text-center">
              <Icon name="hourglass_top" className="mx-auto text-[40px] text-primary" />
              <h2 className="text-title">Awaiting verification</h2>
              <p className="text-body text-on-surface-variant">{pendingMessage}</p>
              <Button
                onClick={() => {
                  setStep('market')
                  setSelected(null)
                  setTransactionId('')
                }}
              >
                Back to marketplace
              </Button>
            </Card>
          ) : null}

          {step === 'checkout' && selected ? (
            <Card className="space-y-4 p-5">
              <button type="button" className="text-label text-primary" onClick={() => setStep('market')}>
                ← All boosts
              </button>
              <h2 className="text-title">Buy {selected.name}</h2>
              <p className="text-body text-on-surface-variant">{selected.description}</p>
              <p className="text-headline text-primary">
                {formatUgx(selected.price)}
                <span className="text-label font-normal text-on-surface-variant">
                  {' '}
                  · {selected.durationLabel}
                </span>
              </p>

              {selectedNetwork ? (
                <div className="rounded-xl bg-surface-container-low p-4 text-label">
                  <p className="font-semibold">{selectedNetwork.label}</p>
                  <p>
                    {selectedNetwork.accountName} · {selectedNetwork.phoneNumber}
                  </p>
                  <p className="mt-2 text-on-surface-variant">{selectedNetwork.instructions}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {networks.map((n) => (
                  <button
                    key={n.code}
                    type="button"
                    onClick={() => setNetwork(n.code)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      network === n.code ? 'bg-primary text-white' : 'bg-surface-container'
                    }`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>

              {selected.allowTechnicianDistrictPick ? (
                <label className="block space-y-1">
                  <span className="text-label text-on-surface-variant">Districts (comma-separated)</span>
                  <input
                    className="w-full rounded-xl border border-outline-variant px-3 py-3"
                    value={districts}
                    onChange={(e) => setDistricts(e.target.value)}
                    placeholder="Entebbe, Kampala"
                  />
                </label>
              ) : null}

              <label className="block space-y-1">
                <span className="text-label text-on-surface-variant">Payer phone</span>
                <input
                  className="w-full rounded-xl border border-outline-variant px-3 py-3"
                  value={payerMsisdn}
                  onChange={(e) => setPayerMsisdn(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-label text-on-surface-variant">Transaction ID</span>
                <input
                  className="w-full rounded-xl border border-outline-variant px-3 py-3"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </label>

              {error ? <FormError>{error}</FormError> : null}

              <Button className="min-h-11" disabled={submitting} onClick={() => void purchase()}>
                {submitting ? 'Submitting…' : 'Submit payment for verification'}
              </Button>
            </Card>
          ) : null}

          {step === 'market' ? (
            <>
              {!query.data.enabled ? (
                <Card className="p-5 text-body text-on-surface-variant">
                  Boost purchases are temporarily disabled by Admin.
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {safeArray(query.data.products).map((product) => (
                    <Card key={product.id} className="flex flex-col p-5">
                      <p className="text-caps text-primary">{product.type.replace(/_/g, ' ')}</p>
                      <h2 className="mt-1 text-title">{product.name}</h2>
                      <p className="mt-2 flex-1 text-label text-on-surface-variant">{product.description}</p>
                      <ul className="mt-3 space-y-1 text-label text-on-surface-variant">
                        {product.benefits.slice(0, 3).map((b) => (
                          <li key={b}>· {b}</li>
                        ))}
                      </ul>
                      <p className="mt-4 text-title text-primary">
                        {formatUgx(product.price)}
                        <span className="text-label font-normal text-on-surface-variant">
                          {' '}
                          · {product.durationLabel}
                        </span>
                      </p>
                      <p className="mt-1 text-label text-on-surface-variant">
                        Est. visibility lift ~{product.estimatedVisibilityLiftPercent}% · soft weight{' '}
                        {product.weight}
                      </p>
                      <Button
                        className="mt-4 min-h-11"
                        onClick={() => {
                          setSelected(product)
                          setStep('checkout')
                          setError(null)
                        }}
                      >
                        Purchase
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              {safeArray(query.data.history).length ? (
                <Card className="space-y-2 p-5">
                  <h2 className="text-title">History</h2>
                  {safeArray(query.data.history)
                    .slice(0, 8)
                    .map((h) => (
                      <div
                        key={String(h.id)}
                        className="flex justify-between gap-2 border-b border-outline-variant/60 py-2 text-label last:border-0"
                      >
                        <span>
                          {String(h.productName)} · {String(h.status)}
                        </span>
                        <span className="text-on-surface-variant">
                          {formatUgx(Number(h.amount || 0))}
                        </span>
                      </div>
                    ))}
                </Card>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Link to="/technician/upgrade" className="text-label text-primary">
              Manage subscription →
            </Link>
            <Link to="/technician/dashboard" className="text-label text-primary">
              Dashboard →
            </Link>
          </div>
        </PlanWorkspaceShell>
      ) : null}
    </AsyncStateView>
  )
}

export default BoostMarketplacePage
