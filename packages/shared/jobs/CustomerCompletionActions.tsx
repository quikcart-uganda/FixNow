import { useState } from 'react'
import { Button, Icon } from '@fixnow/ui'
import { getFriendlyErrorMessage, jobsApi } from '@fixnow/api'

const ISSUE_CATEGORIES = [
  { id: 'incomplete_work', label: 'Work incomplete' },
  { id: 'quality_issue', label: 'Quality issue' },
  { id: 'wrong_work', label: 'Wrong work done' },
  { id: 'parts_missing', label: 'Parts / materials missing' },
  { id: 'technician_no_show', label: 'Technician left early / no-show' },
  { id: 'other', label: 'Other' },
] as const

type Props = {
  jobId: string
  jobTitle: string
  open: boolean
  onClose: () => void
  onChanged: () => void
}

/**
 * Customer confirmation surface for awaiting_confirmation jobs.
 */
export function CustomerCompletionActions({ jobId, jobTitle, open, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<'choose' | 'issue'>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<string>('incomplete_work')
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')

  if (!open) return null

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await jobsApi.confirmCompletion(jobId)
      onChanged()
      onClose()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const report = async () => {
    if (description.trim().length < 8) {
      setError('Please describe the issue (at least 8 characters).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await jobsApi.reportCompletionIssue(jobId, {
        category,
        description: description.trim(),
        comments: comments.trim() || undefined,
        photoUrls: photoUrl.trim() ? [photoUrl.trim()] : undefined,
      })
      onChanged()
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
            <p className="text-caps text-primary">Completion</p>
            <h2 className="text-title">
              {mode === 'choose' ? 'Did the technician finish satisfactorily?' : 'Report an issue'}
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {mode === 'choose'
                ? `Your technician marked “${jobTitle}” as complete. Confirm only if you are satisfied.`
                : 'The job will return to In Progress. It will not count as a completed free job.'}
            </p>
          </div>
          <button type="button" className="rounded-full p-2 hover:bg-surface-container-low" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        {mode === 'choose' ? (
          <div className="space-y-3">
            {error ? <p className="text-label text-error">{error}</p> : null}
            <Button fullWidth disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Confirming…' : 'Confirm Completion'}
            </Button>
            <Button fullWidth variant="outline" disabled={busy} onClick={() => setMode('issue')}>
              Report an Issue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-label">
              Issue category
              <select
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-body"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-label">
              Description
              <textarea
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface p-3 text-body"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What still needs to be fixed?"
              />
            </label>
            <label className="block text-label">
              Comments (optional)
              <input
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-body"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </label>
            <label className="block text-label">
              Photo URL (optional)
              <input
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-body"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
            {error ? <p className="text-label text-error">{error}</p> : null}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('choose')} disabled={busy}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => void report()} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit issue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
