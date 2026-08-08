import { useRef } from 'react'

type AiLandingProps = {
  title: string
  greetingTitle: string
  greetingBody: string
  starters: Array<{ id: string; label: string; prompt: string; icon: string }>
  quickActions: Array<{ id: string; label: string; icon: string; action: string }>
  onSendStarter: (prompt: string) => void
  onPrefill: (prompt: string) => void
  onQuickAction: (action: string) => void
  disabled?: boolean
}

function StarterTile({
  starter,
  disabled,
  onSend,
  onPrefill,
}: {
  starter: { id: string; label: string; prompt: string; icon: string }
  disabled?: boolean
  onSend: () => void
  onPrefill: () => void
}) {
  const longPressed = useRef(false)
  const timerRef = useRef<number | null>(null)

  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          onSend()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onPrefill()
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return
          longPressed.current = false
          timerRef.current = window.setTimeout(() => {
            longPressed.current = true
            onPrefill()
          }, 500)
        }}
        onPointerUp={() => {
          if (timerRef.current) window.clearTimeout(timerRef.current)
          timerRef.current = null
        }}
        onPointerLeave={() => {
          if (timerRef.current) window.clearTimeout(timerRef.current)
          timerRef.current = null
        }}
        className="fixnow-ai-starter group flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white px-3.5 py-3 text-left transition hover:border-primary/35 hover:bg-primary/[0.03] disabled:opacity-50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <span className="material-symbols-outlined text-[1.25rem]">{starter.icon}</span>
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface">{starter.label}</span>
        <span className="material-symbols-outlined text-on-surface-variant opacity-0 transition group-hover:opacity-100">
          arrow_forward
        </span>
      </button>
    </li>
  )
}

export function AiLanding({
  title,
  greetingTitle,
  greetingBody,
  starters,
  quickActions,
  onSendStarter,
  onPrefill,
  onQuickAction,
  disabled,
}: AiLandingProps) {
  return (
    <div className="fixnow-ai-landing flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-8 sm:px-8 sm:pt-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center text-center">
        <div
          className="fixnow-ai-mark mb-6 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full sm:mb-7 sm:h-[4.75rem] sm:w-[4.75rem]"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-[2.1rem] text-white sm:text-[2.35rem]">
            auto_awesome
          </span>
        </div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary/75">{title}</p>
        <h3 className="mt-2.5 text-[1.55rem] font-semibold leading-tight tracking-tight text-on-surface sm:text-[1.85rem]">
          {greetingTitle} <span aria-hidden="true">👋</span>
        </h3>
        <p className="mt-3.5 max-w-md text-[0.9375rem] leading-relaxed text-on-surface-variant sm:text-base">
          {greetingBody}
        </p>

        <ul className="mt-8 w-full space-y-2.5 text-left">
          {starters.map((starter) => (
            <StarterTile
              key={starter.id}
              starter={starter}
              disabled={disabled}
              onSend={() => onSendStarter(starter.prompt)}
              onPrefill={() => onPrefill(starter.prompt)}
            />
          ))}
        </ul>

        {quickActions.length ? (
          <div className="mt-7 flex w-full flex-wrap justify-center gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => onQuickAction(action.action)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-container-low/80 px-3.5 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-primary/30 hover:text-primary disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[1rem]">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
