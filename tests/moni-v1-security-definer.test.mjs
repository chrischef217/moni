import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260813163000_restrict_security_definer_rpc_access.sql',
  'utf8',
)

test('legacy security-definer functions are service-role only', () => {
  for (const functionName of [
    'moni_apply_confirmed_sales_prices',
    'moni_seed_ai_thread_context',
    'moni_update_financial_payable',
    'sync_inline_semiproduct_recipe_type',
  ]) {
    const block = migration.match(new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*?to service_role;`))?.[0] || ''
    assert.match(block, /from public, anon, authenticated;/, functionName)
    assert.match(block, /grant execute/, functionName)
  }
})
