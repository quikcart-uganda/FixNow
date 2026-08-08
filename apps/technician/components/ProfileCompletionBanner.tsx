import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { technicianApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'

const DISMISS_KEY = 'fixnow.tech.profileReminderDismissedAt'

function readLocalDismiss(): number {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** Temporary dismiss — banner returns after reminderFrequencyDays (default 3). */
export function ProfileCompletionBanner() {
  const [hidden, setHidden] = useState(true)

  const query = useAsync(async () => {
    const res = await technicianApi.getProfileCompletion()
    return res.data
  }, [], { cacheKey: 'technician.profileCompletion.v1', cacheFreshMs: 60_000 })

  useEffect(() => {
    if (!query.data?.belowThreshold) {
      setHidden(true)
      return
    }
    const dismissedAt = readLocalDismiss()
    const days = Math.max(1, query.data.reminderFrequencyDays || 3)
    const coolMs = days * 24 * 60 * 60 * 1000
    setHidden(dismissedAt > 0 && Date.now() - dismissedAt < coolMs)
  }, [query.data?.belowThreshold, query.data?.percent, query.data?.reminderFrequencyDays])

  if (hidden || !query.data?.belowThreshold) return null

  const { percent, nextActions } = query.data
  const tip = nextActions[0]

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    void technicianApi.dismissProfileReminder().catch(() => undefined)
    setHidden(true)
  }

  return (
    <Card className="border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <Icon name="edit" className="mt-0.5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold text-on-surface">
            Your profile is only {percent}% complete.
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {tip?.hint ||
              'Technicians with complete profiles get more customer interest and win more jobs.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={tip?.href || '/technician/profile-setup'}>
              <Button type="button" size="sm">
                {tip ? `Add ${tip.label.toLowerCase()}` : 'Complete profile'}
              </Button>
            </Link>
            <Link to="/technician/profile-setup">
              <Button type="button" size="sm" variant="outline">
                View setup
              </Button>
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="px-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
            >
              Dismiss for now
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
