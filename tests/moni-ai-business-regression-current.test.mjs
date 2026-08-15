import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cases = JSON.parse(readFileSync('evals/moni-ai-business-regression-cases.json', 'utf8'))
const backend = readFileSync('src/lib/moni/agent/tool-backend.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const liveEval = readFileSync('src/lib/moni/agent/live-eval.ts', 'utf8')

test('business regression suite covers at least 49 realistic cases and 50 questions', () => {
  assert.ok(cases.length >= 49)
  const questionCount = cases.reduce((count, item) => count + (Array.isArray(item.turns) ? item.turns.length : 1), 0)
  assert.ok(questionCount >= 50)
  const categories = cases.map((item) => item.category).join('\n')
  for (const category of [
    '오늘 가장 먼저 해야 하는 일', '이번 달 경영 상황', '이번 달 생산 상황', '전월 대비 판단',
    '생산량 이상 탐지', '재고 부족', '재고 과다', '수금 예정', '미수금', '매출', '매입',
    '제품별 생산 이력', 'LOT 조회', '특정 날짜 생산', '경영자가 잘하는지 판단',
    '데이터 부족 시 추측 금지', '연속 대화 문맥 유지',
  ]) assert.match(categories, new RegExp(category))
})

test('official read backend is canonical-only', () => {
  assert.doesNotMatch(backend, /businessIdsWithLegacy/)
  assert.doesNotMatch(backend, /\.in\('business_id',[^\n]*default/)
  const canonicalFilters = backend.match(/\.eq\('business_id', context\.businessId\)/g) || []
  assert.ok(canonicalFilters.length >= 9)
  assert.match(runtime, /business_id=default 또는 다른 사업체의 행을 공식 데이터에 섞지 않습니다/)
})

test('live evaluator includes business cases, multi-turn context, and no-write enforcement', () => {
  assert.match(liveEval, /moni-ai-business-regression-cases\.json/)
  assert.match(liveEval, /required_tool_calls/)
  assert.match(liveEval, /required_any_terms/)
  assert.match(liveEval, /WRITE_TOOL_NAMES/)
  assert.match(liveEval, /previousResult\.conversationId/)
  assert.match(liveEval, /recentHistory/)
})

test('zero rows, units, truncation and anomaly semantics are explicit', () => {
  assert.match(runtime, /실제 실적이 0.*단정하지 않습니다/)
  assert.match(runtime, /\*_g인 수량은 항상 g/)
  assert.match(runtime, /1000으로 정확히 한 번 나누며/)
  assert.match(runtime, /may_be_truncated=true/)
  assert.match(runtime, /상세 행은 일부라고 밝힙니다/)
  assert.match(runtime, /같은 도구를 반복 호출하지 않습니다/)
  assert.match(runtime, /작업지시 발행·생산 착수를 권고하지 않습니다/)
  assert.match(runtime, /당일 생산실적이 없어도 search_production_plans를 생략하지 않습니다/)
  assert.match(backend, /summary_is_complete:/)
  assert.match(backend, /PRODUCTION_PLAN_SCALE_REVIEW_REQUIRED/)
})

test('exact LOT lookup is schema-validated and bounded to production read first', () => {
  assert.match(backend, /const lot = text\(args\.lot_query/)
  assert.match(backend, /\.ilike\('lot_number'/)
  assert.match(runtime, /function isExplicitLotLookupRequest/)
  assert.match(runtime, /forceLotLookup/)
  assert.match(runtime, /\? 'search_production_records'/)
  assert.match(runtime, /forced_lot_lookup: forceLotLookup/)
  const lot = cases.find((item) => item.id === 'business-lot-lookup')
  assert.equal(lot.required_tool_calls[0].arguments.lot_query, 'LOT20260715-3')
})
