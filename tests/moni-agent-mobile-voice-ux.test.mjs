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

test('all enabled chat buttons use reliable audible feedback and voice cues stay near maximum output', () => {
  assert.match(polish, /type UiCueKind = 'tap' \| 'start' \| 'stop' \| 'send'/)
  assert.match(polish, /async function playUiCue\(kind: UiCueKind\)/)
  assert.match(polish, /if \(context\.state !== 'running'\) await context\.resume\(\)/)
  assert.match(polish, /if \(context\.state !== 'running'\) return/)
  assert.match(polish, /from: 640, to: 760, duration: 0\.11, peak: 0\.96/)
  assert.match(polish, /from: 820, to: 980, duration: 0\.12, peak: 0\.96/)
  assert.match(polish, /from: 860, to: 700, duration: 0\.11, peak: 0\.96/)
  assert.match(polish, /from: 620, to: 440, duration: 0\.13, peak: 0\.96/)
  assert.match(polish, /oscillator\.type = 'square'/)
  assert.match(polish, /gain\.gain\.exponentialRampToValueAtTime\(note\.peak, startedAt \+ 0\.004\)/)
  assert.doesNotMatch(polish, /exponentialRampToValueAtTime\(0\.028,/)
  assert.match(polish, /const button = target\?\.closest\('button'\)/)
  assert.match(polish, /root\.addEventListener\('pointerdown', handleButtonPointerDown, true\)/)
  assert.match(polish, /void playUiCue\(kind\)/)
  assert.match(polish, /navigator\.vibrate\(kind === 'tap' \? 8 : 14\)/)
})

test('voice start, confirm, and send receive distinct button sounds', () => {
  assert.match(polish, /button\.getAttribute\('aria-label'\) === '음성으로 입력'/)
  assert.match(polish, /kind = 'start'/)
  assert.match(polish, /button\.getAttribute\('aria-label'\) === '전송'/)
  assert.match(polish, /kind = 'send'/)
  assert.match(polish, /button\.textContent\?\.trim\(\) === '확인'/)
  assert.match(polish, /kind = 'stop'/)
})

test('voice confirmation still ends in editable composer text and does not auto-send', () => {
  assert.match(mobileChat, /function confirmVoiceInput\(\)/)
  assert.match(mobileChat, /recognition\.stop\(\)/)
  assert.match(mobileChat, /function finalizeVoiceDraft\(\)/)
  assert.match(mobileChat, /setInput\(combined\)/)
  assert.doesNotMatch(mobileChat, /function confirmVoiceInput\(\)[\s\S]{0,900}void send\(/)
})
