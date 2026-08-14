import { readFileSync } from 'node:fs'

const cases = JSON.parse(readFileSync('evals/moni-agent-cases.json', 'utf8'))
const businessCases = JSON.parse(readFileSync('evals/moni-ai-business-regression-cases.json', 'utf8'))
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const conversationTools = readFileSync('src/lib/moni/agent/conversation-tools.ts', 'utf8')
const productionActions = readFileSync('src/lib/moni/chatgpt-production-actions.ts', 'utf8')
const atomicMigration = readFileSync('supabase/migrations/20260813153000_atomic_production_record_actions.sql', 'utf8')
const policies = readFileSync('src/lib/moni/agent/policies.ts', 'utf8')
const memory = readFileSync('src/lib/moni/agent/memory.ts', 'utf8')
const telemetry = readFileSync('src/lib/moni/agent/telemetry.ts', 'utf8')
const pmoRoute = readFileSync('src/app/api/moni/pmo-events/route.ts', 'utf8')
const regression = process.argv.includes('--regression')

const failures = []
if (!Array.isArray(cases) || cases.length < 15) failures.push('evaluation set must contain at least 15 cases')
if (!Array.isArray(businessCases) || businessCases.length < 40) failures.push('business regression set must contain at least 40 cases')
for (const [index, item] of businessCases.entries()) {
  const prefix = 'business_case[' + index + ']'
  if (!item?.id || !item?.category) failures.push(prefix + ' id and category are required')
  if (!item?.prompt && (!Array.isArray(item?.turns) || item.turns.length < 2)) failures.push(prefix + ' prompt or multi-turn sequence is required')
  if (!Array.isArray(item?.required_tools)) failures.push(prefix + ' required_tools must be an array')
  if (!Array.isArray(item?.required_terms)) failures.push(prefix + ' required_terms must be an array')
  if (!Array.isArray(item?.required_any_terms)) failures.push(prefix + ' required_any_terms must be an array')
  if (!Array.isArray(item?.forbidden_terms)) failures.push(prefix + ' forbidden_terms must be an array')
}

const ids = new Set()
for (const [index, item] of cases.entries()) {
  const prefix = `case[${index}]`
  if (!item || typeof item !== 'object') {
    failures.push(`${prefix} must be an object`)
    continue
  }
  if (!item.id || ids.has(item.id)) failures.push(`${prefix} id must be unique and non-empty`)
  ids.add(item.id)
  if (!item.prompt || typeof item.prompt !== 'string') failures.push(`${prefix} prompt is required`)
  for (const key of ['required_tools', 'forbidden_tools', 'required_terms', 'forbidden_terms']) {
    if (!Array.isArray(item[key])) failures.push(`${prefix} ${key} must be an array`)
  }
  if (!item.required_arguments || typeof item.required_arguments !== 'object' || Array.isArray(item.required_arguments)) {
    failures.push(`${prefix} required_arguments must be an object`)
  }
  if (item.role && !['admin', 'freelancer'].includes(item.role)) failures.push(`${prefix} role must be admin or freelancer`)
}

const markerChecks = [
  [runtime, 'startOpenAIConversationsSession', 'runtime'],
  [runtime, 'conversationId', 'runtime'],
  [runtime, 'maxTurns: MAX_AGENT_TURNS', 'runtime'],
  [runtime, "reasoningItemIdPolicy: 'preserve'", 'runtime'],
  [runtime, 'incompleteReasoningChain', 'runtime'],
  [registry, 'open_planned_quantity_g', 'registry'],
  [registry, 'completed_plan_gap_g', 'registry'],
  [conversationTools, 'get_monthly_management_snapshot', 'conversation-tools'],
  [conversationTools, 'preexistingPendingConfirmationIds', 'conversation-tools'],
  [conversationTools, 'hasProductionMutationIntent', 'conversation-tools'],
  [conversationTools, '유효한 JSON 객체', 'conversation-tools'],
  [productionActions, "rpc('moni_execute_production_record_action'", 'production-actions'],
  [atomicMigration, 'uq_moni_action_audit_log_confirmation', 'atomic-migration'],
  [atomicMigration, "v_business_id constant text := '20220523011'", 'atomic-migration'],
  [policies, 'FREELANCER_TOOLS', 'policies'],
  [memory, 'MONI Memory Curator', 'memory'],
  [runtime, 'totalTokens', 'runtime'],
  [pmoRoute, 'PREVIEW_TESTING', 'pmo-control-plane'],
]
for (const [source, marker, label] of markerChecks) {
  if (!source.includes(marker)) failures.push(`${label} marker missing: ${marker}`)
}
if (!route.includes('[MONI_AGENT_SDK_ROUTE]')) failures.push('production route audit marker is missing')
if (!route.includes('loadThreadMemory')) failures.push('thread memory loading is missing')

if (regression) {
  const requiredCaseIds = [
    'production-month-summary',
    'production-material-cross-check',
    'missing-period-no-substitution',
    'payables-separation',
    'pmo-data-quality',
    'no-write-production',
    'prompt-injection-document',
    'freelancer-finance-denied',
    'memory-user-correction',
    'pmo-state-control',
  ]
  for (const id of requiredCaseIds) if (!ids.has(id)) failures.push(`regression case missing: ${id}`)
}

if (failures.length) {
  console.error('MONI Agent static evaluation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  mode: regression ? 'regression' : 'static',
  case_count: cases.length,
  business_case_count: businessCases.length,
  business_question_count: businessCases.reduce((count, item) => count + (Array.isArray(item.turns) ? item.turns.length : 1), 0),
  marker_checks: markerChecks.length,
}, null, 2))
