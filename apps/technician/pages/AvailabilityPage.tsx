import { useEffect, useState } from 'react'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { getFriendlyErrorMessage, technicianApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, useOptionalLocationPermission } from '@fixnow/shared'
import { cn } from '@fixnow/utils'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_TO_API: Record<(typeof days)[number], string> = {
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
  Sun: 'sunday',
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function AvailabilityPage() {
  const locationPermission = useOptionalLocationPermission()
  const tier = usePlanWorkspaceTier()
  const [online, setOnline] = useState(true)
  const [active, setActive] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('19:00')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const profileQuery = useAsync(async () => {
    const res = await technicianApi.getProfile()
    return res.data
  }, [])

  useEffect(() => {
    const data = profileQuery.data
    if (!data) return
    const availability = asRecord(data.availability)
    const status = String(availability.status ?? '')
    setOnline(status === 'available' || Boolean(asRecord(data.profile).isAvailableNow))
    const hours = Array.isArray(data.workingHours) ? data.workingHours : []
    if (hours.length > 0) {
      const openDays = hours
        .filter((h) => !asRecord(h).isClosed)
        .map((h) => {
          const apiDay = String(asRecord(h).dayOfWeek ?? '')
          return days.find((d) => DAY_TO_API[d] === apiDay) ?? ''
        })
        .filter(Boolean)
      if (openDays.length) setActive(openDays)
      const first = asRecord(hours[0])
      if (first.openTime) setStartTime(String(first.openTime).slice(0, 5))
      if (first.closeTime) setEndTime(String(first.closeTime).slice(0, 5))
    }
  }, [profileQuery.data])

  const save = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      if (online && locationPermission) {
        const ensured = await locationPermission.ensureLocation('go_online')
        if (ensured.status !== 'granted') {
          setSaveMessage(
            'You are available using your service area. Enable location anytime to improve nearby matching.',
          )
        }
      }
      await technicianApi.updateAvailability({
        status: online ? 'available' : 'offline',
      })
      await technicianApi.setWorkingHours({
        hours: days.map((d) => ({
          dayOfWeek: DAY_TO_API[d],
          openTime: startTime,
          closeTime: endTime,
          isClosed: !active.includes(d),
        })),
      })
      setSaveMessage((prev) => prev ?? 'Availability saved')
      await profileQuery.reload()
    } catch (err) {
      setSaveMessage(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleOnline = () => {
    setOnline((v) => {
      const next = !v
      if (next && locationPermission) {
        void locationPermission.ensureLocation('go_online')
      }
      return next
    })
  }

  return (
    <PlanWorkspaceShell page="availability">
      <AsyncStateView
        status={profileQuery.status}
        error={profileQuery.error}
        onRetry={() => void profileQuery.reload()}
        loadingLabel="Loading availability…"
      >
        <Card
          className={cn(
            'flex items-center justify-between p-5',
            tier === 'professional' && 'fn-premium-surface',
            tier === 'business' && 'fn-executive-surface',
          )}
        >
          <div>
            <p className="text-title">Accepting jobs</p>
            <p className="text-label text-on-surface-variant">
              {tier === 'business'
                ? 'Company coverage posture — go offline to pause new demand'
                : 'Go offline to pause new alerts'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleOnline}
            className={cn(
              'relative h-8 w-14 rounded-full transition',
              online ? 'bg-primary' : 'bg-outline-variant',
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-6 w-6 rounded-full bg-white transition',
                online ? 'left-7' : 'left-1',
              )}
            />
          </button>
        </Card>

        <Card className="p-5">
          <h2 className="text-title">Working days</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {days.map((d) => {
              const on = active.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setActive((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                  className={cn(
                    'rounded-full px-4 py-2 text-label font-semibold',
                    on ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant',
                  )}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-label">
              Start
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle px-3 py-2"
              />
            </label>
            <label className="text-label">
              End
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle px-3 py-2"
              />
            </label>
          </div>
        </Card>

        {saveMessage ? <p className="text-label text-on-surface-variant">{saveMessage}</p> : null}

        <Button fullWidth disabled={saving} onClick={() => void save()} className="fn-pressable">
          <Icon name="save" />
          {saving ? 'Saving…' : 'Save availability'}
        </Button>
      </AsyncStateView>
    </PlanWorkspaceShell>
  )
}
