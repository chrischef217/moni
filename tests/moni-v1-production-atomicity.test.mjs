import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260813153000_atomic_production_record_actions.sql', 'utf8')
const actions = readFileSync('src/lib/moni/chatgpt-production-actions.ts', 'utf8')
const productionRoute = readFileSync('src/app/api/moni/production-records/route.ts', 'utf8')

test('five production actions share one atomic PostgreSQL execution boundary', () => {
  for (const action of [
    'CREATE_WORK_ORDER', 'UPDATE_WORK_ORDER', 'CANCEL_WORK_ORDER',
    'COMPLETE_PRODUCTION', 'CONFIRM_PRODUCTION',
  ]) assert.match(migration, new RegExp(action))
  assert.match(actions, /rpc\('moni_execute_production_record_action'/)
})

test('confirmation is locked pending-only so replay and races are blocked', () => {
  assert.match(migration, /where id = p_confirmation_id\s+for update/)
  assert.match(migration, /v_confirmation\.status <> 'PENDING'/)
  assert.match(migration, /confirmation_not_pending/)
})

test('canonical business and actor identity are checked inside transaction', () => {
  assert.match(migration, /v_business_id constant text := '20220523011'/)
  assert.match(migration, /non_canonical_business/)
  assert.match(migration, /confirmation_actor_mismatch/)
  assert.doesNotMatch(migration, /'default'/)
})

test('cancel preserves the row and complete does not deduct inventory', () => {
  const cancelBlock = migration.match(/elsif v_confirmation\.action_type = 'CANCEL_WORK_ORDER'[\s\S]*?elsif v_confirmation\.action_type = 'COMPLETE_PRODUCTION'/)?.[0] || ''
  const completeBlock = migration.match(/elsif v_confirmation\.action_type = 'COMPLETE_PRODUCTION'[\s\S]*?elsif v_confirmation\.action_type = 'CONFIRM_PRODUCTION'/)?.[0] || ''
  assert.match(cancelBlock, /set status = 'cancelled'/)
  assert.doesNotMatch(cancelBlock, /delete from public\.production_records/)
  assert.match(completeBlock, /set actual_quantity_g/)
  assert.doesNotMatch(completeBlock, /update public\.raw_materials/)
})

test('confirm alone locks and deducts stock and writes linked OUTBOUND', () => {
  const confirmBlock = migration.match(/elsif v_confirmation\.action_type = 'CONFIRM_PRODUCTION'[\s\S]*?v_after := to_jsonb/)?.[0] || ''
  assert.match(confirmBlock, /from public\.raw_materials[\s\S]*for update/)
  assert.match(confirmBlock, /set current_stock_g = current_stock_g - v_required_g/)
  assert.match(confirmBlock, /'OUTBOUND'/)
  assert.match(confirmBlock, /production_record_id/)
})

test('mutation, audit, and confirmation finalization are one function transaction', () => {
  assert.match(migration, /update public\.moni_action_confirmations[\s\S]*set status = 'EXECUTED'/)
  assert.match(migration, /insert into public\.moni_action_audit_log/)
  assert.match(migration, /uq_moni_action_audit_log_confirmation/)
  assert.doesNotMatch(migration, /exception when others/)
})

test('application performs post-commit verification against record, confirmation, audit and outbound', () => {
  assert.match(actions, /Promise\.all/)
  assert.match(actions, /confirmation_executed/)
  assert.match(actions, /audit_row_count/)
  assert.match(actions, /raw_material_transactions_verified/)
})

test('confirm preview is shared server-side and never depends on an unauthenticated self-fetch', () => {
  assert.match(actions, /buildCanonicalProductionDeductionPreview/)
  assert.match(productionRoute, /buildCanonicalProductionDeductionPreview/)
  assert.doesNotMatch(actions, /fetch\(`?\$\{?PRODUCTION_API_ORIGIN/)
  assert.doesNotMatch(actions, /moni-sigma\.vercel\.app/)
})
