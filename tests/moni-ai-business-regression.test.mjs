import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cases = JSON.parse(readFileSync('evals/moni-ai-business-regression-cases.json', 'utf8'))
const backend = readFileSync('src/lib/moni/agent/tool-backend.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const liveEval = readFileSync('src/lib/moni/agent/live-eval.ts', 'utf8')

test('business regression suite covers at least 40 realistic questions and required domains', () => {
  assert.ok(cases.length >= 40)
  const questionCount = cases.reduce((count, item) => count + (Array.isArray(item.turns) ? item.turns.length : 1), 0)
  assert.ok(questionCount >= 40)
  const categories = cases.map((item) => item.category).join('\n')
  for (const category of [
    '오늘 가장 먼저 해야 하는 일', '이번 달 경영 상황', '이번 달 생산 상황', '전월 대비 판단',
    '생산량 이상 탐지', '재고 부족', '재고 과다', '수금 예정', '미수금', '매출', '매입',
    '제품별 생산 이력', 'LOT 조회', '특정 날짜 생산', '경영자가 잘하는지 판단',
    '데이터 부족 시 추측 금지', '연속 대화 문맥 유지',
  ]) assert.match(categories, new RegExp(category))
})

test('official MONI read tools are strictly canonical and never mix default rows', () => {
  assert.doesNotMatch(backend, /businessIdsWithLegacy/)
  assert.doesNotMatch(backend, /\.in\('business_id',[^\n]*default/)
  const canonicalFilters = backend.match(/\.eq\('business_id', context\.businessId\)/g) || []
  assert.ok(canonicalFilters.length >= 9)
  assert.match(runtime, /business_id=default 또는 다른 사업체의 행을 공식 데이터에 섞지 않습니다/)
})

test('live evaluator supports exact tool calls, no-write enforcement and consecutive turns', () => {
  assert.match(liveEval, /moni-ai-business-regression-cases\.json/)
  assert.match(liveEval, /required_tool_calls/)
  assert.match(liveEval, /required_any_terms/)
  assert.match(liveEval, /WRITE_TOOL_NAMES/)
  assert.match(liveEval, /previousResult\.conversationId/)
  assert.match(liveEval, /recentHistory/)
})

test('zero-row answers must distinguish missing input from actual zero performance', () => {
  assert.match(runtime, /실제 실적이 0.*단정하지 않습니다/)
  const noDataCases = cases.filter((item) => /no-data|insufficient|missing/.test(item.id))
  assert.ok(noDataCases.length >= 4)
  for (const item of noDataCases) {
    assert.ok(item.required_any_terms.flat().some((term) => /입력|확인|단정|부족|없/.test(term)))
  }
})

test('operational reads force the matching canonical tool without weakening write intent', () => {
  assert.match(runtime, /function forcedReadTool/)
  assert.match(runtime, /hasProductionMutationIntent\(message\)/)
  assert.match(runtime, /return 'search_production_records'/)
  assert.match(runtime, /return 'search_sales_and_receivables'/)
  assert.match(runtime, /return 'search_purchases_and_payables'/)
  assert.match(runtime, /toolChoice: forcedTool/)
})

test('agent instructions enforce one-time kg conversion and truncated-result disclosure', () => {
  assert.match(runtime, /이름이 \*_g인 수량은 항상 g/)
  assert.match(runtime, /1000으로 정확히 한 번 나누며/)
  assert.match(runtime, /may_be_truncated=true/)
  assert.match(runtime, /전체 원장·전체 건수라고 단정하지 않습니다/)
  assert.ok(cases.some((item) => item.id === 'business-august-plan-unit-anomaly'))
})
