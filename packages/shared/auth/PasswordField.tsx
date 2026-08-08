import { useId, useRef, useState, type InputHTMLAttributes } from 'react'
import { Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'
import { authFieldClassName } from './authUx'

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  hint?: string
  error?: string | null
  /** Replaces the default label styling so each app keeps its own field look. */
  labelClassName?: string
}

export function PasswordField({
  label,
  hint,
  error,
  id,
  className,
  labelClassName,
  disabled,
  ...rest
}: PasswordFieldProps) {
  const autoId = useId()
  const inputId = id || autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Keep focus and caret in the field when toggling type (QuikCart-style toggle UX). */
  const toggleVisibility = () => {
    const input = inputRef.current
    const start = input?.selectionStart ?? null
    const end = input?.selectionEnd ?? null
    setVisible((v) => !v)
    requestAnimationFrame(() => {
      if (!input) return
      input.focus({ preventScroll: true })
      if (start !== null && end !== null) {
        try {
          input.setSelectionRange(start, end)
        } catch {
          /* some browsers disallow selection APIs on type=password */
        }
      }
    })
  }

  return (
    <div className="space-y-2">
      <label
        className={labelClassName ?? 'block text-label-caps uppercase text-on-surface-variant'}
        htmlFor={inputId}
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
          className={cn(authFieldClassName('pr-12'), className)}
          {...rest}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={toggleVisibility}
          className="absolute right-2 top-1/2 flex h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
            <Icon name={visible ? 'visibility_off' : 'visibility'} className="text-[20px]" />
        </button>
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-body-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
