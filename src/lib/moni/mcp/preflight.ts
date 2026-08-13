import crypto from 'node:crypto'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  MONI_BUSINESS_ID,
  MONI_MCP_SCOPES,
  moniMcpResource,
  moniPublicBaseUrl,
  oauthMetadataUrl,
  protectedResourceMetadataUrl,
} from '@/lib/moni/mcp/config'
import { getMoniMcpActivationState } from '@/lib/moni/mcp/activation'
import { listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export type MoniMcpPreflightCheck = {
  key: string
  label: string
  status: 'PASS' | 'FAIL'
  detail: string
}

export type MoniMcpPreflightGateStatus = {
  ready: boolean
  latest_run_id: string | null
  latest_status: string | null
  latest_finished_at: string | null
  expires_at: string | null
  catalog_hashes_match: boolean
  reason: string
}

const PREFLIGHT_TTL_MINUTES = 30
const ADMIN_REQUIRED_TOOLS = new Set([
  'get_business_clock',
  'get_company_context',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'search_products_and_recipes',
  'get_agent_capabilities',
])
const FREELANCER_FORBIDDEN_TOOLS = new Set([
  'get_company_context',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'report_pmo_event',
])

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function catalogHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

export function currentMcpToolCatalogHashes() {
  const admin = listMcpToolsForRole('admin')
  const freelancer = listMcpToolsForRole('freelancer')
  return {
    admin,
    freelancer,
    adminHash: catalogHash(admin),
    freelancerHash: catalogHash(freelancer),
  }
}

function pass(key: string, label: string, detail: string): MoniMcpPreflightCheck {
  return { key, label, status: 'PASS', detail }
}

function fail(key: string, label: string, detail: string): MoniMcpPreflightCheck {
  return { key, label, status: 'FAIL', detail }
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  return { response, body }
}

export async function runMoniMcpPreflight(input: {
  loginId: string
  displayName: string
}) {
  const startedAt = new Date()
  const checks: MoniMcpPreflightCheck[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const baseUrl = moniPublicBaseUrl()
  const resource = moniMcpResource()
  const catalogs = currentMcpToolCatalogHashes()

  const activation = await getMoniMcpActivationState()
  checks.push(activation.mode === 'DISABLED'
    ? pass('activation_closed', '수용검사 기본 차단', '현재 MCP 런타임이 닫혀 있습니다.')
    : fail('activation_closed', '수용검사 기본 차단', `현재 활성 방식은 ${activation.mode}입니다. Preflight 전에 수용검사 창을 닫아야 합니다.`))

  const baseHttps = baseUrl.startsWith('https://') && resource === `${baseUrl}/mcp`
  checks.push(baseHttps
    ? pass('canonical_https', 'Canonical HTTPS MCP URL', resource)
    : fail('canonical_https', 'Canonical HTTPS MCP URL', `base=${baseUrl}, resource=${resource}`))

  try {
    const { response, body } = await fetchJson(oauthMetadataUrl())
    const scopes = Array.isArray(body?.scopes_supported) ? body!.scopes_supported.map(String) : []
    const grants = Array.isArray(body?.grant_types_supported) ? body!.grant_types_supported.map(String) : []
    const pkce = Array.isArray(body?.code_challenge_methods_supported) ? body!.code_challenge_methods_supported.map(String) : []
    const metadataOk = response.ok
      && body?.issuer === baseUrl
      && body?.authorization_endpoint === `${baseUrl}/oauth/authorize`
      && body?.token_endpoint === `${baseUrl}/oauth/token`
      && body?.registration_endpoint === `${baseUrl}/oauth/register`
      && body?.revocation_endpoint === `${baseUrl}/oauth/revoke`
      && MONI_MCP_SCOPES.every((scope) => scopes.includes(scope))
      && grants.includes('authorization_code')
      && grants.includes('refresh_token')
      && pkce.includes('S256')
    checks.push(metadataOk
      ? pass('oauth_metadata', 'OAuth metadata', 'PKCE S256, DCR, refresh token, offline_access metadata가 일치합니다.')
      : fail('oauth_metadata', 'OAuth metadata', `HTTP ${response.status}; 필수 endpoint/scope/grant/PKCE 중 하나가 불일치합니다.`))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth metadata 조회 실패'
    errors.push(message)
    checks.push(fail('oauth_metadata', 'OAuth metadata', message))
  }

  try {
    const { response, body } = await fetchJson(protectedResourceMetadataUrl())
    const servers = Array.isArray(body?.authorization_servers) ? body!.authorization_servers.map(String) : []
    const scopes = Array.isArray(body?.scopes_supported) ? body!.scopes_supported.map(String) : []
    const resourceOk = response.ok
      && body?.resource === resource
      && servers.includes(baseUrl)
      && scopes.includes('moni:read')
    checks.push(resourceOk
      ? pass('resource_metadata', 'Protected Resource metadata', 'MCP resource와 authorization server가 일치합니다.')
      : fail('resource_metadata', 'Protected Resource metadata', `HTTP ${response.status}; resource/authorization server/scope가 불일치합니다.`))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Protected Resource metadata 조회 실패'
    errors.push(message)
    checks.push(fail('resource_metadata', 'Protected Resource metadata', message))
  }

  try {
    const response = await fetch(resource, {
      method: 'OPTIONS',
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    })
    const corsOk = response.status === 204
      && response.headers.get('access-control-allow-origin') === 'https://chatgpt.com'
      && String(response.headers.get('access-control-allow-headers') || '').toLowerCase().includes('authorization')
      && String(response.headers.get('access-control-allow-methods') || '').toUpperCase().includes('POST')
    checks.push(corsOk
      ? pass('mcp_cors', 'ChatGPT MCP CORS', 'chatgpt.com origin, Authorization header, POST가 허용됩니다.')
      : fail('mcp_cors', 'ChatGPT MCP CORS', `HTTP ${response.status}; CORS 계약이 기대값과 다릅니다.`))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP OPTIONS 조회 실패'
    errors.push(message)
    checks.push(fail('mcp_cors', 'ChatGPT MCP CORS', message))
  }

  const adminNames = catalogs.admin.map((tool) => tool.name)
  const freelancerNames = catalogs.freelancer.map((tool) => tool.name)
  const adminUnique = new Set(adminNames)
  const freelancerUnique = new Set(freelancerNames)
  const annotationsSafe = [...catalogs.admin, ...catalogs.freelancer].every((tool) => (
    tool.annotations?.readOnlyHint === true
    && tool.annotations?.destructiveHint === false
    && tool.annotations?.openWorldHint === false
  ))
  const adminPolicyOk = adminNames.length === adminUnique.size
    && ADMIN_REQUIRED_TOOLS.size === adminUnique.size
    && [...ADMIN_REQUIRED_TOOLS].every((name) => adminUnique.has(name as never))
  const freelancerPolicyOk = freelancerNames.length === freelancerUnique.size
    && freelancerNames.length > 0
    && [...FREELANCER_FORBIDDEN_TOOLS].every((name) => !freelancerUnique.has(name as never))
    && freelancerUnique.has('search_production_records')
    && freelancerUnique.has('get_raw_material_inventory')

  checks.push(adminPolicyOk && freelancerPolicyOk && annotationsSafe
    ? pass('tool_policy', '역할별 READ ONLY 도구 정책', `Admin ${adminNames.length}개 / Freelancer ${freelancerNames.length}개, 쓰기·파괴 도구 없음.`)
    : fail('tool_policy', '역할별 READ ONLY 도구 정책', `Admin=[${adminNames.join(', ')}], Freelancer=[${freelancerNames.join(', ')}]`))

  const supabase = createMoniServiceRoleClient()
  try {
    const [clients, codes, tokens, toolRuns, windows] = await Promise.all([
      supabase.from('moni_mcp_oauth_clients').select('client_id', { count: 'exact', head: true }),
      supabase.from('moni_mcp_oauth_codes').select('code_hash', { count: 'exact', head: true }),
      supabase.from('moni_mcp_oauth_tokens').select('id', { count: 'exact', head: true }),
      supabase.from('moni_mcp_tool_runs').select('id', { count: 'exact', head: true }),
      supabase.from('moni_mcp_acceptance_windows').select('id', { count: 'exact', head: true }),
    ])
    const dbError = [clients.error, codes.error, tokens.error, toolRuns.error, windows.error].find(Boolean)
    if (dbError) throw new Error(dbError.message)
    checks.push(pass(
      'mcp_storage',
      'MCP OAuth·감사 저장소',
      `clients=${clients.count || 0}, codes=${codes.count || 0}, tokens=${tokens.count || 0}, tool_runs=${toolRuns.count || 0}, windows=${windows.count || 0}`,
    ))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP 저장소 조회 실패'
    errors.push(message)
    checks.push(fail('mcp_storage', 'MCP OAuth·감사 저장소', message))
  }

  const failedChecks = checks.filter((check) => check.status === 'FAIL')
  const status: 'PASS' | 'FAIL' = failedChecks.length ? 'FAIL' : 'PASS'
  if (failedChecks.length) errors.push(...failedChecks.map((check) => `${check.label}: ${check.detail}`))
  const finishedAt = new Date()

  const { data: saved, error: saveError } = await supabase
    .from('moni_mcp_preflight_runs')
    .insert({
      business_id: MONI_BUSINESS_ID,
      requested_by_login_id: input.loginId,
      requested_by_display_name: input.displayName,
      status,
      admin_tool_catalog_hash: catalogs.adminHash,
      freelancer_tool_catalog_hash: catalogs.freelancerHash,
      checks,
      warnings,
      errors: Array.from(new Set(errors)),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
    })
    .select('id,created_at')
    .single()
  if (saveError) throw new Error(`Preflight 감사기록 저장 실패: ${saveError.message}`)

  return {
    id: saved.id,
    status,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    valid_until: status === 'PASS' ? new Date(finishedAt.getTime() + PREFLIGHT_TTL_MINUTES * 60_000).toISOString() : null,
    checks,
    warnings,
    errors: Array.from(new Set(errors)),
    tool_catalog: {
      admin_count: adminNames.length,
      freelancer_count: freelancerNames.length,
      admin_hash: catalogs.adminHash,
      freelancer_hash: catalogs.freelancerHash,
    },
  }
}

export async function getMcpPreflightGateStatus(): Promise<MoniMcpPreflightGateStatus> {
  const supabase = createMoniServiceRoleClient()
  const cutoff = new Date(Date.now() - PREFLIGHT_TTL_MINUTES * 60_000).toISOString()
  const { data, error } = await supabase
    .from('moni_mcp_preflight_runs')
    .select('id,status,admin_tool_catalog_hash,freelancer_tool_catalog_hash,finished_at')
    .eq('business_id', MONI_BUSINESS_ID)
    .gte('finished_at', cutoff)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return {
      ready: false,
      latest_run_id: null,
      latest_status: null,
      latest_finished_at: null,
      expires_at: null,
      catalog_hashes_match: false,
      reason: `Preflight 상태 조회 실패: ${error.message}`,
    }
  }
  if (!data) {
    return {
      ready: false,
      latest_run_id: null,
      latest_status: null,
      latest_finished_at: null,
      expires_at: null,
      catalog_hashes_match: false,
      reason: '최근 30분 내 Preflight 실행 결과가 없습니다.',
    }
  }

  const hashes = currentMcpToolCatalogHashes()
  const catalogHashesMatch = data.admin_tool_catalog_hash === hashes.adminHash
    && data.freelancer_tool_catalog_hash === hashes.freelancerHash
  const ready = data.status === 'PASS' && catalogHashesMatch
  const finishedAt = Date.parse(data.finished_at)
  return {
    ready,
    latest_run_id: data.id,
    latest_status: data.status,
    latest_finished_at: data.finished_at,
    expires_at: Number.isFinite(finishedAt) ? new Date(finishedAt + PREFLIGHT_TTL_MINUTES * 60_000).toISOString() : null,
    catalog_hashes_match: catalogHashesMatch,
    reason: ready
      ? '최근 Preflight PASS이며 현재 도구 카탈로그 해시가 일치합니다.'
      : data.status !== 'PASS'
        ? `최근 Preflight 상태가 ${data.status}입니다.`
        : 'Preflight 이후 MCP 도구 정의가 변경되었습니다. 다시 점검해야 합니다.',
  }
}

export async function assertRecentPassingMcpPreflight() {
  const gate = await getMcpPreflightGateStatus()
  if (!gate.ready) throw new Error(`MCP 수용검사 창을 열 수 없습니다. ${gate.reason}`)
  return gate
}
