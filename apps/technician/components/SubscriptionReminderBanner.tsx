import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import { subscriptionsApi } from '@fixnow/api'
import { useApp } from '@technician/context/AppContext'

const DISMISS_KEY = 'fn_sub_reminder_dismissed_at'

/**
 * Throttled upgrade / expiry reminders (server decides which triggers fire;
 * client enforces dismiss duration from admin reminder settings).
 */
export function SubscriptionReminderBanner() {
  const { isLocked, remainingFreeJobs, profile } = useApp()
  const query = useAsync(async () => {
    const [remindersRes, mineRes] = await Promise.all([
      subscriptionsApi.reminders(),
      subscriptionsApi.getMine(),
    ])
    return { reminders: remindersRes.data.reminders, mine: mineRes.data }
  }, [profile.subscriptionStatus, remainingFreeJobs, isLocked])

  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
  const dismissHours = Number(
    (query.data?.mine.reminders as { dismissDurationHours?: number } | undefined)
      ?.dismissDurationHours ?? 72,
  )
  const dismissedRecently =
    dismissedAt > 0 && Date.now() - dismissedAt < dismissHours * 60 * 60 * 1000

  const reminder = query.data?.reminders?.[0]
  if (!reminder || dismissedRecently) return null

  return (
    <Card className="flex flex-col gap-3 border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon name="notifications_active" className="text-warning" />
        <div>
          <p className="text-title">{reminder.title}</p>
          <p className="text-label text-on-surface-variant">{reminder.body}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          className="min-h-10"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()))
            void query.reload()
          }}
        >
          Later
        </Button>
        <Link to="/technician/upgrade">
          <Button className="min-h-10">View Starter</Button>
        </Link>
      </div>
    </Card>
  )
}
