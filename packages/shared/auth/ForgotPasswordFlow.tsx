import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { authApi, getFriendlyErrorMessage } from '@fixnow/api'
import { AuthShell } from './AuthShell'
import { AuthAlert } from './AuthAlert'
import { AuthSubmitButton } from './AuthSubmitButton'
import { AuthTextField } from './AuthTextField'
import { PasswordField } from './PasswordField'
import { OtpInput, ResendCodeButton } from './OtpInput'
import { DevOtpNotice } from './devSettings'
import { useAuthSubmit } from './useAuthSubmit'
import { useResendCountdown } from './useResendCountdown'
import { useCmsCopy } from '../content/useCmsCopy'
import { maskEmail, passwordValidationMessage, passwordsMatchMessage } from './authUx'

type Step = 'request' | 'code' | 'password' | 'done'

type ForgotPasswordFlowProps = {
  loginPath: string
  brand?: string
  icon?: string
}

const titles: Record<Step, string> = {
  request: 'Reset password',
  code: 'Check your email',
  password: 'Create new password',
  done: 'Password updated',
}

/** Reset wizard over the existing /auth/forgot-password, /auth/verify-otp and /auth/reset-password endpoints. */
export function ForgotPasswordFlow({ loginPath, brand = 'FixNow', icon = 'lock_reset' }: ForgotPasswordFlowProps) {
  const navigate = useNavigate()
  const { submitting, run } = useAuthSubmit()
  const resend = useResendCountdown(60)
  const cmsInstructions = useCmsCopy('forgot-password-instructions')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [debugOtp, setDebugOtp] = useState<string | undefined>()
  const [step, setStep] = useState<Step>('request')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)

  const startResend = resend.start
  useEffect(() => {
    if (step === 'code') startResend(60)
  }, [step, startResend])

  function goToLogin() {
    // Imperative navigation avoids stale Suspense/history stalls after lazy route swaps.
    navigate(loginPath, { replace: true })
  }

  const messages: Record<Step, string> = {
    request: cmsInstructions.text || 'Enter your email to receive a secure reset code.',
    code: `Enter the code sent to ${maskEmail(email)}.`,
    password: 'Choose a strong password. You’ll sign in again afterward.',
    done: 'Your password was updated. You can sign in with it now.',
  }

  return (
    <AuthShell
      brand={brand}
      tagline={messages[step]}
      icon={icon}
      footer={
        step !== 'done' ? (
          <p className="text-sm">
            <button
              type="button"
              onClick={goToLogin}
              className="font-semibold text-primary hover:underline"
            >
              Back to login
            </button>
          </p>
        ) : null
      }
    >
      <div className="mb-5 text-center">
        <h2 className="text-title-md text-on-surface">{titles[step]}</h2>
      </div>

      <AuthAlert message={error} className="mb-4" />
      <AuthAlert message={info} tone="info" className="mb-4" />

      {step === 'request' ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            setInfo(null)
            if (!email.trim()) {
              setError('Email is required.')
              return
            }
            void run(async () => {
              try {
                const res = await authApi.forgotPassword(email.trim())
                setDebugOtp(res.data.verification?.debugOtp)
                setInfo('If this account exists, we’ll send recovery instructions.')
                setStep('code')
              } catch (err) {
                setError(getFriendlyErrorMessage(err))
              }
            })
          }}
        >
          <AuthTextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="Enter your email"
            required
          />
          <AuthSubmitButton busy={submitting} busyLabel="Sending…" showArrow={false}>
            Send reset code
          </AuthSubmitButton>
        </form>
      ) : null}

      {step === 'code' ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            setInfo(null)
            if (!code.trim()) {
              setError('Enter the reset code from your email.')
              return
            }
            void run(async () => {
              try {
                await authApi.verifyOtp({
                  email: email.trim(),
                  code: code.trim(),
                  purpose: 'password_reset',
                })
                setStep('password')
              } catch (err) {
                setError(getFriendlyErrorMessage(err))
              }
            })
          }}
        >
          <DevOtpNotice code={debugOtp} />
          <OtpInput label="Reset code" value={code} onChange={setCode} placeholder="123456" autoFocus required />
          <AuthSubmitButton busy={submitting} busyLabel="Checking…" showArrow={false}>
            Verify code
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
                    purpose: 'password_reset',
                    channel: 'email',
                  })
                  setDebugOtp(res.data.verification?.debugOtp)
                  setInfo('If this account exists, we’ll send recovery instructions.')
                  resend.start(60)
                } catch (err) {
                  setError(getFriendlyErrorMessage(err))
                } finally {
                  setResendBusy(false)
                }
              })()
            }}
          />
        </form>
      ) : null}

      {step === 'password' ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            const strength = passwordValidationMessage(newPassword)
            if (strength) {
              setError(strength)
              return
            }
            const match = passwordsMatchMessage(newPassword, confirmPassword)
            if (match) {
              setError(match)
              return
            }
            void run(async () => {
              try {
                await authApi.resetPassword({
                  email: email.trim(),
                  code: code.trim(),
                  newPassword,
                })
                setStep('done')
              } catch (err) {
                setError(getFriendlyErrorMessage(err))
              }
            })
          }}
        >
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            hint="At least 8 characters with a letter and a number."
            autoFocus
            required
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <AuthSubmitButton busy={submitting} busyLabel="Updating…" showArrow={false}>
            Reset password
          </AuthSubmitButton>
        </form>
      ) : null}

      {step === 'done' ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-green/10 text-success-green">
            <Icon name="check_circle" className="text-3xl" />
          </div>
          <AuthAlert message={messages.done} tone="success" />
          <button
            type="button"
            onClick={goToLogin}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white"
          >
            Back to login
          </button>
        </div>
      ) : null}
    </AuthShell>
  )
}
