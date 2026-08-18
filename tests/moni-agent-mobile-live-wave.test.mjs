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

test('heartbeat keeps the approved 10x output while retaining a limiter and rounded waveform', () => {
  assert.match(heartbeat, /master\.gain\.value = 9\.8/)
  assert.match(heartbeat, /limiter\.threshold\.value = -5/)
  assert.match(heartbeat, /limiter\.ratio\.value = 12/)
  assert.match(heartbeat, /peak: 0\.90/)
  assert.match(heartbeat, /peak: 0\.74/)
  assert.match(heartbeat, /oscillator\.type = 'sine'/)
  assert.match(heartbeat, /harmonic\.type = 'triangle'/)
})

test('overtime THINKING state turns red while the shared heartbeat accelerates', () => {
  assert.match(liveWave, /data-moni-heartbeat-overtime="true"/)
  assert.match(liveWave, /#dc2626/)
  assert.match(liveWave, /#ef4444/)
  assert.match(heartbeat, /normal: 1320/)
  assert.match(heartbeat, /grace: 1040/)
  assert.match(heartbeat, /apology: 500/)
})

test('top-left MONI character changes expression and heat level with the exact heartbeat stage', () => {
  assert.match(liveWave, /root\.dataset\.moniHeartbeatStage = String\(detail\.stage\)/)
  assert.match(liveWave, /moni-heartbeat-character-hit/)
  assert.match(liveWave, /data-moni-heartbeat-stage="normal"/)
  assert.match(liveWave, /data-moni-heartbeat-stage="grace"/)
  assert.match(liveWave, /data-moni-heartbeat-stage="detail-1"/)
  assert.match(liveWave, /data-moni-heartbeat-stage="detail-2"/)
  assert.match(liveWave, /data-moni-heartbeat-stage="apology"/)
  assert.match(liveWave, /@keyframes moniThinkingEyes/)
  assert.match(liveWave, /@keyframes moniThinkingOverheat/)
  assert.match(liveWave, /@keyframes moniHeatPuffs/)
  assert.match(liveWave, /@keyframes moniOverheatRing/)
  assert.match(liveWave, /@keyframes moniCharacterHeartbeatHit/)
})

test('listening waveform reacts to real microphone level already exposed by runtime guard', () => {
  assert.match(liveWave, /var\(--moni-voice-level, 0\)/)
  assert.match(liveWave, /calc\(\.72 \+ var\(--moni-voice-level, 0\) \* 1\.1\)/)
})

test('living waveform preserves accessibility reduced-motion behavior', () => {
  assert.match(liveWave, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(liveWave, /animation: none !important/)
})
