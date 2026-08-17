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
  if (toolName === 'search_raw_material_transactions' || toolName === 'search_material_transactions') return '원재료 입출고·소모 기록'
  if (toolName === 'get_raw_material_inventory') return '원재료 현재재고'
  if (toolName === 'search_products_and_recipes') return '제품·레시피 마스터'
  if (toolName === 'get_recent_product_monthly_trend') return '최근 제품별 월간 흐름'
  if (toolName === 'get_sales_client_master_summary') return '거래처 마스터'
  if (/prepare/i.test(toolName)) return '승인 전 미리보기 조건'
  if (/execute/i.test(toolName)) return '승인된 업무 실행 결과'
  return '회사 업무 데이터'
}

function elapsedSeconds(startedAt: unknown) {
  const started = Date.parse(String(startedAt || ''))
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

function inferExpectedToolName(message: string, recentContext: string) {
  const current = String(message || '').replace(/\s+/g, ' ').trim()
  const recent = String(recentContext || '').replace(/\s+/g, ' ').trim()

  if (/(생산계획|월간\s*계획)/.test(current)) return 'search_production_plans'
  if (/(생산실적|작업지시|작업지시서|\bLOT\d{8}-\d+\b)/i.test(current)) return 'search_production_records'
  if (/(매출|판매|수금|미수)/.test(current)) return 'search_sales_and_receivables'
  if (/(매입|지급|미지급)/.test(current)) return 'search_purchases_and_payables'
  if (/(?:원재료|원료).*(?:소모|출고)|(?:소모|출고).*(?:원재료|원료)|원재료\s*입출고/.test(current)) return 'search_raw_material_transactions'
  if (/(현재\s*재고|원재료\s*재고)/.test(current)) return 'get_raw_material_inventory'
  if (/(제품\s*마스터|레시피|배합)/.test(current)) return 'search_products_and_recipes'

  const contextualCue = /(?:\d{1,3}\s*번(?:만|도)?|넘버|번호|연번|다음|계속(?:\s*진행)?|이어(?:서|줘|가|계속)?|그럼|그거|그것|이것|저거|도\s*알려|까지\s*알려|뭔지|뭐였|얼마|몇\s*(?:개|건|곳)|체크|확인해)/i.test(current)
  if (!contextualCue) return null

  if (/(?:원재료|원료).*(?:소모|출고)|(?:소모|출고).*(?:원재료|원료)|출고\s*기준/.test(recent)) return 'search_raw_material_transactions'
  if (/(생산계획|월간\s*계획)/.test(recent)) return 'search_production_plans'
  if (/(생산실적|작업지시|작업지시서|\bLOT\d{8}-\d+\b)/i.test(recent)) return 'search_production_records'
  if (/(매출|판매|수금|미수)/.test(recent)) return 'search_sales_and_receivables'
  if (/(매입|지급|미지급)/.test(recent)) return 'search_purchases_and_payables'
  if (/(제품\s*마스터|레시피|배합)/.test(recent)) return 'search_products_and_recipes'
  if (/(현재\s*재고|원재료\s*재고)/.test(recent)) return 'get_raw_material_inventory'
  return null
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
    .select('id,status,started_at,created_at,message_id')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(1)

  const run = runs?.[0]
  if (runError || !run) {
    return NextResponse.json({
      ok: true,
      progress: '요청을 접수하고 실행 준비를 시작했습니다.',
      progress_detail: null,
      run_status: null,
      elapsed_seconds: 0,
      completed_tool_steps: 0,
      current_tool_label: null,
      last_completed_tool_label: null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const elapsed = elapsedSeconds(run.started_at || run.created_at)
  const { data: toolRuns } = await supabase
    .from('moni_ai_tool_runs')
    .select('tool_name,status,step_no,finished_at')
    .eq('business_id', BUSINESS_ID)
    .eq('agent_run_id', run.id)
    .order('step_no', { ascending: false })
    .limit(8)

  const rows = toolRuns || []
  const running = rows.find((row) => row.status === 'RUNNING')
  const completed = rows.filter((row) => row.status === 'COMPLETED')
  const failed = rows.find((row) => row.status === 'FAILED')
  const latestCompleted = completed[0]
  const currentToolLabel = running ? describeTool(String(running.tool_name || '')) : null
  const lastCompletedToolLabel = latestCompleted ? describeTool(String(latestCompleted.tool_name || '')) : null

  let expectedToolName: string | null = null
  if (run.status === 'RUNNING' && !running && !latestCompleted) {
    const { data: currentMessage } = await supabase
      .from('moni_ai_messages')
      .select('content')
      .eq('business_id', BUSINESS_ID)
      .eq('id', run.message_id)
      .maybeSingle()
    const currentText = String(currentMessage?.content || '').trim()

    if (currentText) {
      let recentContext = ''
      const isContextualFollowup = /(?:\d{1,3}\s*번(?:만|도)?|넘버|번호|연번|다음|계속(?:\s*진행)?|이어(?:서|줘|가|계속)?|그럼|그거|그것|이것|저거|도\s*알려|까지\s*알려)/i.test(currentText)
      if (isContextualFollowup) {
        const { data: recentMessages } = await supabase
          .from('moni_ai_messages')
          .select('role,content,created_at')
          .eq('business_id', BUSINESS_ID)
          .eq('thread_id', threadId)
          .lt('created_at', run.created_at)
          .order('created_at', { ascending: false })
          .limit(10)
        recentContext = (recentMessages || []).map((item) => String(item.content || '')).join(' ')
      }
      expectedToolName = inferExpectedToolName(currentText, recentContext)
    }
  }

  let progress = ''

  if (running) {
    const currentStep = completed.length + 1
    progress = completed.length > 0
      ? `${currentToolLabel}을 실제 데이터에서 조회하고 있습니다 · 조회 ${currentStep}단계 · 앞선 ${completed.length}단계 완료`
      : `${currentToolLabel}을 실제 데이터에서 조회하고 있습니다 · 조회 ${currentStep}단계`
  } else if (latestCompleted && run.status === 'RUNNING') {
    progress = `${lastCompletedToolLabel} 확인 완료 · 실제 조회 ${completed.length}단계의 결과를 질문 조건과 맞춰 답변에 반영하고 있습니다.`
  } else if (run.status === 'RUNNING' && expectedToolName) {
    progress = `${describeTool(expectedToolName)} 조회를 준비하고 있습니다 · 질문에서 필요한 데이터 영역을 확인했습니다.`
  } else if (run.status === 'RUNNING') {
    progress = '질문의 대상·기간·조건을 확인하고 필요한 회사 데이터 범위를 준비하고 있습니다.'
  } else if (run.status === 'COMPLETED') {
    progress = latestCompleted
      ? `${lastCompletedToolLabel}까지 필요한 데이터 확인을 마쳤고 최종 답변을 구성하고 있습니다.`
      : '필요한 처리를 마쳤고 최종 답변을 구성하고 있습니다.'
  } else if (failed || run.status === 'FAILED') {
    progress = failed
      ? `${describeTool(String(failed.tool_name || ''))} 확인 단계에서 처리가 중단되어 실제 오류 기록을 확인하고 있습니다.`
      : '처리 상태가 중단되어 실제 오류 기록을 확인하고 있습니다.'
  } else {
    progress = '현재 실행 상태를 확인하고 다음 처리 단계를 준비하고 있습니다.'
  }

  return NextResponse.json({
    ok: true,
    progress,
    progress_detail: null,
    run_status: run.status,
    elapsed_seconds: elapsed,
    completed_tool_steps: completed.length,
    current_tool_label: currentToolLabel,
    last_completed_tool_label: lastCompletedToolLabel,
    expected_tool_label: expectedToolName ? describeTool(expectedToolName) : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
