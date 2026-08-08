import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'
import { useContentBlocks } from '@fixnow/shared'

// Fallback recruitment slides — used only if Admin content is unavailable.
const FALLBACK_SLIDES = [
  {
    icon: 'near_me',
    title: 'Jobs near you',
    description: 'Browse posted jobs in your parishes and apply with one tap when you match.',
  },
  {
    icon: 'military_tech',
    title: 'Build your reputation',
    description: 'Trust Score, reviews, and badges help you win more work in Kampala and beyond.',
  },
  {
    icon: 'payments',
    title: 'Get paid via Mobile Money',
    description: 'MTN MoMo and Airtel Money ready — track earnings and upgrade when you grow.',
  },
]

export function OnboardingPage() {
  const content = useContentBlocks('technician', 'technician.onboarding')
  const slideBlocks = content.list('slide')
  const slides = slideBlocks.length
    ? slideBlocks.map((b) => ({ icon: b.icon || 'info', title: b.title || '', description: b.body || '' }))
    : FALLBACK_SLIDES
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const { setOnboarded } = useApp()
  const slide = slides[index]
  const last = index === slides.length - 1

  const finish = () => {
    setOnboarded(true)
    navigate('/technician/register')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <p className="text-title text-primary">FixNow Pro</p>
        <button type="button" className="text-label text-on-surface-variant" onClick={finish}>
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center animate-fade-up" key={slide.title}>
        <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-trust-blue-subtle text-primary">
          <Icon name={slide.icon} className="text-5xl" filled />
        </div>
        <h1 className="text-display-mobile text-on-surface">{slide.title}</h1>
        <p className="mt-4 max-w-sm text-body-lg text-on-surface-variant">{slide.description}</p>
      </div>

      <div className="mt-8 space-y-6">
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn('h-2 rounded-full transition-all', i === index ? 'w-8 bg-primary' : 'w-2 bg-outline-variant')}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            Back
          </Button>
          <Button
            onClick={() => {
              if (last) finish()
              else setIndex((i) => i + 1)
            }}
          >
            {last ? 'Create account' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
