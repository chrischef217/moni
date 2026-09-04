import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const middleware = readFileSync('src/middleware.ts', 'utf8')
const sessionRoute = readFileSync('src/app/api/allowance/auth/session/route.ts', 'utf8')

test('all MONI API routes pass through the common session boundary', () => {
  assert.match(middleware, /'\/api\/moni\/:path\*'/)
  assert.match(middleware, /pathname\.startsWith\(MONI_API_PREFIX\)/)
  assert.match(middleware, /verifyMoniSession\(request\)/)
})

test('the common boundary delegates to the DB-backed allowance session verifier', () => {
  assert.match(middleware, /SESSION_CHECK_PATH = '\/api\/allowance\/auth\/session'/)
  assert.match(middleware, /cookie: request\.headers\.get\('cookie'\) \|\| ''/)
  assert.match(sessionRoute, /getSessionFromRequest\(request\)/)
  assert.match(sessionRoute, /status: 401/)
})

test('middleware fails closed when authentication storage cannot be verified', () => {
  assert.match(middleware, /status: 503/)
  assert.match(middleware, /X-MONI-Auth': 'unavailable'/)
  assert.match(middleware, /cache: 'no-store'/)
  assert.doesNotMatch(middleware, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('only the one-time live-eval canary bypasses ordinary MONI login', () => {
  assert.match(middleware, /'\/api\/moni\/agent-evals\/canary'/)
  assert.doesNotMatch(middleware, /SESSION_EXEMPT_PATHS[\s\S]*'\/api\/moni\/raw-materials'/)
  assert.doesNotMatch(middleware, /SESSION_EXEMPT_PATHS[\s\S]*'\/api\/moni\/products'/)
  assert.doesNotMatch(middleware, /SESSION_EXEMPT_PATHS[\s\S]*'\/api\/moni\/production-records'/)
  assert.doesNotMatch(middleware, /SESSION_EXEMPT_PATHS[\s\S]*'\/api\/moni\/agent-evals'/)
})

test('authenticated MONI APIs reject foreign business_id query scopes', () => {
  assert.match(middleware, /MONI_BUSINESS_ID = String\(process\.env\.MONI_BUSINESS_ID \|\| '20220523011'\)/)
  assert.match(middleware, /LEGACY_BUSINESS_ID = 'default'/)
  assert.match(middleware, /searchParams\.getAll\('business_id'\)/)
  assert.match(middleware, /id === '' \|\| id === MONI_BUSINESS_ID \|\| id === LEGACY_BUSINESS_ID/)
  assert.match(middleware, /X-MONI-Tenant': 'rejected'/)
  const authIndex = middleware.indexOf('verifyMoniSession(request)')
  const tenantIndex = middleware.indexOf('hasForeignTenantQuery(request)')
  assert.ok(tenantIndex > authIndex)
})

test('authenticated MONI JSON writes reject foreign top-level business_id values', () => {
  assert.match(middleware, /request\.clone\(\)\.json\(\)/)
  assert.match(middleware, /Object\.prototype\.hasOwnProperty\.call\(payload, 'business_id'\)/)
  assert.match(middleware, /return !isAllowedBusinessId\(\(payload as Record<string, unknown>\)\.business_id\)/)
  assert.match(middleware, /hasForeignTenantQuery\(request\) \|\| \(await hasForeignTenantBody\(request\)\)/)
  assert.doesNotMatch(middleware, /BODY_TENANT_GUARD_EXEMPT_PATHS[\s\S]*'\/api\/moni\/products'/)
  assert.doesNotMatch(middleware, /BODY_TENANT_GUARD_EXEMPT_PATHS[\s\S]*'\/api\/moni\/production-records'/)
  assert.doesNotMatch(middleware, /BODY_TENANT_GUARD_EXEMPT_PATHS[\s\S]*'\/api\/moni\/raw-materials'/)
})

test('agent-chat rewrite and production PDF rewrite remain behind authentication', () => {
  const authIndex = middleware.indexOf('verifyMoniSession(request)')
  const chatIndex = middleware.indexOf("pathname === '/api/moni/agent-chat'")
  const pdfIndex = middleware.indexOf("/^\\/api\\/moni\\/production-records")
  assert.ok(authIndex >= 0)
  assert.ok(chatIndex > authIndex)
  assert.ok(pdfIndex > authIndex)
})
