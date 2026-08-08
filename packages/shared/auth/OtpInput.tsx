import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@fixnow/utils'
import { authFieldClassName } from './authUx'

type OtpInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  /** Replaces the default label styling so each app keeps its own field look. */
  labelClassName?: string
}

export function OtpInput({
  label = 'Verification code',
  value,
  onChange,
  error,
  id,
  className,
  labelClassName,
  ...rest
}: OtpInputProps) {
  const autoId = useId()
  const inputId = id || autoId
  const errorId = `${inputId}-error`

  return (
    <div className="space-y-2">
      <label
        className={labelClassName ?? 'block text-label-caps uppercase text-on-surface-variant'}
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(authFieldClassName('tracking-[0.35em]'), className)}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-body-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type ResendCodeButtonProps = {
  label: string
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}

export function ResendCodeButton({ label, disabled, busy, onClick }: ResendCodeButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        if (disabled || busy) {
          e.preventDefault()
          return
        }
        onClick()
      }}
      disabled={disabled || busy}
      aria-busy={busy ? 'true' : 'false'}
      className="tap-target touch-manip min-h-11 w-full select-none rounded-lg text-sm font-semibold text-primary underline-offset-2 transition-[transform,opacity] duration-100 ease-out [-webkit-tap-highlight-color:transparent] hover:underline active:scale-[0.97] active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-on-surface-variant disabled:no-underline disabled:opacity-70 disabled:active:scale-100"
    >
      {busy ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
            aria-hidden="true"
          />
          Sending…
        </span>
      ) : (
        label
      )}
    </button>
  )
}
