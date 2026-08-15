import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')

test('registered sales-client count uses a canonical deterministic read path', () => {
  assert.match(runtime, /isSalesClientMasterSummaryRequest/)
  assert.match(runtime, /from\('sales_clients'\)/)
  assert.match(runtime, /eq\('business_id', context\.businessId\)/)
  assert.match(runtime, /count: 'exact'/)
  assert.match(runtime, /total_registered_client_count/)
  assert.match(runtime, /현재 거래처 마스터에 등록된 거래처는/)
  assert.match(runtime, /direct_sales_client_master_summary: true/)
  assert.match(runtime, /get_sales_client_master_summary/)
})

test('admin guidance forbids guessed permission refusals before a supported read', () => {
  assert.match(runtime, /관리자에게 “조회 권한이 없다”는 말을 추측으로 하지 않습니다/)
  assert.match(runtime, /MONI가 지원하는 읽기 범위라면 먼저 실제 데이터를 조회/)
})
