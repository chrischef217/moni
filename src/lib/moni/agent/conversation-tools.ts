import { Buffer } from 'node:buffer'
import { tool, type RunContext } from '@openai/agents'
import { z } from 'zod'
import { executeMoniReadOnlyTool } from '@/lib/moni/agent/tool-backend'
import { moniToolDefinitions } from '@/lib/moni/agent/tools/catalog'
import { allowedToolNamesForRole, assertToolAllowedForRole, type MoniToolName } from '@/lib/moni/agent/policies'
import { prepareProductionPlanChange, executeProductionPlanChange } from '@/lib/moni/chatgpt-write-actions'
import { prepareProductionOperation, executeProductionOperation } from '@/lib/moni/chatgpt-production-actions'
import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'
import type { MoniConversationRuntimeContext } from '@/lib/moni/agent/conversation-runtime-types'
import {
  hasProductionMutationIntent,
  isExplicitApproval,
  monthRange,
  parseRequestedYearMonth,
  parseRequestedYearMonths,
} from '@/lib/moni/v1-contracts'

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function identity(context: MoniConversationRuntimeContext): MoniMcpIdentity {
  return {
    tokenId: `web:${context.threadId}`,
    clientId: `moni-web:${context.threadId}`,
    loginId: context.session.loginId,
    displayName: context.session.displayName || context.session.loginId,
    role: context.session.role,
    scopes: ['moni:read', 'moni:write:production-plan', 'moni:write:production-record'],
  }
}

async function auditedTool(
  name: string,
  args: Record<string, unknown>,
  runContext: RunContext<MoniConversationRuntimeContext>,
  execute: () => Promise<unknown>,
) {
  const context = runContext.context
  context.toolCallCount += 1
  if (!context.toolsUsed.includes(name)) context.toolsUsed.push(name)
  const started = Date.now()
  const { data: row, error } = await context.supabase.from('moni_ai_tool_runs').insert({
    business_id: context.businessId,
    agent_run_id: context.agentRunId,
    thread_id: context.threadId,
    message_id: context.messageId,
    step_no: context.toolCallCount,
    tool_name: name,
    tool_arguments: args,
    status: 'RUNNING',
  }).select('id').single()
  if (error) throw new Error(error.message)

  try {
    const output = await execute()
    const serialized = JSON.stringify(output)
    const existing = context.toolOutputs.get(name) || []
    existing.push(output)
    context.toolOutputs.set(name, existing)
    await context.supabase.from('moni_ai_tool_runs').update({
      status: 'COMPLETED',
      result_summary: {
        preview: serialized.slice(0, 10_000),
        truncated: serialized.length > 10_000,
        output_bytes: Buffer.byteLength(serialized, 'utf8'),
      },
      duration_ms: Date.now() - started,
      finished_at: new Date().toISOString(),
    }).eq('id', row.id)
    return output
  } catch (toolError) {
    const message = toolError instanceof Error ? toolError.message : 'MONI 도구 실행 실패'
    await context.supabase.from('moni_ai_tool_runs').update({
      status: 'FAILED',
      error_message: message.slice(0, 2000),
      duration_ms: Date.now() - started,
      finished_at: new Date().toISOString(),
    }).eq('id', row.id)
    throw toolError
  }
}

function readToolError(_context: RunContext<MoniConversationRuntimeContext>, error: Error) {
  return `MONI 조회 도구 입력 또는 실행 오류: ${text(error.message, 500)}. 사용자에게 실패했다고 답하지 말고, 같은 도구를 스키마에 맞는 유효한 JSON 객체로 정확히 한 번 다시 호출하세요.`
}

function createReadTools(role: string) {
  const allowed = new Set(allowedToolNamesForRole(role))
  return moniToolDefinitions
    .filter((definition) => definition.name !== 'report_pmo_event' && allowed.has(definition.name))
    .map((definition) => tool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters as any,
      timeoutMs: 20_000,
      timeoutBehavior: 'raise_exception',
      errorFunction: readToolError as any,
      execute: async (rawArgs, rawContext) => {
        const args = rawArgs as Record<string, unknown>
        const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
        const context = runContext.context
        assertToolAllowedForRole(context.session.role, definition.name as MoniToolName)
        return auditedTool(definition.name, args, runContext, async () => {
          if (definition.name === 'get_agent_capabilities') {
            const admin = String(context.session.role || '').toLowerCase() === 'admin'
            return {
              mode: 'MONI_OPENAI_CONVERSATIONS_AGENT',
              role: context.session.role,
              conversation_state: 'OpenAI Conversations API',
              read_tools: moniToolDefinitions.filter((item) => item.name !== 'report_pmo_event' && allowed.has(item.name)).map((item) => item.name),
              write_tools: admin ? ['prepare_production_plan_change', 'execute_production_plan_change', 'prepare_production_operation', 'execute_production_operation'] : [],
              write_policy: 'prepare -> 다음 사용자 메시지의 명시적 승인 -> execute -> verification',
            }
          }
          return executeMoniReadOnlyTool(definition.name, args, context)
        })
      },
    }))
}

