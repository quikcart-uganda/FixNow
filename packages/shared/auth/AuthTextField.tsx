import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'
import { authFieldClassName } from './authUx'

type AuthTextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: string
  error?: string | null
  trailing?: ReactNode
  /** Replaces the default label styling so each app keeps its own field look. */
  labelClassName?: string
}

export function AuthTextField({
  label,
  value,
  onChange,
  icon,
  error,
  trailing,
  id,
  className,
  labelClassName,
  ...rest
}: AuthTextFieldProps) {
  const autoId = useId()
  const inputId = id || autoId
  const errorId = `${inputId}-error`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label
          className={labelClassName ?? 'block text-label-caps uppercase text-on-surface-variant'}
          htmlFor={inputId}
        >
          {label}
        </label>
        {trailing}
      </div>
      <div className="relative">
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(authFieldClassName(icon ? 'pr-11' : ''), className)}
          {...rest}
        />
        {icon ? (
          <Icon
            name={icon}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-outline"
          />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-body-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
