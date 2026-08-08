import { useState } from 'react'
import { cn } from '@fixnow/utils'
import { Icon } from './ui'

type Props = {
  value?: string | null
  /** Accessible name for the identifier type, e.g. "Job reference". */
  label?: string
  /** When set, tapping the ID opens details; the copy button still copies. */
  onOpen?: () => void
  className?: string
  /** Visual density. */
  size?: 'sm' | 'md'
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

/**
 * Single-line, monospace identifier with copy affordance.
 * Never wraps — scrolls horizontally or truncates; full value always copyable.
 */
export function CopyableId({
  value,
  label = 'Identifier',
  onOpen,
  className,
  size = 'sm',
}: Props) {
  const [copied, setCopied] = useState(false)
  const text = String(value || '').trim()

  if (!text) {
    return <span className={cn('text-xs text-ink-muted', className)}>—</span>
  }

  async function copy(e?: { stopPropagation?: () => void; preventDefault?: () => void }) {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    const ok = await writeClipboard(text)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function openOrCopy(e: { stopPropagation: () => void; preventDefault: () => void }) {
    e.stopPropagation()
    e.preventDefault()
    if (onOpen) onOpen()
    else void copy()
  }

  return (
    <span
      className={cn('inline-flex max-w-full min-w-0 items-center gap-1', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={text}
        aria-label={onOpen ? `Open details for ${label} ${text}` : `Copy ${label} ${text}`}
        onClick={openOrCopy}
        className={cn(
          'min-w-0 max-w-full overflow-x-auto whitespace-nowrap rounded px-0.5 text-left font-mono font-semibold tabular-nums text-primary',
          'hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          size === 'sm' ? 'text-[11px] leading-5 sm:text-xs' : 'text-xs leading-5 sm:text-sm',
        )}
      >
        {text}
      </button>
      <button
        type="button"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        title={copied ? 'Copied' : `Copy ${label}`}
        onClick={(e) => void copy(e)}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors',
          'hover:bg-primary/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        )}
      >
        <Icon name={copied ? 'check' : 'content_copy'} className="!text-[14px]" />
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </span>
  )
}
