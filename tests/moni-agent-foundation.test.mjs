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
const pmo = readFileSync('src/lib/moni/agent/pmo.ts', 'utf8')
const pmoRoute = readFileSync('src/app/api/moni/pmo-events/route.ts', 'utf8')
const liveEvalRoute = readFileSync('src/app/api/moni/agent-evals/route.ts', 'utf8')
const canaryRoute = readFileSync('src/app/api/moni/agent-evals/canary/route.ts', 'utf8')
const canaryMigration = readFileSync('supabase/migrations/20260804070000_add_moni_agent_eval_canary_requests.sql', 'utf8')

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

test('gap validator distinguishes explicit negation from actual misuse', () => {
  assert.match(runtime, /function hasUnsafeUnaccountedGapInterpretation/)
  assert.match(runtime, /safeNegation/)
  assert.match(runtime, /의미하지/)
  assert.match(runtime, /hasUnsafeUnaccountedGapInterpretation\(answer\)/)
  assert.doesNotMatch(runtime, /unaccounted_gap_g\.\{0,20\}/)
})

test('agent initialization is covered by failure telemetry', () => {
  const tryIndex = runtime.indexOf('  try {\n    const supervisor = new Agent')
  const catchIndex = runtime.indexOf('  } catch (error) {', tryIndex)
  assert.ok(tryIndex >= 0)
  assert.ok(catchIndex > tryIndex)
  assert.match(runtime.slice(tryIndex, catchIndex), /createMoniTools\(context\.session\.role\)/)
  assert.match(runtime.slice(tryIndex, catchIndex), /new SupabaseMoniSession/)
  assert.match(runtime.slice(catchIndex), /markAgentRunFailed/)
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

test('PMO tool evidence is strict while internal evidence remains flexible', () => {
  const toolSchema = pmo.match(/export const PmoEventInputSchema[\s\S]*?\.strict\(\)/)?.[0] || ''
  assert.match(pmo, /export const PmoToolEvidenceSchema/)
  assert.match(pmo, /PmoToolEvidenceSchema[\s\S]*?\.strict\(\)/)
  assert.match(toolSchema, /evidence: PmoToolEvidenceSchema/)
  assert.doesNotMatch(toolSchema, /z\.record\(/)
  assert.match(pmo, /const PmoEventStorageSchema/)
  assert.match(pmo, /PmoEventStorageSchema[\s\S]*?evidence: z\.record\(/)
  assert.match(pmo, /PmoEventStorageSchema\.parse\(raw\)/)
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

test('admin live evaluation remains authenticated and bounded', () => {
  assert.match(liveEvalRoute, /requireAdmin/)
  assert.match(liveEvalRoute, /maxDuration = 60/)
  assert.match(liveEvalRoute, /runLiveEvalCase/)
})

test('one-time canary stores only token hash and atomically claims request', () => {
  assert.match(canaryRoute, /createHash\('sha256'\)/)
  assert.match(canaryRoute, /\.eq\('token_hash', tokenHash\)/)
  assert.match(canaryRoute, /\.eq\('status', 'PENDING'\)/)
  assert.match(canaryRoute, /claimed\.case_id/)
  assert.match(canaryRoute, /maxDuration = 60/)
  assert.doesNotMatch(canaryRoute, /case_id\s*:\s*z\./)
  assert.match(canaryMigration, /token_hash text not null/)
  assert.doesNotMatch(canaryMigration, /\btoken\s+text\b/)
  assert.match(canaryMigration, /enable row level security/)
  assert.match(canaryMigration, /revoke all on table public\.moni_ai_eval_canary_requests from anon, authenticated/)
})
