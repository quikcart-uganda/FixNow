import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'
import {
  enterGuestSession,
  setCustomerOnboarded,
  trackGuestEvent,
  useContentBlocks,
} from '@fixnow/shared'

const FALLBACK_SLIDES = [
  {
    icon: 'handshake',
    title: 'Find Trusted Technicians',
    description: 'Connect with verified experts for electrical, plumbing, and home repairs.',
  },
  {
    icon: 'post_add',
    title: 'Post Jobs Instantly',
    description: 'Describe your problem, upload photos, and get matches in minutes.',
  },
  {
    icon: 'verified_user',
    title: 'Hire with Confidence',
    description: 'Track your technician in real-time and pay securely after the job is done.',
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const content = useContentBlocks('customer', 'customer.onboarding')
  const slideBlocks = content.list('slide')
  const slides = slideBlocks.length
    ? slideBlocks.map((b) => ({ icon: b.icon || 'info', title: b.title || '', description: b.body || '' }))
    : FALLBACK_SLIDES
  const [step, setStep] = useState(0)
  const isLast = step === slides.length - 1

  const finish = (path: '/customer/register' | '/customer/login' | '/customer/home') => {
    setCustomerOnboarded(true)
    navigate(path, { replace: path === '/customer/home' })
  }

  const continueAsGuest = () => {
    enterGuestSession()
    setCustomerOnboarded(true)
    trackGuestEvent('guest_continue_from_onboarding')
    navigate('/customer/home', { replace: true })
  }

  const next = () => {
    if (isLast) finish('/customer/login')
    else setStep((s) => s + 1)
  }

  const slide = slides[step]

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas-white">
      <header className="fixed inset-x-0 top-0 z-50 mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="text-display-lg-mobile font-bold text-primary">FixNow</div>
        <div className="flex items-center gap-3">
          <Link
            to="/customer/login"
            onClick={() => setCustomerOnboarded(true)}
            className="px-2 py-2 text-label-caps text-primary transition-colors hover:underline"
          >
            SIGN IN
          </Link>
          <button
            type="button"
            onClick={continueAsGuest}
            className="px-4 py-2 text-label-caps text-on-surface-variant transition-colors hover:text-primary"
          >
            SKIP
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative mb-12 flex aspect-square w-full max-w-md items-center justify-center">
          <div className="absolute inset-0 scale-110 rounded-full bg-primary-container opacity-5 blur-3xl" />
          <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-container-low p-8">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary shadow-xl shadow-primary/20">
              <Icon name={slide.icon} filled className="text-5xl text-canvas-white" />
            </div>
            <div className="flex items-center gap-2 rounded-full bg-success-green/10 px-3 py-1">
              <Icon name="verified" filled className="text-[18px] text-success-green" />
              <span className="text-label-caps uppercase text-success-green">Verified Experts</span>
            </div>
          </div>
        </div>

        <div className="max-w-sm text-center">
          <h1 className="mb-4 text-headline-lg-mobile text-on-surface">{slide.title}</h1>
          <p className="text-body-lg text-on-surface-variant">{slide.description}</p>
        </div>
      </main>

      <footer className="sticky bottom-0 z-50 p-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center">
          <div className="mb-8 flex space-x-2">
            {slides.map((s, i) => (
              <div
                key={s.title}
                className={cn(
                  'h-1 rounded-full transition-all',
                  i === step ? 'w-8 bg-primary' : 'w-2 bg-outline-variant',
                )}
              />
            ))}
          </div>
          {isLast ? (
            <div className="flex w-full max-w-md flex-col gap-3">
              <button
                type="button"
                onClick={continueAsGuest}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/5 px-8 text-title-md font-bold text-primary"
              >
                Continue as Guest
              </button>
              <button
                type="button"
                onClick={() => finish('/customer/login')}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 text-title-md text-on-primary shadow-sm"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : (
            <div className="flex h-14 w-full items-center justify-between">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className={cn(
                  'px-6 py-4 text-label-caps text-on-surface-variant transition-colors hover:text-primary',
                  step === 0 && 'invisible',
                )}
              >
                BACK
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-lg bg-primary px-8 text-title-md text-on-primary shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Next</span>
                <Icon name="arrow_forward" />
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
