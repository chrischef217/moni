import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const contracts = readFileSync('src/lib/moni/v1-contracts.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')

test('relative current-month phrases resolve against the Seoul business clock', () => {
  assert.match(contracts, /timeZone: 'Asia\/Seoul'/)
  assert.match(contracts, /이번\\s\*달/)
  assert.match(contracts, /금월/)
  assert.match(contracts, /return yearMonthInSeoul\(now\)/)
})

test('monthly production forecast and report requests take the bounded snapshot path', () => {
  assert.match(runtime, /이번\\s\*달/)
  assert.match(runtime, /예측\|보고/)
  assert.match(runtime, /hasProductionMutationIntent/)
  assert.match(runtime, /toolChoice: 'get_monthly_management_snapshot'/)
  assert.match(runtime, /const runTurnLimit = forceMonthlySnapshot \? 4 : MAX_AGENT_TURNS/)
  assert.match(runtime, /같은 답변을 위해 다른 월간 조회 도구를 연달아 호출하지 말고 바로 결론을 작성합니다/)
})

test('production mutation requests are excluded from the read-only monthly report fast path', () => {
  assert.match(runtime, /if \(hasProductionMutationIntent\(normalized\)\) return false/)
})
