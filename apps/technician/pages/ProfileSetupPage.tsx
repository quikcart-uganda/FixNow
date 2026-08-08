import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Field, Icon, ProgressBar, Select, TextArea } from '@fixnow/ui'
import { getFriendlyErrorMessage, technicianApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, ProfilePhotoPicker } from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'

const LANGUAGE_OPTIONS = ['English', 'Luganda', 'Swahili', 'Runyankole', 'Luo', 'Ateso', 'Lugbara'] as const

type CompletionPayload = Awaited<ReturnType<typeof technicianApi.getProfileCompletion>>['data']

export function ProfileSetupPage() {
  const navigate = useNavigate()
  const { refreshProfile, profile } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [bio, setBio] = useState('')
  const [experienceYears, setExperienceYears] = useState('0')
  const [languages, setLanguages] = useState<string[]>(['English'])
  const [photoUrl, setPhotoUrl] = useState('')

  const completionQuery = useAsync(async () => {
    const res = await technicianApi.getProfileCompletion()
    return res.data
  }, [])

  useEffect(() => {
    setBio(profile.bio || '')
    setExperienceYears(String(profile.experienceYears || 0))
    setPhotoUrl(profile.photo || '')
  }, [profile.bio, profile.experienceYears, profile.photo])

  const completion = completionQuery.data as CompletionPayload | undefined
  const percent = completion?.percent ?? 0
  const benefits = completion?.benefits ?? [
    'Higher search ranking',
    'Greater customer trust',
    'Better application success',
    'Eligible for verification badges',
    'Eligible for premium jobs',
    'Improved profile visibility',
  ]

  const reload = async () => {
    await Promise.all([completionQuery.reload(), refreshProfile()])
  }

  const saveBasics = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await technicianApi.updateProfile({
        bio: bio.trim().slice(0, 250),
        experienceYears: Math.max(0, Number(experienceYears) || 0),
        languages: languages.filter(Boolean),
      })
      setMessage('Profile details saved.')
      await reload()
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]))
  }

  const goDashboard = () => navigate('/technician/dashboard', { replace: true })

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 animate-fade-up">
      <div>
        <p className="text-caps text-primary">Welcome to FixNow</p>
        <h1 className="mt-1 text-headline text-on-surface">Your account has been created successfully.</h1>
        <p className="mt-3 text-body text-on-surface-variant">
          Technicians with complete profiles are more likely to receive customer interest and win jobs.
          Complete your profile to increase your visibility, build trust, and improve your chances of being hired.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-caps text-outline">Profile completion</p>
            <p className="mt-1 text-display-mobile text-primary">{percent}%</p>
          </div>
          <Badge tone={percent >= 80 ? 'success' : 'secondary'}>
            {percent >= 100 ? 'Complete' : percent >= 80 ? 'Strong' : 'Keep going'}
          </Badge>
        </div>
        <div className="mt-3">
          <ProgressBar value={percent} max={100} />
        </div>
        <p className="mt-2 text-label text-on-surface-variant">
          Each section you finish raises this score. You can skip for now and finish later.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-title">Why complete your profile?</h2>
        <ul className="mt-3 space-y-2">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-body text-on-surface-variant">
              <Icon name="check_circle" className="mt-0.5 text-secondary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <AsyncStateView
        status={completionQuery.status}
        error={completionQuery.error}
        onRetry={() => void completionQuery.reload()}
      >
        <Card className="space-y-3 p-5">
          <h2 className="text-title">Sections</h2>
          {(completion?.sections ?? []).map((section) => (
            <div
              key={section.id}
              className={cn(
                'flex items-start justify-between gap-3 rounded-xl border px-3 py-3',
                section.complete ? 'border-secondary/30 bg-secondary-container/20' : 'border-border-subtle',
              )}
            >
              <div>
                <p className="text-label font-semibold text-on-surface">
                  {section.label}
                  <span className="ml-2 text-caps text-outline">{section.weight}%</span>
                </p>
                <p className="mt-1 text-sm text-on-surface-variant">{section.hint}</p>
              </div>
              {section.complete ? (
                <Badge tone="success">Done</Badge>
              ) : (
                <Link to={section.href} className="shrink-0 text-sm font-semibold text-primary">
                  Add →
                </Link>
              )}
            </div>
          ))}
        </Card>
      </AsyncStateView>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-title">Quick setup</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Optional now — takes about a minute. Certificates, portfolio, and payment stay on their own pages.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ProfilePhotoPicker
            role="technician"
            name={profile.name || 'Technician'}
            photoUrl={photoUrl}
            onUploaded={async (url) => {
              await technicianApi.updateProfile({ photoUrl: url })
              setPhotoUrl(url)
              await reload()
            }}
          />
          <div>
            <p className="text-sm font-semibold text-on-surface">Profile photo</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">Tap to take a photo or choose from gallery.</p>
          </div>
        </div>
        <Field label="Short professional bio" hint="Up to 250 characters">
          <TextArea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 250))}
            rows={4}
            placeholder="Describe your trade, typical jobs, and how you help customers."
          />
        </Field>
        <Field label="Years of experience">
          <Select value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={String(i)}>
                {i === 0 ? 'Prefer to add later' : `${i} year${i === 1 ? '' : 's'}`}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-label text-on-surface-variant">Languages</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((lang) => {
              const active = languages.includes(lang)
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-medium',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-subtle text-on-surface-variant',
                  )}
                >
                  {lang}
                </button>
              )
            })}
          </div>
        </div>
        {message ? <p className="text-sm text-on-surface-variant">{message}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={saving} onClick={() => void saveBasics()}>
            {saving ? 'Saving…' : 'Save progress'}
          </Button>
          <Link to="/technician/portfolio">
            <Button type="button" variant="outline">
              Add portfolio
            </Button>
          </Link>
          <Link to="/technician/service-areas">
            <Button type="button" variant="outline">
              Operating areas
            </Button>
          </Link>
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="flex-1" onClick={goDashboard}>
          Go to dashboard
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={goDashboard}>
          Skip for now
        </Button>
      </div>
      <p className="text-center text-sm text-on-surface-variant">
        You can reopen this anytime from Settings → Profile setup.
      </p>
    </div>
  )
}