const EmptyObjectSchema = z.object({})

function canonicalProductionSummary(productionRecords: any) {
  const rows = Array.isArray(productionRecords?.records) ? productionRecords.records : []
  const statusCounts: Record<string, number> = {}
  let completedRecordCount = 0
  let openWorkOrderCount = 0
  let openPlannedQuantityG = 0

  for (const row of rows) {
    const status = text(row?.status, 80) || 'UNKNOWN'
    statusCounts[status] = (statusCounts[status] || 0) + 1
    const normalized = status.toLowerCase()
    if (status === '완료' || normalized === 'completed' || normalized === 'confirmed') completedRecordCount += 1
    if (normalized === 'planned') {
      openWorkOrderCount += 1
      openPlannedQuantityG += num(row?.planned_quantity_g)
    }
  }

  return {
    record_count: rows.length,
    completed_record_count: completedRecordCount,
    open_work_order_count: openWorkOrderCount,
    open_planned_quantity_g: openPlannedQuantityG,
    status_counts: statusCounts,
    planned_quantity_g: num(productionRecords?.summary?.planned_quantity_g),
    actual_quantity_g: num(productionRecords?.summary?.actual_quantity_g),
    defect_quantity_g: num(productionRecords?.summary?.defect_quantity_g),
    sample_quantity_g: num(productionRecords?.summary?.sample_quantity_g),
    unaccounted_gap_g: num(productionRecords?.summary?.unaccounted_gap_g),
  }
}

async function loadMonthlyManagementSnapshot(context: MoniConversationRuntimeContext, year: number, month: number) {
  const { start, end } = monthRange(year, month)
  const common = { start_date: start, end_date: end, limit: 100 }
  const sales = await executeMoniReadOnlyTool('search_sales_and_receivables', common, context)
  const purchases = await executeMoniReadOnlyTool('search_purchases_and_payables', common, context)
  const productionRecords = await executeMoniReadOnlyTool('search_production_records', common, context)
  const productionPlans = await executeMoniReadOnlyTool('search_production_plans', common, context)
  const productionCanonical = canonicalProductionSummary(productionRecords)
  return {
    period: { year, month, start_date: start, end_date: end, time_zone: 'Asia/Seoul' },
    canonical_summary: {
      sales_and_receivables: (sales as any)?.summary ?? null,
      actual_purchases: (purchases as any)?.actual_purchases_summary ?? null,
      production: productionCanonical,
      production_plans: (productionPlans as any)?.summary ?? null,
    },
    sales_and_receivables: sales,
    purchases_and_payables: purchases,
    production_records: productionRecords,
    production_plans: productionPlans,
  }
}

function interpretationContract() {
  return [
    '건수와 합계는 직접 행을 세거나 더하지 말고 canonical_summary를 그대로 사용합니다.',
    '생산의 unaccounted_gap_g는 미완료량 또는 확정 로스로 해석하지 않습니다.',
    '열린 작업지시는 canonical_summary.production.open_work_order_count와 open_planned_quantity_g를 사용합니다.',
    '월간 생산계획(monthly_production_plans)과 생산 작업지시(production_records)는 서로 다른 업무 단계입니다.',
    '같은 제품·날짜·수량이 생산계획과 작업지시에 함께 존재하는 것만으로 중복 데이터라고 판단하거나 하나를 삭제·통합하라고 권고하지 않습니다.',
    '실제 중복이라고 말하려면 동일 업무단계 내부의 중복 ID/LOT/작업지시 등 별도 근거가 있어야 합니다.',
    '조회 한도에 도달한 배열은 전체 원장이라고 단정하지 않습니다.',
  ]
}

