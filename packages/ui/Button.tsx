import { cn } from '@fixnow/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'soft'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  /** When true, shows an inline spinner, disables further taps, and sets aria-busy. */
  busy?: boolean
  /** Label shown while busy (falls back to children). */
  busyLabel?: ReactNode
  children: ReactNode
}

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-container',
  secondary: 'bg-white text-on-surface border border-border-subtle hover:bg-surface-container-low',
  ghost: 'bg-transparent text-primary hover:bg-primary-fixed/40',
  danger: 'bg-error text-on-error hover:opacity-95',
  outline: 'bg-surface border border-outline-variant text-primary hover:bg-surface-container-low',
  soft: 'bg-primary-fixed text-primary hover:bg-primary-fixed-dim',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-10 h-10 px-3 text-sm rounded-lg',
  md: 'min-h-12 h-12 px-5 text-body-lg rounded-lg',
  lg: 'min-h-14 h-14 px-6 text-body-lg rounded-lg',
}

function BusySpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current',
        className,
      )}
      aria-hidden="true"
    />
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  disabled,
  busy = false,
  busyLabel,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isBusy = Boolean(busy)
  const isDisabled = Boolean(disabled) || isBusy

  return (
    <button
      type={type}
      className={cn(
        'inline-flex touch-manip select-none items-center justify-center gap-2 font-semibold transition-[transform,opacity,background-color,box-shadow] duration-100 ease-out [-webkit-tap-highlight-color:transparent]',
        'active:scale-[0.97] active:opacity-90 motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:opacity-100',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:active:opacity-50',
        isBusy && 'cursor-wait opacity-80',
        styles[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={isDisabled}
      aria-busy={isBusy ? 'true' : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      {...rest}
    >
      {isBusy ? (
        <>
          <BusySpinner />
          <span>{busyLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
