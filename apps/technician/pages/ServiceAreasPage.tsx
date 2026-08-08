import { useState } from 'react'
import { Badge } from '@fixnow/ui'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { getFriendlyErrorMessage, technicianApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { safeArray } from '@fixnow/utils'

const parishes = ['Nakasero', 'Kololo', 'Kamwokya', 'Ntinda', 'Makerere', 'Najjera', 'Kira']

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function coverageAreasFromResponse(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(data.items)) return data.items.map(asRecord)
  if (Array.isArray(data.coverageAreas)) return data.coverageAreas.map(asRecord)
  return []
}

export function ServiceAreasPage() {
  const { profile } = useApp()
  const [selectedParish, setSelectedParish] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const coverageQuery = useAsync(async () => {
    const res = await technicianApi.listCoverage()
    return coverageAreasFromResponse(res.data as Record<string, unknown>)
  }, [])

  const districts = Array.from(
    new Set([
      profile.district,
      ...safeArray(coverageQuery.data).map((a) => String(a.district ?? '')).filter(Boolean),
    ]),
  )

  const coveredParishes = new Set([
    ...profile.serviceAreas,
    ...safeArray(coverageQuery.data).map((a) => String(a.parish ?? '')).filter(Boolean),
  ])

  const saveCoverage = async () => {
    if (!selectedParish) {
      setMessage('Select a parish to add')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await technicianApi.addCoverage({
        district: profile.district || 'Kampala',
        parish: selectedParish,
        isPrimary: coveredParishes.size === 0,
      })
      setMessage(`Added ${selectedParish}`)
      setSelectedParish('')
      await coverageQuery.reload()
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Coverage areas</h1>
        <p className="text-body text-on-surface-variant">
          District + parish hyperlocal discovery — Uganda-first, not city-only.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-title">Districts</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {districts.map((d) => (
            <Badge key={d} tone="primary">
              {d}
            </Badge>
          ))}
        </div>
      </Card>

      <AsyncStateView
        status={coverageQuery.status}
        error={coverageQuery.error}
        onRetry={() => void coverageQuery.reload()}
        emptyTitle="No coverage areas yet"
        emptyHint="Add parishes below to start receiving nearby job alerts."
        loadingLabel="Loading coverage…"
      >
        <Card className="p-5">
          <h2 className="text-title">Saved parishes / villages</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {coveredParishes.size === 0 ? (
              <p className="text-label text-on-surface-variant">No parishes saved yet.</p>
            ) : (
              [...coveredParishes].map((p) => (
                <Badge key={p} tone="success">
                  {p}
                </Badge>
              ))
            )}
          </div>
        </Card>
      </AsyncStateView>

      <Card className="p-5">
        <h2 className="text-title">Add parish</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {parishes.map((p) => {
            const on = selectedParish === p
            return (
              <button key={p} type="button" onClick={() => setSelectedParish(p)}>
                <Badge tone={on ? 'success' : 'secondary'}>{p}</Badge>
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="bg-trust-blue-subtle/50 p-5">
        <p className="flex items-center gap-2 text-title text-primary">
          <Icon name="home_pin" />
          Neighbors Recommend
        </p>
        <p className="mt-2 text-label text-on-surface-variant">
          Jobs in your covered parishes boost “Popular in your area” and community endorsements.
        </p>
      </Card>

      {message ? <p className="text-label text-on-surface-variant">{message}</p> : null}

      <Button fullWidth disabled={saving} onClick={() => void saveCoverage()}>
        {saving ? 'Saving…' : 'Save coverage'}
      </Button>
    </div>
  )
}
