import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { accountDeletionApi, getFriendlyErrorMessage } from '@fixnow/api'
import { useAsync, useAuth } from '@fixnow/hooks'
import { AsyncStateView, CmsDocumentView } from '@fixnow/shared'

export function DeleteAccountPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [phrase, setPhrase] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const policy = useAsync(async () => {
    const res = await accountDeletionApi.getPolicy()
    return res.data
  }, [])

  const status = useAsync(async () => {
    const res = await accountDeletionApi.getStatus()
    return res.data.request
  }, [])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await accountDeletionApi.request({ confirmPhrase: phrase, reason: reason || undefined })
      await status.reload()
      setPhrase('')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await accountDeletionApi.cancel()
      await status.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const request = status.data
  const confirmPhrase = policy.data?.confirmPhrase || 'DELETE MY ACCOUNT'

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to="/customer/profile" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-title-md">Delete account</h1>
      </header>

      <section className="space-y-5 p-4">
        <CmsDocumentView slug="delete-account" audience="customer" />

        <AsyncStateView status={policy.status} error={policy.error} onRetry={() => void policy.reload()}>
          {policy.data ? (
            <div className="space-y-3 rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <h2 className="font-semibold">Deletion summary</h2>
              <div>
                <p className="text-xs font-bold uppercase text-on-surface-variant">Deleted</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {policy.data.deleted.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-on-surface-variant">Retained</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {policy.data.retained.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-on-surface-variant">{policy.data.recoveryNote}</p>
              <p className="text-sm font-semibold text-error">{policy.data.irreversibleNote}</p>
              <p className="text-xs text-on-surface-variant">Cooling-off: {policy.data.coolingOffHours} hours</p>
            </div>
          ) : null}
        </AsyncStateView>

        {request ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold">Status: {request.status}</p>
            {request.coolingOffEndsAt ? (
              <p className="mt-1">Cooling-off ends {new Date(request.coolingOffEndsAt).toLocaleString()}</p>
            ) : null}
            {request.status === 'cooling_off' || request.status === 'pending' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="mt-3 rounded-full bg-white px-4 py-2 font-semibold"
              >
                Cancel deletion
              </button>
            ) : null}
            {request.status === 'completed' ? (
              <button
                type="button"
                className="mt-3 rounded-full bg-primary px-4 py-2 font-semibold text-white"
                onClick={() => {
                  void logout()
                  navigate('/customer/login', { replace: true })
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-canvas-white p-4">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Reason (optional)</span>
              <textarea
                className="rounded-xl border border-border-subtle px-3 py-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Type {confirmPhrase} to confirm</span>
              <input
                className="rounded-xl border border-border-subtle px-3 py-2 font-mono"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <button
              type="button"
              disabled={busy || phrase.trim().toUpperCase() !== confirmPhrase}
              onClick={() => void submit()}
              className="rounded-full bg-error px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              Request account deletion
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
