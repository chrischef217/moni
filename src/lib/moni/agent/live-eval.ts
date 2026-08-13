import casesJson from '../../../../evals/moni-agent-cases.json'
import { loadPinnedProjectContext } from '@/lib/moni/agent/memory'
import { reportPmoEvent } from '@/lib/moni/agent/pmo'
import { runMoniConversationAgent } from '@/lib/moni/agent/conversation-runtime'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const LIVE_SAFE_CASE_IDS = new Set([
  'production-month-summary',
  'relative-date-clock',
  'raw-material-stock',
  'receivables-priority',
  'company-rule',
  'capabilities',
  'freelancer-finance-denied',
  'freelancer-production-allowed',
])

type EvalCase = {
  id: string
  role?: 'admin' | 'freelancer'
  prompt: string
  required_tools: string[]
  forbidden_tools: string[]
  required_arguments: Record<string, unknown>
  required_terms: string[]
  forbidden_terms: string[]
}

export type LiveEvalCaseSummary = Pick<EvalCase, 'id' | 'role' | 'prompt'>

const cases = (casesJson as EvalCase[]).filter((item) => LIVE_SAFE_CASE_IDS.has(item.id))

export function listLiveEvalCases(): LiveEvalCaseSummary[] {
  return cases.map(({ id, role, prompt }) => ({ id, role, prompt }))
}

function valuesEqual(actual: unknown, expected: unknown) {
  if (typeof expected === 'number') return Number(actual) === expected
  if (typeof expected === 'boolean') return actual === expected
  return String(actual ?? '') === String(expected ?? '')
}

function gradeCase(args: {
  evalCase: EvalCase
  answerText: string
  answer: unknown
  toolsUsed: string[]
  toolRuns: Array<{ tool_name: string; tool_arguments: Record<string, unknown> }>
}) {
  const { evalCase, answerText, answer, toolsUsed, toolRuns } = args
  const checks: Array<{ name: string; passed: boolean; detail: string }> = []
  const toolSet = new Set(toolsUsed)

  for (const name of evalCase.required_tools) {
    checks.push({
      name: `required_tool:${name}`,
      passed: toolSet.has(name),
      detail: toolSet.has(name) ? 'called' : 'missing',
    })
  }
  for (const name of evalCase.forbidden_tools) {
    checks.push({
      name: `forbidden_tool:${name}`,
      passed: !toolSet.has(name),
      detail: toolSet.has(name) ? 'unexpectedly called' : 'not called',
    })
  }

  const searchable = `${answerText}\n${JSON.stringify(answer)}`.toLowerCase()
  for (const term of evalCase.required_terms) {
    const present = searchable.includes(term.toLowerCase())
    checks.push({
      name: `required_term:${term}`,
      passed: present,
      detail: present ? 'present' : 'missing',
    })
  }
  for (const term of evalCase.forbidden_terms) {
    const present = searchable.includes(term.toLowerCase())
    checks.push({
      name: `forbidden_term:${term}`,
      passed: !present,
      detail: present ? 'present' : 'absent',
    })
  }

  for (const [key, expected] of Object.entries(evalCase.required_arguments || {})) {
    const matches = toolRuns.some((toolRun) => (
      key in (toolRun.tool_arguments || {})
      && valuesEqual(toolRun.tool_arguments[key], expected)
    ))
    checks.push({
      name: `required_argument:${key}`,
      passed: matches,
      detail: matches ? `matched ${String(expected)}` : `missing ${String(expected)}`,
    })
  }

  const passedCount = checks.filter((check) => check.passed).length
  const score = checks.length ? passedCount / checks.length : 1
  return {
    passed: checks.every((check) => check.passed),
    score,
    checks,
  }
}

