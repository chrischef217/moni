import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const recovery = fs.readFileSync('src/components/MoniMobileBusyRecovery.tsx', 'utf8')
const runtime = fs.readFileSync('src/app/api/moni/agent-runtime/base-route.ts', 'utf8')
const page = fs.readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts active-run recovery before the chat request surface', () => {
  assert.match(page, /import MoniMobileBusyRecovery from '@\/components\/MoniMobileBusyRecovery'/)
  assert.match(page, /<MoniMobileThinkingCopyFix \/>\s*<MoniMobileBusyRecovery \/>/)
  assert.match(page, /<MoniMobileBusyRecovery \/>[\s\S]*<MoniMobileChat \/>/)
})

test('same-question 409 recovery waits for the already running turn instead of submitting again', () => {
  assert.match(recovery, /response\.status !== 409/)
  assert.match(recovery, /busy\.code !== 'MONI_BUSY'/)
  assert.match(recovery, /latestUserQuestion\(initialMessages\) !== post\.question/)
  assert.match(recovery, /while \(Date\.now\(\) < deadline\)/)
  assert.match(recovery, /completedAnswerAfterLatestUser/)
  assert.match(recovery, /recovered_active_run: true/)
  const originalRequestCalls = recovery.match(/originalFetch\(input, init\)/g) || []
  assert.equal(originalRequestCalls.length, 2, 'one pass-through branch plus exactly one submitted agent request are allowed')
  assert.match(recovery, /const response = await originalFetch\(input, init\)/)
})

test('different concurrent questions remain blocked by the server approval-safe busy guard', () => {
  assert.match(recovery, /if \(latestUserQuestion\(initialMessages\) !== post\.question\) return response/)
  assert.match(runtime, /const activeRun = await activeRunForThread/)
  assert.match(runtime, /if \(activeRun\) return busyResponse\(\)/)
  assert.match(runtime, /MONI_BUSY/)
})