function compactComparisonMonth(snapshot: Awaited<ReturnType<typeof loadMonthlyManagementSnapshot>>) {
  const records = snapshot.production_records as any
  const plans = snapshot.production_plans as any
  return {
    period: snapshot.period,
    canonical_summary: snapshot.canonical_summary,
    production_by_product: Array.isArray(records?.by_product) ? records.by_product.slice(0, 30) : [],
    production_plan_items: Array.isArray(plans?.plans)
      ? plans.plans.slice(0, 30).map((item: any) => ({
        plan_date: item.plan_date,
        product_name: item.product_name,
        planned_quantity_g: item.planned_quantity_g,
      }))
      : [],
  }
}

function createMonthlyManagementComparisonTool(role: string) {
  if (String(role || '').toLowerCase() !== 'admin') return []
  return [tool({
    name: 'get_monthly_management_comparison',
    description: '사용자가 말한 두 개 월을 서버가 직접 해석해 두 달의 경영+생산 공식 요약을 한 번에 비교 조회합니다. 연도를 생략한 월은 공장 기준 현재 연도로 해석합니다. 인자는 반드시 빈 JSON 객체 {} 입니다.',
    parameters: EmptyObjectSchema,
    timeoutMs: 30_000,
    timeoutBehavior: 'raise_exception',
    errorFunction: readToolError as any,
    execute: async (_rawArgs, rawContext) => {
      const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
      const context = runContext.context
      const periods = parseRequestedYearMonths(context.currentUserText).slice(0, 2)
      if (periods.length < 2) throw new Error('비교할 두 개 월을 확인할 수 없습니다.')
      return auditedTool('get_monthly_management_comparison', { periods }, runContext, async () => {
        const months = []
        for (const period of periods) {
          const snapshot = await loadMonthlyManagementSnapshot(context, period.year, period.month)
          months.push(compactComparisonMonth(snapshot))
        }
        return {
          comparison_periods: periods,
          months,
          interpretation_contract: [
            ...interpretationContract(),
            '연도가 생략된 월은 다른 연도 단서가 없는 한 공장 기준 현재 연도로 해석하며 사용자에게 다시 확인하지 않습니다.',
            '현재 진행 중인 월과 완료된 과거 월을 비교할 때는 현재 월이 부분기간이라는 점을 반드시 표시합니다.',
          ],
        }
      })
    },
  })]
}

function createMonthlyManagementSnapshotTool(role: string) {
  if (String(role || '').toLowerCase() !== 'admin') return []
  return [tool({
    name: 'get_monthly_management_snapshot',
    description: '사용자의 현재 문장에 적힌 연월을 서버가 직접 읽어 해당 월의 경영+생산 공식 스냅샷을 한 번에 조회합니다. 연도를 생략한 월은 공장 기준 현재 연도로 해석합니다. 인자는 반드시 빈 JSON 객체 {} 입니다.',
    parameters: EmptyObjectSchema,
    timeoutMs: 30_000,
    timeoutBehavior: 'raise_exception',
    errorFunction: readToolError as any,
    execute: async (_rawArgs, rawContext) => {
      const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
      const context = runContext.context
      const { year, month } = parseRequestedYearMonth(context.currentUserText)
      return auditedTool('get_monthly_management_snapshot', { year, month }, runContext, async () => ({
        ...(await loadMonthlyManagementSnapshot(context, year, month)),
        interpretation_contract: interpretationContract(),
      }))
    },
  })]
}

const ProductionPlanPrepareSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  plan_id: z.string().optional().nullable(),
  plan_date: z.string().optional().nullable(),
  product_id: z.string().optional().nullable(),
  planned_quantity_kg: z.number().optional().nullable(),
  note: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
})
const ExecuteSchema = z.object({ confirmation_id: z.string().uuid() })
const ProductionOperationPrepareSchema = z.object({
  action: z.enum(['CREATE_WORK_ORDER', 'UPDATE_WORK_ORDER', 'CANCEL_WORK_ORDER', 'COMPLETE_PRODUCTION', 'CONFIRM_PRODUCTION']),
  record_id: z.string().optional().nullable(),
  work_date: z.string().optional().nullable(),
  product_id: z.string().optional().nullable(),
  planned_quantity_kg: z.number().optional().nullable(),
  lot_number: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  worker_name: z.string().optional().nullable(),
  actual_quantity_kg: z.number().optional().nullable(),
  defect_quantity_kg: z.number().optional().nullable(),
  sample_quantity_kg: z.number().optional().nullable(),
  inspection_result: z.string().optional().nullable(),
  inspection_note: z.string().optional().nullable(),
  sanitation_check: z.boolean().optional().nullable(),
  reason: z.string().optional().nullable(),
})

