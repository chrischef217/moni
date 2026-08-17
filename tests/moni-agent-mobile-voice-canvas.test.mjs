import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const canvasWave = readFileSync('src/components/MoniMobileVoiceCanvasWave.tsx', 'utf8')
const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('mobile mounts a Canvas-based real-time voice waveform', () => {
  assert.match(mobilePage, /import MoniMobileVoiceCanvasWave from '@\/components\/MoniMobileVoiceCanvasWave'/)
  assert.match(mobilePage, /<MoniMobileVoiceCanvasWave \/>/)
  assert.match(canvasWave, /<canvas ref=\{canvasRef\} data-moni-voice-canvas/)
  assert.match(canvasWave, /createPortal\(<VoiceCanvas \/>, target\)/)
})

test('voice waveform records a dense slow history instead of reanimating the whole wave', () => {
  assert.match(canvasWave, /const HISTORY_SAMPLES = 144/)
  assert.match(canvasWave, /const SAMPLE_INTERVAL_MS = 58/)
  assert.match(canvasWave, /history\.shift\(\)/)
  assert.match(canvasWave, /history\.push\(signedSample\)/)
  assert.match(canvasWave, /fractionalShift/)
  assert.match(canvasWave, /window\.requestAnimationFrame\(draw\)/)
})

test('new waveform is driven by real microphone level and becomes blank during silence', () => {
  assert.match(canvasWave, /getPropertyValue\('--moni-voice-level'\)/)
  assert.match(canvasWave, /const SILENCE_THRESHOLD = 0\.14/)
  assert.match(canvasWave, /target === 0\) envelope \*= 0\.26/)
  assert.match(canvasWave, /envelope < 0\.018\) envelope = 0/)
  assert.match(canvasWave, /const active = Math\.abs\(point\.value\) > ACTIVE_EPSILON/)
})

test('wave depth scales strongly with voice intensity while old CSS loop is disabled', () => {
  assert.match(canvasWave, /Math\.pow\(Math\.min\(1, \(level - SILENCE_THRESHOLD\)/)
  assert.match(canvasWave, /const maxAmplitude = Math\.max\(12, height \* 0\.46\)/)
  assert.match(canvasWave, /height: 42px !important/)
  assert.match(canvasWave, /content: none !important/)
  assert.match(canvasWave, /animation: none !important/)
})
