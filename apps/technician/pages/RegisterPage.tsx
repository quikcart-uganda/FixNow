import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@fixnow/ui'
import { Field, Input, Select } from '@fixnow/ui'
import { ProgressBar } from '@fixnow/ui'
import { authApi, categoriesApi, getFriendlyErrorMessage, mapCategory, technicianApi } from '@fixnow/api'
import { useAsync, useAuth } from '@fixnow/hooks'
import {
  AuthAlert,
  ContinueWithGoogleButton,
  DevOtpNotice,
  OtpInput,
  PasswordField,
  ResendCodeButton,
  maskEmail,
  passwordValidationMessage,
  useAuthSubmit,
  useResendCountdown,
} from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { cn, safeArray } from '@fixnow/utils'

const steps = ['Account', 'Verify'] as const

/** Common Uganda districts for MVP signup — full coverage is post-registration. */
const DISTRICTS = [
  'Kampala',
  'Wakiso',
  'Mukono',
  'Entebbe',
  'Jinja',
  'Mbale',
  'Gulu',
  'Lira',
  'Mbarara',
  'Fort Portal',
  'Masaka',
  'Arua',
  'Soroti',
  'Hoima',
  'Kabale',
  'Tororo',
  'Iganga',
  'Mityana',
  'Luwero',
  'Other',
] as const

