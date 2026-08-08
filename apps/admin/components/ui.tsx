import { Link } from 'react-router-dom'
import { cn } from '@fixnow/utils'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon as SharedIcon } from '@fixnow/ui'

/** Admin Icon — same shared Material Symbols renderer as Customer / Technician. */
export function Icon({
  name,
  className,
  filled,
}: {
  name: string
  className?: string
  filled?: boolean
}) {
  return <SharedIcon name={name} className={className} filled={filled} />
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-canvas border border-border rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] md:text-[32px] font-semibold tracking-[-0.04em] text-ink-primary leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm md:text-base text-ink-secondary leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  busy = false,
  busyLabel,
  disabled,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md'
  busy?: boolean
  busyLabel?: ReactNode
}) {
  const variants = {
    primary: 'bg-primary text-white hover:opacity-90 shadow-sm shadow-primary/20',
    secondary: 'bg-surface-alt text-ink-primary border border-border-strong hover:bg-surface-container',
    outline: 'bg-transparent border border-outline-variant text-ink-primary hover:bg-surface-alt',
    ghost: 'bg-transparent text-ink-secondary hover:bg-surface-container hover:text-primary',
    danger: 'bg-error text-white hover:opacity-90',
  }
  const sizes = {
    sm: 'min-h-10 px-3 py-2 text-sm',
    md: 'min-h-11 px-4 py-2.5 text-sm',
  }
  const isBusy = Boolean(busy)
  const isDisabled = Boolean(disabled) || isBusy
  return (
    <button
      type={type}
      className={cn(
        'inline-flex touch-manip select-none items-center justify-center gap-2 rounded-lg font-medium transition-[transform,opacity,background-color,box-shadow] duration-100 ease-out [-webkit-tap-highlight-color:transparent]',
        'active:scale-[0.97] active:opacity-90',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:active:opacity-50',
        isBusy && 'cursor-wait opacity-80',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={isDisabled}
      aria-busy={isBusy ? 'true' : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      {...props}
    >
      {isBusy ? (
        <>
          <span
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
            aria-hidden="true"
          />
          <span>{busyLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export function StatusBadge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string
  tone?: BadgeTone
  icon?: string
}) {
  const tones = {
    success: 'bg-secondary-container/40 text-on-secondary-container border-secondary/20',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-error-container text-on-error-container border-error/20',
    neutral: 'bg-surface-alt text-ink-secondary border-border',
    info: 'bg-primary-fixed text-on-primary-fixed-variant border-primary/15',
    locked: 'bg-ink-primary text-white border-ink-primary',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.05em] border',
        tones[tone],
      )}
    >
      {icon ? <Icon name={icon} className="!text-[13px]" /> : null}
      {label}
    </span>
  )
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'locked'

const AVATAR_TINTS = [
  'bg-primary/12 text-primary',
  'bg-secondary/15 text-secondary',
  'bg-tertiary/15 text-tertiary',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
]

const AVATAR_SIZES = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-11 w-11 text-[13px]',
  lg: 'h-14 w-14 text-base',
}

export function Avatar({
  name,
  email,
  size = 'md',
  className,
}: {
  name?: string | null
  email?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const source = (name || email || '').trim()
  const initials =
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AD'
  const seed = Array.from(source).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const tint = AVATAR_TINTS[seed % AVATAR_TINTS.length]

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight',
        AVATAR_SIZES[size],
        tint,
        className,
      )}
    >
      {initials}
    </span>
  )
}

/**
 * Compact metric tile for list-screen summaries. Renders as a button when
 * `onClick` is supplied so tiles can double as status filters.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  active = false,
  onClick,
  className,
}: {
  label: string
  value: number | string | null
  icon: string
  tone?: BadgeTone
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const tones: Record<BadgeTone, string> = {
    success: 'bg-secondary-container/40 text-on-secondary-container',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-error-container text-error',
    neutral: 'bg-surface-alt text-ink-secondary',
    info: 'bg-primary/10 text-primary',
    locked: 'bg-ink-primary/90 text-white',
  }

  const body = (
    <>
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tones[tone])}>
        <Icon name={icon} className="!text-[20px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          {label}
        </span>
        <span className="mt-0.5 block text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink-primary">
          {value === null ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </span>
    </>
  )

  const shared = cn(
    'flex min-h-[84px] items-center gap-3 rounded-xl border bg-canvas p-4 text-left transition-colors',
    active ? 'border-primary ring-1 ring-primary/30' : 'border-border',
    className,
  )

  if (!onClick) {
    return <div className={shared}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        shared,
        'hover:border-border-strong hover:bg-surface-alt/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      {body}
    </button>
  )
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted !text-[20px]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder ?? label}
        className="min-h-11 w-full rounded-lg border border-border bg-canvas pl-10 pr-3 text-sm text-ink-primary outline-none placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
    </div>
  )
}

export function SelectField({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <select
      aria-label={label}
      className={cn(
        'min-h-11 rounded-lg border border-border bg-canvas px-3 pr-8 text-sm text-ink-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/25',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export type MenuAction = {
  key: string
  label: string
  icon?: string
  tone?: 'default' | 'danger'
  disabled?: boolean
  /** Explains why an action is unavailable; also used as the accessible title. */
  hint?: string
  onSelect: () => void
}

