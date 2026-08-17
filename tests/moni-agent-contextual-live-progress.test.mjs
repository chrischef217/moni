import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const statusRoute = readFileSync('src/app/api/moni/agent-status/route.ts', 'utf8')

test('short contextual company-data followups force a real read tool instead of memory-only numbers', () => {
  assert.match(runtime, /function inferContextualCompanyDataTool/)
  assert.match(runtime, /넘버\|번호\|다음/)
  assert.match(runtime, /return 'search_raw_material_transactions'/)
  assert.match(runtime, /forceContextualReadTool/)
  assert.match(runtime, /forceContextualReadTool \|\| undefined/)
  assert.match(runtime, /toolChoice/)
  assert.match(runtime, /forced_contextual_read_tool: forceContextualReadTool/)
})

test('raw-material instruction points to the real catalog tool name', () => {
  assert.match(runtime, /원재료 입출고는 search_raw_material_transactions를 우선 사용합니다/)
  assert.doesNotMatch(runtime, /원재료 입출고는 search_material_transactions를 우선 사용합니다/)
  assert.match(runtime, /새로운 순번·항목·수치를 요구하면 직전 답변의 숫자를 그대로 재사용하지 말고 관련 MONI 조회 도구/)
})

test('agent status reports observable phases instead of claiming it is still before the first tool call', () => {
  assert.match(statusRoute, /search_raw_material_transactions' \|\| toolName === 'search_material_transactions'/)
  assert.match(statusRoute, /원재료 입출고·소모 기록/)
  assert.match(statusRoute, /첫 실제 데이터 조회가 실행 중입니다/)
  assert.match(statusRoute, /확인을 마쳤고 답변에 반영하고 있습니다/)
  assert.match(statusRoute, /질문 맥락과 필요한 조회 범위를 확인하고 있습니다/)
  assert.doesNotMatch(statusRoute, /아직 데이터 조회 도구 호출 전입니다/)
  assert.doesNotMatch(statusRoute, /처리 시작 후 \$\{elapsed\}초/)
})
