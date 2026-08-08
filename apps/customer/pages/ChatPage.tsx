import { useParams } from 'react-router-dom'
import { ChatThread } from '@fixnow/shared'

export function ChatPage() {
  const { id = '' } = useParams()
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col p-3 sm:p-4">
      <ChatThread conversationId={id} backHref="/customer/messages" title="Technician chat" />
    </div>
  )
}
