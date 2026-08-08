import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const storage = readFileSync('src/app/audit/lib/storage.ts', 'utf8')
const db = readFileSync('src/lib/moni/db.ts', 'utf8')

test('audit storage is server-only and uses the central MONI service-role factory', () => {
  assert.match(storage, /import 'server-only'/)
  assert.match(storage, /createMoniServiceRoleClient/)
  assert.doesNotMatch(storage, /\bcreateClient\s*\(/)
  assert.doesNotMatch(storage, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('central MONI factory remains fail-closed on missing service role', () => {
  assert.match(db, /function requireServiceRoleKey\(\)/)
  assert.match(db, /createMoniServiceRoleClient/)
  assert.doesNotMatch(db, /SUPABASE_SERVICE_ROLE_KEY'\) \|\| supabaseAnonKey/)
})
