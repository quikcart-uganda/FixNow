import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Icon } from '@fixnow/ui'
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

  const policy = useAsync(async () => (await accountDeletionApi.getPolicy()).data, [])
  const status = useAsync(async () => (await accountDeletionApi.getStatus()).data.request, [])

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
    <div className="space-y-6 p-4 md:p-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <Link to="/technician/settings" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-headline">Delete account</h1>
      </div>

      <CmsDocumentView slug="delete-account" audience="technician" />

      <AsyncStateView status={policy.status} error={policy.error} onRetry={() => void policy.reload()}>
        {policy.data ? (
          <Card className="space-y-3 p-5">
            <p className="text-title">What happens</p>
            <ul className="list-disc space-y-1 pl-5 text-label text-on-surface-variant">
              {policy.data.deleted.map((item) => (
                <li key={`d-${item}`}>Deleted: {item}</li>
              ))}
              {policy.data.retained.map((item) => (
                <li key={`r-${item}`}>Retained: {item}</li>
              ))}
            </ul>
            <p className="text-label">{policy.data.recoveryNote}</p>
            <p className="text-label font-semibold text-error">{policy.data.irreversibleNote}</p>
          </Card>
        ) : null}
      </AsyncStateView>

      {request ? (
        <Card className="space-y-3 p-5">
          <p className="text-title">Status: {request.status}</p>
          {request.coolingOffEndsAt ? (
            <p className="text-label">Cooling-off ends {new Date(request.coolingOffEndsAt).toLocaleString()}</p>
          ) : null}
          {(request.status === 'cooling_off' || request.status === 'pending') && (
            <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-full bg-surface px-4 py-2 font-semibold">
              Cancel deletion
            </button>
          )}
          {request.status === 'completed' && (
            <button
              type="button"
              className="rounded-full bg-primary px-4 py-2 font-semibold text-white"
              onClick={() => {
                void logout()
                navigate('/technician/login', { replace: true })
              }}
            >
              Sign out
            </button>
          )}
        </Card>
      ) : (
        <Card className="space-y-3 p-5">
          <textarea
            className="w-full rounded-xl border border-border-subtle px-3 py-2"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <input
            className="w-full rounded-xl border border-border-subtle px-3 py-2 font-mono"
            placeholder={`Type ${confirmPhrase}`}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <button
            type="button"
            disabled={busy || phrase.trim().toUpperCase() !== confirmPhrase}
            onClick={() => void submit()}
            className="rounded-full bg-error px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Request account deletion
          </button>
        </Card>
      )}
    </div>
  )
}
