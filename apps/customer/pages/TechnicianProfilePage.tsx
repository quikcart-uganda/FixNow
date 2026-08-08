import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Icon, ProfileAvatar, SubscriptionBadge } from '@fixnow/ui'
import { mapCustomerTechnicianCard, technicianApi } from '@fixnow/api'
import { useAsync, useAuth } from '@fixnow/hooks'
import { AsyncStateView, isGuestSession, trackGuestEvent, useAuthGate } from '@fixnow/shared'
import type { CustomerTechnician } from '@customer/data'
import { useEffect } from 'react'

export function TechnicianProfilePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { requireAuth } = useAuthGate()
  const guest = isGuestSession() && !isAuthenticated

  const profileQuery = useAsync(async () => {
    const res = await technicianApi.getPublicProfile(id)
    const raw = res.data.technician as Record<string, unknown>
    const tech = mapCustomerTechnicianCard(raw) as CustomerTechnician & { profileImageUrl?: string }
    return {
      ...tech,
      photo: tech.profileImageUrl || tech.photo,
      bio: typeof raw.bio === 'string' ? raw.bio : '',
    }
  }, [id])

  const tech = profileQuery.data

  useEffect(() => {
    if (guest) trackGuestEvent('guest_technician_view', { technicianId: id })
  }, [guest, id])

  useEffect(() => {
    const st = location.state as { resumeAction?: string; resumePayload?: Record<string, unknown> } | null
    if (!isAuthenticated || !st?.resumeAction) return
    if (st.resumeAction === 'book' || st.resumeAction === 'post_job') {
      navigate(`/customer/post-job?technicianId=${id}`, { replace: true })
    }
  }, [isAuthenticated, location.state, id, navigate])

  const gateBook = () => {
    trackGuestEvent('guest_booking_attempt', { technicianId: id })
    if (
      requireAuth({
        intent: 'book',
        title: 'Continue to book',
        message: 'Create your free FixNow account to continue.',
        resumePath: `/customer/technician/${id}`,
        payload: { technicianId: id },
      })
    ) {
      navigate(`/customer/post-job?technicianId=${id}`)
    }
  }

  const gateMessages = () => {
    if (
      requireAuth({
        intent: 'messages',
        title: 'Create your free FixNow account',
        message: 'Sign in or create an account to message technicians.',
        resumePath: `/customer/technician/${id}`,
        payload: { technicianId: id },
      })
    ) {
      navigate('/customer/messages')
    }
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-canvas-white px-4">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </button>
        <h1 className="text-title-md">Technician Profile</h1>
        <button
          type="button"
          aria-label="Share technician profile"
          className="tap-target rounded-full p-2 hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={async () => {
            const url = typeof window !== 'undefined' ? window.location.href : ''
            const title = profileQuery.data?.name
              ? `${profileQuery.data.name} on FixNow`
              : 'FixNow technician'
            const text = profileQuery.data?.trade
              ? `${profileQuery.data.name} · ${profileQuery.data.trade}`
              : title
            try {
              if (navigator.share) {
                await navigator.share({ title, text, url })
              } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url)
                window.alert('Link copied. You can paste it to share this technician.')
              } else {
                window.alert('Sharing is not available on this device. Copy the page link from your browser.')
              }
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') return
              window.alert('Unable to share right now. Please try again.')
            }
          }}
        >
          <Icon name="share" />
        </button>
      </header>

      <AsyncStateView
        status={profileQuery.status}
        error={profileQuery.error}
        onRetry={() => void profileQuery.reload()}
        emptyTitle="Technician not found"
        emptyHint="This profile may have been removed or is no longer available."
        loadingLabel="Loading profile…"
      >
        {tech ? (
          <>
            <div className="relative flex h-48 items-center justify-center overflow-hidden bg-surface-container">
              <ProfileAvatar src={tech.photo} alt={tech.name} className="h-full w-full rounded-none" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>

            <section className="relative -mt-10 space-y-6 px-4 pb-8">
              <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5 shadow-card">
                <div className="flex items-start gap-4">
                  <ProfileAvatar
                    src={tech.photo}
                    alt={tech.name}
                    online={tech.online}
                    className="h-20 w-20 shrink-0 rounded-2xl border-4 border-white shadow-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-headline-lg-mobile text-on-surface">{tech.name}</h2>
                      <Icon name="verified" filled className="text-primary" />
                      {tech.subscriptionBadge ? (
                        <SubscriptionBadge
                          text={tech.subscriptionBadge.text}
                          icon={tech.subscriptionBadge.icon}
                          color={tech.subscriptionBadge.color}
                          borderColor={tech.subscriptionBadge.borderColor}
                          glow={tech.subscriptionBadge.glow}
                          size={tech.subscriptionBadge.size || 'sm'}
                          boostActive={tech.boostActive}
                        />
                      ) : tech.boostActive ? (
                        <SubscriptionBadge boostActive />
                      ) : null}
                    </div>
                    <p className="text-body-sm text-on-surface-variant">{tech.trade}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-0.5 text-body-sm font-semibold">
                        <Icon name="star" filled className="text-[16px] text-primary" />
                        {tech.rating}
                      </span>
                      <span className="text-body-sm text-on-surface-variant">{tech.jobs} jobs</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border-subtle pt-4 text-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-outline">Trust</p>
                    <p className="text-title-md text-primary">{tech.trustScore}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-outline">From</p>
                    <p className="text-title-md text-on-surface">{tech.startingFrom}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-outline">Neighbors</p>
                    <p className="text-title-md text-success-green">{tech.neighborsHired}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
                <h3 className="text-title-md text-on-surface">About</h3>
                <p className="mt-2 text-body-sm text-on-surface-variant">
                  {tech.bio ||
                    'Verified FixNow technician serving Kampala. Known for punctual arrivals, clear quotes, and clean workmanship. Available for residential and commercial calls.'}
                </p>
                {guest ? (
                  <p className="mt-3 text-xs text-on-surface-variant">
                    Phone and email stay private until you book with a FixNow account.
                  </p>
                ) : null}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={gateBook}
                  className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary font-semibold text-on-primary"
                >
                  Book Now
                </button>
                <button
                  type="button"
                  onClick={gateMessages}
                  className="flex h-12 flex-1 items-center justify-center rounded-lg border border-border-subtle font-semibold text-primary"
                >
                  Messages
                </button>
              </div>
            </section>
          </>
        ) : null}
      </AsyncStateView>
    </div>
  )
}
