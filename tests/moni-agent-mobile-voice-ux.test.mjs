import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')
const mobileChat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const runtimeGuard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')

test('mobile voice input renders a slow dense neutral continuous wave inside the composer', () => {
  assert.match(polish, /\[aria-label="음성 인식 상태"\]/)
  assert.match(polish, /background-image: url\("data:image\/svg\+xml/)
  assert.match(polish, /http%3A%2F%2Fwww\.w3\.org%2F2000%2Fsvg/)
  assert.match(polish, /stroke%3D%22%23798389%22/)
  assert.doesNotMatch(polish, /xmlns=['"]http:\/\//)
  assert.match(polish, /background-repeat: repeat-x/)
  assert.match(polish, /background-size: 180px 32px/)
  assert.match(polish, /animation: moniVoiceWaveDrift 8\.5s linear infinite/)
  assert.match(polish, /transform: scaleY\(calc\(\.38 \+ var\(--moni-voice-level, 0\)\)\)/)
  assert.match(polish, /\[aria-label="음성 인식 상태"\] > span \{\s*display: none !important;/)
  assert.doesNotMatch(polish, /moniVoiceTravel 2\.05s/)
})

test('mobile waveform remains driven by real microphone level rather than decorative-only motion', () => {
  assert.match(runtimeGuard, /getByteTimeDomainData\(samples\)/)
  assert.match(runtimeGuard, /Math\.sqrt\(energy \/ samples\.length\)/)
  assert.match(runtimeGuard, /--moni-voice-level/)
  assert.match(runtimeGuard, /updateVoiceWaveFromRms\(rms\)/)
})

test('voice start and confirm actions have distinct short audible cues', () => {
  assert.match(polish, /playVoiceCue\(kind: 'start' \| 'stop'\)/)
  assert.match(polish, /from: 600, to: 690/)
  assert.match(polish, /from: 760, to: 880/)
  assert.match(polish, /from: 760, to: 680/)
  assert.match(polish, /from: 560, to: 470/)
  assert.match(polish, /button\.getAttribute\('aria-label'\) === '음성으로 입력'/)
  assert.match(polish, /button\.textContent\?\.trim\(\) === '확인'/)
  assert.match(polish, /playVoiceCue\('start'\)/)
  assert.match(polish, /playVoiceCue\('stop'\)/)
})

test('voice confirmation still ends in editable composer text and does not auto-send', () => {
  assert.match(mobileChat, /function confirmVoiceInput\(\)/)
  assert.match(mobileChat, /recognition\.stop\(\)/)
  assert.match(mobileChat, /function finalizeVoiceDraft\(\)/)
  assert.match(mobileChat, /setInput\(combined\)/)
  assert.doesNotMatch(mobileChat, /function confirmVoiceInput\(\)[\s\S]{0,900}void send\(/)
})