import { Buffer } from 'node:buffer'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  executeMoniAgentTool,
  MONI_AGENT_TOOLS,
  type MoniAgentToolContext,
} from '@/lib/moni/agent-v2'
import {
  allowedToolNamesForRole,
  assertToolAllowedForRole,
  type MoniToolName,
} from '@/lib/moni/agent/policies'
import { MONI_BUSINESS_ID } from '@/lib/moni/mcp/config'
import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'

const READ_ONLY_MCP_TOOLS = new Set<MoniToolName>([
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

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function normalizedToolName(name: unknown): MoniToolName | null {
  const value = text(name, 100) as MoniToolName
  return READ_ONLY_MCP_TOOLS.has(value) ? value : null
}

function normalizeArguments(raw: unknown) {
  const args = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {}
  if ('limit' in args) {
    const parsed = Number(args.limit)
    args.limit = Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : undefined
  }
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

function normalizeProductionResult(raw: unknown, args: Record<string, unknown>) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const result = raw as Record<string, any>
  const records = Array.isArray(result.records) ? result.records : []
  const summary = result.summary && typeof result.summary === 'object' ? { ...result.summary } : {}
  let openWorkOrderCount = 0
  let openPlannedQuantity = 0
  let completedRecordCount = 0
  let completedActualQuantity = 0
  let completedPlanGap = 0

  for (const row of records) {
    const status = text(row?.status, 80).toLowerCase()
    const actual = Number(row?.actual_quantity_g || 0)
    const planned = Number(row?.planned_quantity_g || 0)
    const defect = Number(row?.defect_quantity_g || 0)
    const sample = Number(row?.sample_quantity_g || 0)
    const cancelled = ['cancelled', 'canceled', '취소'].includes(status)
    const completed = ['완료', 'completed'].includes(status) || actual > 0
    if (!cancelled && !completed) {
      openWorkOrderCount += 1
      openPlannedQuantity += planned
    }
    if (completed) {
      completedRecordCount += 1
      completedActualQuantity += actual
      completedPlanGap += Math.max(0, planned - actual - defect - sample)
    }
  }

  return {
    ...result,
    summary: {
      ...summary,
      open_work_order_count: openWorkOrderCount,
      open_planned_quantity_g: openPlannedQuantity,
      completed_record_count: completedRecordCount,
      completed_actual_quantity_g: completedActualQuantity,
      completed_plan_gap_g: completedPlanGap,
      terminology: {
        open_planned_quantity_g: '아직 완료실적이 없는 열린 작업지시의 계획량 합계',
        completed_plan_gap_g: '완료 처리된 기록의 계획량 대비 실제·불량·샘플 차이',
        unaccounted_gap_g: '전체 계획량에서 실제·불량·샘플을 뺀 단순 차이로 미완료 생산량이나 확정 로스가 아님',
      },
      warning: '미완료 수량은 open_planned_quantity_g를 사용하고 unaccounted_gap_g를 미완료 또는 로스로 표현하지 않습니다.',
    },
    result_meta: {
      source_tool: 'search_production_records',
      queried_at: new Date().toISOString(),
      row_count: records.length,
      requested_limit: Number(args.limit || 30),
      may_be_truncated: records.length >= Number(args.limit || 30),
    },
  }
}

function withResultMeta(name: MoniToolName, raw: unknown, args: Record<string, unknown>) {
  if (name === 'search_production_records') return normalizeProductionResult(raw, args)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const value = raw as Record<string, unknown>
  if (value.result_meta) return value
  const rowKeys = ['records', 'plans', 'materials', 'transactions', 'orders', 'actual_purchases', 'products', 'recipes']
  const rowKey = rowKeys.find((key) => Array.isArray(value[key]))
  const rows = rowKey ? value[rowKey] as unknown[] : []
  return {
    ...value,
    result_meta: {
      source_tool: name,
      queried_at: new Date().toISOString(),
      row_count: rows.length,
      requested_limit: Number(args.limit || 0) || null,
      may_be_truncated: Boolean(args.limit && rows.length >= Number(args.limit)),
    },
  }
}

export function listMcpToolsForRole(role: unknown) {
  const allowed = new Set(allowedToolNamesForRole(role))
  return MONI_AGENT_TOOLS
    .map((item) => ({
      name: normalizedToolName(item.name),
      description: text(item.description, 1200),
      inputSchema: item.parameters,
    }))
    .filter((item): item is { name: MoniToolName; description: string; inputSchema: Record<string, unknown> } => Boolean(item.name && allowed.has(item.name)))
    .map((item) => ({
      name: item.name,
      title: item.name === 'get_agent_capabilities' ? 'MONI 지원 범위 확인' : item.description.split('.')[0].slice(0, 80),
      description: item.description,
      inputSchema: item.inputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    }))
}

export async function callMcpTool(input: {
  identity: MoniMcpIdentity
  toolName: unknown
  arguments: unknown
}) {
  const name = normalizedToolName(input.toolName)
  if (!name) throw new Error('지원하지 않는 MONI 읽기 전용 도구입니다.')
  assertToolAllowedForRole(input.identity.role, name)
  const allowed = new Set(listMcpToolsForRole(input.identity.role).map((tool) => tool.name))
  if (!allowed.has(name)) throw new Error('현재 사용자 권한으로 이 도구를 사용할 수 없습니다.')

  const args = normalizeArguments(input.arguments)
  const supabase = createMoniServiceRoleClient()
  const startedAt = Date.now()
  const { data: run, error: insertError } = await supabase
    .from('moni_mcp_tool_runs')
    .insert({
      business_id: MONI_BUSINESS_ID,
      oauth_token_id: input.identity.tokenId,
      oauth_client_id: input.identity.clientId,
      user_login_id: input.identity.loginId,
      user_role: input.identity.role,
      tool_name: name,
      tool_arguments: args,
      status: 'RUNNING',
    })
    .select('id')
    .single()
  if (insertError) throw new Error(insertError.message)

  const context: MoniAgentToolContext = {
    supabase,
    businessId: MONI_BUSINESS_ID,
    threadId: `mcp:${input.identity.clientId}`,
    messageId: run.id,
    page: { pathname: '/mcp', title: 'ChatGPT MONI MCP' },
    session: {
      loginId: input.identity.loginId,
      displayName: input.identity.displayName,
      role: input.identity.role,
    },
  }

  try {
    const raw = await executeMoniAgentTool(name, args, context)
    const output = withResultMeta(name, raw, args)
    const serialized = JSON.stringify(output)
    await supabase
      .from('moni_mcp_tool_runs')
      .update({
        status: 'COMPLETED',
        duration_ms: Date.now() - startedAt,
        output_bytes: Buffer.byteLength(serialized, 'utf8'),
        output_preview: serialized.slice(0, 10_000),
        output_truncated: serialized.length > 10_000,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    return output
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI MCP 도구 실행 실패'
    await supabase
      .from('moni_mcp_tool_runs')
      .update({
        status: 'FAILED',
        duration_ms: Date.now() - startedAt,
        error_message: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    throw error
  }
}
