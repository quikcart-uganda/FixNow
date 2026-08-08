import { Link } from 'react-router-dom'
import { assetUrl, cloudinaryPresetUrl, isCloudinaryDeliveryUrl } from '@fixnow/assets'
import { Icon } from '@fixnow/ui'
import type { ReputationLevel, TrustScores } from '@fixnow/types'
import { cn } from '@fixnow/utils'

export function ScoreRing({
  score,
  size = 96,
  label,
}: {
  score: number
  size?: number
  label?: string
}) {
  const r = 40
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-white/20" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-mtn-yellow"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Icon name="workspace_premium" className="text-3xl text-mtn-yellow" filled />
        {label ? <span className="mt-1 text-caps text-white">{label}</span> : null}
      </div>
    </div>
  )
}

export function TrustScoreHero({
  trust,
  level,
  blurb,
  to = '/technician/reputation',
}: {
  trust: TrustScores
  level: ReputationLevel
  blurb: string
  to?: string
}) {
  const photo = assetUrl('campaigns.verification')
  const photoSrc = isCloudinaryDeliveryUrl(photo)
    ? cloudinaryPresetUrl(photo, 'banner') || photo
    : photo
  return (
    <Link
      to={to}
      aria-label="Open reputation and trust details"
      className="trust-gradient relative block overflow-hidden rounded-3xl p-6 text-white shadow-float transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:p-8"
    >
      <img
        src={photoSrc}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-primary-container/30 blur-2xl" />
      <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <span className="text-caps text-primary-fixed/80">Current Standing</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-trust">{trust.trust}</span>
            <span className="text-title opacity-90">Trust Score</span>
          </div>
          <p className="mt-4 max-w-xs text-body text-on-primary-container">{blurb}</p>
          <p className="mt-3 text-caps text-white/80">Tap for trust breakdown →</p>
        </div>
        <div className="glass-effect flex flex-col items-center rounded-2xl border border-white/20 p-5">
          <ScoreRing score={trust.trust} label={`${level.toUpperCase()} PRO`} />
        </div>
      </div>
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Reliability', trust.reliability],
          ['Completion', trust.completion],
          ['Response', trust.response],
          ['Punctuality', trust.punctuality],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-caps text-white/70">{label as string}</p>
            <p className="text-title tabular-nums">{value as number}</p>
          </div>
        ))}
      </div>
    </Link>
  )
}

export function ReputationLadder({
  current,
  to = '/technician/reputation',
}: {
  current: ReputationLevel
  to?: string
}) {
  const levels: ReputationLevel[] = [
    'New Professional',
    'Active',
    'Trusted',
    'Preferred',
    'Top Performer',
    'Elite Partner',
  ]
  const legacyAlias: Record<string, ReputationLevel> = {
    Beginner: 'New Professional',
    Rising: 'Active',
    Expert: 'Preferred',
    Elite: 'Top Performer',
    Master: 'Elite Partner',
  }
  const normalized = (legacyAlias[current] || current) as ReputationLevel
  const idx = levels.indexOf(normalized)

  return (
    <Link
      to={to}
      aria-label="Open reputation engine"
      className="block space-y-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-title">Reputation Engine</h3>
        <span className="text-caps text-primary">{normalized} Technician</span>
      </div>
      <div className="flex gap-1">
        {levels.map((level, i) => (
          <div key={level} className="flex-1 space-y-1">
            <div
              className={cn(
                'h-2 rounded-full',
                i <= idx ? 'bg-primary' : 'bg-surface-container',
                i === idx && 'bg-warning',
              )}
            />
            <p className={cn('truncate text-[10px] font-semibold', i <= idx ? 'text-primary' : 'text-outline')}>
              {level}
            </p>
          </div>
        ))}
      </div>
      <p className="text-caps text-on-surface-variant">View full reputation history →</p>
    </Link>
  )
}

export function GuaranteeChip() {
  return (
    <Link
      to="/technician/guarantee"
      aria-label="Open FixNow Guarantee"
      className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-trust-blue-subtle px-3 py-1.5 text-label text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon name="verified_user" className="text-[18px]" filled />
      FixNow Guarantee
    </Link>
  )
}
