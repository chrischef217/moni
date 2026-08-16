import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobile = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const conversation = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')

test('mobile prevents duplicate in-flight submits and restores rejected optimistic input', () => {
  assert.match(mobile, /sendInFlightRef/)
  assert.match(mobile, /response\.status === 409/)
  assert.match(mobile, /payload\.code === 'MONI_BUSY'/)
  assert.match(mobile, /current\.slice\(0, -1\)/)
  assert.match(mobile, /setInput\(rawQuestion\)/)
  const busyIndex = mobile.indexOf("response.status === 409")
  const photoCleanupIndex = mobile.indexOf('photos.forEach((photo)', busyIndex)
  assert.ok(busyIndex >= 0 && photoCleanupIndex > busyIndex, 'busy rejection must happen before submitted-photo cleanup')
})

test('server rejects an active thread before another visible user turn is persisted and hides race losers', () => {
  assert.match(route, /activeRunForThread/)
  assert.match(route, /if \(activeRun\) return busyResponse\(\)/)
  assert.match(route, /code: 'MONI_BUSY'/)
  assert.match(route, /hideRejectedBusyTurn/)
  assert.match(route, /role: 'system'/)
  assert.match(route, /message_id: null/)
})

test('relative period followups proceed without confirmation loops or fabricated retries', () => {
  assert.match(conversation, /최신 N개월/)
  assert.match(conversation, /다시 확인을 요구하지 않습니다/)
  assert.match(conversation, /최근 대화에서 이미 대상 제품·거래처·지표가 확정돼 있고/)
  assert.match(conversation, /실제 MONI 도구가 오류를 반환하지 않았는데/)
  assert.match(conversation, /MONI_CONVERSATIONS_V1_10_MOBILE_CONTINUITY/)
})
