import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { GuaranteeChip } from '@technician/components/trust/Trust'

export function GuaranteePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <GuaranteeChip />
        <h1 className="mt-3 text-headline">FixNow Guarantee</h1>
        <p className="text-body text-on-surface-variant">
          Verified professionals · completion assurance · fair dispute resolution.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['verified_user', 'Verified professionals', 'ID, skills, and LC1-ready checks before high-trust badges.'],
          ['task_alt', 'Completion assurance', 'Jobs tracked to confirmation — incomplete work escalates to support.'],
          ['gavel', 'Dispute resolution', 'Structured mediation with photo evidence and visit verification logs.'],
        ].map(([icon, title, body]) => (
          <Card key={title} className="p-5">
            <Icon name={icon} className="text-primary" />
            <h2 className="mt-2 text-title">{title}</h2>
            <p className="mt-1 text-label text-on-surface-variant">{body}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-title">Customer safety (you enable)</h2>
        <ul className="mt-3 space-y-2 text-label text-on-surface-variant">
          <li className="flex gap-2"><Icon name="share_location" className="text-primary" /> Live arrival tracking</li>
          <li className="flex gap-2"><Icon name="pin" className="text-primary" /> Visit verification codes</li>
          <li className="flex gap-2"><Icon name="family_restroom" className="text-primary" /> Share visit with family</li>
          <li className="flex gap-2"><Icon name="sos" className="text-primary" /> Emergency support</li>
        </ul>
      </Card>
    </div>
  )
}
