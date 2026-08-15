import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listLiveEvalCases, runLiveEvalCase } from '@/lib/moni/agent/live-eval'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const DEFAULT_OPENAI_MODEL = 'gpt-5'
const FULL_BUSINESS_SUITE = '__FULL_BUSINESS_REGRESSION__'
const BATCH_CONCURRENCY = 6
const TokenSchema = z.string().trim().min(32).max(256)
const RequestSchema = z.object({ token: TokenSchema })

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

async function runFullBusinessSuite(model: string, triggeredBy: string) {
  const cases = listLiveEvalCases().filter((item) => item.id.startsWith('business-'))
  const results: Array<{
    case_id: string
    ok: boolean
    passed: boolean
    score: number
    duration_ms: number
    eval_run_id?: string
    error?: string
  }> = []

  for (let offset = 0; offset < cases.length; offset += BATCH_CONCURRENCY) {
    const batch = cases.slice(offset, offset + BATCH_CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(async (item) => {
      const result = await runLiveEvalCase({ caseId: item.id, model, triggeredBy })
      return {
        case_id: item.id,
        ok: true,
        passed: result.passed,
        score: result.score,
        duration_ms: result.durationMs,
        eval_run_id: result.evalRunId,
      }
    }))
    settled.forEach((item, index) => {
      if (item.status === 'fulfilled') {
        results.push(item.value)
      } else {
        results.push({
          case_id: batch[index]?.id || `unknown-${offset + index}`,
          ok: false,
          passed: false,
          score: 0,
          duration_ms: 0,
          error: item.reason instanceof Error ? item.reason.message : String(item.reason || 'unknown error'),
        })
      }
    })
  }

  const passed = results.filter((item) => item.passed).length
  const failed = results.length - passed
  return {
    case_count: results.length,
    passed,
    failed,
    pass_rate: results.length ? passed / results.length : 0,
    all_passed: failed === 0,
    results,
  }
}

async function executeCanary(token: string) {
  const parsedToken = TokenSchema.safeParse(token)
  if (!parsedToken.success) {
    return json({ ok: false, error: '유효한 카나리 토큰이 필요합니다.' }, 400)
  }

  const supabase = createMoniServiceRoleClient()
  const tokenHash = hashToken(parsedToken.data)
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
    return json({ ok: false, error: '카나리 요청 확인에 실패했습니다.' }, 500)
  }
  if (!pending) {
    return json({ ok: false, error: '유효하지 않거나 만료된 카나리 요청입니다.' }, 401)
  }
  if (pending.status !== 'PENDING') {
    return json({ ok: false, error: '이미 사용된 카나리 요청입니다.' }, 409)
  }
  if (Date.parse(pending.expires_at) <= now.getTime()) {
    await supabase
      .from('moni_ai_eval_canary_requests')
      .update({ status: 'EXPIRED', finished_at: nowIso, updated_at: nowIso })
      .eq('id', pending.id)
      .eq('status', 'PENDING')
    return json({ ok: false, error: '만료된 카나리 요청입니다.' }, 410)
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
    return json({ ok: false, error: '카나리 요청 잠금에 실패했습니다.' }, 500)
  }
  if (!claimed) {
    return json({ ok: false, error: '이미 실행 중이거나 사용된 카나리 요청입니다.' }, 409)
  }

  try {
    const model = String(process.env.OPENAI_MONI_MODEL || DEFAULT_OPENAI_MODEL).trim()
    const triggeredBy = claimed.requested_by || 'system:pmo-canary'

    if (claimed.case_id === FULL_BUSINESS_SUITE) {
      const suite = await runFullBusinessSuite(model, triggeredBy)
      const finishedAt = new Date().toISOString()
      await supabase
        .from('moni_ai_eval_canary_requests')
        .update({
          status: suite.all_passed ? 'COMPLETED' : 'FAILED',
          error_message: suite.all_passed ? null : `${suite.failed} business regression case(s) failed`,
          finished_at: finishedAt,
          updated_at: finishedAt,
        })
        .eq('id', claimed.id)
      return json({ ok: true, suite })
    }

    const result = await runLiveEvalCase({
      caseId: claimed.case_id,
      model,
      triggeredBy,
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

    return json({
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
    return json({ ok: false, error: message }, 500)
  }
}

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, error: '유효한 카나리 토큰이 필요합니다.' }, 400)
  }
  return executeCanary(parsed.data.token)
}

export async function GET(request: NextRequest) {
  return executeCanary(request.nextUrl.searchParams.get('token') || '')
}
