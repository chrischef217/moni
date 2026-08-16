import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const guard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')

test('bounded read-only MONI runs abort server-side without applying the timeout to general/write paths', () => {
  assert.match(runtime, /BOUNDED_READ_TIMEOUT_MS = 45_000/)
  assert.match(runtime, /if \(!boundedReadPath\)/)
  assert.match(runtime, /const controller = new AbortController\(\)/)
  assert.match(runtime, /signal: controller\.signal/)
  assert.match(runtime, /MONI_TIMEOUT:/)
  assert.match(runtime, /bounded_read_timeout_ms/)
  assert.match(runtime, /쓰기 실행에는 이 제한을 적용하지 않습니다/)
})

test('mobile watchdog is slower than the server timeout and reuses existing input-restore flow', () => {
  assert.match(guard, /BOUNDED_READ_CLIENT_TIMEOUT_MS = 55_000/)
  assert.match(guard, /isBoundedReadQuestion/)
  assert.match(guard, /mutationObject/)
  assert.match(guard, /mutationAction/)
  assert.match(guard, /controller\.abort\(\)/)
  assert.match(guard, /code: 'MONI_BUSY'/)
  assert.match(guard, /질문은 입력창에 복구/)
  assert.match(guard, /window\.fetch = originalFetch/)
})
