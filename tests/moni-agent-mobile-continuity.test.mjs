import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const continuity = readFileSync('src/components/MoniMobileContinuityGuard.tsx', 'utf8')
const threadRoute = readFileSync('src/app/api/moni/mobile-thread/route.ts', 'utf8')
const actionStart = readFileSync('src/app/api/moni/mobile-action-start/route.ts', 'utf8')

test('mobile page mounts continuity guard before the chat component', () => {
  assert.match(page, /MoniMobileContinuityGuard/)
  assert.ok(page.indexOf('<MoniMobileContinuityGuard />') < page.indexOf('<MoniMobileChat />'))
})

test('first mobile turn bootstraps and persists a thread before the long agent request', () => {
  assert.match(continuity, /\/api\/moni\/mobile-thread/)
  assert.match(continuity, /window\.localStorage\.setItem\(THREAD_KEY, payload\.thread_id\)/)
  assert.match(continuity, /thread_id: threadId/)
  assert.match(threadRoute, /20220523011/)
  assert.match(threadRoute, /user_login_id: session\.loginId/)
  assert.match(threadRoute, /status', 'ACTIVE'/)
})

test('text business mutation turns end immediately in the structured card path without starting the agent runtime', () => {
  assert.match(continuity, /if \(intent && attachmentCount === 0\)/)
  assert.match(continuity, /\/api\/moni\/mobile-action-start/)
  assert.match(actionStart, /classifyMobileBusinessIntent/)
  assert.match(actionStart, /classifyMobileExtendedIntent/)
  assert.match(actionStart, /structured_action_card: true/)
  assert.doesNotMatch(actionStart, /runMoniConversationAgent/)
})

test('photo business mutations can hand control to the card as soon as the card is ready while analysis continues', () => {
  assert.match(continuity, /intent && attachmentCount > 0/)
  assert.match(continuity, /matchingActionCard/)
  assert.match(continuity, /Promise\.race/)
  assert.match(continuity, /structured_action_card: true/)
})

test('agent POST uses keepalive and recovers completed server messages after a mobile network disconnect', () => {
  assert.match(continuity, /keepalive: true/)
  assert.match(continuity, /recoverFinishedTurn/)
  assert.match(continuity, /RECOVERY_TIMEOUT_MS = 4 \* 60_000/)
  assert.match(continuity, /completedAssistant/)
  assert.match(continuity, /recovered_background_turn: true/)
  assert.doesNotMatch(continuity, /Failed to fetch/)
})

test('background recovery never resubmits the business command', () => {
  const helperStart = continuity.indexOf('async function loadThreadMessages')
  const helperEnd = continuity.indexOf('async function matchingActionCard', helperStart)
  const helperBody = continuity.slice(helperStart, helperEnd)
  const recoveryStart = continuity.indexOf('async function recoverFinishedTurn')
  const recoveryEnd = continuity.indexOf('export default function MoniMobileContinuityGuard', recoveryStart)
  const recoveryBody = continuity.slice(recoveryStart, recoveryEnd)
  assert.match(helperBody, /agent-runtime\?thread_id=/)
  assert.match(recoveryBody, /agent-status\?thread_id=/)
  assert.doesNotMatch(helperBody, /method:\s*'POST'/)
  assert.doesNotMatch(recoveryBody, /method:\s*'POST'/)
})

test('text card start preserves admin and active-run safety boundaries', () => {
  assert.match(actionStart, /session\.role !== 'admin'/)
  assert.match(actionStart, /status', 'RUNNING'/)
  assert.match(actionStart, /code: 'MONI_BUSY'/)
  assert.match(actionStart, /assertSafeUserRequest\(rawMessage\)/)
  assert.match(actionStart, /\.eq\('business_id', BUSINESS_ID\)/)
})
