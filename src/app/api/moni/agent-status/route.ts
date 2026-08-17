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
  if (/execute/i.test(toolName)) return '승인된 업무 실행 결과'
  return '회사 업무 데이터'
}

function elapsedSeconds(startedAt: unknown) {
  const started = Date.parse(String(startedAt || ''))
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
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
    return NextResponse.json({
      ok: true,
      progress: '요청을 받았습니다. 아직 실행 상태가 생성되지 않아 첫 조회를 준비하고 있습니다.',
      progress_detail: '실행 상태가 확인되는 즉시 현재 조회 단계와 경과 시간을 표시합니다.',
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

  let progress = ''
  let progressDetail = ''

  if (running) {
    progress = `현재 ${currentToolLabel}을 확인하고 있습니다.`
    progressDetail = completed.length > 0
      ? `처리 시작 후 ${elapsed}초 경과 · 앞선 조회 ${completed.length}단계를 완료했고 현재 조회가 끝나면 결과를 이어서 정리합니다.`
      : `처리 시작 후 ${elapsed}초 경과 · 첫 데이터 조회 단계가 실행 중입니다.`
  } else if (latestCompleted && run.status === 'RUNNING') {
    progress = `최근 ${lastCompletedToolLabel} 확인을 마쳤습니다.`
    progressDetail = `처리 시작 후 ${elapsed}초 경과 · 현재까지 조회 ${completed.length}단계를 완료했고 다음 조회 또는 최종 답변 반영을 기다리고 있습니다.`
  } else if (run.status === 'RUNNING') {
    progress = `처리 시작 후 ${elapsed}초 · 아직 데이터 조회 도구 호출 전입니다.`
    progressDetail = '서버 실행은 계속 진행 중입니다. 첫 실제 조회가 시작되면 데이터 영역과 완료 단계를 바로 표시합니다.'
  } else if (run.status === 'COMPLETED') {
    progress = latestCompleted
      ? `${lastCompletedToolLabel}까지 필요한 데이터 확인을 마쳤습니다.`
      : '필요한 실행을 마쳤습니다.'
    progressDetail = `총 ${elapsed}초 처리 · 최종 답변을 화면에 반영하고 있습니다.`
  } else if (failed || run.status === 'FAILED') {
    progress = failed
      ? `${describeTool(String(failed.tool_name || ''))} 확인 단계에서 처리가 중단됐습니다.`
      : '처리 상태가 중단되어 오류 정보를 확인하고 있습니다.'
    progressDetail = `처리 시작 후 ${elapsed}초 · 실패 원인을 임의로 추측하지 않고 실제 실행 기록 기준으로 상태를 표시합니다.`
  } else {
    progress = '현재 실행 상태를 확인하고 있습니다.'
    progressDetail = `처리 시작 후 ${elapsed}초 · 실제 실행 기록이 갱신되는 대로 현재 단계를 표시합니다.`
  }

  return NextResponse.json({
    ok: true,
    progress,
    progress_detail: progressDetail,
    run_status: run.status,
    elapsed_seconds: elapsed,
    completed_tool_steps: completed.length,
    current_tool_label: currentToolLabel,
    last_completed_tool_label: lastCompletedToolLabel,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
