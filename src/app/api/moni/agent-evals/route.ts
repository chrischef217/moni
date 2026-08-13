import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { listLiveEvalCases, runLiveEvalCase } from '@/lib/moni/agent/live-eval'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const DEFAULT_OPENAI_MODEL = 'gpt-5'
const RunSchema = z.object({ case_id: z.string().trim().min(1).max(160) })

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { error: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (String(session.role).toLowerCase() !== 'admin') {
    return { error: NextResponse.json({ ok: false, error: 'MONI 실모델 평가는 관리자만 실행할 수 있습니다.' }, { status: 403 }) }
  }
  return { session }
}
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const supabase = createMoniServiceRoleClient()
  const { data: runs, error } = await supabase
    .from('moni_ai_eval_runs')
    .select('id,suite_name,model,status,triggered_by,case_count,passed_count,failed_count,metrics,error_message,started_at,finished_at')
    .eq('business_id', BUSINESS_ID)
    .order('started_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cases: listLiveEvalCases(), runs: runs ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const parsed = RunSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '평가 사례 ID가 필요합니다.', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await runLiveEvalCase({
      caseId: parsed.data.case_id,
      model: text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_OPENAI_MODEL,
      triggeredBy: auth.session.loginId,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI 실모델 평가 실행 중 오류가 발생했습니다.'
    console.error('[MONI_AGENT_LIVE_EVAL_ERROR]', {
      case_id: parsed.data.case_id,
      message,
      occurred_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
