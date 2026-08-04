import { createMoniServiceRoleClient } from '@/lib/moni/db'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

type ClaimRow = {
  request_id: string
  claim_status: 'CLAIMED' | 'REPLAY' | 'IN_PROGRESS' | 'BUSY' | 'DUPLICATE_FAILED'
  request_status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  response_json: Record<string, unknown> | null
  error_message: string | null
}

export async function claimAgentRequest(args: {
  supabase: SupabaseClient
  businessId: string
  threadId: string
  clientRequestId: string
  ttlSeconds?: number
}) {
  const { data, error } = await args.supabase.rpc('moni_claim_agent_request', {
    p_business_id: args.businessId,
    p_thread_id: args.threadId,
    p_client_request_id: args.clientRequestId,
    p_ttl_seconds: Math.max(30, Math.min(300, args.ttlSeconds || 120)),
  })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null
  if (!row?.request_id || !row.claim_status) throw new Error('MONI Agent 요청 잠금 결과를 확인할 수 없습니다.')
  return row
}

export async function finishAgentRequest(args: {
  supabase: SupabaseClient
  requestId: string
  status: 'COMPLETED' | 'FAILED'
  agentRunId?: string | null
  responseJson?: Record<string, unknown> | null
  errorMessage?: string | null
}) {
  const { error } = await args.supabase.rpc('moni_finish_agent_request', {
    p_request_id: args.requestId,
    p_status: args.status,
    p_agent_run_id: args.agentRunId || null,
    p_response_json: args.responseJson || null,
    p_error_message: args.errorMessage || null,
  })
  if (error) throw new Error(error.message)
}
