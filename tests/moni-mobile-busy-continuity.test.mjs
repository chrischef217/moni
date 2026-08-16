import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobile = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const conversation = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const trend = readFileSync('src/lib/moni/agent/recent-product-trend.ts', 'utf8')

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

test('recent N-month product trend followup is routed through a deterministic database aggregate', () => {
  assert.match(conversation, /isRecentProductTrendFollowupRequest/)
  assert.match(conversation, /resolveRecentProductTrendFollowup/)
  assert.match(conversation, /get_recent_product_monthly_trend/)
  assert.match(conversation, /DIRECT_DB_AGGREGATE/)
  assert.match(trend, /직전 대화에서 확정한 제품들의 월별 추이를 바로 조회했습니다/)
  assert.match(trend, /production_records/)
  assert.match(trend, /sales_orders/)
  assert.match(trend, /sales_order_items/)
  assert.match(trend, /월말 미수잔액은 주문 단위 수금 데이터를 제품별로 임의 배분하지 않기 위해/)
})

test('trend resolver can recover target product names when they fell outside the short agent history', () => {
  assert.match(trend, /loadRecentConversationHistory/)
  assert.match(trend, /\.limit\(20\)/)
  assert.match(trend, /history\.slice\(-20\)/)
  assert.match(trend, /if \(!targets\.length\)/)
  assert.match(trend, /최근 대화 문맥 조회 실패/)
})
