import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const planMigration = readFileSync('supabase/migrations/20260814100352_harden_production_plan_action.sql', 'utf8')
const recordMigration = readFileSync('supabase/migrations/20260813153000_atomic_production_record_actions.sql', 'utf8')
const planActions = readFileSync('src/lib/moni/chatgpt-write-actions.ts', 'utf8')
const recordActions = readFileSync('src/lib/moni/chatgpt-production-actions.ts', 'utf8')
const agentTools = readFileSync('src/lib/moni/agent/conversation-tools.ts', 'utf8')
const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const middleware = readFileSync('src/middleware.ts', 'utf8')

test('production-plan RPC locks and consumes only a pending confirmation', () => {
  assert.match(planMigration, /where id = p_confirmation_id\s+for update/i)
  assert.match(planMigration, /status <> 'PENDING'/)
  assert.match(planMigration, /confirmation_not_pending/)
})

test('production-plan RPC enforces canonical tenant inside the transaction', () => {
  assert.match(planMigration, /v_business_id constant text := '20220523011'/)
  assert.match(planMigration, /non_canonical_business/)
  assert.match(planMigration, /coalesce\(v_payload->>'business_id', ''\) <> v_business_id/)
  assert.doesNotMatch(planMigration, /v_confirmation\.business_id\s*\)\s*returning/i)
})

test('production-plan execute binds approval to the original actor and client', () => {
  assert.match(planMigration, /requested_by_login_id is distinct from p_actor_login_id/)
  assert.match(planMigration, /source_client_id is distinct from p_source_client_id/)
  assert.match(planMigration, /confirmation_actor_mismatch/)
  assert.match(planActions, /p_actor_login_id: identity\.loginId/)
  assert.match(planActions, /p_source_client_id: identity\.clientId/)
})

test('legacy actor-unbound plan RPC is unavailable to API roles', () => {
  assert.match(planMigration, /revoke all on function public\.moni_execute_production_plan_action\(uuid, text\)[\s\S]*public, anon, authenticated, service_role/)
  assert.match(planMigration, /grant execute on function public\.moni_execute_production_plan_action\(uuid, text, text, text\)[\s\S]*to service_role/)
})

test('plan mutation, finalization and audit remain one atomic PostgreSQL call', () => {
  assert.match(planMigration, /update public\.moni_action_confirmations[\s\S]*status = 'EXECUTED'/)
  assert.match(planMigration, /insert into public\.moni_action_audit_log/)
  assert.match(planMigration, /uq_moni_action_audit_log_confirmation/)
  assert.doesNotMatch(planMigration, /exception when others/i)
})

test('expired plan confirmations are rejected and marked expired', () => {
  assert.match(planMigration, /expires_at <= now\(\)/)
  assert.match(planMigration, /status = 'EXPIRED'/)
  assert.match(planMigration, /confirmation_expired/)
})

test('production-record RPC preserves cancelled work orders instead of deleting them', () => {
  assert.match(recordMigration, /action_type = 'CANCEL_WORK_ORDER'/)
  assert.match(recordMigration, /set status = 'cancelled'/)
  assert.doesNotMatch(recordMigration, /delete from public\.production_records/i)
})

test('COMPLETE records output while CONFIRM alone can deduct raw materials', () => {
  const completeStart = recordMigration.indexOf("action_type = 'COMPLETE_PRODUCTION'")
  const confirmStart = recordMigration.indexOf("action_type = 'CONFIRM_PRODUCTION'")
  assert.ok(completeStart >= 0 && confirmStart > completeStart)
  const completeBlock = recordMigration.slice(completeStart, confirmStart)
  assert.doesNotMatch(completeBlock, /raw_material_transactions/)
  assert.match(recordMigration.slice(confirmStart), /raw_material_transactions/)
  assert.match(recordMigration.slice(confirmStart), /'OUTBOUND'/)
  assert.match(recordActions, /deductionApprovalSignature\(approvedPreview\) !== deductionApprovalSignature\(deductionPreview\)/)
  assert.match(recordActions, /최신 미리보기로 다시 승인해 주세요/)
})

test('record execution prevents replay, tenant crossover and actor mismatch', () => {
  assert.match(recordMigration, /where id = p_confirmation_id\s+for update/i)
  assert.match(recordMigration, /non_canonical_business/)
  assert.match(recordMigration, /confirmation_not_pending/)
  assert.match(recordMigration, /confirmation_actor_mismatch/)
})

test('record audit and material outbound have database uniqueness barriers', () => {
  assert.match(recordMigration, /uq_moni_action_audit_log_confirmation/)
  assert.match(recordMigration, /uq_raw_material_outbound_production_item/)
})

test('prepare paths create confirmation previews but do not mutate business tables', () => {
  assert.match(planActions, /from\('moni_action_confirmations'\)\s*\.insert/)
  assert.doesNotMatch(planActions.slice(0, planActions.indexOf('export async function executeProductionPlanChange')), /from\('monthly_production_plans'\)\s*\.update/)
  assert.match(recordActions, /from\('moni_action_confirmations'\)/)
  const executeIndex = recordActions.indexOf('export async function executeProductionOperation')
  assert.doesNotMatch(recordActions.slice(0, executeIndex), /from\('production_records'\)\s*\.(insert|update|delete)/)
})

test('conversation runtime requires a separate pre-existing confirmation turn', () => {
  assert.match(runtime, /prepare를 호출한 같은 사용자 턴에서는 execute_\*를 절대 실행하지 않습니다/)
  assert.match(runtime, /preexistingPendingConfirmationIds: await pendingBeforeRun\(input\)/)
  assert.match(agentTools, /preexistingPendingConfirmationIds\.has\(args\.confirmation_id\)/)
  assert.match(agentTools, /같은 턴의 prepare→execute는 금지됩니다/)
})

test('all agent-exposed mutation tools are confirmation-managed production tools', () => {
  const expected = [
    'prepare_production_plan_change',
    'execute_production_plan_change',
    'prepare_production_operation',
    'execute_production_operation',
  ]
  for (const name of expected) assert.match(agentTools, new RegExp(`name: '${name}'`))
  assert.doesNotMatch(agentTools, /name: '(create|update|delete)_(sale|purchase|receipt|payment|inventory|product|recipe|lot)/)
})

test('middleware rejects default and every non-canonical explicit tenant', () => {
  assert.match(middleware, /businessId === '' \|\| businessId === MONI_BUSINESS_ID/)
  assert.doesNotMatch(middleware, /LEGACY_BUSINESS_ID/)
  assert.doesNotMatch(middleware, /businessId === ['"]default['"]/)
})
