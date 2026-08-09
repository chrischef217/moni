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

test('agent-chat rewrite and production PDF rewrite remain behind authentication', () => {
  const authIndex = middleware.indexOf('verifyMoniSession(request)')
  const chatIndex = middleware.indexOf("pathname === '/api/moni/agent-chat'")
  const pdfIndex = middleware.indexOf("/^\\/api\\/moni\\/production-records")
  assert.ok(authIndex >= 0)
  assert.ok(chatIndex > authIndex)
  assert.ok(pdfIndex > authIndex)
})
