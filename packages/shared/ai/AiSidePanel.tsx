import { formatAiDateTime } from './roleCopy'
import type { AiConversationSummary } from './types'

type AiSidePanelProps = {
  open: boolean
  onClose: () => void
  conversations: AiConversationSummary[]
  activeId?: string
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onClearAll: () => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  onOpenPrivacy: () => void
  desktop?: boolean
}

export function AiSidePanel({
  open,
  onClose,
  conversations,
  activeId,
  onNew,
  onOpen,
  onDelete,
  onTogglePin,
  onClearAll,
  onOpenSettings,
  onOpenHelp,
  onOpenPrivacy,
  desktop,
}: AiSidePanelProps) {
  const pinned = conversations.filter((c) => c.pinned)
  const recent = conversations.filter((c) => !c.pinned)

  const body = (
    <aside
      className={`fixnow-ai-sidebar flex h-full w-[min(100%,18rem)] flex-col border-r border-border-subtle bg-surface-container-low ${
        desktop ? '' : 'shadow-xl'
      }`}
      aria-label="Conversations"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-3">
        <h3 className="text-sm font-semibold text-on-surface">Chats</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white"
          >
            New
          </button>
          {!desktop ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
              aria-label="Close panel"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
              aria-label="Collapse panel"
              title="Collapse"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {pinned.length ? (
          <section className="mb-3">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
              Pinned
            </p>
            <ul className="space-y-0.5">
              {pinned.map((c) => (
                <ConversationRow
                  key={c.id}
                  item={c}
                  active={c.id === activeId}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Recent
          </p>
          {recent.length === 0 && pinned.length === 0 ? (
            <p className="px-2 py-3 text-xs text-on-surface-variant">No conversations yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {recent.map((c) => (
                <ConversationRow
                  key={c.id}
                  item={c}
                  active={c.id === activeId}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-1 border-t border-border-subtle p-2">
        <SideAction icon="settings" label="Settings" onClick={onOpenSettings} />
        <SideAction icon="help" label="Help" onClick={onOpenHelp} />
        <SideAction icon="privacy_tip" label="Privacy" onClick={onOpenPrivacy} />
        <SideAction icon="delete_sweep" label="Clear history" onClick={onClearAll} danger />
      </div>
    </aside>
  )

  if (desktop) {
    return open ? body : null
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-20 flex">
      <button
        type="button"
        className="absolute inset-0 bg-ink-primary/35"
        aria-label="Close conversations"
        onClick={onClose}
      />
      <div className="fixnow-ai-sidebar-drawer relative h-full">{body}</div>
    </div>
  )
}

function SideAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
        danger ? 'text-error hover:bg-error/5' : 'text-on-surface-variant hover:bg-canvas-white hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined text-[1.05rem]">{icon}</span>
      {label}
    </button>
  )
}

function ConversationRow({
  item,
  active,
  onOpen,
  onDelete,
  onTogglePin,
}: {
  item: AiConversationSummary
  active: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
}) {
  return (
    <li>
      <div
        className={`group flex items-start gap-1 rounded-xl px-2 py-2 ${
          active ? 'bg-primary/10' : 'hover:bg-canvas-white'
        }`}
      >
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-xs font-semibold text-on-surface">{item.title}</p>
          {item.updatedAt ? (
            <p className="mt-0.5 text-[10px] text-on-surface-variant">{formatAiDateTime(item.updatedAt)}</p>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onTogglePin(item.id)}
          className="rounded p-0.5 text-on-surface-variant opacity-70 hover:text-primary group-hover:opacity-100"
          aria-label={item.pinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          <span className="material-symbols-outlined text-[1rem]">
            {item.pinned ? 'push_pin' : 'keep'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="rounded p-0.5 text-on-surface-variant opacity-70 hover:text-error group-hover:opacity-100"
          aria-label="Delete conversation"
        >
          <span className="material-symbols-outlined text-[1rem]">delete</span>
        </button>
      </div>
    </li>
  )
}
