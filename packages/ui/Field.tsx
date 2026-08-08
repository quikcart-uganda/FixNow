import { cn } from '@fixnow/utils'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function Field({
  label,
  children,
  hint,
  error,
  htmlFor,
  required,
}: {
  label: string
  children: ReactNode
  hint?: string
  error?: string
  htmlFor?: string
  required?: boolean
}) {
  const autoId = useId()
  const fieldId = htmlFor ?? autoId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="block space-y-2">
      <label htmlFor={fieldId} className="block text-label text-on-surface-variant">
        {label}
        {required ? (
          <span className="text-error" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {/* Clone description ids onto a wrapper so callers can still pass their own controls */}
      <div
        data-field-describedby={describedBy}
        data-field-invalid={error ? 'true' : undefined}
        data-field-id={fieldId}
      >
        {children}
      </div>
      {hint && !error ? (
        <span id={hintId} className="block text-caps text-on-surface-variant">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="block text-body-sm text-error">
          {error}
        </span>
      ) : null}
    </div>
  )
}

const inputClass =
  'w-full min-h-11 rounded-lg border border-border-subtle bg-surface px-4 py-3 text-base text-on-surface outline-none transition focus-visible:border-2 focus-visible:border-primary focus-visible:ring-0'

export function Input({
  invalid,
  describedBy,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; describedBy?: string }) {
  return (
    <input
      className={cn(inputClass, invalid && 'border-error', className)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      {...props}
    />
  )
}

export function TextArea({
  invalid,
  describedBy,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; describedBy?: string }) {
  return (
    <textarea
      className={cn(inputClass, 'min-h-28 resize-y', invalid && 'border-error', className)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      {...props}
    />
  )
}

export function Select({
  invalid,
  describedBy,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; describedBy?: string }) {
  return (
    <select
      className={cn(inputClass, invalid && 'border-error', className)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      {...props}
    />
  )
}

/**
 * Self-contained labelled control — preferred for new forms.
 * Wires id / aria-invalid / aria-describedby automatically.
 */
export function LabeledInput({
  label,
  hint,
  error,
  required,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="block space-y-2">
      <label htmlFor={fieldId} className="block text-label text-on-surface-variant">
        {label}
        {required ? (
          <span className="text-error" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <Input
        id={fieldId}
        required={required}
        invalid={Boolean(error)}
        describedBy={describedBy}
        {...props}
      />
      {hint && !error ? (
        <span id={hintId} className="block text-caps text-on-surface-variant">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="block text-body-sm text-error">
          {error}
        </span>
      ) : null}
    </div>
  )
}
