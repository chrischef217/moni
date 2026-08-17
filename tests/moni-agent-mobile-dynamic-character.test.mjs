import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const motion = readFileSync('src/components/MoniMobileThinkingCharacterMotion.tsx', 'utf8')
const motionPatch = readFileSync('src/components/MoniMobileThinkingCharacterMotionPatch.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts the dynamic thinking character after the shared heartbeat waveform', () => {
  assert.match(page, /import MoniMobileThinkingCharacterMotion from '@\/components\/MoniMobileThinkingCharacterMotion'/)
  assert.match(page, /<MoniMobileLiveWave \/>\s*<MoniMobileThinkingCharacterMotion \/>\s*<MoniMobileThinkingCharacterMotionPatch \/>/)
})

test('thinking character body color visibly progresses from blue to purple-orange to bright red', () => {
  assert.match(motion, /#0b2d50/)
  assert.match(motion, /#26365f/)
  assert.match(motion, /#66405c/)
  assert.match(motion, /#8b343f/)
  assert.match(motion, /#df263a/)
})

test('thinking face changes by stage and becomes sweaty under load', () => {
  assert.match(motion, /moniThinkingEyeScan/)
  assert.match(motion, /moni-thinking-sweat-one/)
  assert.match(motion, /moni-thinking-sweat-two/)
  assert.match(motion, /moni-thinking-sweat-three/)
  assert.match(motion, /detail-1.*moni-thinking-sweat-one/s)
  assert.match(motion, /apology.*moni-thinking-sweat/s)
  assert.match(motion, /moni-mobile-eye::after/)
})

test('real heartbeat drives randomized movement and occasional full 360-degree spins', () => {
  assert.match(motion, /HEARTBEAT_EVENT = 'moni:heartbeat'/)
  assert.match(motion, /randomBetween\(-2\.2, 2\.2\)/)
  assert.match(motion, /--moni-hop-x/)
  assert.match(motion, /beatCount % 8 === 0/)
  assert.match(motion, /beatCount % 5 === 0/)
  assert.match(motion, /moni-thinking-spin/)
  assert.match(motion, /rotate\(360deg\)/)
  assert.match(motionPatch, /@keyframes moniRandomHeartbeatBurst/)
})

test('dynamic character still honors reduced-motion accessibility', () => {
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(motion, /animation: none !important/)
})