function createWriteTools(role: string) {
  if (String(role || '').toLowerCase() !== 'admin') return []
  return [
    tool({
      name: 'prepare_production_plan_change',
      description: '생산계획 생성·수정·삭제의 미리보기와 confirmation_id만 만듭니다. 실제 DB는 변경하지 않습니다. 변경 요청에는 반드시 이 도구부터 사용하세요.',
      parameters: ProductionPlanPrepareSchema as any,
      execute: async (rawArgs, rawContext) => {
        const args = rawArgs as Record<string, unknown>
        const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
        return auditedTool('prepare_production_plan_change', args, runContext, () => {
          if (!hasProductionMutationIntent(runContext.context.currentUserText)) {
            throw new Error('조회·분석 질문에서는 write prepare 도구를 호출할 수 없습니다.')
          }
          return prepareProductionPlanChange(args, identity(runContext.context))
        })
      },
    }),
    tool({
      name: 'execute_production_plan_change',
      description: '이전 사용자 턴에서 생성된 생산계획 confirmation_id를 실제 실행합니다. 현재 사용자 메시지가 명시적 승인일 때만 호출하세요.',
      parameters: ExecuteSchema as any,
      execute: async (rawArgs, rawContext) => {
        const args = rawArgs as { confirmation_id: string }
        const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
        const context = runContext.context
        return auditedTool('execute_production_plan_change', args, runContext, async () => {
          if (!context.preexistingPendingConfirmationIds.has(args.confirmation_id)) throw new Error('같은 턴의 prepare→execute는 금지됩니다. 이 승인 건은 현재 사용자 메시지 이전부터 PENDING 상태여야 합니다.')
          if (!isExplicitApproval(context.currentUserText)) throw new Error('현재 사용자 메시지에서 명시적인 실행 승인을 확인할 수 없습니다.')
          return executeProductionPlanChange({ confirmation_id: args.confirmation_id, user_confirmation_text: context.currentUserText }, identity(context))
        })
      },
    }),
    tool({
      name: 'prepare_production_operation',
      description: '작업지시 생성·수정·취소, 생산완료, 생산확정의 미리보기와 confirmation_id만 만듭니다. 실제 업무값은 변경하지 않습니다.',
      parameters: ProductionOperationPrepareSchema as any,
      execute: async (rawArgs, rawContext) => {
        const args = rawArgs as Record<string, unknown>
        const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
        return auditedTool('prepare_production_operation', args, runContext, () => {
          if (!hasProductionMutationIntent(runContext.context.currentUserText)) {
            throw new Error('조회·분석 질문에서는 write prepare 도구를 호출할 수 없습니다.')
          }
          return prepareProductionOperation(args, identity(runContext.context))
        })
      },
    }),
    tool({
      name: 'execute_production_operation',
      description: '이전 사용자 턴의 생산 작업 confirmation_id를 실제 실행합니다. 현재 사용자 메시지가 명시적 승인일 때만 호출하세요.',
      parameters: ExecuteSchema as any,
      execute: async (rawArgs, rawContext) => {
        const args = rawArgs as { confirmation_id: string }
        const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
        const context = runContext.context
        return auditedTool('execute_production_operation', args, runContext, async () => {
          if (!context.preexistingPendingConfirmationIds.has(args.confirmation_id)) throw new Error('같은 턴의 prepare→execute는 금지됩니다. 이 승인 건은 현재 사용자 메시지 이전부터 PENDING 상태여야 합니다.')
          if (!isExplicitApproval(context.currentUserText)) throw new Error('현재 사용자 메시지에서 명시적인 실행 승인을 확인할 수 없습니다.')
          return executeProductionOperation({ confirmation_id: args.confirmation_id, user_confirmation_text: context.currentUserText }, identity(context))
        })
      },
    }),
  ]
}

export function createMoniConversationTools(role: string) {
  return [
    ...createMonthlyManagementComparisonTool(role),
    ...createMonthlyManagementSnapshotTool(role),
    ...createReadTools(role),
    ...createWriteTools(role),
  ]
}
