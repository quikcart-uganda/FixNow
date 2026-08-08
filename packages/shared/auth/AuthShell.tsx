import type { ReactNode } from 'react'
import { cn } from '@fixnow/utils'

type AuthShellProps = {
  brand?: string
  tagline?: string
  icon?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  entering?: boolean
}

export function AuthShell({
  brand = 'FixNow',
  tagline,
  children,
  footer,
  className,
  entering = true,
}: AuthShellProps) {
  return (
    <main
      className={cn(
        'relative flex min-h-dvh flex-col items-center justify-center bg-canvas-white p-4',
        entering && 'auth-screen-enter',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute left-[-12%] top-[-14%] h-[42%] w-[42%] rounded-full bg-primary opacity-[0.04] blur-[110px]" />
        <div className="absolute bottom-[-12%] right-[-10%] h-[40%] w-[40%] rounded-full bg-trust-blue opacity-[0.06] blur-[110px]" />
      </div>

      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center animate-fade-up">
          <img
            src="/brand/fixnow-mark.svg"
            alt=""
            width={48}
            height={48}
            className="mb-5 inline-block h-12 w-12 rounded-xl shadow-lg shadow-primary/20"
          />
          <h1 className="text-display-lg-mobile tracking-tight text-primary">{brand}</h1>
          {tagline ? <p className="mt-2 text-body-lg text-on-surface-variant">{tagline}</p> : null}
        </header>

        <section className="w-full rounded-xl border border-border-subtle bg-canvas-white p-8 shadow-card animate-scale-in">
          {children}
        </section>

        {footer ? <footer className="mt-8 text-center animate-fade-up">{footer}</footer> : null}
      </div>
    </main>
  )
}
