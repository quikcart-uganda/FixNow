import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { AiLocalPrefs, AiMediaCapabilities, AiAttachment } from './types'
import type { VoicePhase } from './useAiVoice'

type AiComposerProps = {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  sending?: boolean
  placeholder: string
  capabilities: AiMediaCapabilities
  prefs: AiLocalPrefs
  attachments: AiAttachment[]
  onRemoveAttachment: (id: string) => void
  onPickGallery: () => void
  onPickCamera: () => void
  onPickFiles: (files: FileList | File[]) => void
  voicePhase: VoicePhase
  voiceTranscript: string
  voiceDurationSec: number
  voiceLevels?: number[]
  voiceSlideOffset?: number
  voiceWillCancel?: boolean
  onVoicePointerDown: (clientX: number) => void
  onVoicePointerMove: (clientX: number) => void
  onVoicePointerUp: () => void
  onCancelVoice: () => void
  attachmentError?: string | null
  voiceError?: string | null
  dragDropEnabled?: boolean
}

function formatTimer(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function Waveform({ levels, danger }: { levels: number[]; danger?: boolean }) {
  const bars = levels.length ? levels : Array.from({ length: 16 }, () => 0.2)
  return (
    <div className="fixnow-ai-waveform flex h-8 flex-1 items-center gap-[3px]" aria-hidden="true">
      {bars.map((level, i) => (
        <span
          key={i}
          className={`fixnow-ai-wave-bar inline-block w-[3px] rounded-full ${danger ? 'bg-error' : 'bg-primary'}`}
          style={{ height: `${Math.round(level * 100)}%`, minHeight: '12%' }}
        />
      ))}
    </div>
  )
}

function AttachmentPreview({
  attachments,
  onRemove,
}: {
  attachments: AiAttachment[]
  onRemove: (id: string) => void
}) {
  if (!attachments.length) return null
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-container-low"
        >
          {att.kind === 'image' && (att.previewUrl || att.url) ? (
            <img src={att.previewUrl || att.url} alt={att.name} className="h-16 w-16 object-cover" />
          ) : (
            <div className="flex h-16 w-28 items-center gap-1 px-2 text-[11px] font-medium text-on-surface">
              <span className="material-symbols-outlined text-sm">attach_file</span>
              <span className="truncate">{att.name}</span>
            </div>
          )}
          {att.uploading ? (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/20">
              <div className="h-full bg-primary transition-all" style={{ width: `${att.progress ?? 20}%` }} />
            </div>
          ) : null}
          {att.error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-error/80 text-[10px] font-bold text-white">
              Failed
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-primary/70 text-white"
            aria-label={`Remove ${att.name}`}
          >
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}

export function AiComposer({
  draft,
  onDraftChange,
  onSend,
  disabled,
  sending,
  placeholder,
  capabilities,
  prefs,
  attachments,
  onRemoveAttachment,
  onPickGallery,
  onPickCamera,
  onPickFiles,
  voicePhase,
  voiceTranscript,
  voiceDurationSec,
  voiceLevels = [],
  voiceSlideOffset = 0,
  voiceWillCancel = false,
  onVoicePointerDown,
  onVoicePointerMove,
  onVoicePointerUp,
  onCancelVoice,
  attachmentError,
  voiceError,
  dragDropEnabled,
}: AiComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const micActiveRef = useRef(false)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draft])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const recording = voicePhase === 'recording' || voicePhase === 'canceling'
  const transcribing = voicePhase === 'transcribing'
  const hasText = draft.trim().length > 0
  const hasReadyAttachment = attachments.some((a) => a.url && !a.error)
  const canSend =
    !disabled &&
    !sending &&
    !recording &&
    !transcribing &&
    !attachments.some((a) => a.uploading) &&
    (hasText || hasReadyAttachment)

  const showSendInsteadOfMic = hasText || hasReadyAttachment
  const showCamera = prefs.showCamera && capabilities.camera
  const showMic = prefs.showMic && capabilities.voiceRecord
  const cameraDisabled = disabled || !capabilities.camera
  const micDisabled = disabled || !capabilities.voiceRecord || transcribing

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (canSend) onSend()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!capabilities.pasteImages || disabled) return
    const items = Array.from(e.clipboardData?.items ?? [])
    const files = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => !!f)
    if (files.length) {
      e.preventDefault()
      onPickFiles(files)
    }
  }

  const onDrop = (e: DragEvent) => {
    if (!dragDropEnabled || !capabilities.dragDrop) return
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) onPickFiles(e.dataTransfer.files)
  }

  const onMicPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (micDisabled || showSendInsteadOfMic) return
    e.preventDefault()
    micActiveRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onVoicePointerDown(e.clientX)
  }

  const onMicPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!micActiveRef.current) return
    onVoicePointerMove(e.clientX)
  }

  const onMicPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!micActiveRef.current) return
    micActiveRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    onVoicePointerUp()
  }

  return (
    <div
      className={`fixnow-ai-composer border-t border-border-subtle/80 bg-canvas-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-sm ${
        dragging ? 'ring-2 ring-inset ring-primary/30' : ''
      }`}
      onDragEnter={(e) => {
        if (!dragDropEnabled || !capabilities.dragDrop) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!dragDropEnabled || !capabilities.dragDrop) return
        e.preventDefault()
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <AttachmentPreview attachments={attachments} onRemove={onRemoveAttachment} />

      {recording || transcribing ? (
        <div
          className={`mb-2 rounded-2xl border px-3 py-2.5 ${
            voiceWillCancel
              ? 'border-error/30 bg-error/[0.06]'
              : 'border-primary/20 bg-primary/[0.04]'
          }`}
          style={recording ? { transform: `translateX(${Math.max(voiceSlideOffset, -120)}px)` } : undefined}
        >
          {transcribing ? (
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined animate-pulse text-primary">graphic_eq</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface">Transcribing voice note…</p>
                <p className="truncate text-[11px] text-on-surface-variant">
                  {voiceTranscript || 'Turning your recording into text'}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancelVoice}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`fixnow-ai-rec-dot h-2.5 w-2.5 shrink-0 rounded-full ${
                    voiceWillCancel ? 'bg-error' : 'bg-error'
                  }`}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold tabular-nums text-on-surface">
                  {voiceWillCancel ? 'Release to cancel' : `Recording · ${formatTimer(voiceDurationSec)}`}
                </p>
                <Waveform levels={voiceLevels} danger={voiceWillCancel} />
              </div>
              <p className="text-[11px] text-on-surface-variant">
                {voiceWillCancel
                  ? 'Slide back right to keep recording'
                  : 'Slide left to cancel · release to send'}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {(attachmentError || voiceError) && (
        <p className="mb-2 px-1 text-[11px] font-medium text-error">{attachmentError || voiceError}</p>
      )}

      {voicePhase === 'denied' && voiceError ? (
        <p className="mb-2 rounded-xl bg-surface-container-low px-3 py-2 text-[11px] text-on-surface-variant">
          {voiceError}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="relative flex items-end gap-1.5">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={disabled || recording || transcribing}
            onClick={() => setMenuOpen((v) => !v)}
            className="fixnow-ai-icon-btn"
            aria-label="Attachments"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+0.4rem)] left-0 z-10 min-w-[11rem] overflow-hidden rounded-xl border border-border-subtle bg-canvas-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!capabilities.images || disabled}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                onClick={() => {
                  setMenuOpen(false)
                  onPickGallery()
                }}
              >
                <span className="material-symbols-outlined text-[1.1rem]">image</span>
                Photo library
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={cameraDisabled}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                onClick={() => {
                  setMenuOpen(false)
                  onPickCamera()
                }}
              >
                <span className="material-symbols-outlined text-[1.1rem]">photo_camera</span>
                Camera
                {!capabilities.camera ? (
                  <span className="ml-auto text-[10px] text-on-surface-variant">N/A</span>
                ) : null}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!capabilities.fileAttach || disabled}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                onClick={() => {
                  setMenuOpen(false)
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/*,.pdf,.txt,.doc,.docx'
                  input.multiple = true
                  input.onchange = () => {
                    if (input.files?.length) onPickFiles(input.files)
                  }
                  input.click()
                }}
              >
                <span className="material-symbols-outlined text-[1.1rem]">attach_file</span>
                File
              </button>
            </div>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value.slice(0, 2000))}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled || recording || transcribing}
          placeholder={dragging ? 'Drop images here…' : placeholder}
          rows={1}
          className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-2xl border border-border-subtle bg-surface-container-low px-3.5 py-2.5 text-base leading-snug text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60 sm:text-sm"
          aria-label={placeholder}
        />

        {showCamera ? (
          <button
            type="button"
            disabled={cameraDisabled || recording || transcribing}
            onClick={onPickCamera}
            className="fixnow-ai-icon-btn"
            aria-label="Take photo"
            title={capabilities.camera ? 'Camera' : 'Camera unavailable'}
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
        ) : null}

        {showSendInsteadOfMic ? (
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition enabled:active:scale-95 disabled:opacity-40"
            aria-label="Send message"
          >
            <span className="material-symbols-outlined text-[1.25rem]">
              {sending ? 'hourglass_top' : 'send'}
            </span>
          </button>
        ) : showMic ? (
          <button
            type="button"
            disabled={micDisabled}
            onPointerDown={onMicPointerDown}
            onPointerMove={onMicPointerMove}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerUp}
            className={`fixnow-ai-icon-btn touch-none select-none ${
              recording ? 'bg-error/10 text-error ring-2 ring-error/30' : ''
            }`}
            aria-label="Hold to record voice note"
            title={
              capabilities.voiceRecord
                ? 'Hold to record · slide left to cancel'
                : 'Microphone unavailable'
            }
          >
            <span className="material-symbols-outlined">
              {transcribing ? 'hourglass_top' : voiceWillCancel ? 'close' : 'mic'}
            </span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition enabled:active:scale-95 disabled:opacity-40"
            aria-label="Send message"
          >
            <span className="material-symbols-outlined text-[1.25rem]">send</span>
          </button>
        )}
      </form>
    </div>
  )
}
