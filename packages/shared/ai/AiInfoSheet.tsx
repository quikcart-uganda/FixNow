import type { AiLocalPrefs } from './types'

type SheetKind = 'settings' | 'help' | 'privacy' | null

export function AiInfoSheet({
  kind,
  onClose,
  prefs,
  onPrefsChange,
  helpNote,
  privacyNote,
}: {
  kind: SheetKind
  onClose: () => void
  prefs: AiLocalPrefs
  onPrefsChange: (next: AiLocalPrefs) => void
  helpNote: string
  privacyNote: string
}) {
  if (!kind) return null

  const title =
    kind === 'settings' ? 'Assistant settings' : kind === 'help' ? 'Help' : 'Privacy'

  return (
    <div className="absolute inset-0 z-30 flex justify-end">
      <button type="button" className="absolute inset-0 bg-ink-primary/35" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixnow-ai-sheet relative flex h-full w-full max-w-sm flex-col border-l border-border-subtle bg-canvas-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-on-surface-variant">
          {kind === 'settings' ? (
            <div className="space-y-4">
              <ToggleRow
                label="Show microphone"
                checked={prefs.showMic}
                onChange={(showMic) => onPrefsChange({ ...prefs, showMic })}
              />
              <ToggleRow
                label="Show camera"
                checked={prefs.showCamera}
                onChange={(showCamera) => onPrefsChange({ ...prefs, showCamera })}
              />
              <ToggleRow
                label="Compact composer"
                checked={prefs.compactComposer}
                onChange={(compactComposer) => onPrefsChange({ ...prefs, compactComposer })}
              />
              <p className="text-xs leading-relaxed">
                Unavailable device features stay disabled automatically. Emoji input uses your device keyboard.
              </p>
            </div>
          ) : null}
          {kind === 'help' ? <p className="leading-relaxed">{helpNote}</p> : null}
          {kind === 'privacy' ? <p className="leading-relaxed">{privacyNote}</p> : null}
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2.5">
      <span className="text-sm font-medium text-on-surface">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
    </label>
  )
}
