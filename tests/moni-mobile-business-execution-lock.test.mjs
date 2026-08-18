import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const guard = readFileSync('src/components/MoniMobileBusinessExecuteGuard.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/mobile-business-execute/route.ts', 'utf8')

test('mobile generic business execution is routed through a duplicate-safe lock', () => {
  assert.match(page, /MoniMobileBusinessExecuteGuard/)
  assert.match(guard, /command === 'execute'/)
  assert.match(guard, /\/api\/moni\/mobile-business-execute/)
  assert.match(route, /status: 'EXECUTING'/)
  assert.match(route, /\.eq\('status', 'PENDING'\)/)
  assert.match(route, /이미 처리 중이거나 완료된 승인 건입니다\. 중복 실행하지 않습니다/)
})

test('production contracts keep their existing audited confirmation executor', () => {
  assert.match(route, /executeProductionPlanChange/)
  assert.match(route, /executeProductionOperation/)
})

test('generic execution marks success or failure after the lock', () => {
  assert.match(route, /status: 'EXECUTED'/)
  assert.match(route, /status: 'FAILED'/)
  assert.match(route, /error_message/)
})
