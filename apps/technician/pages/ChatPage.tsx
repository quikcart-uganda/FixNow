import { useParams } from 'react-router-dom'
import { ChatThread } from '@fixnow/shared'

export function ChatPage() {
  const { id = '' } = useParams()
  return (
    <div className="animate-fade-up flex min-h-[calc(100dvh-4rem)] flex-col">
      <ChatThread conversationId={id} backHref="/technician/messages" title="Customer chat" />
    </div>
  )
}