export function RegisterPage() {
  const [step, setStep] = useState(0)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [debugOtp, setDebugOtp] = useState<string | undefined>()
  const [categoryId, setCategoryId] = useState('')
  const [district, setDistrict] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [googleMode, setGoogleMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const { submitting, run } = useAuthSubmit()
  const resend = useResendCountdown(60)
  const navigate = useNavigate()
  const { register, verifyOtp, login } = useAuth()
  const { refreshProfile } = useApp()

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory)
  }, [])

  const categories = safeArray(categoriesQuery.data)

  const startResend = resend.start
  useEffect(() => {
    if (step === 1 && !googleMode) startResend(60)
  }, [step, startResend, googleMode])

  const validateMvp = () => {
    if (!fullName.trim()) {
      setError('Enter your full name.')
      return false
    }
    const phoneNorm = phone.trim().replace(/\s+/g, '')
    if (!phoneNorm || !/^\+?[0-9]{9,15}$/.test(phoneNorm)) {
      setError('Enter a valid phone number (e.g. +256700000000).')
      return false
    }
    if (!googleMode) {
      if (!email.trim()) {
        setError('Enter your email address.')
        return false
      }
      const strength = passwordValidationMessage(password)
      if (strength) {
        setError(strength)
        return false
      }
    }
    if (!categoryId) {
      setError('Select your primary profession.')
      return false
    }
    if (!district.trim()) {
      setError('Select your current district.')
      return false
    }
    if (!acceptedTerms) {
      setError('Accept the Terms and Privacy Policy to continue.')
      return false
    }
    return true
  }

  const finishToProfileSetup = async () => {
    await refreshProfile()
    navigate('/technician/profile-setup', { replace: true })
  }

  const saveGoogleEssentials = async () => {
    const phoneNorm = phone.trim().replace(/\s+/g, '')
    await technicianApi.updateProfile({
      fullName: fullName.trim(),
      phone: phoneNorm,
      primaryCategoryId: categoryId,
      location: { district: district.trim(), country: 'UG' },
      acceptedTerms: true,
    })
    await finishToProfileSetup()
  }

  const handleContinue = () => {
    setError(null)
    void run(async () => {
      try {
        if (googleMode) {
          if (!validateMvp()) return
          await saveGoogleEssentials()
          return
        }

        if (step === 0) {
          if (!validateMvp()) return
          const phoneNorm = phone.trim().replace(/\s+/g, '')
          const result = await register({
            email: email.trim(),
            password,
            fullName: fullName.trim(),
            role: 'technician',
            phone: phoneNorm,
            acceptedTerms: true,
            primaryCategoryId: categoryId,
            district: district.trim(),
          })
          setDebugOtp(result.debugOtp)
          setStep(1)
          return
        }

        if (!otp.trim()) {
          setError('Enter the verification code.')
          return
        }
        await verifyOtp({ email: email.trim(), code: otp.trim() })
        await login({ email: email.trim(), password, rememberMe: true })
        await finishToProfileSetup()
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      }
    })
  }

  const progressValue = googleMode ? 1 : step + 1
  const progressMax = googleMode ? 1 : steps.length

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-8 auth-screen-enter">
      <div className="mb-6">
        <p className="text-caps text-primary">Technician registration</p>
        <h1 className="mt-1 text-headline text-on-surface">
          {googleMode ? 'Finish your account' : `${steps[step]} details`}
        </h1>
        <p className="mt-2 text-body text-on-surface-variant">
          {googleMode
            ? 'Add the essentials so customers can find and contact you.'
            : 'Create your account in under two minutes. Portfolio, certificates, and payment details come later.'}
        </p>
        <div className="mt-4">
          <ProgressBar value={progressValue} max={progressMax} />
          {!googleMode ? (
            <div className="mt-2 flex justify-between text-caps text-outline">
              {steps.map((s, i) => (
                <span key={s} className={cn(i <= step && 'text-primary')}>
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <AuthAlert message={error} className="mb-4" />

      {step === 0 || googleMode ? (
        <div className="animate-fade-up space-y-4">
          <Field label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
              autoComplete="name"
            />
          </Field>
          <Field label="Phone number">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder="+256700000000"
              required
              autoComplete="tel"
            />
          </Field>
          {!googleMode ? (
            <>
              <Field label="Email">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="alex@example.com"
                  required
                  autoComplete="email"
                />
              </Field>
              <PasswordField
                label="Password"
                labelClassName="text-label text-on-surface-variant"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                hint="At least 8 characters with a letter and a number."
                required
              />
            </>
          ) : null}
          <Field label="Primary profession">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={categoriesQuery.isLoading}
            >
              <option value="">
                {categoriesQuery.isLoading ? 'Loading professions…' : 'Select your main trade'}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Current district">
            <Select value={district} onChange={(e) => setDistrict(e.target.value)} required>
              <option value="">Select district</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-container-low/50 px-3 py-3 text-sm text-on-surface-variant">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span>
              I agree to the{' '}
              <Link to="/technician/content/terms" className="font-semibold text-primary underline-offset-2 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                to="/technician/content/privacy-policy"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {!googleMode ? (
            <ContinueWithGoogleButton
              role="technician"
              disabled={submitting}
              onError={setError}
              onSuccess={({ user, isNewUser }) => {
                if (user.role !== 'technician') {
                  setError('This account is not a technician account.')
                  return
                }
                setEmail(user.email)
                setFullName(user.fullName || fullName)
                if (isNewUser) {
                  setGoogleMode(true)
                  setAcceptedTerms(false)
                  setError(null)
                  return
                }
                void refreshProfile().finally(() => {
                  navigate('/technician/dashboard', { replace: true })
                })
              }}
            />
          ) : null}
        </div>
      ) : null}

      {step === 1 && !googleMode ? (
        <div className="animate-fade-up space-y-4">
          <p className="text-body text-on-surface-variant">
            Enter the verification code sent to <strong>{maskEmail(email)}</strong>.
          </p>
          <DevOtpNotice code={debugOtp} />
          <OtpInput
            label="Verification code"
            labelClassName="text-label text-on-surface-variant"
            value={otp}
            onChange={setOtp}
            autoFocus
          />
          <ResendCodeButton
            label={resend.label}
            disabled={!resend.canResend || resendBusy}
            busy={resendBusy}
            onClick={() => {
              void (async () => {
                setResendBusy(true)
                setError(null)
                try {
                  const res = await authApi.resendOtp({
                    email: email.trim(),
                    purpose: 'email_verification',
                  })
                  setDebugOtp(res.data?.verification?.debugOtp)
                  resend.start(60)
                } catch (err) {
                  setError(getFriendlyErrorMessage(err))
                } finally {
                  setResendBusy(false)
                }
              })()
            }}
          />
        </div>
      ) : null}

      <div className="mt-8 flex gap-3">
        {step === 1 && !googleMode ? (
          <Button type="button" variant="outline" className="flex-1" disabled={submitting} onClick={() => setStep(0)}>
            Back
          </Button>
        ) : null}
        <Button type="button" className="flex-1" disabled={submitting} onClick={handleContinue}>
          {submitting
            ? 'Please wait…'
            : googleMode
              ? 'Continue to profile setup'
              : step === 0
                ? 'Create account'
                : 'Verify & continue'}
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Already have an account?{' '}
        <Link to="/technician/login" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
    </div>
  )
}
