import { Link } from 'react-router-dom'
import { formatAiTime } from './roleCopy'
import type { AiTurn } from './types'

function AttachmentStrip({ turn }: { turn: AiTurn }) {
  if (!turn.attachments?.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {turn.attachments.map((att) =>
        att.kind === 'image' && (att.previewUrl || att.url) ? (
          <a
            key={att.id}
            href={att.url || att.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-white/20"
          >
            <img
              src={att.previewUrl || att.url}
              alt={att.name}
              className="h-28 w-28 object-cover"
              loading="lazy"
            />
          </a>
        ) : (
          <span
            key={att.id}
            className="inline-flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1 text-[11px] font-medium"
          >
            <span className="material-symbols-outlined text-[14px]">attach_file</span>
            {att.name}
          </span>
        ),
      )}
    </div>
  )
}

export function AiMessageBubble({
  turn,
  onSendSuggestion,
  onNavigate,
  onConfirmAction,
  onCancelAction,
  actionBusyId,
}: {
  turn: AiTurn
  onSendSuggestion?: (text: string) => void
  onNavigate?: () => void
  onConfirmAction?: (actionId: string) => void
  onCancelAction?: (actionId: string) => void
  actionBusyId?: string | null
}) {
  const mine = turn.sender === 'user'
  return (
    <div
      className={`fixnow-ai-turn flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
      data-sender={turn.sender}
    >
      {!mine ? (
        <div
          className="fixnow-ai-avatar mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-[1rem] text-white">auto_awesome</span>
        </div>
      ) : null}

      <div className={`max-w-[min(92%,28rem)] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            mine
              ? 'rounded-br-md bg-primary text-white'
              : 'rounded-bl-md bg-surface-container-high text-on-surface'
          }`}
        >
          {turn.text ? <p className="whitespace-pre-wrap">{turn.text}</p> : null}
          <AttachmentStrip turn={turn} />

          {turn.tools?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {turn.tools.map((tool) => (
                <span
                  key={`${turn.id}-${tool.tool}`}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    mine ? 'bg-white/20 text-white' : 'bg-canvas-white/80 text-on-surface-variant'
                  }`}
                >
                  {tool.label || tool.tool}
                </span>
              ))}
            </div>
          ) : null}

          {turn.pendingActions?.length ? (
            <div className="mt-3 space-y-2">
              {turn.pendingActions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-xl border border-primary/20 bg-canvas-white/90 p-3 text-on-surface"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{action.title}</p>
                  <p className="mt-1 text-[12px] leading-snug text-on-surface-variant">{action.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusyId === action.id}
                      className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                      onClick={() => onConfirmAction?.(action.id)}
                    >
                      {actionBusyId === action.id ? 'Working…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      disabled={actionBusyId === action.id}
                      className="rounded-full border border-border-subtle px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant"
                      onClick={() => onCancelAction?.(action.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {turn.deepLinks?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {turn.deepLinks.map((link) => (
                <Link
                  key={`${turn.id}-${link.href}`}
                  to={link.href}
                  className="rounded-full border border-border-subtle bg-canvas-white px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                  onClick={onNavigate}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}

          {turn.suggestions?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {turn.suggestions.map((suggestion) => (
                <button
                  key={`${turn.id}-${suggestion}`}
                  type="button"
                  onClick={() => onSendSuggestion?.(suggestion)}
                  className="rounded-full border border-border-subtle bg-canvas-white px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <time
          className="mt-1 px-1 text-[10px] font-medium text-on-surface-variant/80"
          dateTime={turn.createdAt}
        >
          {formatAiTime(turn.createdAt)}
          {turn.inputMode === 'voice' ? ' · Voice' : turn.inputMode === 'image' ? ' · Photo' : ''}
        </time>
      </div>
    </div>
  )
}

export function AiTypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-end gap-2" aria-live="polite" aria-label={label || 'Assistant is thinking'}>
      <div className="fixnow-ai-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <span className="material-symbols-outlined text-[1rem] text-white">auto_awesome</span>
      </div>
      <div className="rounded-2xl rounded-bl-md bg-surface-container-high px-4 py-3">
        {label ? (
          <p className="text-xs font-medium text-on-surface-variant">{label}</p>
        ) : (
          <div className="fixnow-ai-typing flex items-center gap-1">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  )
}
