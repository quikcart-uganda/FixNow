import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Icon } from '@fixnow/ui'
import { getFriendlyErrorMessage, technicianApi } from '@fixnow/api'
import { ProfilePhotoPicker } from '@fixnow/shared'
import { ReputationLadder, TrustScoreHero } from '@technician/components/trust/Trust'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'

export function ProfilePage() {
  const { profile, refreshProfile } = useApp()
  const tier = usePlanWorkspaceTier()
  const [photoError, setPhotoError] = useState<string | null>(null)

  return (
    <PlanWorkspaceShell page="profile">
      <Card
        className={cn(
          'overflow-hidden',
          tier === 'professional' && 'fn-premium-surface border-primary/20',
          tier === 'business' && 'fn-executive-surface',
        )}
      >
        <div
          className={cn(
            'h-28',
            tier === 'business' ? 'bg-gradient-to-br from-teal-900 via-teal-700 to-teal-600' : 'trust-gradient',
            tier === 'professional' && 'fn-hero-shine relative overflow-hidden',
          )}
        />
        <div className="-mt-12 px-5 pb-5">
          <ProfilePhotoPicker
            role="technician"
            name={profile.name}
            photoUrl={profile.photo}
            sizeClassName={cn(
              'h-24 w-24 rounded-full border-4 border-surface object-cover',
              tier === 'business' && 'ring-2 ring-teal-700/40',
              tier === 'professional' && 'ring-2 ring-primary/30',
            )}
            onUploaded={async (url) => {
              setPhotoError(null)
              try {
                await technicianApi.updateProfile({ photoUrl: url })
                await refreshProfile()
              } catch (err) {
                setPhotoError(getFriendlyErrorMessage(err))
                throw err
              }
            }}
          />
          {photoError ? <p className="mt-2 text-sm text-error">{photoError}</p> : null}
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-headline">{profile.name}</h2>
              <p className="text-label text-on-surface-variant">
                {profile.category} · {profile.parish}, {profile.district}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="primary" icon="workspace_premium">
                  {profile.level}
                </Badge>
                <Badge tone="success" icon="verified">
                  ID Verified
                </Badge>
                <Badge tone="secondary">★ {profile.rating}</Badge>
                {tier === 'business' ? (
                  <Badge tone="secondary" icon="apartment">
                    Company
                  </Badge>
                ) : null}
                {tier === 'professional' ? (
                  <Badge tone="primary" icon="verified">
                    Verified
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/technician/upgrade">
                <Button className="fn-pressable">
                  <Icon name="upgrade" />
                  Upgrade Plan
                </Button>
              </Link>
              <Link to="/technician/settings">
                <Button variant="outline" className="fn-pressable">
                  <Icon name="edit" />
                  Edit profile
                </Button>
              </Link>
            </div>
          </div>
          <p className="mt-4 text-body text-on-surface-variant">{profile.bio}</p>
          {tier === 'professional' || tier === 'business' ? (
            <p className="mt-3 rounded-xl bg-surface-container-low px-3 py-2 text-label text-on-surface-variant">
              {tier === 'business'
                ? 'Brand tip: keep company logo, mission, and portfolio case studies aligned for customer trust.'
                : 'Presentation tip: refresh portfolio photos weekly — Professional visibility converts with proof.'}
            </p>
          ) : null}
        </div>
      </Card>

      <TrustScoreHero
        trust={profile.trust}
        level={profile.level}
        blurb={`${profile.points.toLocaleString()} reputation points · ${profile.reviewCount} reviews`}
      />

      <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
        <ReputationLadder current={profile.level} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={cn('p-5', tier === 'professional' && 'fn-premium-surface')}>
          <h2 className="text-title">Services</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.subcategories.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <p className="mt-3 text-label text-on-surface-variant">
            Skills: {profile.skills.join(' · ')}
          </p>
          <Link to="/technician/services" className="mt-4 inline-flex text-label font-semibold text-primary">
            Edit services →
          </Link>
        </Card>
        <Card className={cn('p-5', tier === 'professional' && 'fn-premium-surface')}>
          <h2 className="text-title">Availability</h2>
          <p className="mt-2 text-body">{profile.availability}</p>
          <p className="text-label text-on-surface-variant">{profile.workingHours}</p>
          <Link to="/technician/availability" className="mt-4 inline-flex text-label font-semibold text-primary">
            Manage hours →
          </Link>
        </Card>
        <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
          <h2 className="text-title">Coverage areas</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.serviceAreas.map((a) => (
              <Badge key={a} tone="secondary">
                {a}
              </Badge>
            ))}
          </div>
          <Link to="/technician/service-areas" className="mt-4 inline-flex text-label font-semibold text-primary">
            Edit coverage →
          </Link>
        </Card>
        <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
          <h2 className="text-title">Payment</h2>
          <p className="mt-2 text-body">{profile.mobileMoneyName}</p>
          <p className="text-label text-on-surface-variant">{profile.mobileMoney} · MTN MoMo</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['/technician/upgrade', 'upgrade', 'Upgrade'],
          ['/technician/portfolio', 'photo_library', 'Portfolio'],
          ['/technician/reviews', 'star', 'Reviews'],
          ['/technician/achievements', 'emoji_events', 'Badges'],
          ['/technician/referrals', 'share', 'Refer'],
        ].map(([to, icon, label]) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-surface p-4 text-center hover:bg-trust-blue-subtle fn-pressable',
              tier === 'business' && 'hover:border-teal-700/30',
              tier === 'professional' && 'hover:border-primary/30',
            )}
          >
            <Icon name={icon} className="text-primary" />
            <span className="text-label font-semibold">{label}</span>
          </Link>
        ))}
      </div>
    </PlanWorkspaceShell>
  )
}
