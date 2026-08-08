import { useParams } from 'react-router-dom'
import { ChatThread, ConversationInbox } from '@fixnow/shared'

export function AdminMessagesPage() {
  const { id } = useParams()

  if (id) {
    return (
      <div className="space-y-4">
        <ChatThread
          conversationId={id}
          readOnly
          backHref="/admin/messages"
          title="Conversation monitor"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ConversationInbox basePath="/admin/messages" heading="Messaging monitor" />
      <p className="text-sm text-ink-muted">Admins have read-only access. Reopen closed chats via API if needed.</p>
    </div>
  )
}
