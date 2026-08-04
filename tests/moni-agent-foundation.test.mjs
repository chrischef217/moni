import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const middleware = readFileSync('src/middleware.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/sdk-runtime.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')

test('prebuild verifies source without mutating TypeScript', () => {
  assert.equal(packageJson.scripts.prebuild, 'node scripts/verify-moni-agent-source.mjs')
  assert.ok(!packageJson.scripts.prebuild.includes('patch-'))
})

test('public MONI endpoint is routed to SDK runtime', () => {
  assert.match(middleware, /\/api\/moni\/agent-chat/)
  assert.match(middleware, /\/api\/moni\/agent-runtime/)
  assert.match(route, /runMoniSdkAgent/)
})

test('runtime uses official Agents SDK and strict Zod contracts', () => {
  assert.match(runtime, /from '@openai\/agents'/)
  assert.match(runtime, /from 'zod'/)
  assert.match(runtime, /parameters: toolContracts\[name\]/)
  assert.match(runtime, /outputType: MoniAnswerSchema/)
})

test('runtime validates evidence-backed metrics', () => {
  assert.match(runtime, /source_tool/)
  assert.match(runtime, /source_field/)
  assert.match(runtime, /validateAnswer\(answer, runtimeContext\)/)
  assert.match(runtime, /수치 불일치/)
})

test('production terminology is protected', () => {
  assert.match(runtime, /open_planned_quantity_g/)
  assert.match(runtime, /completed_plan_gap_g/)
  assert.match(runtime, /unaccounted_gap_g는 미완료량이나 로스가 아닙니다/)
})

test('runtime remains read only', () => {
  assert.match(runtime, /READ ONLY/)
  assert.match(runtime, /승인되지 않은 쓰기 도구입니다/)
  assert.doesNotMatch(runtime, /name:\s*['"]execute_sql['"]/)
})
