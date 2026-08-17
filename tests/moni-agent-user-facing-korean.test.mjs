import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const userFacing = readFileSync('src/lib/moni/agent/user-facing-text.ts', 'utf8')
const runtimeRoute = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')

test('MONI user-facing status values are localized to simple Korean', () => {
  assert.ok(userFacing.includes("[/\\bPLANNED\\b/gi, '계획']"))
  assert.ok(userFacing.includes("[/\\bCOMPLETED\\b/gi, '완료']"))
  assert.ok(userFacing.includes("[/\\bCONFIRMED\\b/gi, '확정']"))
  assert.ok(userFacing.includes("[/\\bPENDING\\b/gi, '대기']"))
  assert.ok(userFacing.includes("[/\\bCANCELLED\\b/gi, '취소']"))
  assert.ok(userFacing.includes("[/\\bCANCELED\\b/gi, '취소']"))
})

test('internal Asia timezone identifiers are stripped from visible MONI answers', () => {
  assert.ok(userFacing.includes(".replace(/\\s*\\((?:Asia\\/Seoul|Asia\\/Bangkok)\\)/gi, '')"))
  assert.ok(userFacing.includes(".replace(/\\b(?:Asia\\/Seoul|Asia\\/Bangkok)\\b/gi, '')"))
})

test('agent runtime sanitizes both restored and newly generated assistant answers', () => {
  assert.ok(runtimeRoute.includes('content: sanitizeMoniUserFacingText(removePdfCapabilityRefusal(row.content))'))
  assert.ok(runtimeRoute.includes('let finalText = sanitizeMoniUserFacingText(result.text)'))
})
