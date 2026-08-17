import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const polish = readFileSync('src/components/MoniMobileInteractionPolish.tsx', 'utf8')
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

test('thinking state loops a two-pulse adaptive heartbeat and stops on state exit', () => {
  assert.match(polish, /THINKING_SELECTOR = '\.moni-live-state-thinking'/)
  assert.match(polish, /HEARTBEAT_LEAD_MS = 260/)
  assert.match(polish, /heartbeatDelayMs\(heartbeatStage\)/)
  assert.match(polish, /oscillator\.type = 'triangle'/)
  assert.match(polish, /const pulses = \[/)
  assert.match(polish, /peak: 0\.57/)
  assert.match(polish, /peak: 0\.435/)
  assert.match(polish, /heartbeatTimer = window\.setTimeout/)
  assert.match(polish, /function stopHeartbeat\(\)/)
  assert.match(polish, /attributeFilter: \['class'\]/)
})
