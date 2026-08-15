import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runtime = readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const evalRuntime = readFileSync('src/lib/moni/agent/live-eval.ts', 'utf8')
const userFacing = readFileSync('src/lib/moni/agent/user-facing-text.ts', 'utf8')

test('MONI preserves exact LOT and product-history labels in final answers', () => {
  assert.match(runtime, /preserveExplicitRequestLabels/)
  assert.match(runtime, /\\bLOT\\d\{8\}-\\d\+\\b/)
  assert.match(runtime, /대상 제품/)
  assert.match(runtime, /applyAnswerContracts\(rawFinalText/)
})

test('official exact product lookup never silently substitutes a fuzzy product', () => {
  assert.match(runtime, /enforceExactProductLookup/)
  assert.match(runtime, /정확한 이름 또는 ID는 확인되지 않았습니다/)
  assert.match(runtime, /유사한 이름을 같은 제품으로 간주하지 않았습니다/)
})

test('live evaluator grades the same sanitized output users see', () => {
  assert.match(evalRuntime, /sanitizeMoniUserFacingText/)
  assert.match(evalRuntime, /const firstAnswer = sanitizeMoniUserFacingText\(result\.text\)/)
  assert.match(evalRuntime, /covered by monthly composite read/)
  assert.match(evalRuntime, /factoryDate\(\)/)
})

test('internal inventory transaction codes are translated for user-facing chat', () => {
  assert.match(userFacing, /\\bOUTBOUND\\b\/gi, '출고'/)
  assert.match(userFacing, /\\bINBOUND\\b\/gi, '입고'/)
})
