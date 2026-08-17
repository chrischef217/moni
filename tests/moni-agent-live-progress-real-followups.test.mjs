import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const statusRoute = readFileSync('src/app/api/moni/agent-status/route.ts', 'utf8')
const copyFix = readFileSync('src/components/MoniMobileThinkingCopyFix.tsx', 'utf8')

test('status route recognizes the real Korean followups seen in production', () => {
  assert.match(statusRoute, /\\d\{1,3\}\\s\*번/)
  assert.match(statusRoute, /계속\(\?:\\s\*진행\)\?/)
  assert.match(statusRoute, /연번/)
  assert.match(statusRoute, /이어/)
})

test('status route derives the expected company-data area from recent thread context before a tool starts', () => {
  assert.match(statusRoute, /moni_ai_messages/)
  assert.match(statusRoute, /inferExpectedToolName/)
  assert.match(statusRoute, /return 'search_raw_material_transactions'/)
  assert.match(statusRoute, /조회를 준비하고 있습니다 · 질문에서 필요한 데이터 영역을 확인했습니다/)
  assert.match(statusRoute, /expected_tool_label/)
})

test('actual RUNNING tool progress remains distinct from truthful pre-tool preparation', () => {
  assert.match(statusRoute, /실제 데이터에서 조회하고 있습니다 · 조회 \$\{currentStep\}단계/)
  assert.match(statusRoute, /실제 조회 \$\{completed\.length\}단계의 결과를 질문 조건과 맞춰 답변에 반영하고 있습니다/)
  assert.doesNotMatch(statusRoute, /expectedToolName.*실제 데이터에서 조회하고 있습니다/s)
})

test('mobile polls quickly enough to catch sub-second and one-second tool runs observed in production', () => {
  assert.match(copyFix, /STATUS_REFRESH_MS = 500/)
  assert.match(copyFix, /payload\.run_status === 'RUNNING'/)
})
