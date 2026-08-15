import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const backend = readFileSync('src/lib/moni/agent/tool-backend.ts', 'utf8')
const productionTools = readFileSync('src/lib/moni/agent/tools/production.ts', 'utf8')
const planActions = readFileSync('src/lib/moni/chatgpt-write-actions.ts', 'utf8')
const productionActions = readFileSync('src/lib/moni/chatgpt-production-actions.ts', 'utf8')
const stage1 = readFileSync('supabase/migrations/202608150002_harden_production_plan_action_stage1.sql', 'utf8')
const stage2 = readFileSync('supabase/migrations/202608150003_revoke_legacy_production_plan_action.sql', 'utf8')
const cases = JSON.parse(readFileSync('evals/moni-ai-business-regression-cases.json', 'utf8'))

test('business regression corpus keeps at least 49 realistic cases', () => {
  assert.ok(Array.isArray(cases))
  assert.ok(cases.length >= 49)
  assert.ok(cases.some((item) => /LOT/i.test(String(item.prompt || ''))))
  assert.ok(cases.some((item) => /원재료/.test(String(item.prompt || ''))))
  assert.ok(cases.some((item) => /생산계획/.test(String(item.prompt || ''))))
})

test('production reads support exact LOT without tenant fallback', () => {
  assert.match(productionTools, /lot_query: Query/)
  assert.match(productionTools, /LOT 번호를 정확히 말하면/)
  assert.match(backend, /const lot = text\(args\.lot_query/)
  assert.match(backend, /query = query\.ilike\('lot_number'/)
  assert.match(backend, /\.eq\('business_id', context\.businessId\)/)
  assert.doesNotMatch(backend, /businessId,\s*'default'/)
})

test('production-plan scale anomaly is explicit and blocks unsafe recommendation', () => {
  assert.match(backend, /PRODUCTION_PLAN_SCALE_REVIEW_REQUIRED/)
  assert.match(backend, /10,000kg 이상/)
  assert.match(productionTools, /검증 전에는 작업지시 발행이나 생산 착수를 권고하지 않는다/)
})

test('raw-material ledger summary paginates beyond the 100-row detail window', () => {
  assert.match(backend, /summaryPageSize = 1000/)
  assert.match(backend, /summaryRows\.push/)
  assert.match(backend, /summary_is_complete/)
  assert.match(backend, /total_count: count/)
})

test('production-plan execution binds approved actor and source client', () => {
  assert.match(planActions, /p_actor_login_id: identity\.loginId/)
  assert.match(planActions, /p_source_client_id: identity\.clientId/)
  assert.match(stage1, /p_actor_login_id text/)
  assert.match(stage1, /p_source_client_id text/)
  assert.match(stage1, /confirmation_actor_mismatch/)
  assert.match(stage1, /v_business_id constant text := '20220523011'/)
  assert.match(stage1, /for update/)
  assert.match(stage1, /moni_action_audit_log/)
  assert.match(stage2, /revoke all on function public\.moni_execute_production_plan_action\(uuid, text\)/)
})

test('production confirmation revalidates the approved deduction preview before write', () => {
  assert.match(productionActions, /deductionApprovalSignature/)
  assert.match(productionActions, /approvedPreview/)
  assert.match(productionActions, /최신 미리보기로 다시 승인해 주세요/)
})
