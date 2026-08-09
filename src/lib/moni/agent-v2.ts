import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'

/**
 * Legacy import-compatibility shim.
 *
 * MONI production Agent execution lives in `agent/sdk-runtime.ts` and
 * read-only data execution lives in `agent/tool-backend.ts`.
 *
 * Do not add runtime logic, database queries, provider calls, or tool schemas
 * back into this file. It remains only so older type-only imports can migrate
 * without reintroducing the retired Agent V1 runtime.
 */
export type {
  MoniAgentPageContext,
  MoniAgentSession,
  MoniAgentToolContext,
} from '@/lib/moni/agent/context-types'

export type MoniAgentHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type RunMoniAgentInput = {
  apiKey: string
  model: string
  history: MoniAgentHistoryMessage[]
  currentContent: Record<string, unknown>[]
  context: MoniAgentToolContext
}

export type RunMoniAgentResult = {
  text: string
  agentRunId: string
  stepCount: number
  toolCallCount: number
  toolsUsed: string[]
  responseId?: string
}
