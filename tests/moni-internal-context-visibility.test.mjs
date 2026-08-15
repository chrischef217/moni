import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const userFacing = readFileSync('src/lib/moni/agent/user-facing-text.ts', 'utf8')
const runtimeGuard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/202608150001_guard_moni_internal_context_role.sql', 'utf8')

test('MONI internal PMO/shared context is never rendered as user-facing assistant text', () => {
  assert.match(userFacing, /isMoniInternalContextMessage/)
  assert.match(userFacing, /MONI_SHARED_CONTEXT_START/)
  assert.match(userFacing, /PMO 승인 공용 프로젝트 문맥/)
  assert.match(userFacing, /if \(isMoniInternalContextMessage\(raw\)\) return ''/)
})

test('mobile removes leaked internal context from stale local cache before chat restore', () => {
  assert.match(runtimeGuard, /scrubLeakedInternalContextCache/)
  assert.match(runtimeGuard, /MESSAGE_CACHE_KEY/)
  assert.match(runtimeGuard, /MONI_SHARED_CONTEXT_START/)
  assert.match(runtimeGuard, /localStorage\.setItem\(MESSAGE_CACHE_KEY, JSON\.stringify\(cleaned\)\)/)
  assert.match(runtimeGuard, /useLayoutEffect/)
})

test('database forces PMO context bridge messages to system role', () => {
  assert.match(migration, /moni_force_internal_context_system_role/)
  assert.match(migration, /pmo-context-bridge/)
  assert.match(migration, /new\.role := 'system'/)
  assert.match(migration, /before insert or update of role, content, provider, model/)
  assert.match(migration, /where role = 'assistant'/)
})
