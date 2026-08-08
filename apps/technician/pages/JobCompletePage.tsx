import { Link, useParams } from 'react-router-dom'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { jobsApi, mapAssignedJob } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'

export function JobCompletePage() {
  const { id = '' } = useParams()

  const jobQuery = useAsync(async () => {
    const res = await jobsApi.getById(id)
    return mapAssignedJob(res.data.job, res.data.customer as Record<string, unknown> | undefined)
  }, [id])

  const job = jobQuery.data

  return (
    <AsyncStateView status={jobQuery.status} error={jobQuery.error} onRetry={() => void jobQuery.reload()} loadingLabel="Loading…">
      <div className="mx-auto max-w-lg space-y-6 py-8 text-center animate-fade-up">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-tertiary-fixed text-tertiary">
          <Icon name="hourglass_top" className="text-5xl" filled />
        </div>
        <div>
          <h1 className="text-headline">Waiting for customer confirmation</h1>
          <p className="mt-2 text-body text-on-surface-variant">
            You requested completion for {job?.title ?? 'this job'}. The job is <strong>not</strong> completed
            until the customer confirms. Free completed-job quota is only deducted after confirmation.
          </p>
        </div>

        <Card className="space-y-3 p-5 text-left">
          <p className="text-label font-semibold text-on-surface">What happens next</p>
          <ul className="space-y-2 text-body-sm text-on-surface-variant">
            <li className="flex gap-2">
              <Icon name="notifications" className="text-primary" />
              Customer is notified to confirm or report an issue
            </li>
            <li className="flex gap-2">
              <Icon name="lock" className="text-primary" />
              Completion request is locked — you cannot edit it
            </li>
            <li className="flex gap-2">
              <Icon name="replay" className="text-primary" />
              If they report an issue, the job returns to In Progress
            </li>
          </ul>
        </Card>

        <div className="grid gap-3">
          <Link to="/technician/active">
            <Button fullWidth>Back to active jobs</Button>
          </Link>
          <Link to={`/technician/active/${id}`}>
            <Button fullWidth variant="outline">
              View job details
            </Button>
          </Link>
        </div>
      </div>
    </AsyncStateView>
  )
}
