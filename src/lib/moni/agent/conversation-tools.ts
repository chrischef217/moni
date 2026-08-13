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

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

function explicitApproval(value: string) {
  const message = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!message) return false
  if (/(취소|보류|멈춰|하지\s*마|하지마|실행하지|진행하지|아니야|아니요)/.test(message)) return false
  return /(^|\s)(확인|승인|동의)(\.|!|\s|$)|그대로\s*(실행|진행|처리)|(?:실행|진행|처리)해(?:줘|주세요|라|요)?|위\s*(?:미리보기|내용).*(?:실행|진행|처리)|^(네|예|응|좋아)[.!]?$/i.test(message)
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

const MonthlyManagementSnapshotSchema = z.object({})

function parseRequestedYearMonth(message: string) {
  const normalized = String(message || '').replace(/\s+/g, ' ')
  const korean = normalized.match(/(20\d{2})\s*년\s*(1[0-2]|0?[1-9])\s*월/)
  const compact = normalized.match(/(20\d{2})[-/.](1[0-2]|0?[1-9])(?:\b|월)/)
  const match = korean || compact
  if (!match) throw new Error('월간 종합 조회에는 사용자 요청에 연도와 월이 필요합니다. 예: 2026년 7월')
  return { year: Number(match[1]), month: Number(match[2]) }
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}

function createMonthlyManagementSnapshotTool(role: string) {
  if (String(role || '').toLowerCase() !== 'admin') return []
  return [tool({
    name: 'get_monthly_management_snapshot',
    description: '사용자의 현재 문장에 적힌 연월을 서버가 직접 읽어 해당 월의 경영+생산 공식 스냅샷을 한 번에 조회합니다. 월간 경영 데이터와 생산 데이터를 종합 분석해 달라는 요청에는 이 도구를 사용하세요. 인자는 반드시 빈 JSON 객체 {} 입니다.',
    parameters: MonthlyManagementSnapshotSchema,
    timeoutMs: 30_000,
    timeoutBehavior: 'raise_exception',
    errorFunction: readToolError as any,
    execute: async (_rawArgs, rawContext) => {
      const runContext = rawContext as RunContext<MoniConversationRuntimeContext>
      const context = runContext.context
      const { year, month } = parseRequestedYearMonth(context.currentUserText)
      return auditedTool('get_monthly_management_snapshot', { year, month }, runContext, async () => {
        const { start, end } = monthRange(year, month)
        const common = { start_date: start, end_date: end, limit: 100 }
        const sales = await executeMoniReadOnlyTool('search_sales_and_receivables', common, context)
        const purchases = await executeMoniReadOnlyTool('search_purchases_and_payables', common, context)
        const productionRecords = await executeMoniReadOnlyTool('search_production_records', common, context)
        const productionPlans = await executeMoniReadOnlyTool('search_production_plans', common, context)
        return {
          period: { year, month, start_date: start, end_date: end, time_zone: 'Asia/Seoul' },
          sales_and_receivables: sales,
          purchases_and_payables: purchases,
          production_records: productionRecords,
          production_plans: productionPlans,
          interpretation_contract: [
            '각 영역의 summary 수치를 우선 사용합니다.',
            '생산의 unaccounted_gap_g는 미완료량 또는 확정 로스로 해석하지 않습니다.',
            '열린 작업지시는 production_records.summary.open_work_order_count와 open_planned_quantity_g를 사용합니다.',
            '조회 한도에 도달한 배열은 전체 원장이라고 단정하지 않습니다.',
          ],
        }
      })
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
        return auditedTool('prepare_production_plan_change', args, runContext, () => prepareProductionPlanChange(args, identity(runContext.context)))
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
          if (!explicitApproval(context.currentUserText)) throw new Error('현재 사용자 메시지에서 명시적인 실행 승인을 확인할 수 없습니다.')
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
        return auditedTool('prepare_production_operation', args, runContext, () => prepareProductionOperation(args, identity(runContext.context)))
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
          if (!explicitApproval(context.currentUserText)) throw new Error('현재 사용자 메시지에서 명시적인 실행 승인을 확인할 수 없습니다.')
          return executeProductionOperation({ confirmation_id: args.confirmation_id, user_confirmation_text: context.currentUserText }, identity(context))
        })
      },
    }),
  ]
}

export function createMoniConversationTools(role: string) {
  return [...createMonthlyManagementSnapshotTool(role), ...createReadTools(role), ...createWriteTools(role)]
}
