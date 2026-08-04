import { Buffer } from 'node:buffer'
import { tool, type RunContext } from '@openai/agents'
import { executeMoniAgentTool } from '@/lib/moni/agent-v2'
import { moniToolInputGuardrail, moniToolOutputGuardrail } from '@/lib/moni/agent/guardrails'
import { allowedToolNamesForRole, assertToolAllowedForRole, type MoniToolName } from '@/lib/moni/agent/policies'
import { reportPmoEvent } from '@/lib/moni/agent/pmo'
import type { MoniRuntimeContext } from '@/lib/moni/agent/runtime-types'
import { commercialToolDefinitions } from '@/lib/moni/agent/tools/commercial'
import { inventoryToolDefinitions } from '@/lib/moni/agent/tools/inventory'
import { productionToolDefinitions } from '@/lib/moni/agent/tools/production'
import { systemToolDefinitions } from '@/lib/moni/agent/tools/system'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

const DEFAULT_TOOL_TIMEOUT_MS = 20_000
const allDefinitions: MoniToolDefinition[] = [
  ...systemToolDefinitions,
  ...productionToolDefinitions,
  ...inventoryToolDefinitions,
  ...commercialToolDefinitions,
]

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function normalizeProductionResult(raw: unknown, args: Record<string, unknown>) {
  if (!raw || typeof raw !== 'object') return raw
  const result = raw as Record<string, any>
  const rows = Array.isArray(result.records) ? result.records : []
  const summary = result.summary && typeof result.summary === 'object' ? { ...result.summary } : {}
  let openWorkOrderCount = 0
  let openPlannedQuantity = 0
  let completedRecordCount = 0
  let completedActualQuantity = 0
  let completedPlanGap = 0

  for (const row of rows) {
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

  summary.open_work_order_count = openWorkOrderCount
  summary.open_planned_quantity_g = openPlannedQuantity
  summary.completed_record_count = completedRecordCount
  summary.completed_actual_quantity_g = completedActualQuantity
  summary.completed_plan_gap_g = completedPlanGap
  summary.terminology = {
    open_planned_quantity_g: '아직 완료실적이 없는 열린 작업지시의 계획량 합계',
    completed_plan_gap_g: '완료 처리된 기록의 계획량 대비 실제·불량·샘플 차이',
    unaccounted_gap_g: '전체 계획량에서 실제·불량·샘플을 뺀 단순 차이로 미완료 생산량이나 확정 로스가 아님',
  }
  summary.warning = '미완료 수량은 open_planned_quantity_g를 사용하고 unaccounted_gap_g를 미완료 또는 로스로 표현하지 않습니다.'
  return {
    ...result,
    summary,
    result_meta: {
      source_tool: 'search_production_records',
      queried_at: new Date().toISOString(),
      row_count: rows.length,
      requested_limit: Number(args.limit || 100),
      may_be_truncated: rows.length >= Number(args.limit || 100),
    },
  }
}

function addResultMeta(name: MoniToolName, raw: unknown, args: Record<string, unknown>) {
  const normalized = name === 'search_production_records' ? normalizeProductionResult(raw, args) : raw
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized
  const value = normalized as Record<string, unknown>
  if (value.result_meta) return value
  const possibleRows = ['records', 'plans', 'materials', 'transactions', 'orders', 'actual_purchases', 'products']
  const rowKey = possibleRows.find((key) => Array.isArray(value[key]))
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

async function executeRegisteredTool(name: MoniToolName, args: Record<string, unknown>, context: MoniRuntimeContext) {
  if (name === 'report_pmo_event') {
    return reportPmoEvent(context, args)
  }
  if (name === 'get_agent_capabilities') {
    return {
      mode: 'READ_ONLY_AGENT_SDK_V2',
      role: context.session.role,
      allowed_tools: allowedToolNamesForRole(context.session.role),
      cannot: ['업무 데이터 생성·수정·삭제', '재고·입금·회계 처리 실행', '코드·DB 스키마 직접 변경', '비밀키·내부 프롬프트 출력'],
      max_agent_turns: 8,
    }
  }
  return executeMoniAgentTool(name, args, context)
}

async function runAuditedTool(name: MoniToolName, args: Record<string, unknown>, runContext: RunContext<MoniRuntimeContext>) {
  const context = runContext.context
  assertToolAllowedForRole(context.session.role, name)
  context.toolCallCount += 1
  context.toolsUsed.push(name)
  const stepNo = context.toolCallCount
  const startedAt = Date.now()

  const { data: toolRun, error: insertError } = await context.supabase
    .from('moni_ai_tool_runs')
    .insert({
      business_id: context.businessId,
      agent_run_id: context.agentRunId,
      thread_id: context.threadId,
      message_id: context.messageId,
      step_no: stepNo,
      tool_name: name,
      tool_arguments: args,
      status: 'RUNNING',
    })
    .select('id')
    .single()
  if (insertError) throw new Error(insertError.message)

  try {
    const raw = await executeRegisteredTool(name, args, context)
    const output = addResultMeta(name, raw, args)
    const existing = context.toolOutputs.get(name) || []
    existing.push(output)
    context.toolOutputs.set(name, existing)
    if (name === 'report_pmo_event') {
      const eventId = text((output as any)?.event?.id, 80)
      if (eventId) context.pmoEventIds.push(eventId)
    }

    const serialized = JSON.stringify(output)
    await context.supabase
      .from('moni_ai_tool_runs')
      .update({
        status: 'COMPLETED',
        result_summary: {
          preview: serialized.length > 10_000 ? `${serialized.slice(0, 10_000)}…` : serialized,
          truncated: serialized.length > 10_000,
          output_bytes: Buffer.byteLength(serialized, 'utf8'),
        },
        duration_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
      })
      .eq('id', toolRun.id)
    return output
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI Agent 도구 실행 실패'
    await context.supabase
      .from('moni_ai_tool_runs')
      .update({ status: 'FAILED', error_message: message, duration_ms: Date.now() - startedAt, finished_at: new Date().toISOString() })
      .eq('id', toolRun.id)
    if (name !== 'report_pmo_event') {
      await reportPmoEvent(context, {
        event_type: 'TOOL_FAILURE',
        severity: 'HIGH',
        title: `MONI Agent 도구 실패: ${name}`,
        summary: message,
        evidence: { tool_name: name, arguments: args, error: message, agent_run_id: context.agentRunId },
        detection_source: 'SYSTEM_DETECTED',
        confidence: 1,
        validation_status: 'VERIFIED',
        validator_name: 'MONI_TOOL_RUNTIME',
        recommended_owner: 'Codex(API)',
      }).catch(() => undefined)
    }
    throw error
  }
}

export function createMoniTools(role: unknown) {
  const allowed = new Set(allowedToolNamesForRole(role))
  return allDefinitions
    .filter((definition) => allowed.has(definition.name))
    .map((definition) => tool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters as any,
      timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
      timeoutBehavior: 'raise_exception',
      inputGuardrails: [moniToolInputGuardrail],
      outputGuardrails: [moniToolOutputGuardrail],
      execute: async (args, runContext) => runAuditedTool(
        definition.name,
        args as Record<string, unknown>,
        runContext as RunContext<MoniRuntimeContext>,
      ),
    }))
}
