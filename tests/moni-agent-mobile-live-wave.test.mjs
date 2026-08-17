import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const liveWave = readFileSync('src/components/MoniMobileLiveWave.tsx', 'utf8')
const heartbeat = readFileSync('src/components/MoniMobileHeartbeatBoost.tsx', 'utf8')
const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('MONI mobile mounts a persistent living status waveform through a React portal', () => {
  assert.match(mobilePage, /import MoniMobileLiveWave from '@\/components\/MoniMobileLiveWave'/)
  assert.match(mobilePage, /<MoniMobileLiveWave \/>/)
  assert.match(liveWave, /import \{ createPortal \} from 'react-dom'/)
  assert.match(liveWave, /const LIVE_WAVE_BAR_COUNT = 11/)
  assert.match(liveWave, /data-moni-live-wave/)
  assert.match(liveWave, /createPortal\(<LivingWaveMarkup \/>, target\)/)
})

test('THINKING waveform pulses from the same heartbeat event instead of an independent loop', () => {
  assert.match(heartbeat, /HEARTBEAT_EVENT = 'moni:heartbeat'/)
  assert.match(heartbeat, /window\.dispatchEvent\(new CustomEvent/)
  assert.match(liveWave, /HEARTBEAT_EVENT = 'moni:heartbeat'/)
  assert.match(liveWave, /window\.addEventListener\(HEARTBEAT_EVENT, pulseWave\)/)
  assert.match(liveWave, /moni-heartbeat-hit/)
  assert.match(liveWave, /@keyframes moniHeartbeatBarHit/)
  assert.doesNotMatch(liveWave, /@keyframes moniThinkingWave/)
})

test('overtime THINKING state turns red while the shared heartbeat accelerates', () => {
  assert.match(liveWave, /data-moni-heartbeat-overtime="true"/)
  assert.match(liveWave, /#dc2626/)
  assert.match(liveWave, /#ef4444/)
  assert.match(heartbeat, /normal: 1320/)
  assert.match(heartbeat, /grace: 1040/)
  assert.match(heartbeat, /apology: 500/)
})

test('listening waveform reacts to real microphone level already exposed by runtime guard', () => {
  assert.match(liveWave, /var\(--moni-voice-level, 0\)/)
  assert.match(liveWave, /calc\(\.72 \+ var\(--moni-voice-level, 0\) \* 1\.1\)/)
})

test('living waveform preserves accessibility reduced-motion behavior', () => {
  assert.match(liveWave, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(liveWave, /animation: none !important/)
})
