import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { MONI_BUSINESS_ID, moniMcpResource } from '@/lib/moni/mcp/config'

export type MoniMcpAcceptanceCheck = {
  key: string
  label: string
  status: 'PASS' | 'PENDING' | 'FAIL' | 'MANUAL'
  detail: string
}

const ADMIN_SMOKE_TOOLS = [
  'get_business_clock',
  'search_production_records',
  'get_raw_material_inventory',
  'search_sales_and_receivables',
] as const

const FREELANCER_SMOKE_TOOLS = [
  'get_business_clock',
  'search_production_records',
  'get_raw_material_inventory',
] as const

const FREELANCER_FORBIDDEN_TOOLS = [
  'get_company_context',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'report_pmo_event',
] as const

function check(
  key: string,
  label: string,
  status: MoniMcpAcceptanceCheck['status'],
  detail: string,
): MoniMcpAcceptanceCheck {
  return { key, label, status, detail }
}

function toolNames(rows: Array<Record<string, unknown>>, role: string) {
  return new Set(
    rows
      .filter((row) => row.user_role === role && row.status === 'COMPLETED')
      .map((row) => String(row.tool_name || ''))
      .filter(Boolean),
  )
}

function missingTools(required: readonly string[], observed: Set<string>) {
  return required.filter((name) => !observed.has(name))
}

