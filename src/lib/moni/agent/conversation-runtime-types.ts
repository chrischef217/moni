import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'
import type { PinnedProjectContext, ThreadMemory } from '@/lib/moni/agent/memory'

export type MoniConversationRuntimeContext = MoniAgentToolContext & {
  agentRunId: string
  toolCallCount: number
  toolsUsed: string[]
  toolOutputs: Map<string, unknown[]>
  threadMemory: ThreadMemory
  pinnedProjectContext: PinnedProjectContext[]
  currentUserText: string
  preexistingPendingConfirmationIds: Set<string>
}
