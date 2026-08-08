import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { categoriesApi, getFriendlyErrorMessage, jobsApi, mapCategory } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError, useOptionalAppDownloadReminder, useOptionalLocationPermission } from '@fixnow/shared'
import type { CustomerCategory } from '@customer/data'
import { safeArray } from '@fixnow/utils'

function jobIdFromResponse(job: Record<string, unknown>): string {
  return String(job._id ?? job.id ?? '')
}

export function PostJobPage() {
  const navigate = useNavigate()
  const locationPermission = useOptionalLocationPermission()
  const appDownload = useOptionalAppDownloadReminder()
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const errorId = useId()
  const categoryGroupId = useId()

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory) as CustomerCategory[]
  }, [], { isEmpty: (items) => items.length === 0 })

  const categories = safeArray<CustomerCategory>(categoriesQuery.data)
  const selectedCategory = category || categories[0]?.id || ''

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link
          to="/customer/home"
          className="tap-target rounded-full p-2 hover:bg-surface-container-low"
          aria-label="Close and go home"
        >
          <Icon name="close" />
        </Link>
        <h1 className="text-title-md">Post a Job</h1>
      </header>

      <AsyncStateView
        status={categoriesQuery.status}
        error={categoriesQuery.error}
        onRetry={() => void categoriesQuery.reload()}
        emptyTitle="No categories available"
        emptyHint="You need at least one service category before posting a job."
        loadingLabel="Loading categories…"
      >
        <form
          className="space-y-6 p-4"
          aria-describedby={submitError ? errorId : undefined}
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitError(null)
            setSubmitting(true)
            try {
              let parish = 'Nakawa'
              let district = 'Kampala'
              let latitude: number | undefined
              let longitude: number | undefined
              try {
                if (locationPermission) {
                  const ensured = await locationPermission.ensureLocation('post_job')
                  if (ensured.coords) {
                    latitude = ensured.coords.latitude
                    longitude = ensured.coords.longitude
                  }
                } else {
                  const { getCurrentPosition } = await import('@fixnow/native')
                  const coords = await getCurrentPosition(6_000, {
                    requestPermission: false,
                    role: 'customer',
                  })
                  if (coords) {
                    latitude = coords.latitude
                    longitude = coords.longitude
                  }
                }
              } catch {
                /* GPS optional — fall back to default parish */
              }
              const res = await jobsApi.create({
                title: title.trim(),
                description: details.trim(),
                categoryId: selectedCategory || undefined,
                publish: true,
                parish,
                district,
                location: {
                  parish,
                  district,
                  ...(typeof latitude === 'number' && typeof longitude === 'number'
                    ? {
                        geo: { type: 'Point', coordinates: [longitude, latitude] },
                        coordinates: { type: 'Point', coordinates: [longitude, latitude] },
                      }
                    : {}),
                },
              })
              const jobId = jobIdFromResponse(res.data.job)
              if (!jobId) throw new Error('Job was created but no id was returned.')
              appDownload?.signalEngagement('post_job')
              navigate(`/customer/tracking/${jobId}`)
            } catch (err) {
              setSubmitError(getFriendlyErrorMessage(err))
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <fieldset>
            <legend id={categoryGroupId} className="mb-2 block text-label-caps uppercase text-on-surface-variant">
              Category
            </legend>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-labelledby={categoryGroupId}
            >
              {categories.map((cat) => {
                const selected = selectedCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCategory(cat.id)}
                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-3 text-left text-body-sm transition ${
                      selected
                        ? 'border-primary bg-primary-fixed text-primary'
                        : 'border-border-subtle bg-canvas-white text-on-surface'
                    }`}
                  >
                    <Icon name={cat.icon} className="text-[20px]" />
                    <span className="font-semibold">{cat.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label className="mb-2 block text-label-caps uppercase text-on-surface-variant" htmlFor="job-title">
              Job title
            </label>
            <input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Full house wiring inspection"
              className="h-12 min-h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              required
              minLength={3}
              aria-required="true"
            />
          </div>

          <div>
            <label className="mb-2 block text-label-caps uppercase text-on-surface-variant" htmlFor="job-details">
              Describe the issue
            </label>
            <textarea
              id="job-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Share location details, urgency, and what you need fixed..."
              className="w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              required
              minLength={10}
              aria-required="true"
            />
          </div>

          {submitError ? <FormError id={errorId}>{submitError}</FormError> : null}

          <button
            type="submit"
            disabled={submitting || categories.length === 0}
            aria-busy={submitting}
            className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-on-primary disabled:opacity-60"
          >
            {submitting ? 'Posting…' : 'Post Job'}
            <Icon name="send" className="text-[20px]" />
          </button>
        </form>
      </AsyncStateView>
    </div>
  )
}