export type MenuSection = {
  key: string
  label?: string
  actions: MenuAction[]
}

const MENU_WIDTH = 248

type MenuPosition = { left: number; top?: number; bottom?: number; maxHeight: number }

/**
 * Single-trigger contextual actions menu. Rendered in a portal with fixed
 * positioning so it is never clipped by table or card overflow containers.
 */
export function OverflowMenu({
  sections,
  label = 'More actions',
  triggerLabel,
  triggerClassName,
  disabled = false,
}: {
  sections: MenuSection[]
  label?: string
  /** Optional visible label next to the overflow icon (e.g. mobile "More"). */
  triggerLabel?: string
  triggerClassName?: string
  disabled?: boolean
}) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const actions = useMemo(() => sections.flatMap((section) => section.actions), [sections])
  const enabledIndexes = useMemo(
    () => actions.map((action, index) => (action.disabled ? -1 : index)).filter((i) => i >= 0),
    [actions],
  )

  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const gap = 6
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const openDown = spaceBelow >= 240 || spaceBelow >= spaceAbove
    const left = Math.max(margin, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - margin))
    setPosition({
      left,
      top: openDown ? rect.bottom + gap : undefined,
      bottom: openDown ? undefined : window.innerHeight - rect.top + gap,
      maxHeight: Math.max(200, openDown ? spaceBelow : spaceAbove),
    })
  }, [])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    setActiveIndex(-1)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onViewportChange = () => place()
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open, place, close])

  useEffect(() => {
    if (!open) return
    if (activeIndex < 0) {
      setActiveIndex(enabledIndexes[0] ?? -1)
      return
    }
    itemRefs.current[activeIndex]?.focus()
  }, [open, activeIndex, enabledIndexes])

  function moveFocus(direction: 1 | -1) {
    if (!enabledIndexes.length) return
    const current = enabledIndexes.indexOf(activeIndex)
    const next = current < 0 ? 0 : (current + direction + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[next])
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(enabledIndexes[0] ?? -1)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  let renderIndex = -1

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'inline-flex h-11 items-center justify-center rounded-lg border border-transparent text-ink-secondary transition-colors hover:border-border hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40',
          triggerLabel ? 'min-w-11 gap-1 px-3 text-sm font-medium' : 'w-11',
          open && 'border-border bg-surface-alt text-ink-primary',
          triggerClassName,
        )}
      >
        {triggerLabel ? <span>{triggerLabel}</span> : null}
        <Icon name="more_vert" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: MENU_WIDTH,
                maxHeight: position.maxHeight,
              }}
              className="z-[80] overflow-y-auto rounded-xl border border-border bg-canvas p-1.5 shadow-float"
            >
              {sections.map((section, sectionIndex) => (
                <div
                  key={section.key}
                  role="group"
                  aria-label={section.label}
                  className={cn(sectionIndex > 0 && 'mt-1 border-t border-border pt-1')}
                >
                  {section.label ? (
                    <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                      {section.label}
                    </p>
                  ) : null}
                  {section.actions.map((action) => {
                    renderIndex += 1
                    const index = renderIndex
                    return (
                      <button
                        key={action.key}
                        ref={(node) => {
                          itemRefs.current[index] = node
                        }}
                        type="button"
                        role="menuitem"
                        tabIndex={index === activeIndex ? 0 : -1}
                        disabled={action.disabled}
                        title={action.hint}
                        onClick={() => {
                          close(false)
                          action.onSelect()
                        }}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors',
                          action.tone === 'danger' ? 'text-error' : 'text-ink-primary',
                          action.disabled
                            ? 'cursor-not-allowed opacity-40'
                            : action.tone === 'danger'
                              ? 'hover:bg-error-container/60'
                              : 'hover:bg-surface-alt',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                        )}
                      >
                        {action.icon ? <Icon name={action.icon} className="!text-[18px] opacity-70" /> : null}
                        <span className="flex-1">{action.label}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Beginner: 'bg-[#CD7F32]/15 text-[#8B5A2B] border-[#CD7F32]/30',
    Rising: 'bg-slate-200 text-slate-700 border-slate-300',
    Trusted: 'bg-sky-100 text-sky-800 border-sky-200',
    Expert: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    Elite: 'bg-amber-100 text-amber-900 border-amber-300',
    Master: 'bg-violet-100 text-violet-900 border-violet-300',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.05em] border',
        map[level] ?? map.Beginner,
      )}
    >
      <Icon name="workspace_premium" className="!text-[14px]" filled />
      {level}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-colors p-0.5',
        checked ? 'bg-primary' : 'bg-border-strong',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'block w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export function TrustGauge({
  score,
  size = 40,
}: {
  score: number
  size?: number
}) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color =
    score >= 85 ? 'text-trust-high' : score >= 70 ? 'text-trust-mid' : 'text-trust-low'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-surface-container-high"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className="absolute text-[10px] font-bold tabular-nums text-ink-primary">{score}</span>
    </div>
  )
}

