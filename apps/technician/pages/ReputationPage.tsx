import { Badge } from '@fixnow/ui'
import { Card, StatCard } from '@fixnow/ui'
import { ProgressBar } from '@fixnow/ui'
import { ReputationLadder, TrustScoreHero } from '@technician/components/trust/Trust'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'

export function ReputationPage() {
  const { profile } = useApp()
  const tier = usePlanWorkspaceTier()

  return (
    <PlanWorkspaceShell page="reputation">
      <TrustScoreHero
        trust={profile.trust}
        level={profile.level}
        blurb={
          tier === 'business'
            ? 'Brand reputation blends reliability, completion, response, and punctuality for company quality control.'
            : 'Trust Score blends reliability, completion, response, and punctuality — not just star ratings.'
        }
      />

      <Card
        className={cn(
          'p-5',
          tier === 'professional' && 'fn-premium-surface',
          tier === 'business' && 'fn-executive-surface',
        )}
      >
        <ReputationLadder current={profile.level} />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-label">
            <span>Progress to sustain Master</span>
            <span>{profile.nextLevelProgress}%</span>
          </div>
          <ProgressBar value={profile.nextLevelProgress} barClassName="bg-warning" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Trust" value={profile.trust.trust} />
        <StatCard label="Reliability" value={profile.trust.reliability} />
        <StatCard label="Completion" value={profile.trust.completion} />
        <StatCard label="Punctuality" value={profile.trust.punctuality} />
      </div>

      <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
        <h2 className="text-title">{tier === 'business' ? 'Company badges' : 'Badges'}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.badges.map((b) => (
            <Badge key={b.id} tone={b.tone} icon={b.icon}>
              {b.label}
            </Badge>
          ))}
        </div>
        <p className="mt-4 text-label text-on-surface-variant">
          {tier === 'professional' || tier === 'business'
            ? 'Visibility and reputation reinforce each other — keep scores sharp to convert premium placement.'
            : 'Competitors show ratings. FixNow shows identity levels, skill verification, and community endorsements.'}
        </p>
      </Card>
    </PlanWorkspaceShell>
  )
}
