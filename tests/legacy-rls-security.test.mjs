import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260808172000_harden_legacy_actions_rls.sql', 'utf8')
const audit = readFileSync('scripts/audit-legacy-supabase-access.mjs', 'utf8')

const TABLES = [
  'bom_items',
  'cash_flow',
  'inventory_logs',
  'packaging_materials',
  'packaging_transactions',
  'planned_productions',
  'productions',
  'purchase_orders',
  'raw_material_transactions',
  'raw_materials',
  'transactions',
]

test('legacy actions tables enable RLS and revoke public roles', () => {
  for (const table of TABLES) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`))
    assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role;`))
  }
})

test('legacy inventory view is no longer readable by public roles', () => {
  assert.match(migration, /revoke all on table public\.inventory_summary from anon, authenticated;/)
  assert.match(migration, /grant select on table public\.inventory_summary to service_role;/)
})

test('RLS hardening does not mutate business data or business identifiers', () => {
  assert.doesNotMatch(migration, /\b(update|insert|delete)\b/i)
  assert.doesNotMatch(migration, /business_id\s*=/i)
  assert.doesNotMatch(migration, /create\s+policy/i)
})

test('public DB access audit is now an enforcement gate', () => {
  assert.match(audit, /if \(findings\.length \|\| moniDbConsumers\.length/)
  assert.match(audit, /Public\/anon MONI database access regression detected/)
  assert.match(audit, /ALLOWED_BROWSER_DB_CONSUMERS = new Set\(\['src\/components\/GlobalMoniAgent\.tsx'\]\)/)
  assert.equal(existsSync('src/lib/supabase.ts'), false)
})