export function Sparkline({
  points,
  colorClass = 'text-primary',
}: {
  points: number[]
  colorClass?: string
}) {
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 40 - ((p - min) / range) * 35
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
  return (
    <svg className={cn('w-full h-10 opacity-70', colorClass)} viewBox="0 0 100 40" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function KpiCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  spark,
  accent = 'primary',
  to,
  onClick,
}: {
  label: string
  value: string | number
  icon: string
  trend?: number
  trendLabel?: string
  spark?: number[]
  accent?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  /** Drill-down destination — makes the entire card a navigable control. */
  to?: string
  onClick?: () => void
}) {
  const accents = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    tertiary: 'bg-tertiary/10 text-tertiary',
    danger: 'bg-error-container text-error',
  }
  const body = (
    <>
      <div className="flex justify-between items-start">
        <div className={cn('p-2 rounded-lg', accents[accent])}>
          <Icon name={icon} />
        </div>
        <div className="flex items-center gap-2">
          {typeof trend === 'number' ? (
            <span
              className={cn(
                'text-[11px] font-semibold flex items-center gap-0.5',
                trend >= 0 ? 'text-trust-high' : 'text-trust-mid',
              )}
            >
              {trend >= 0 ? '+' : ''}
              {trend}%
              <Icon name={trend >= 0 ? 'trending_up' : 'trending_down'} className="!text-[14px]" />
            </span>
          ) : trendLabel ? (
            <span className="text-[11px] font-semibold text-error">{trendLabel}</span>
          ) : null}
          {to || onClick ? (
            <Icon name="chevron_right" className="!text-[20px] text-ink-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[13px] font-medium text-ink-secondary uppercase tracking-tight">{label}</p>
        <h3 className="text-[32px] font-semibold tracking-[-0.04em] text-ink-primary tabular-nums mt-1">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </h3>
      </div>
      {spark ? (
        <div className="mt-4">
          <Sparkline
            points={spark}
            colorClass={
              accent === 'secondary'
                ? 'text-secondary'
                : accent === 'tertiary'
                  ? 'text-tertiary'
                  : accent === 'danger'
                    ? 'text-error'
                    : 'text-primary'
            }
          />
        </div>
      ) : null}
    </>
  )

  const shellClass =
    'p-6 flex flex-col justify-between min-h-[140px] group transition hover:border-primary/30 hover:shadow-sm focus-within:ring-2 focus-within:ring-primary/25'

  if (to) {
    return (
      <Link
        to={to}
        aria-label={`Open ${label}`}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Surface className={shellClass}>{body}</Surface>
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={`Open ${label}`} className="block w-full text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <Surface className={shellClass}>{body}</Surface>
      </button>
    )
  }

  return <Surface className={shellClass}>{body}</Surface>
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-secondary py-8 text-center">{children}</p>
}
