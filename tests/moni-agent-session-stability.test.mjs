import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const session = readFileSync('src/lib/moni/agent/supabase-session.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const production = readFileSync('src/lib/moni/agent/tools/production.ts', 'utf8')
const commercial = readFileSync('src/lib/moni/agent/tools/commercial.ts', 'utf8')
const inventory = readFileSync('src/lib/moni/agent/tools/inventory.ts', 'utf8')
const route = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const component = readFileSync('src/components/GlobalMoniAgent.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260804193000_moni_agent_request_leases.sql', 'utf8')

test('session replay excludes historical tool protocol items', () => {
  assert.match(session, /function canonicalConversationItem/)
  assert.match(session, /value\.type !== 'message'/)
  assert.match(session, /selectReplaySafeSessionItems/)
  assert.match(session, /MAX_SESSION_ROWS = 500/)
  assert.doesNotMatch(session, /return \(data \?\? \[\]\)\.reverse\(\)\.map/)
})

test('nullable optional tool inputs are compacted before execution', () => {
  assert.match(production, /\.nullish\(\)/)
  assert.match(commercial, /\.nullish\(\)/)
  assert.match(inventory, /\.nullish\(\)/)
  assert.match(registry, /function compactToolArguments/)
  assert.match(registry, /value !== null && value !== undefined && value !== ''/)
  assert.match(registry, /compactToolArguments\(args as Record<string, unknown>\)/)
})

test('agent runtime enforces thread lease and idempotent requests', () => {
  assert.match(route, /client_request_id\?: string/)
  assert.match(route, /claimAgentRequest/)
  assert.match(route, /finishAgentRequest/)
  assert.match(route, /code: 'THREAD_BUSY'/)
  assert.match(route, /idempotent_replay: true/)
  assert.match(route, /status: 'COMPLETED'/)
  assert.match(route, /status: 'FAILED'/)
})

test('frontend blocks same-tick duplicate submissions and sends request id', () => {
  assert.match(component, /const sendingRef = useRef\(false\)/)
  assert.match(component, /sendingRef\.current \|\| uploading/)
  assert.match(component, /crypto\.randomUUID\(\)/)
  assert.match(component, /client_request_id: clientRequestId/)
  assert.match(component, /payload\.code === 'THREAD_BUSY'/)
})

test('request lease migration is service-role only and atomic', () => {
  assert.match(migration, /create table if not exists public\.moni_ai_agent_requests/)
  assert.match(migration, /where status = 'RUNNING'/)
  assert.match(migration, /create or replace function public\.moni_claim_agent_request/)
  assert.match(migration, /exception when unique_violation/)
  assert.match(migration, /create or replace function public\.moni_finish_agent_request/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/i)
  assert.match(migration, /grant execute .* to service_role/i)
})
