import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'
import type { ThreadMemory, PinnedProjectContext } from '@/lib/moni/agent/memory'

export type MoniRuntimeContext = MoniAgentToolContext & {
  agentRunId: string
  toolCallCount: number
  toolsUsed: string[]
  pmoEventIds: string[]
  toolOutputs: Map<string, unknown[]>
  threadMemory: ThreadMemory
  pinnedProjectContext: PinnedProjectContext[]
}
