import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const liveWave = readFileSync('src/components/MoniMobileLiveWave.tsx', 'utf8')
const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('MONI mobile mounts a persistent living status waveform', () => {
  assert.match(mobilePage, /import MoniMobileLiveWave from '@\/components\/MoniMobileLiveWave'/)
  assert.match(mobilePage, /<MoniMobileLiveWave \/>/)
  assert.match(liveWave, /const LIVE_WAVE_BAR_COUNT = 11/)
  assert.match(liveWave, /wave\.dataset\.moniLiveWave = 'true'/)
  assert.match(liveWave, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/)
})

test('living waveform changes behavior for live, thinking, listening, and issue states', () => {
  assert.match(liveWave, /moni-live-state-thinking \.moni-live-wave-bar/)
  assert.match(liveWave, /moni-live-state-listening \.moni-live-wave-bar/)
  assert.match(liveWave, /moni-live-state-issue \.moni-live-wave-bar/)
  assert.match(liveWave, /@keyframes moniLivingWave/)
  assert.match(liveWave, /@keyframes moniThinkingWave/)
  assert.match(liveWave, /@keyframes moniListeningWave/)
  assert.match(liveWave, /@keyframes moniIssueWave/)
})

test('listening waveform reacts to real microphone level already exposed by runtime guard', () => {
  assert.match(liveWave, /var\(--moni-voice-level, 0\)/)
  assert.match(liveWave, /calc\(\.72 \+ var\(--moni-voice-level, 0\) \* 1\.1\)/)
})

test('living waveform preserves accessibility reduced-motion behavior', () => {
  assert.match(liveWave, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(liveWave, /animation: none !important/)
})
