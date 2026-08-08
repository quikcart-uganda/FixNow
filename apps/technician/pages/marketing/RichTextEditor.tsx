import { useId, useRef } from 'react'
import { Icon } from '@fixnow/ui'

type ToolId = 'bullet' | 'numbered' | 'emphasis' | 'divider'

const TOOLS: Array<{ id: ToolId; icon: string; label: string }> = [
  { id: 'bullet', icon: 'format_list_bulleted', label: 'Bullet point' },
  { id: 'numbered', icon: 'format_list_numbered', label: 'Numbered point' },
  { id: 'emphasis', icon: 'bolt', label: 'Highlight line' },
  { id: 'divider', icon: 'horizontal_rule', label: 'Separator' },
]

/**
 * Structured text editor. Stores plain text (matching the backend contract and
 * avoiding stored HTML), while giving technicians formatting affordances and
 * live guidance.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  minLength,
  hint,
  rows = 6,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  maxLength: number
  minLength?: number
  hint?: string
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = useId()

  const insert = (tool: ToolId) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(start)
    const needsBreak = before.length > 0 && !before.endsWith('\n')

    const numberedCount = value.split('\n').filter((line) => /^\d+\./.test(line.trim())).length
    const token =
      tool === 'bullet'
        ? '• '
        : tool === 'numbered'
          ? `${numberedCount + 1}. `
          : tool === 'emphasis'
            ? '★ '
            : '—\n'

    const next = `${before}${needsBreak ? '\n' : ''}${token}${after}`.slice(0, maxLength)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const caret = Math.min(next.length, (before.length + (needsBreak ? 1 : 0) + token.length))
      el.setSelectionRange(caret, caret)
    })
  }

  const remaining = maxLength - value.length
  const tooShort = minLength != null && value.trim().length > 0 && value.trim().length < minLength

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-label text-on-surface-variant">
          {label}
        </label>
        <div className="flex gap-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => insert(tool.id)}
              title={tool.label}
              aria-label={tool.label}
              className="rounded-lg border border-border-subtle px-2 py-1 text-on-surface-variant transition hover:border-primary/50 hover:text-primary"
            >
              <Icon name={tool.icon} className="text-[16px]" />
            </button>
          ))}
        </div>
      </div>

      <textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-subtle bg-surface px-4 py-3 text-body text-on-surface outline-none transition focus:border-2 focus:border-primary"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={tooShort ? 'text-amber-700' : 'text-on-surface-variant'}>
          {tooShort ? `Add a bit more detail — at least ${minLength} characters.` : hint}
        </span>
        <span className={remaining < 50 ? 'text-amber-700' : 'text-outline'}>{remaining} left</span>
      </div>
    </div>
  )
}
