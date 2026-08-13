import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mutationRoutes = [
  'src/app/api/moni/production-records/route.ts',
  'src/app/api/moni/monthly-production-plans/route.js',
  'src/app/api/moni/products/route.ts',
  'src/app/api/moni/products/[id]/route.ts',
  'src/app/api/moni/products/[id]/production-units/route.ts',
  'src/app/api/moni/products/[id]/production-units/[unitId]/route.ts',
  'src/app/api/moni/recipes/route.ts',
  'src/app/api/moni/raw-materials/route.ts',
  'src/app/api/moni/raw-materials/[id]/route.ts',
  'src/app/api/moni/raw-materials/[id]/pricing/route.ts',
  'src/app/api/moni/raw-material-transactions/route.ts',
  'src/app/api/moni/packaging-materials/route.ts',
  'src/app/api/moni/packaging-materials/[id]/route.ts',
  'src/app/api/moni/packaging-transactions/route.ts',
]

test('V1 production and inventory mutation routes are pinned to the canonical business', () => {
  for (const route of mutationRoutes) {
    const source = readFileSync(route, 'utf8')
    assert.match(source, /CANONICAL_MONI_BUSINESS_ID|BUSINESS_ID\s*=\s*['"]20220523011['"]/, route)
    assert.doesNotMatch(source, /business_id\s*:\s*['"]default['"]/, route)
    assert.doesNotMatch(source, /business_id\s*:\s*(?:body|payload|input|data)\.business_id/, route)
  }
})

test('production actions reject non-canonical confirmations inside PostgreSQL', () => {
  const migration = readFileSync('supabase/migrations/20260813153000_atomic_production_record_actions.sql', 'utf8')
  assert.match(migration, /v_business_id constant text := '20220523011'/)
  assert.match(migration, /non_canonical_business/)
})
