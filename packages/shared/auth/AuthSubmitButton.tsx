import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'

type AuthSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean
  busyLabel?: string
  showArrow?: boolean
  children: ReactNode
}

export function AuthSubmitButton({
  busy = false,
  busyLabel = 'Please wait…',
  showArrow = true,
  children,
  className,
  onClick,
  ...rest
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      aria-busy={busy ? 'true' : 'false'}
      aria-disabled={busy ? 'true' : undefined}
      className={cn(
        'flex h-12 min-h-12 w-full touch-manip select-none items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm transition-[transform,opacity,background-color] duration-100 ease-out [-webkit-tap-highlight-color:transparent]',
        'hover:bg-primary-container active:scale-[0.97] active:opacity-90',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        busy && 'auth-submitting pointer-events-none cursor-wait opacity-70',
        className,
      )}
      onClick={(e) => {
        if (busy) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      {...rest}
    >
      {busy ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          <span>{busyLabel}</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {showArrow ? <Icon name="arrow_forward" className="text-[20px]" /> : null}
        </>
      )}
    </button>
  )
}
