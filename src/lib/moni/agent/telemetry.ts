import { createMoniServiceRoleClient } from '@/lib/moni/db'
import type { MoniRuntimeContext } from '@/lib/moni/agent/runtime-types'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

export const MONI_AGENT_PROMPT_VERSION = 'moni-agent-sdk-v2.1'

export function extractRunUsage(result: any) {
  const usage = result?.state?.usage || result?.runContext?.usage || {}
  const requestUsageEntries = Array.isArray(usage.requestUsageEntries)
    ? usage.requestUsageEntries.map((entry: any) => ({
        endpoint: entry?.endpoint || null,
        input_tokens: Number(entry?.inputTokens || 0),
        output_tokens: Number(entry?.outputTokens || 0),
        total_tokens: Number(entry?.totalTokens || 0),
      }))
    : []
  return {
    requests: Number(usage.requests || requestUsageEntries.length || 0),
    inputTokens: Number(usage.inputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
    totalTokens: Number(usage.totalTokens || 0),
    requestUsageEntries,
  }
}

export async function markAgentRunCompleted(args: {
  supabase: SupabaseClient
  context: MoniRuntimeContext
  result: any
  latencyMs: number
  responseId?: string
  stepCount: number
}) {
  const { supabase, context, result, latencyMs, responseId, stepCount } = args
  const usage = extractRunUsage(result)
  const { error } = await supabase
    .from('moni_ai_agent_runs')
    .update({
      status: 'COMPLETED',
      step_count: stepCount,
      tool_call_count: context.toolCallCount,
      request_count: usage.requests,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      latency_ms: Math.max(0, Math.trunc(latencyMs)),
      validation_status: 'PASSED',
      prompt_version: MONI_AGENT_PROMPT_VERSION,
      memory_version: context.threadMemory.memoryVersion,
      usage,
      finished_at: new Date().toISOString(),
      metadata: {
        runtime: 'MONI_AGENT_SDK_V2',
        prompt_version: MONI_AGENT_PROMPT_VERSION,
        page: context.page,
        user_login_id: context.session.loginId,
        user_role: context.session.role,
        tools_used: [...new Set(context.toolsUsed)],
        response_id: responseId || null,
        output_validation: 'PASSED',
        pmo_event_ids: context.pmoEventIds,
        memory_version: context.threadMemory.memoryVersion,
      },
    })
    .eq('id', context.agentRunId)
  if (error) throw new Error(error.message)
  return usage
}

export async function markAgentRunFailed(args: {
  supabase: SupabaseClient
  context: MoniRuntimeContext
  message: string
  latencyMs: number
  validationFailed?: boolean
}) {
  const { supabase, context, message, latencyMs, validationFailed } = args
  const { error } = await supabase
    .from('moni_ai_agent_runs')
    .update({
      status: 'FAILED',
      step_count: Math.min(8, context.toolCallCount + 1),
      tool_call_count: context.toolCallCount,
      latency_ms: Math.max(0, Math.trunc(latencyMs)),
      validation_status: validationFailed ? 'FAILED' : 'NOT_APPLICABLE',
      prompt_version: MONI_AGENT_PROMPT_VERSION,
      memory_version: context.threadMemory.memoryVersion,
      error_message: message,
      finished_at: new Date().toISOString(),
      metadata: {
        runtime: 'MONI_AGENT_SDK_V2',
        prompt_version: MONI_AGENT_PROMPT_VERSION,
        tools_used: [...new Set(context.toolsUsed)],
        pmo_event_ids: context.pmoEventIds,
        memory_version: context.threadMemory.memoryVersion,
      },
    })
    .eq('id', context.agentRunId)
  if (error) throw new Error(error.message)
}
