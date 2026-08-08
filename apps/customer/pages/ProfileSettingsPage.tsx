import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { customerApi, getFriendlyErrorMessage } from '@fixnow/api'
import { useAsync, useAuth } from '@fixnow/hooks'
import { AsyncStateView, LocationSettingsCard, ProfilePhotoPicker, SwitchRoleControl } from '@fixnow/shared'

const rows = [
  { icon: 'edit', label: 'Edit profile', to: '/customer/profile' },
  { icon: 'history', label: 'Job history', to: '/customer/jobs' },
  { icon: 'favorite', label: 'Saved technicians', to: '/customer/search' },
  { icon: 'local_offer', label: 'Saved offers', to: '/customer/offers/saved' },
  { icon: 'payments', label: 'Payment methods', to: '/customer/payments' },
  { icon: 'notifications', label: 'Notifications', to: '/customer/notifications' },
  { icon: 'help', label: 'Help center', to: '/customer/help' },
  { icon: 'policy', label: 'Privacy policy', to: '/customer/content/privacy-policy' },
  { icon: 'gavel', label: 'Terms', to: '/customer/content/terms' },
  { icon: 'person_off', label: 'Delete account', to: '/customer/account/delete' },
]

function FavouriteOfferAlertsCard() {
  const prefsQuery = useAsync(async () => {
    const res = await customerApi.getProfile()
    const prefs = (res.data.profile?.preferences as Record<string, unknown> | undefined) ?? {}
    return prefs.notifyFavouriteTechnicianOffers !== false
  }, [])
  const [busy, setBusy] = useState(false)
  const enabled = prefsQuery.data ?? true

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await customerApi.updateProfile({
        preferences: { notifyFavouriteTechnicianOffers: !enabled },
      })
      await prefsQuery.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4">
      <div>
        <p className="font-semibold text-on-surface">Favourite technician offers</p>
        <p className="text-xs text-on-surface-variant">
          Notify me when a saved technician publishes a new promotion.
        </p>
      </div>
      <button
        type="button"
        disabled={busy || prefsQuery.status === 'loading'}
        onClick={() => void toggle()}
        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
          enabled ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'
        }`}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  )
}

export function ProfileSettingsPage() {
  const navigate = useNavigate()
  const { user, logout, refreshMe } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const profileQuery = useAsync(async () => {
    const res = await customerApi.getProfile()
    const profile = res.data.profile ?? {}
    const loc = (profile.location as Record<string, unknown> | undefined) ?? {}
    return {
      name: String(res.data.user?.fullName ?? user?.fullName ?? 'Customer'),
      photo: String(profile.photoUrl ?? ''),
      parish: String(loc.parish ?? '—'),
      district: String(loc.district ?? 'Kampala'),
    }
  }, [user?.fullName])

  const display = profileQuery.data ?? {
    name: user?.fullName ?? 'Customer',
    photo: '',
    parish: '—',
    district: 'Kampala',
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border-subtle bg-canvas-white px-4">
        <h1 className="text-title-md">Profile & Settings</h1>
      </header>

      <section className="space-y-6 p-4">
        <AsyncStateView
          status={profileQuery.status}
          error={profileQuery.error}
          onRetry={() => void profileQuery.reload()}
          loadingLabel="Loading profile…"
          className="min-h-[120px]"
        >
          <div className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-canvas-white p-5 shadow-sm">
            <ProfilePhotoPicker
              role="customer"
              name={display.name}
              photoUrl={display.photo}
              sizeClassName="h-16 w-16 rounded-full"
              onUploaded={async (url) => {
                await customerApi.updateProfile({ photoUrl: url })
                await Promise.all([profileQuery.reload(), refreshMe()])
              }}
            />
            <div>
              <h2 className="text-title-md text-on-surface">{display.name}</h2>
              <p className="text-body-sm text-on-surface-variant">
                {display.parish}, {display.district}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">Tap photo to change</p>
            </div>
          </div>
        </AsyncStateView>

        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-canvas-white">
          {rows.map((row, index) => (
            <Link
              key={row.label}
              to={row.to}
              className={`flex items-center gap-3 px-4 py-4 transition hover:bg-surface-container-low ${
                index < rows.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
            >
              <Icon name={row.icon} className="text-primary" />
              <span className="flex-1 text-body-lg text-on-surface">{row.label}</span>
              <Icon name="chevron_right" className="text-outline" />
            </Link>
          ))}
        </div>

        <FavouriteOfferAlertsCard />

        <LocationSettingsCard role="customer" />

        <SwitchRoleControl />

        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true)
            try {
              await logout()
              navigate('/customer/login', { replace: true })
            } finally {
              setSigningOut(false)
            }
          }}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-error/30 font-semibold text-error disabled:opacity-60"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
