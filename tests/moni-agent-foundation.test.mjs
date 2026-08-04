import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const middleware = readFileSync('src/middleware.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const policies = readFileSync('src/lib/moni/agent/policies.ts', 'utf8')
const memory = readFileSync('src/lib/moni/agent/memory.ts', 'utf8')
const session = readFileSync('src/lib/moni/agent/supabase-session.ts', 'utf8')
const guardrails = readFileSync('src/lib/moni/agent/guardrails.ts', 'utf8')
const telemetry = readFileSync('src/lib/moni/agent/telemetry.ts', 'utf8')
const pmoRoute = readFileSync('src/app/api/moni/pmo-events/route.ts', 'utf8')

test('prebuild verifies source without mutating TypeScript', () => {
  assert.equal(packageJson.scripts.prebuild, 'node scripts/verify-moni-agent-source.mjs')
  assert.ok(!packageJson.scripts.prebuild.includes('patch-'))
  assert.equal(readdirSync('scripts').some((name) => /^patch-.*\.mjs$/.test(name)), false)
})

test('public MONI endpoint is routed only to SDK runtime', () => {
  assert.match(middleware, /\/api\/moni\/agent-chat/)
  assert.match(middleware, /\/api\/moni\/agent-runtime/)
  assert.match(route, /runMoniSdkAgent/)
  assert.equal(existsSync('src/app/api/moni/agent-v2/route.ts'), false)
})

test('runtime uses official Agents SDK and structured output', () => {
  assert.match(runtime, /from '@openai\/agents'/)
  assert.match(runtime, /from 'zod'/)
  assert.match(runtime, /outputType: MoniAnswerSchema/)
  assert.match(registry, /parameters: definition\.parameters/)
})

test('runtime validates evidence-backed metrics and period', () => {
  assert.match(runtime, /source_tool/)
  assert.match(runtime, /source_field/)
  assert.match(runtime, /validateAnswer\(answer, runtimeContext\)/)
  assert.match(runtime, /수치 불일치/)
  assert.match(runtime, /답변 기간이 도구 조회기간과 일치하지 않음/)
})

test('production terminology is protected', () => {
  assert.match(registry, /open_planned_quantity_g/)
  assert.match(registry, /completed_plan_gap_g/)
  assert.match(runtime, /unaccounted_gap_g는 미완료량이나 로스가 아닙니다/)
})

test('runtime remains read only and role scoped', () => {
  assert.match(runtime, /READ ONLY/)
  assert.match(policies, /FREELANCER_TOOLS/)
  assert.doesNotMatch(policies, /FREELANCER_TOOLS[\s\S]*search_sales_and_receivables[\s\S]*\]/)
  assert.match(registry, /assertToolAllowedForRole/)
  assert.doesNotMatch(registry, /name:\s*['"]execute_sql['"]/)
})

test('persistent session and layered memory are enabled', () => {
  assert.match(runtime, /SupabaseMoniSession/)
  assert.match(session, /implements Session/)
  assert.match(session, /moni_ai_session_items/)
  assert.match(route, /loadThreadMemory/)
  assert.match(route, /loadPinnedProjectContext/)
  assert.match(route, /maybeRefreshThreadMemory/)
  assert.match(memory, /MONI Memory Curator/)
})

test('tool security guardrails are attached', () => {
  assert.match(guardrails, /defineToolInputGuardrail/)
  assert.match(guardrails, /defineToolOutputGuardrail/)
  assert.match(registry, /inputGuardrails: \[moniToolInputGuardrail\]/)
  assert.match(registry, /outputGuardrails: \[moniToolOutputGuardrail\]/)
})

test('usage latency and validation telemetry are persisted', () => {
  assert.match(telemetry, /input_tokens/)
  assert.match(telemetry, /output_tokens/)
  assert.match(telemetry, /latency_ms/)
  assert.match(telemetry, /validation_status: 'PASSED'/)
})

test('PMO control plane enforces admin and transitions', () => {
  assert.match(pmoRoute, /requireAdmin/)
  assert.match(pmoRoute, /allowed_transitions/)
  assert.match(pmoRoute, /PREVIEW_TESTING/)
  assert.match(pmoRoute, /PMO_REVIEW/)
})
