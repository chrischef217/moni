import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/mobile-business-actions/route.ts', 'utf8')

test('mobile generic business execution uses one server-side duplicate-safe lock', () => {
  assert.doesNotMatch(page, /MoniMobileBusinessExecuteGuard/)
  assert.equal(existsSync('src/components/MoniMobileBusinessExecuteGuard.tsx'), false)
  assert.equal(existsSync('src/app/api/moni/mobile-business-execute/route.ts'), false)
  assert.match(route, /status: 'EXECUTING'/)
  assert.match(route, /\.eq\('status', 'PENDING'\)/)
  assert.match(route, /중복 실행하지 않습니다/)
})

test('production contracts keep their existing audited confirmation executors', () => {
  assert.match(route, /executeProductionPlanChange/)
  assert.match(route, /executeProductionOperation/)
})

test('generic execution records success, failure, and audit after the lock', () => {
  assert.match(route, /status: 'EXECUTED'/)
  assert.match(route, /status: 'FAILED'/)
  assert.match(route, /error_message/)
  assert.match(route, /moni_action_audit_log/)
  assert.match(route, /verification_basis: 'PC_API_SUCCESS'/)
})
