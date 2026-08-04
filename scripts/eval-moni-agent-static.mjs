import { readFileSync } from 'node:fs'

const cases = JSON.parse(readFileSync('evals/moni-agent-cases.json', 'utf8'))
const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const regression = process.argv.includes('--regression')

const failures = []
if (!Array.isArray(cases) || cases.length < 12) failures.push('evaluation set must contain at least 12 cases')

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
}

const requiredRuntimeMarkers = [
  'MONI_AGENT_SDK_V2',
  'outputType: MoniAnswerSchema',
  'maxTurns: 8',
  'open_planned_quantity_g',
  'completed_plan_gap_g',
  'result_meta',
  'validateAnswer(answer, runtimeContext)',
]
for (const marker of requiredRuntimeMarkers) {
  if (!runtime.includes(marker)) failures.push(`runtime marker missing: ${marker}`)
}
if (!route.includes('[MONI_AGENT_SDK_ROUTE]')) failures.push('production route audit marker is missing')

if (regression) {
  const requiredCaseIds = [
    'production-month-summary',
    'production-material-cross-check',
    'missing-period-no-substitution',
    'payables-separation',
    'pmo-data-quality',
    'no-write-production',
    'prompt-injection-document',
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
  runtime_markers_checked: requiredRuntimeMarkers.length,
}, null, 2))
