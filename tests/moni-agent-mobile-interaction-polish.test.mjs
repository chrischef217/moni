import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const polish = readFileSync('src/components/MoniMobileInteractionPolish.tsx', 'utf8')
const heartbeat = readFileSync('src/components/MoniMobileHeartbeatBoost.tsx', 'utf8')
const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts the interaction polish before chat rendering', () => {
  assert.match(mobilePage, /import MoniMobileInteractionPolish from '@\/components\/MoniMobileInteractionPolish'/)
  assert.match(mobilePage, /<MoniMobileInteractionPolish \/>/)
})

test('legacy handwash lemon demo text is scrubbed from the local message cache', () => {
  assert.match(polish, /LEGACY_DEMO_PATTERN = \/핸드워시\\s\*레몬\/i/)
  assert.match(polish, /stripLegacyDemoLine/)
  assert.match(polish, /scrubLegacyDemoCache\(\)/)
  assert.match(polish, /useLayoutEffect/)
})

test('mobile header is compositor-pinned and scroll chaining is contained', () => {
  assert.match(polish, /position: sticky !important/)
  assert.match(polish, /top: 0 !important/)
  assert.match(polish, /z-index: 180 !important/)
  assert.match(polish, /transform: translate3d\(0, 0, 0\)/)
  assert.match(polish, /overscroll-behavior-y: contain/)
})

test('send button never uses the black busy treatment and disabled state is gray', () => {
  assert.match(polish, /button\[aria-label="전송"\]/)
  assert.match(polish, /background: #dce6ea !important/)
  assert.match(polish, /button\[aria-label="전송"\]:disabled/)
  assert.match(polish, /background: #e8ecee !important/)
  assert.doesNotMatch(polish, /#17191b/)
})

test('interaction polish owns ETA and progress only while heartbeat audio has one owner', () => {
  assert.match(polish, /THINKING_SELECTOR = '\.moni-live-state-thinking'/)
  assert.match(polish, /thinkingStage\(elapsedSeconds, activeEstimateSeconds\)/)
  assert.match(polish, /void refreshRuntimeProgress\(\)/)
  assert.doesNotMatch(polish, /createOscillator|heartbeatTimer|playHeartbeat/)
  assert.match(heartbeat, /function playCuteHeartbeat\(\)/)
  assert.match(heartbeat, /const STAGE_DELAY_MS/)
  assert.match(heartbeat, /createDynamicsCompressor/)
})
