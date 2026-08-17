import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()

function describeTool(toolName: string) {
  if (toolName === 'get_monthly_management_comparison') return '두 기간의 생산·경영 집계 비교'
  if (toolName === 'get_monthly_management_snapshot') return '월간 생산·경영 집계'
  if (toolName === 'search_production_records') return '생산실적·작업지시·LOT 기록'
  if (toolName === 'search_production_plans') return '생산계획 기록'
  if (toolName === 'search_sales_and_receivables') return '매출·수금·미수 데이터'
  if (toolName === 'search_purchases_and_payables') return '매입·지급·미지급 데이터'
  if (toolName === 'search_material_transactions') return '원재료 입출고 기록'
  if (toolName === 'search_products_and_recipes') return '제품·레시피 마스터'
  if (toolName === 'get_recent_product_monthly_trend') return '최근 제품별 월간 흐름'
  if (toolName === 'get_sales_client_master_summary') return '거래처 마스터'
  if (/prepare/i.test(toolName)) return '승인 전 미리보기 조건'
  return '회사 업무 데이터'
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role === 'freelancer') {
    return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 })
  }

  const threadId = String(request.nextUrl.searchParams.get('thread_id') || '').trim()
  if (!threadId) {
    return NextResponse.json({ ok: false, error: 'thread_id가 필요합니다.' }, { status: 400 })
  }

  const supabase = createMoniServiceRoleClient()
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: runs, error: runError } = await supabase
    .from('moni_ai_agent_runs')
    .select('id,status,started_at,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(1)

  const run = runs?.[0]
  if (runError || !run) {
    return NextResponse.json({ ok: true, progress: null, run_status: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: toolRuns } = await supabase
    .from('moni_ai_tool_runs')
    .select('tool_name,status,step_no,finished_at')
    .eq('business_id', BUSINESS_ID)
    .eq('agent_run_id', run.id)
    .order('step_no', { ascending: false })
    .limit(4)

  const completed = (toolRuns || []).filter((row) => row.status === 'COMPLETED')
  const latest = completed[0]
  let progress: string | null = null

  if (latest) {
    const label = describeTool(String(latest.tool_name || ''))
    const countText = completed.length >= 2 ? ` 현재까지 확인된 조회 단계는 ${completed.length}개입니다.` : ''
    progress = `최근 ${label} 확인을 마쳤습니다.${countText} 이어지는 결과를 정리하고 있습니다.`
  } else if (run.status === 'RUNNING') {
    progress = '질문에 필요한 조회 범위를 확인하고 첫 데이터를 불러오는 중입니다.'
  } else if (run.status === 'COMPLETED') {
    progress = '필요한 데이터 조회를 마치고 최종 답변을 정리하고 있습니다.'
  }

  return NextResponse.json({
    ok: true,
    progress,
    run_status: run.status,
    completed_tool_steps: completed.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
