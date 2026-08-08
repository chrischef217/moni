import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260808153000_moni_mcp_token_lifecycle_audit.sql', 'utf8')
const acceptance = readFileSync('src/lib/moni/mcp/acceptance-status.ts', 'utf8')

test('refresh-token rotation is audited by a database trigger without plaintext tokens', () => {
  assert.match(migration, /refresh_count integer not null default 0/)
  assert.match(migration, /last_refreshed_at timestamptz/)
  assert.match(migration, /old\.refresh_token_hash is distinct from new\.refresh_token_hash/)
  assert.match(migration, /new\.refresh_count := coalesce\(old\.refresh_count, 0\) \+ 1/)
  assert.match(migration, /new\.last_refreshed_at := now\(\)/)
  assert.match(migration, /before update of refresh_token_hash/)
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/)
  assert.doesNotMatch(migration, /refresh_token\s+text/)
})

test('acceptance evidence includes refresh audit and requires admin revocation before automated pass', () => {
  assert.match(acceptance, /refresh_count,last_refreshed_at/)
  assert.match(acceptance, /refreshRotations/)
  assert.match(acceptance, /ADMIN_REVOCATION_AUDIT_TOOLS/)
  assert.match(acceptance, /admin_revoke_mcp_token/)
  assert.match(acceptance, /admin_revoke_mcp_client_tokens/)
  assert.match(acceptance, /admin_disable_mcp_client/)
  assert.match(acceptance, /'revocation_audit'/)
  assert.match(acceptance, /revocationActions\.length > 0 \? 'PASS' : 'PENDING'/)
})

test('live refresh remains non-blocking during the bounded acceptance window', () => {
  assert.match(acceptance, /'refresh_rotation'/)
  assert.match(acceptance, /refreshRotations > 0 \? 'PASS' : 'MANUAL'/)
  assert.match(acceptance, /access token 수명은 1시간이고 수용검사 창은 최대 30분/)
})
