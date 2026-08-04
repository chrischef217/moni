import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runLiveEvalCase } from '@/lib/moni/agent/live-eval'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const DEFAULT_OPENAI_MODEL = 'gpt-5'
const RequestSchema = z.object({
  token: z.string().trim().min(32).max(256),
})

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '유효한 카나리 토큰이 필요합니다.' }, { status: 400 })
  }

  const supabase = createMoniServiceRoleClient()
  const tokenHash = hashToken(parsed.data.token)
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: pending, error: readError } = await supabase
    .from('moni_ai_eval_canary_requests')
    .select('id,case_id,status,expires_at,requested_by')
    .eq('business_id', BUSINESS_ID)
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (readError) {
    console.error('[MONI_AGENT_CANARY_LOOKUP_ERROR]', { message: readError.message, occurred_at: nowIso })
    return NextResponse.json({ ok: false, error: '카나리 요청 확인에 실패했습니다.' }, { status: 500 })
  }
  if (!pending) {
    return NextResponse.json({ ok: false, error: '유효하지 않거나 만료된 카나리 요청입니다.' }, { status: 401 })
  }
  if (pending.status !== 'PENDING') {
    return NextResponse.json({ ok: false, error: '이미 사용된 카나리 요청입니다.' }, { status: 409 })
  }
  if (Date.parse(pending.expires_at) <= now.getTime()) {
    await supabase
      .from('moni_ai_eval_canary_requests')
      .update({ status: 'EXPIRED', finished_at: nowIso, updated_at: nowIso })
      .eq('id', pending.id)
      .eq('status', 'PENDING')
    return NextResponse.json({ ok: false, error: '만료된 카나리 요청입니다.' }, { status: 410 })
  }

  const { data: claimed, error: claimError } = await supabase
    .from('moni_ai_eval_canary_requests')
    .update({ status: 'RUNNING', started_at: nowIso, updated_at: nowIso })
    .eq('id', pending.id)
    .eq('status', 'PENDING')
    .select('id,case_id,requested_by')
    .maybeSingle()

  if (claimError) {
    console.error('[MONI_AGENT_CANARY_CLAIM_ERROR]', { message: claimError.message, occurred_at: nowIso })
    return NextResponse.json({ ok: false, error: '카나리 요청 잠금에 실패했습니다.' }, { status: 500 })
  }
  if (!claimed) {
    return NextResponse.json({ ok: false, error: '이미 실행 중이거나 사용된 카나리 요청입니다.' }, { status: 409 })
  }

  try {
    const result = await runLiveEvalCase({
      caseId: claimed.case_id,
      model: String(process.env.OPENAI_MONI_MODEL || DEFAULT_OPENAI_MODEL).trim(),
      triggeredBy: claimed.requested_by || 'system:pmo-canary',
    })
    const finishedAt = new Date().toISOString()
    await supabase
      .from('moni_ai_eval_canary_requests')
      .update({
        status: 'COMPLETED',
        eval_run_id: result.evalRunId,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq('id', claimed.id)

    return NextResponse.json({
      ok: true,
      result: {
        eval_run_id: result.evalRunId,
        case_id: result.caseId,
        passed: result.passed,
        score: result.score,
        agent_run_id: result.agentRunId,
        tools_used: result.toolsUsed,
        usage: result.usage,
        duration_ms: result.durationMs,
        checks: result.checks,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI 카나리 평가 실행 실패'
    const finishedAt = new Date().toISOString()
    await supabase
      .from('moni_ai_eval_canary_requests')
      .update({
        status: 'FAILED',
        error_message: message,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq('id', claimed.id)
    console.error('[MONI_AGENT_CANARY_ERROR]', {
      request_id: claimed.id,
      case_id: claimed.case_id,
      message,
      occurred_at: finishedAt,
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