export async function getMoniMcpAcceptanceStatus() {
  const supabase = createMoniServiceRoleClient()
  const { data: window, error: windowError } = await supabase
    .from('moni_mcp_acceptance_windows')
    .select('id,enabled_at,enabled_until,enabled_by_login_id,enabled_by_display_name,reason,revoked_at,revoked_by_login_id,preflight_run_id,admin_tool_catalog_hash,freelancer_tool_catalog_hash')
    .order('enabled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (windowError) throw new Error(windowError.message)

  if (!window) {
    return {
      overall: 'NOT_STARTED' as const,
      automated_ready: false,
      mcp_url: moniMcpResource(),
      window: null,
      counts: { clients: 0, codes: 0, tokens: 0, tool_runs: 0, failed_tool_runs: 0 },
      checks: [
        check('window', '수용검사 창', 'PENDING', 'Preflight PASS 후 수용검사 창을 열어야 합니다.'),
      ],
      missing_admin_tools: [...ADMIN_SMOKE_TOOLS],
      missing_freelancer_tools: [...FREELANCER_SMOKE_TOOLS],
      manual_remaining: [
        'Freelancer가 ChatGPT UI에서 Admin 전용 도구를 보지 않는지 확인',
        'ChatGPT 도구 결과와 MONI 화면 수치를 교차검산',
      ],
    }
  }

  const start = window.enabled_at
  const end = window.enabled_until
  const [preflightResult, clientsResult, codesResult, tokensResult, toolRunsResult] = await Promise.all([
    window.preflight_run_id
      ? supabase
          .from('moni_mcp_preflight_runs')
          .select('id,status,admin_tool_catalog_hash,freelancer_tool_catalog_hash,finished_at')
          .eq('id', window.preflight_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('moni_mcp_oauth_clients')
      .select('client_id,client_name,is_active,created_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
    supabase
      .from('moni_mcp_oauth_codes')
      .select('client_id,user_login_id,user_role,used_at,created_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
    supabase
      .from('moni_mcp_oauth_tokens')
      .select('id,client_id,user_login_id,user_display_name,user_role,revoked_at,created_at,last_used_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
    supabase
      .from('moni_mcp_tool_runs')
      .select('id,oauth_client_id,user_login_id,user_role,tool_name,status,error_message,started_at,finished_at')
      .eq('business_id', MONI_BUSINESS_ID)
      .gte('started_at', start)
      .lte('started_at', end)
      .order('started_at', { ascending: true }),
  ])

  const firstError = [
    preflightResult.error,
    clientsResult.error,
    codesResult.error,
    tokensResult.error,
    toolRunsResult.error,
  ].find(Boolean)
  if (firstError) throw new Error(firstError.message)

  const preflight = preflightResult.data
  const clients = clientsResult.data || []
  const codes = codesResult.data || []
  const tokens = tokensResult.data || []
  const toolRuns = (toolRunsResult.data || []) as Array<Record<string, unknown>>
  const failedRuns = toolRuns.filter((row) => row.status === 'FAILED')
  const adminTokenCount = tokens.filter((row) => row.user_role === 'admin').length
  const freelancerTokenCount = tokens.filter((row) => row.user_role === 'freelancer').length
  const adminTools = toolNames(toolRuns, 'admin')
  const freelancerTools = toolNames(toolRuns, 'freelancer')
  const missingAdmin = missingTools(ADMIN_SMOKE_TOOLS, adminTools)
  const missingFreelancer = missingTools(FREELANCER_SMOKE_TOOLS, freelancerTools)
  const forbiddenFreelancerRuns = toolRuns.filter((row) => (
    row.user_role === 'freelancer'
    && FREELANCER_FORBIDDEN_TOOLS.includes(String(row.tool_name || '') as never)
  ))

  const observedClientIds = new Set<string>()
  for (const row of clients) observedClientIds.add(String(row.client_id || ''))
  for (const row of codes) observedClientIds.add(String(row.client_id || ''))
  for (const row of tokens) observedClientIds.add(String(row.client_id || ''))
  for (const row of toolRuns) observedClientIds.add(String(row.oauth_client_id || ''))
  observedClientIds.delete('')

  const enabledAt = Date.parse(window.enabled_at)
  const enabledUntil = Date.parse(window.enabled_until)
  const durationMinutes = Number.isFinite(enabledAt) && Number.isFinite(enabledUntil)
    ? (enabledUntil - enabledAt) / 60_000
    : Number.NaN
  const preflightLinked = Boolean(
    preflight
    && preflight.status === 'PASS'
    && preflight.admin_tool_catalog_hash === window.admin_tool_catalog_hash
    && preflight.freelancer_tool_catalog_hash === window.freelancer_tool_catalog_hash
  )

  const checks: MoniMcpAcceptanceCheck[] = [
    check(
      'preflight_link',
      'Preflight 스냅샷 연결',
      preflightLinked ? 'PASS' : 'FAIL',
      preflightLinked
        ? `run ${window.preflight_run_id}와 Admin/Freelancer 도구 해시가 일치합니다.`
        : '수용검사 창과 PASS Preflight 또는 도구 해시 연결이 일치하지 않습니다.',
    ),
    check(
      'window_duration',
      '수용검사 시간 제한',
      Number.isFinite(durationMinutes) && durationMinutes > 0 && durationMinutes <= 30 ? 'PASS' : 'FAIL',
      Number.isFinite(durationMinutes) ? `${durationMinutes.toFixed(1)}분` : '기간 계산 실패',
    ),
    check(
      'oauth_client',
      'ChatGPT OAuth client 관측',
      observedClientIds.size > 0 ? 'PASS' : 'PENDING',
      observedClientIds.size > 0
        ? `${observedClientIds.size}개 client ID가 이 수용검사 창에서 관측됐습니다.`
        : 'ChatGPT에서 MCP URL을 등록하고 Scan Tools를 시작해야 합니다.',
    ),
    check(
      'admin_oauth',
      'Admin OAuth 연결',
      adminTokenCount > 0 ? 'PASS' : 'PENDING',
      adminTokenCount > 0 ? `${adminTokenCount}개 Admin token record 관측` : 'Admin 계정으로 MONI OAuth 승인을 완료해야 합니다.',
    ),
    check(
      'admin_smoke',
      'Admin 핵심 READ ONLY 조회',
      missingAdmin.length === 0 ? 'PASS' : 'PENDING',
      missingAdmin.length === 0 ? '기준일·생산·원재료 재고·미수금 조회가 모두 완료됐습니다.' : `남은 도구: ${missingAdmin.join(', ')}`,
    ),
    check(
      'freelancer_oauth',
      'Freelancer OAuth 연결',
      freelancerTokenCount > 0 ? 'PASS' : 'PENDING',
      freelancerTokenCount > 0 ? `${freelancerTokenCount}개 Freelancer token record 관측` : 'Freelancer 계정으로 별도 연결시험이 필요합니다.',
    ),
    check(
      'freelancer_smoke',
      'Freelancer 허용 조회',
      missingFreelancer.length === 0 ? 'PASS' : 'PENDING',
      missingFreelancer.length === 0 ? '기준일·생산·원재료 재고 조회가 모두 완료됐습니다.' : `남은 도구: ${missingFreelancer.join(', ')}`,
    ),
    check(
      'freelancer_forbidden',
      'Freelancer 금지 도구 실행',
      forbiddenFreelancerRuns.length === 0 ? 'PASS' : 'FAIL',
      forbiddenFreelancerRuns.length === 0
        ? '재무·회사문맥·PMO 금지 도구 실행 기록이 없습니다.'
        : `${forbiddenFreelancerRuns.length}건의 금지 도구 실행이 발견됐습니다.`,
    ),
    check(
      'tool_failures',
      'MCP 도구 실행 실패',
      failedRuns.length === 0 ? 'PASS' : 'FAIL',
      failedRuns.length === 0 ? 'FAILED tool run이 없습니다.' : `${failedRuns.length}건 FAILED tool run이 있습니다.`,
    ),
    check(
      'freelancer_ui_visibility',
      'Freelancer ChatGPT 도구 미노출',
      'MANUAL',
      'Business의 승인 도구 스냅샷과 사용자별 OAuth 권한 조합은 실제 ChatGPT UI에서 확인해야 합니다.',
    ),
    check(
      'data_cross_check',
      'MONI 화면 수치 교차검산',
      'MANUAL',
      'ChatGPT가 반환한 생산·재고·미수금 수치를 같은 시점의 MONI 화면과 비교해야 합니다.',
    ),
  ]

  const failed = checks.some((item) => item.status === 'FAIL')
  const automatedPending = checks.some((item) => item.status === 'PENDING')
  const automatedReady = !failed && !automatedPending
  const overall = failed ? 'FAIL' : automatedReady ? 'AUTOMATED_PASS' : 'IN_PROGRESS'

  return {
    overall,
    automated_ready: automatedReady,
    mcp_url: moniMcpResource(),
    window: {
      ...window,
      duration_minutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      is_active: !window.revoked_at && Date.parse(window.enabled_until) > Date.now(),
    },
    counts: {
      clients: observedClientIds.size,
      codes: codes.length,
      tokens: tokens.length,
      tool_runs: toolRuns.length,
      failed_tool_runs: failedRuns.length,
      admin_tokens: adminTokenCount,
      freelancer_tokens: freelancerTokenCount,
    },
    checks,
    missing_admin_tools: missingAdmin,
    missing_freelancer_tools: missingFreelancer,
    manual_remaining: checks.filter((item) => item.status === 'MANUAL').map((item) => item.detail),
  }
}
