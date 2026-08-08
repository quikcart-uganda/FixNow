import { Card } from '@fixnow/ui'
import { LocationSettingsCard } from '@fixnow/shared'

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Privacy</h1>
        <p className="text-body text-on-surface-variant">Control what customers see before and after assignment</p>
      </div>

      <LocationSettingsCard role="technician" />

      <Card className="space-y-4 p-5">
        {[
          ['Show online status', true],
          ['Share live location on En Route', true],
          ['Show exact service areas', true],
          ['Allow community profile mentions', false],
        ].map(([label, on]) => (
          <div key={label as string} className="flex items-center justify-between gap-3">
            <span className="text-label font-semibold">{label as string}</span>
            <span
              className={`rounded-full px-3 py-1 text-caps ${on ? 'bg-tertiary-fixed text-tertiary' : 'bg-surface-container text-outline'}`}
            >
              {on ? 'On' : 'Off'}
            </span>
          </div>
        ))}
        <p className="text-xs text-on-surface-variant">
          Live location is shared only while a job is En Route or In Progress, and stops when you go offline or complete the job.
        </p>
      </Card>
    </div>
  )
}
