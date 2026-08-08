import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { useAuth } from '@fixnow/hooks'
import { authApi, getFriendlyErrorMessage } from '@fixnow/api'
import {
  AuthAlert,
  AuthSubmitButton,
  AuthTextField,
  OtpInput,
  PasswordField,
  ResendCodeButton,
  ContinueWithGoogleButton,
  DevOtpNotice,
  clearGuestPendingAction,
  getGuestPendingAction,
  maskEmail,
  passwordValidationMessage,
  passwordsMatchMessage,
  setCustomerOnboarded,
  trackGuestEvent,
  useAuthSubmit,
  useContentBlocks,
  useResendCountdown,
} from '@fixnow/shared'

// Fallbacks keep the marketing column populated if Admin content is offline.
const FALLBACK_PERKS = [
  { icon: 'verified_user', title: 'Vetted Pros', body: 'Every technician undergoes a rigorous multi-step background check.' },
  { icon: 'speed', title: 'Fast Arrival', body: 'Average response time of under 45 minutes across the city.' },
]

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const resumeAfterAuth = () => {
    const pending = getGuestPendingAction()
    if (pending?.path?.startsWith('/customer')) {
      clearGuestPendingAction()
      trackGuestEvent('guest_converted', { intent: pending.intent || pending.type, path: pending.path })
      navigate(pending.path, {
        replace: true,
        state: { resumeAction: pending.intent || pending.type, resumePayload: pending.payload },
      })
      return
    }
    if (from?.startsWith('/customer')) {
      navigate(from, { replace: true })
      return
    }
    navigate('/customer/home', { replace: true })
  }

  const content = useContentBlocks('customer', 'customer.register')
  const heroBlocks = content.list('hero')
  const heroTitle =
    heroBlocks.find((b) => b.type === 'hero_headline')?.title || 'Quality fixes, just a tap away.'
  const heroDescription =
    heroBlocks.find((b) => b.type === 'hero_description')?.body ||
    'Join thousands of homeowners in Kampala who trust FixNow for reliable, vetted, and professional home services.'
  const perkBlocks = content.list('feature')
  const perks = perkBlocks.length
    ? perkBlocks.map((b) => ({ icon: b.icon || 'star', title: b.title || '', body: b.body || '' }))
    : FALLBACK_PERKS
  const { register, verifyOtp, login } = useAuth()
  const { submitting, run } = useAuthSubmit()
  const resend = useResendCountdown(60)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [debugOtp, setDebugOtp] = useState<string | undefined>()
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)

  useEffect(() => {
    setCustomerOnboarded(true)
  }, [])

  const startResend = resend.start
  useEffect(() => {
    if (step === 'otp') startResend(60)
  }, [step, startResend])

  return (
    <div className="flex min-h-dvh flex-col bg-canvas-white auth-screen-enter">
      <header className="sticky top-0 z-50 mx-auto flex h-14 w-full max-w-7xl items-center justify-between border-b border-border-subtle bg-canvas-white px-4">
        <span className="text-display-lg-mobile font-bold text-primary">FixNow</span>
        <Link to="/customer/login" className="text-label-caps font-bold text-primary">
          Sign In
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:py-12">
        <div className="grid w-full max-w-5xl grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <h2 className="text-headline-lg-mobile text-on-surface lg:text-headline-lg">{heroTitle}</h2>
            <p className="mt-3 max-w-prose text-pretty text-body-lg text-on-surface-variant">{heroDescription}</p>
          </div>

          <div className="min-w-0 rounded-xl border border-border-subtle bg-canvas-white p-6 shadow-card animate-scale-in sm:p-8 md:p-10 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="mb-8">
              <h1 className="text-headline-lg-mobile text-on-surface">
                {step === 'form' ? 'Create Account' : 'Verify your email'}
              </h1>
              <p className="mt-2 break-words text-body-sm text-on-surface-variant">
                {step === 'form' ? (
                  <>
                    Already have an account?{' '}
                    <Link to="/customer/login" className="font-semibold text-primary hover:underline">
                      Log In
                    </Link>
                  </>
                ) : (
                  <>Enter the code we sent to <strong>{maskEmail(email)}</strong>.</>
                )}
              </p>
            </div>

            <AuthAlert message={error} className="mb-4" />

            {step === 'form' ? (
              <form
                className="space-y-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  setError(null)
                  if (!fullName.trim() || !email.trim() || !password) {
                    setFieldError('Please add your name, email, and password.')
                    return
                  }
                  const strength = passwordValidationMessage(password)
                  if (strength) {
                    setFieldError(strength)
                    return
                  }
                  const match = passwordsMatchMessage(password, confirmPassword)
                  if (match) {
                    setFieldError(match)
                    return
                  }
                  setFieldError(null)

                  void run(async () => {
                    try {
                      const phoneNorm = phone.trim() ? phone.trim().replace(/\s+/g, '') : undefined
                      const result = await register({
                        email: email.trim(),
                        password,
                        fullName: fullName.trim(),
                        role: 'customer',
                        phone: phoneNorm,
                      })
                      setDebugOtp(result.debugOtp)
                      setStep('otp')
                    } catch (err) {
                      setError(getFriendlyErrorMessage(err))
                    }
                  })
                }}
              >
                <AuthTextField label="Full Name" icon="person" value={fullName} onChange={setFullName} placeholder="John Doe" autoComplete="name" required />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <AuthTextField label="Phone Number" icon="call" value={phone} onChange={setPhone} placeholder="+256700000000" type="tel" autoComplete="tel" />
                  <AuthTextField label="Email Address" icon="mail" value={email} onChange={setEmail} placeholder="john@example.com" type="email" autoComplete="email" required />
                </div>
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  hint="At least 8 characters with a letter and a number."
                  required
                />
                <PasswordField
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />
                <AuthAlert message={fieldError} />
                <AuthSubmitButton busy={submitting} busyLabel="Creating…" className="h-14">
                  Continue
                </AuthSubmitButton>
                <ContinueWithGoogleButton
                  role="customer"
                  disabled={submitting}
                  onError={setError}
                  onSuccess={({ user }) => {
                    if (user.role !== 'customer') {
                      setError('This account is not a customer account.')
                      return
                    }
                    resumeAfterAuth()
                  }}
                />
              </form>
            ) : (
              <form
                className="space-y-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  setError(null)
                  if (!otp.trim()) {
                    setError('Enter the verification code.')
                    return
                  }
                  void run(async () => {
                    try {
                      await verifyOtp({ email: email.trim(), code: otp.trim() })
                      await login({ email: email.trim(), password, rememberMe: true })
                      resumeAfterAuth()
                    } catch (err) {
                      setError(getFriendlyErrorMessage(err))
                    }
                  })
                }}
              >
                <DevOtpNotice code={debugOtp} />
                <OtpInput label="6-digit code" value={otp} onChange={setOtp} placeholder="123456" autoFocus required />
                <AuthSubmitButton busy={submitting} busyLabel="Verifying…">
                  Verify & Continue
                </AuthSubmitButton>
                <ResendCodeButton
                  label={resend.label}
                  disabled={!resend.canResend}
                  busy={resendBusy}
                  onClick={() => {
                    void (async () => {
                      setResendBusy(true)
                      setError(null)
                      try {
                        const res = await authApi.resendOtp({
                          email: email.trim(),
                          purpose: 'email_verification',
                          channel: 'email',
                        })
                        setDebugOtp(res.data.verification?.debugOtp)
                        resend.start(60)
                      } catch (err) {
                        setError(getFriendlyErrorMessage(err))
                      } finally {
                        setResendBusy(false)
                      }
                    })()
                  }}
                />
                <button
                  type="button"
                  className="w-full text-sm font-semibold text-on-surface-variant hover:text-primary"
                  onClick={() => {
                    setStep('form')
                    setOtp('')
                    setError(null)
                  }}
                >
                  Back
                </button>
              </form>
            )}

            <p className="mt-6 flex items-center justify-center gap-2 text-body-sm text-on-surface-variant">
              <Icon name="lock" className="text-base" />
              Your information is safe with us.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:col-start-1 lg:row-start-2">
            {perks.map((p) => (
              <div key={p.title} className="flex min-w-0 flex-col gap-2 rounded-xl bg-surface-container-low p-5 sm:p-6">
                <Icon name={p.icon} className="text-3xl text-primary" />
                <p className="text-title-md text-on-surface">{p.title}</p>
                <p className="text-pretty text-body-sm text-on-surface-variant">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
