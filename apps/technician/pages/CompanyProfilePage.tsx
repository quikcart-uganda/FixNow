import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '@fixnow/ui'
import { FormError } from '@fixnow/shared'
import { getFriendlyErrorMessage, technicianApi } from '@fixnow/api'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'

/** Business / Professional company profile editor. */
export function CompanyProfilePage() {
  const { profile, refreshProfile } = useApp()
  const tier = usePlanWorkspaceTier()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    companyName: '',
    businessSlogan: '',
    businessLogoUrl: '',
    coverUrl: '',
    brandPrimaryColor: '#0F766E',
    brandSecondaryColor: '#111827',
    companyMission: '',
    companyVision: '',
    businessRegistrationNumber: '',
    taxIdentificationNumber: '',
    bio: '',
  })

  useEffect(() => {
    setForm({
      companyName: profile.companyName || '',
      businessSlogan: profile.businessSlogan || '',
      businessLogoUrl: profile.businessLogoUrl || '',
      coverUrl: '',
      brandPrimaryColor: profile.brandPrimaryColor || '#0F766E',
      brandSecondaryColor: profile.brandSecondaryColor || '#111827',
      companyMission: profile.companyMission || '',
      companyVision: profile.companyVision || '',
      businessRegistrationNumber: profile.businessRegistrationNumber || '',
      taxIdentificationNumber: profile.taxIdentificationNumber || '',
      bio: profile.bio || '',
    })
  }, [profile])

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await technicianApi.updateProfile({
        companyName: form.companyName,
        businessSlogan: form.businessSlogan,
        businessLogoUrl: form.businessLogoUrl,
        coverUrl: form.coverUrl || undefined,
        brandPrimaryColor: form.brandPrimaryColor,
        brandSecondaryColor: form.brandSecondaryColor,
        companyMission: form.companyMission,
        companyVision: form.companyVision,
        businessRegistrationNumber: form.businessRegistrationNumber,
        taxIdentificationNumber: form.taxIdentificationNumber,
        bio: form.bio,
      })
      await refreshProfile()
      setSaved(true)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PlanWorkspaceShell page="company" className="mx-auto max-w-2xl">
      <Card
        className={cn(
          'space-y-3 p-5',
          tier === 'professional' && 'fn-premium-surface',
          tier === 'business' && 'fn-executive-surface',
        )}
      >
        {(
          [
            ['companyName', 'Company name'],
            ['businessSlogan', 'Slogan'],
            ['businessLogoUrl', 'Logo URL'],
            ['coverUrl', 'Cover image URL'],
            ['brandPrimaryColor', 'Primary colour'],
            ['brandSecondaryColor', 'Secondary colour'],
            ['businessRegistrationNumber', 'Registration number'],
            ['taxIdentificationNumber', 'Tax ID (optional)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1">
            <span className="text-label text-on-surface-variant">{label}</span>
            <input
              className="w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="block space-y-1">
          <span className="text-label text-on-surface-variant">About / description</span>
          <textarea
            className="min-h-24 w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-label text-on-surface-variant">Mission</span>
          <textarea
            className="min-h-20 w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
            value={form.companyMission}
            onChange={(e) => setForm({ ...form, companyMission: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-label text-on-surface-variant">Vision</span>
          <textarea
            className="min-h-20 w-full rounded-xl border border-outline-variant px-3 py-3 text-label"
            value={form.companyVision}
            onChange={(e) => setForm({ ...form, companyVision: e.target.value })}
          />
        </label>

        {error ? <FormError>{error}</FormError> : null}
        {saved ? <p className="text-label text-tertiary">Company profile saved.</p> : null}

        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="text-label font-semibold">Business verification</p>
          <p className="mt-1 text-label text-on-surface-variant">
            Status:{' '}
            <span className="font-medium text-on-surface">
              {profile.businessVerificationStatus || 'unverified'}
            </span>
            {profile.businessVerificationNote
              ? ` · ${profile.businessVerificationNote}`
              : ''}
          </p>
          {profile.businessVerificationStatus !== 'verified' &&
          profile.businessVerificationStatus !== 'pending' ? (
            <Button
              variant="outline"
              className="mt-3 min-h-10"
              disabled={saving}
              onClick={() =>
                void (async () => {
                  setSaving(true)
                  setError(null)
                  try {
                    await technicianApi.updateProfile({ requestBusinessVerification: true })
                    await refreshProfile()
                    setSaved(true)
                  } catch (err) {
                    setError(getFriendlyErrorMessage(err))
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              Submit for verification
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button className="min-h-11 fn-pressable" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save company profile'}
          </Button>
          {tier === 'business' ? (
            <Link to="/technician/business/team">
              <Button variant="outline" className="min-h-11 fn-pressable">
                Team & dispatch
              </Button>
            </Link>
          ) : null}
          <Link to="/technician/business">
            <Button variant="outline" className="min-h-11 fn-pressable">
              Back
            </Button>
          </Link>
        </div>
      </Card>
    </PlanWorkspaceShell>
  )
}

export default CompanyProfilePage
