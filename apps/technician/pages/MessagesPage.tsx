import { ConversationInbox } from '@fixnow/shared'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { planEmptyCopy } from '@technician/lib/planWorkspace'

export function MessagesPage() {
  const tier = usePlanWorkspaceTier()
  const empty = planEmptyCopy(tier, 'messages')

  return (
    <PlanWorkspaceShell page="messages">
      <ConversationInbox
        basePath="/technician/messages"
        hideHeading
        emptyTitle={empty.title}
        emptyHint={empty.hint}
      />
    </PlanWorkspaceShell>
  )
}
