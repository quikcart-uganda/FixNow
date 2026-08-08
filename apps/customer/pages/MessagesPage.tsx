import { ConversationInbox } from '@fixnow/shared'

export function MessagesPage() {
  return (
    <div className="">
      <div className="p-4">
        <ConversationInbox basePath="/customer/messages" heading="Messages" />
      </div>
    </div>
  )
}
