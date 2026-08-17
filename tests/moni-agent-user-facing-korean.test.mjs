import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const userFacing = readFileSync('src/lib/moni/agent/user-facing-text.ts', 'utf8')
const runtimeRoute = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')

test('MONI user-facing status values are localized to simple Korean', () => {
  assert.match(userFacing, /\[\/\\bPLANNED\\b\/gi, '계획'\]/)
  assert.match(userFacing, /\[\/\\bCOMPLETED\\b\/gi, '완료'\]/)
  assert.match(userFacing, /\[\/\\bCONFIRMED\\b\/gi, '확정'\]/)
  assert.match(userFacing, /\[\/\\bPENDING\\b\/gi, '대기'\]/)
  assert.match(userFacing, /\[\/\\bCANCELLED\\b\/gi, '취소'\]/)
  assert.match(userFacing, /\[\/\\bCANCELED\\b\/gi, '취소'\]/)
})

test('internal Asia timezone identifiers are stripped from visible MONI answers', () => {
  assert.match(userFacing, /Asia\\\/Seoul\|Asia\\\/Bangkok/)
  assert.match(userFacing, /replace\(\/\\s\*\\\(\(\?:Asia\\\/Seoul\|Asia\\\/Bangkok\)\\\)\/gi, ''\)/)
  assert.match(userFacing, /replace\(\/\\b\(\?:Asia\\\/Seoul\|Asia\\\/Bangkok\)\\b\/gi, ''\)/)
})

test('agent runtime sanitizes both restored and newly generated assistant answers', () => {
  assert.match(runtimeRoute, /content: sanitizeMoniUserFacingText\(removePdfCapabilityRefusal\(row\.content\)\)/)
  assert.match(runtimeRoute, /let finalText = sanitizeMoniUserFacingText\(result\.text\)/)
})
