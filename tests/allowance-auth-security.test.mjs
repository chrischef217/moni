import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const secureAuth = readFileSync('src/lib/allowance/secure-auth.ts', 'utf8')
const loginRoute = readFileSync('src/app/api/allowance/auth/login/route.ts', 'utf8')
const logoutRoute = readFileSync('src/app/api/allowance/auth/logout/route.ts', 'utf8')
const sessionHelper = readFileSync('src/lib/allowance/session.ts', 'utf8')
const mcpSession = readFileSync('src/lib/moni/mcp/session.ts', 'utf8')
const moniDb = readFileSync('src/lib/moni/db.ts', 'utf8')
const browserSupabase = readFileSync('src/lib/supabase.ts', 'utf8')
const migrateRoute = readFileSync('src/app/api/migrate/route.ts', 'utf8')
const migrateBomRoute = readFileSync('src/app/api/migrate-bom/route.ts', 'utf8')
const migrateDoobae = readFileSync('src/lib/migrate_doobae.ts', 'utf8')
const sessionMigration = readFileSync('supabase/migrations/20260808161000_harden_allowance_session_storage.sql', 'utf8')

test('active login path is DB-only and has no hard-coded fallback credential', () => {
  assert.match(loginRoute, /verifySecureAllowanceLogin/)
  assert.match(loginRoute, /createSecureAllowanceSession/)
  assert.doesNotMatch(loginRoute, /verifyAllowanceLogin/)
  assert.doesNotMatch(loginRoute, /createAllowanceSession/)
  assert.doesNotMatch(secureAuth, /FALLBACK_ADMIN/)
  assert.doesNotMatch(secureAuth, /fallback-secret/)
  assert.doesNotMatch(secureAuth, /['"]1111['"]/)
})

test('session cookies use random bearer tokens while DB stores only SHA-256 token hashes', () => {
  assert.match(secureAuth, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(secureAuth, /createHash\('sha256'\)/)
  assert.match(secureAuth, /token: tokenHash/)
  assert.doesNotMatch(secureAuth, /token: rawToken/)
})

test('session creation fails closed when DB persistence fails', () => {
  assert.match(secureAuth, /if \(error\) throw new AllowanceAuthStorageError\(\)/)
  assert.doesNotMatch(secureAuth, /createFallbackSession/)
  assert.doesNotMatch(secureAuth, /return .*fallback/i)
})

test('session reads revalidate the current DB user and invalidate identity changes', () => {
  assert.match(secureAuth, /const currentUser = await getCurrentUser\(session\.login_id\)/)
  assert.match(secureAuth, /currentUser\.role !== session\.role/)
  assert.match(secureAuth, /currentUser\.freelancer_ref_id !== session\.freelancer_ref_id/)
  assert.match(secureAuth, /await destroyByHash\(tokenHash\)/)
})

test('all active allowance and MCP session entry points use secure auth', () => {
  assert.match(sessionHelper, /readSecureAllowanceSession/)
  assert.doesNotMatch(sessionHelper, /readAllowanceSession/)
  assert.match(logoutRoute, /destroySecureAllowanceSession/)
  assert.doesNotMatch(logoutRoute, /destroyAllowanceSession/)
  assert.match(mcpSession, /readSecureAllowanceSession/)
  assert.match(mcpSession, /token\.startsWith\('fallback\.'\)/)
})

test('login does not trim passwords and storage errors fail with service unavailable', () => {
  assert.match(loginRoute, /const password = body\?\.password \?\? ''/)
  assert.doesNotMatch(loginRoute, /body\?\.password\?\.trim/)
  assert.match(loginRoute, /storageUnavailable \? 503 : 500/)
})

test('database rejects non-SHA-256 session storage and removes only expired legacy rows', () => {
  assert.match(sessionMigration, /expires_at <= now\(\)/)
  assert.match(sessionMigration, /token !~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(sessionMigration, /raise exception 'active or unexpected legacy allowance sessions remain/)
  assert.match(sessionMigration, /allowance_platform_sessions_token_sha256_check/)
  assert.match(sessionMigration, /check \(token ~ '\^\[0-9a-f\]\{64\}\$'\)/)
})

test('allowance auth tables are defense-in-depth service-role only', () => {
  assert.match(sessionMigration, /enable row level security/g)
  assert.match(sessionMigration, /revoke all on table public\.allowance_platform_users from anon, authenticated/)
  assert.match(sessionMigration, /revoke all on table public\.allowance_platform_sessions from anon, authenticated/)
  assert.match(sessionMigration, /revoke all on table public\.allowance_platform_state from anon, authenticated/)
  assert.match(sessionMigration, /grant all on table public\.allowance_platform_users to service_role/)
})

test('MONI admin database access is server-only and never falls back to anon', () => {
  assert.match(moniDb, /import 'server-only'/)
  assert.match(moniDb, /function requireServiceRoleKey\(\)/)
  assert.match(moniDb, /throw new Error\('SUPABASE_SERVICE_ROLE_KEY environment variable is not configured\.'\)/)
  assert.match(moniDb, /createClient\(supabaseUrl, requireServiceRoleKey\(\)/)
  assert.doesNotMatch(moniDb, /SUPABASE_SERVICE_ROLE_KEY'\) \|\| supabaseAnonKey/)
})

test('shared browser supabase module exposes no privileged admin client', () => {
  assert.doesNotMatch(browserSupabase, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(browserSupabase, /supabaseAdmin/)
  assert.match(browserSupabase, /export const supabase = createClient\(supabaseUrl, supabaseAnonKey/)
})

test('legacy migration helpers use strict server service-role access', () => {
  assert.match(migrateDoobae, /import 'server-only'/)
  assert.match(migrateDoobae, /createMoniServiceRoleClient/)
  assert.doesNotMatch(migrateDoobae, /supabaseAdmin/)
  assert.match(migrateBomRoute, /createMoniServiceRoleClient/)
  assert.doesNotMatch(migrateBomRoute, /supabaseAdmin/)
})

test('legacy migration HTTP routes are non-GET, admin-only, and production-disabled', () => {
  for (const source of [migrateRoute, migrateBomRoute]) {
    assert.match(source, /export async function GET\(\)/)
    assert.match(source, /status: 405/)
    assert.match(source, /export async function POST\(request: NextRequest\)/)
    assert.match(source, /process\.env\.VERCEL_ENV === 'production'/)
    assert.match(source, /status: 410/)
    assert.match(source, /getSessionFromRequest\(request\)/)
    assert.match(source, /session\.role !== 'admin'/)
  }
})
