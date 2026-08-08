import { useState } from 'react'
import { reviewsApi, getFriendlyErrorMessage } from '@fixnow/api'
import { Button, Card } from '@fixnow/ui'

export function ReviewForm({
  jobId,
  onDone,
  title = 'Leave a review',
}: {
  jobId: string
  onDone?: () => void
  title?: string
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [cats, setCats] = useState({
    quality: 5,
    professionalism: 5,
    communication: 5,
    timeliness: 5,
    valueForMoney: 5,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-title">{title}</h2>
      <label className="block text-sm">
        Overall ({rating})
        <input
          type="range"
          min={1}
          max={5}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      {(Object.keys(cats) as Array<keyof typeof cats>).map((key) => (
        <label key={key} className="block text-sm capitalize">
          {key.replace(/([A-Z])/g, ' $1')} ({cats[key]})
          <input
            type="range"
            min={1}
            max={5}
            value={cats[key]}
            onChange={(e) => setCats((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
            className="mt-1 w-full"
          />
        </label>
      ))}
      <textarea
        className="min-h-24 w-full rounded-lg border border-border-subtle px-3 py-2"
        placeholder="Optional comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <Button
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setError(null)
            try {
              await reviewsApi.create({
                jobId,
                rating,
                comment: comment.trim() || undefined,
                categories: cats,
              })
              onDone?.()
            } catch (err) {
              setError(getFriendlyErrorMessage(err))
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy ? 'Submitting…' : 'Submit review'}
      </Button>
    </Card>
  )
}
