import { Link } from 'react-router-dom'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'

export function LockedPage() {
  const { profile, isLocked } = useApp()

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-2 py-10 text-center animate-fade-up">
      <div className="relative mb-10 flex flex-col items-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-trust-blue-subtle text-primary animate-pulse md:h-40 md:w-40">
          <Icon name="lock_person" className="scale-[2.5] md:scale-[3.2]" />
        </div>
        <div className="absolute -bottom-4 flex items-center gap-1 rounded-full bg-warning px-4 py-2 text-label font-bold text-white shadow-float">
          <Icon name="warning" className="text-[18px]" />
          Free limit reached ({profile.freeJobsUsed}/{profile.freeJobLimit})
        </div>
      </div>

      <h1 className="text-display-mobile md:text-display-lg text-on-surface">
        Free completed jobs exhausted
      </h1>
      <p className="mt-4 max-w-xl text-body-lg text-on-surface-variant">
        Customer-confirmed completions: <strong className="text-on-surface">{profile.jobsCompleted}</strong> · Free
        limit: <strong className="text-on-surface">{profile.freeJobLimit}</strong>
        <br />
        Upgrade your plan to continue applying for jobs. You can still browse jobs, view history, and manage your
        account.
      </p>

      <Card className="mt-8 w-full max-w-md p-4 text-left">
        <div className="mb-2 flex justify-between text-label">
          <span className="text-on-surface-variant">Free completed-job capacity</span>
          <span className="font-bold text-warning">Exhausted</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-surface-container">
          <div className="progress-limit h-full w-full" />
        </div>
        <p className="mt-3 flex items-center gap-2 text-tertiary">
          <Icon name="verified" filled />
          <span className="text-caps">Still allowed: browse · search · notifications · profile · chat on existing jobs</span>
        </p>
        <p className="mt-2 text-caps text-outline">Paused: apply · accept invitations · start new work</p>
      </Card>

      <div className="mt-10 flex w-full max-w-md flex-col gap-3 md:flex-row">
        <Link to="/technician/upgrade" className="flex-1">
          <Button fullWidth className="min-h-11">
            View Starter plan
          </Button>
        </Link>
        <Link to="/technician/jobs" className="flex-1">
          <Button fullWidth variant="outline" className="min-h-11">
            View jobs
          </Button>
        </Link>
      </div>

      <div className="mt-12">
        <div className="mb-3 flex justify-center -space-x-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-10 rounded-full border-2 border-surface bg-primary-fixed" />
          ))}
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-primary-fixed text-[12px] font-bold text-on-primary-fixed">
            500+
          </div>
        </div>
        <p className="text-label text-on-surface-variant">
          Join <span className="font-bold text-primary">500+ top technicians</span> in Kampala who already upgraded.
        </p>
      </div>
    </div>
  )
}
