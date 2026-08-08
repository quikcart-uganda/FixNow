import { useState } from 'react'
import { Button, Icon } from '@fixnow/ui'
import { getFriendlyErrorMessage, jobsApi } from '@fixnow/api'

type Props = {
  jobId: string
  jobTitle: string
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}

/**
 * Technician "Mark Work Complete" dialog.
 * Submits to /jobs/:id/request-completion → awaiting_confirmation (NOT completed).
 */
export function MarkWorkCompleteDialog({ jobId, jobTitle, open, onClose, onSubmitted }: Props) {
  const [notes, setNotes] = useState('')
  const [materialsUsed, setMaterialsUsed] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async () => {
    if (!confirmed) {
      setError('Confirm that the work is complete before submitting.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const photoUrls = photoUrl.trim() ? [photoUrl.trim()] : undefined
      await jobsApi.requestCompletion(jobId, {
        notes: notes.trim() || undefined,
        materialsUsed: materialsUsed.trim() || undefined,
        photoUrls,
        completedAtEstimate: new Date().toISOString(),
        confirmedByTechnician: true,
      })
      onSubmitted()
      onClose()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-3xl bg-canvas-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-caps text-primary">Completion request</p>
            <h2 className="text-title">Mark work complete</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Submit for customer confirmation on “{jobTitle}”. The job is not completed until the customer confirms.
            </p>
          </div>
          <button type="button" className="rounded-full p-2 hover:bg-surface-container-low" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <label className="mb-3 block text-label">
          Completion notes
          <textarea
            className="mt-1 w-full rounded-xl border border-border-subtle bg-surface p-3 text-body"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you finish? Any follow-up tips for the customer?"
          />
        </label>

        <label className="mb-3 block text-label">
          Materials used (optional)
          <input
            className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-body"
            value={materialsUsed}
            onChange={(e) => setMaterialsUsed(e.target.value)}
            placeholder="e.g. PVC elbow, sealant"
          />
        </label>

        <label className="mb-3 block text-label">
          Completion photo URL (optional)
          <input
            className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-body"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label className="mb-4 flex items-start gap-2 text-label">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I confirm the work on this job is complete and ready for the customer to review.</span>
        </label>

        {error ? <p className="mb-3 text-label text-error">{error}</p> : null}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => void submit()}
            disabled={!confirmed}
            busy={busy}
            busyLabel="Submitting…"
          >
            Submit for confirmation
          </Button>
        </div>
      </div>
    </div>
  )
}