export async function runLiveEvalCase(args: {
  caseId: string
  model: string
  triggeredBy: string
}) {
  const evalCase = cases.find((item) => item.id === args.caseId)
  if (!evalCase) throw new Error('허용된 MONI 실모델 평가 사례가 아닙니다.')

  const supabase = createMoniServiceRoleClient()
  const role = evalCase.role || 'admin'
  const startedAt = Date.now()
  const { data: evalRun, error: evalRunError } = await supabase
    .from('moni_ai_eval_runs')
    .insert({
      business_id: BUSINESS_ID,
      suite_name: 'live-single-case-v2',
      model: args.model,
      triggered_by: args.triggeredBy,
      case_count: 1,
      metrics: { case_id: evalCase.id, role },
    })
    .select('id')
    .single()
  if (evalRunError) throw new Error(evalRunError.message)

  let agentRunId: string | null = null
  try {
    const { data: thread, error: threadError } = await supabase
      .from('moni_ai_threads')
      .insert({
        business_id: BUSINESS_ID,
        user_login_id: `system:eval:${args.triggeredBy}`,
        user_display_name: `MONI Eval · ${evalCase.id}`,
        user_role: role,
        title: `[EVAL] ${evalCase.id}`,
        current_page: { pathname: '/intelligence', title: 'MONI Agent Quality' },
      })
      .select('id')
      .single()
    if (threadError) throw new Error(threadError.message)

    const { data: userMessage, error: messageError } = await supabase
      .from('moni_ai_messages')
      .insert({
        business_id: BUSINESS_ID,
        thread_id: thread.id,
        role: 'user',
        content: evalCase.prompt,
        page_context: {
          pathname: '/intelligence',
          title: 'MONI Agent Quality',
          eval_case_id: evalCase.id,
        },
      })
      .select('id')
      .single()
    if (messageError) throw new Error(messageError.message)

    const pinnedProjectContext = await loadPinnedProjectContext(supabase, BUSINESS_ID)
    const result = await runMoniConversationAgent({
      model: args.model,
      currentContent: [{ type: 'input_text', text: evalCase.prompt }],
      currentUserText: evalCase.prompt,
      conversationId: null,
      recentHistory: [],
      threadMemory: {
        summary: '',
        salientFacts: [],
        openItems: [],
        decisions: [],
        summarizedMessageCount: 0,
        memoryVersion: 1,
        lastSummarizedAt: null,
      },
      pinnedProjectContext,
      context: {
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        messageId: userMessage.id,
        page: { pathname: '/intelligence', title: 'MONI Agent Quality' },
        session: {
          loginId: `system:eval:${args.triggeredBy}`,
          displayName: 'MONI Eval Runner',
          role,
        },
      },
    })
    agentRunId = result.agentRunId

    const { error: assistantMessageError } = await supabase
      .from('moni_ai_messages')
      .insert({
        business_id: BUSINESS_ID,
        thread_id: thread.id,
        role: 'assistant',
        content: result.text,
        provider: 'openai',
        model: args.model,
        page_context: {
          pathname: '/intelligence',
          title: 'MONI Agent Quality',
          eval_case_id: evalCase.id,
        },
      })
    if (assistantMessageError) throw new Error(assistantMessageError.message)

    const { data: toolRuns, error: toolRunError } = await supabase
      .from('moni_ai_tool_runs')
      .select('tool_name,tool_arguments')
      .eq('agent_run_id', result.agentRunId)
      .order('step_no', { ascending: true })
    if (toolRunError) throw new Error(toolRunError.message)

    const grade = gradeCase({
      evalCase,
      answerText: result.text,
      answer: result.text,
      toolsUsed: result.toolsUsed,
      toolRuns: (toolRuns ?? []) as Array<{
        tool_name: string
        tool_arguments: Record<string, unknown>
      }>,
    })
    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startedAt

    const { error: caseInsertError } = await supabase
      .from('moni_ai_eval_case_results')
      .insert({
        eval_run_id: evalRun.id,
        case_id: evalCase.id,
        status: grade.passed ? 'PASSED' : 'FAILED',
        score: grade.score,
        agent_run_id: result.agentRunId,
        details: {
          role,
          prompt: evalCase.prompt,
          tools_used: result.toolsUsed,
          usage: result.usage,
          duration_ms: durationMs,
          checks: grade.checks,
          answer: result.text,
        },
      })
    if (caseInsertError) throw new Error(caseInsertError.message)

    const { error: evalUpdateError } = await supabase
      .from('moni_ai_eval_runs')
      .update({
        status: 'COMPLETED',
        passed_count: grade.passed ? 1 : 0,
        failed_count: grade.passed ? 0 : 1,
        metrics: {
          case_id: evalCase.id,
          role,
          score: grade.score,
          duration_ms: durationMs,
          tool_call_count: result.toolCallCount,
          usage: result.usage,
        },
        finished_at: finishedAt,
      })
      .eq('id', evalRun.id)
    if (evalUpdateError) throw new Error(evalUpdateError.message)

    if (!grade.passed) {
      await reportPmoEvent({
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        messageId: userMessage.id,
        agentRunId: result.agentRunId,
        page: { pathname: '/intelligence', title: 'MONI Agent Quality' },
        session: {
          loginId: args.triggeredBy,
          displayName: args.triggeredBy,
          role: 'admin',
        },
      }, {
        event_type: 'CAPABILITY_GAP',
        severity: 'MEDIUM',
        title: `MONI 실모델 평가 실패: ${evalCase.id}`,
        summary: `${evalCase.id} 평가가 ${(grade.score * 100).toFixed(1)}점으로 실패했습니다.`,
        evidence: {
          eval_run_id: evalRun.id,
          case_id: evalCase.id,
          agent_run_id: result.agentRunId,
          checks: grade.checks,
        },
        detection_source: 'VALIDATOR_DETECTED',
        confidence: 1,
        validation_status: 'VERIFIED',
        validator_name: 'MONI_LIVE_EVAL_V2',
        recommended_owner: 'GPT(PMO)',
      }).catch(() => undefined)
    }

    return {
      evalRunId: evalRun.id,
      caseId: evalCase.id,
      passed: grade.passed,
      score: grade.score,
      checks: grade.checks,
      agentRunId: result.agentRunId,
      toolsUsed: result.toolsUsed,
      usage: result.usage,
      durationMs,
      answerText: result.text,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI 실모델 평가 실행 실패'
    const { error: caseFailureInsertError } = await supabase
      .from('moni_ai_eval_case_results')
      .insert({
        eval_run_id: evalRun.id,
        case_id: evalCase.id,
        status: 'ERROR',
        score: 0,
        agent_run_id: agentRunId,
        details: { role, prompt: evalCase.prompt },
        error_message: message,
      })
    if (caseFailureInsertError) {
      console.error('[MONI_AGENT_LIVE_EVAL_CASE_RECORD_ERROR]', {
        eval_run_id: evalRun.id,
        case_id: evalCase.id,
        message: caseFailureInsertError.message,
      })
    }

    const { error: evalFailureUpdateError } = await supabase
      .from('moni_ai_eval_runs')
      .update({
        status: 'FAILED',
        failed_count: 1,
        error_message: message,
        metrics: {
          case_id: evalCase.id,
          role,
          duration_ms: Date.now() - startedAt,
        },
        finished_at: new Date().toISOString(),
      })
      .eq('id', evalRun.id)
    if (evalFailureUpdateError) {
      console.error('[MONI_AGENT_LIVE_EVAL_RUN_RECORD_ERROR]', {
        eval_run_id: evalRun.id,
        case_id: evalCase.id,
        message: evalFailureUpdateError.message,
      })
    }
    throw error
  }
}
