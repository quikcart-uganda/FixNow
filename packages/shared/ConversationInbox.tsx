import { Link } from 'react-router-dom'
import { messagesApi, SOCKET_EVENTS } from '@fixnow/api'
import { useAsync, useRealtimeReload } from '@fixnow/hooks'
import { safeArray, safeObject, safeString, safeNumber } from '@fixnow/utils'
import { AsyncStateView } from './AsyncStateView'

type Row = {
  id: string
  title: string
  preview: string
  unread: number
  locked: boolean
  otherName: string
}

export function ConversationInbox({
  basePath,
  heading = 'Messages',
  emptyTitle = 'No conversations yet',
  emptyHint = 'A chat opens automatically when a technician is assigned to your job.',
  hideHeading = false,
}: {
  basePath: string
  heading?: string
  emptyTitle?: string
  emptyHint?: string
  /** When true, omit the local H1 — parent shell owns the page title. */
  hideHeading?: boolean
}) {
  const query = useAsync(async () => {
    const res = await messagesApi.listConversations({ limit: 50 })
    return safeArray(res.data?.items).map((item) => {
      const row = safeObject(item)
      const c = safeObject(row.conversation)
      const participants = safeArray<Record<string, unknown>>(row.participants)
      return {
        id: safeString(c._id ?? c.id),
        title: safeString(c.title, 'Conversation'),
        preview: safeString(c.lastMessagePreview, 'No messages yet'),
        unread: safeNumber(row.unreadCount),
        locked: Boolean(c.isLocked),
        otherName: safeString(participants[0]?.fullName, 'Participant'),
      } satisfies Row
    })
  }, [], { cacheKey: 'conversations.v1' })

  useRealtimeReload(
    () => void query.reload(),
    [SOCKET_EVENTS.MESSAGE_NEW, SOCKET_EVENTS.CONVERSATION_UPDATED, SOCKET_EVENTS.MESSAGE_READ],
  )

  return (
    <div className="space-y-6">
      {hideHeading ? null : (
        <div>
          <h1 className="text-headline text-on-surface">{heading}</h1>
          <p className="text-body text-on-surface-variant">Job conversations with secure realtime delivery</p>
        </div>
      )}

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
      >
        <div className="space-y-3">
          {safeArray<Row>(query.data).map((c) => (
            <Link
              key={c.id}
              to={`${basePath}/${c.id}`}
              className="flex items-start justify-between rounded-2xl border border-border-subtle bg-canvas-white p-4 transition hover:bg-surface-container-low"
            >
              <div>
                <p className="font-semibold text-on-surface">{c.title}</p>
                <p className="text-sm text-on-surface-variant">{c.otherName}</p>
                <p className="mt-1 line-clamp-1 text-sm text-on-surface-variant">{c.preview}</p>
                {c.locked ? <span className="mt-2 inline-block text-xs font-semibold text-warning">Closed</span> : null}
              </div>
              {c.unread > 0 ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </AsyncStateView>
    </div>
  )
}
