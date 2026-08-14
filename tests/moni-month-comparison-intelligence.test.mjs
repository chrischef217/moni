import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const contracts = readFileSync('src/lib/moni/v1-contracts.ts', 'utf8')
const tools = readFileSync('src/lib/moni/agent/conversation-tools.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const mobile = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')

test('month-only requests inherit the current Asia/Seoul business year', () => {
  assert.match(contracts, /businessYearMonthInSeoul/)
  assert.match(contracts, /carriedYear \?\? current\.year/)
  assert.match(contracts, /parseRequestedYearMonths/)
  assert.match(runtime, /연도를 생략하고 “7월”, “8월”처럼 월만 말하면/)
  assert.match(runtime, /연도를 되묻지 않습니다/)
})

test('two-month management comparisons use one bounded composite agent tool', () => {
  assert.match(tools, /name: 'get_monthly_management_comparison'/)
  assert.match(tools, /const periods = parseRequestedYearMonths\(context\.currentUserText\)\.slice\(0, 2\)/)
  assert.match(runtime, /forceMonthlyComparison/)
  assert.match(runtime, /toolChoice = forceMonthlyComparison/)
  assert.match(runtime, /\? 'get_monthly_management_comparison'/)
  assert.match(runtime, /const runTurnLimit = boundedMonthlyPath \? 4 : MAX_AGENT_TURNS/)
})

test('max-turn failures are user-safe and recorded for PMO deduplicated improvement', () => {
  assert.match(runtime, /MONI가 조회 단계를 초과했습니다/)
  assert.match(runtime, /reportPmoEvent/)
  assert.match(runtime, /title: 'MONI 응답 단계 초과'/)
})

test('mobile thinking state has an adaptive ETA countdown and audible send/reply cues', () => {
  assert.match(mobile, /예상 대기 시간 · 약 \$\{remaining\}초 남음/)
  assert.match(mobile, /rememberDuration\(kind/)
  assert.match(mobile, /playCue\('sent'\)/)
  assert.match(mobile, /playCue\('complete'\)/)
})
