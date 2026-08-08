import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adapter = readFileSync('src/app/api/moni/chat/route.ts', 'utf8')
const legacy = readFileSync('src/app/api/chat/route.ts', 'utf8')
const adminDashboard = readFileSync('src/components/AdminDashboard.tsx', 'utf8')

test('admin dashboard compatibility route delegates to official Agent runtime', () => {
  assert.match(adapter, /POST as agentRuntimePOST/)
  assert.match(adapter, /\/api\/moni\/agent-runtime/)
  assert.match(adapter, /const response = await agentRuntimePOST\(forwarded\)/)
  assert.match(adapter, /reply: text\(payload\.text/)
  assert.match(adapter, /read_only: true/)
})

test('adapter preserves request cookies but replaces content framing for new JSON body', () => {
  assert.match(adapter, /new Headers\(request\.headers\)/)
  assert.match(adapter, /forwardedHeaders\.delete\('content-length'\)/)
  assert.match(adapter, /content-type', 'application\/json'/)
})

test('admin dashboard prefers compatibility route before retired legacy route', () => {
  assert.match(adminDashboard, /\['\/api\/moni\/chat', '\/api\/chat'\]/)
  assert.match(legacy, /status: 410/)
})

test('compatibility route cannot restore legacy model-driven writes', () => {
  assert.doesNotMatch(adapter, /parseAndExecuteActions/)
  assert.doesNotMatch(adapter, /OLLAMA/)
  assert.doesNotMatch(adapter, /from\(/)
  assert.doesNotMatch(adapter, /createMoniServiceRoleClient/)
})
