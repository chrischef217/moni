import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')
const runtimeGuard = readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')

test('MONI mobile composer grows to a capped height and preserves the active conversation', () => {
  assert.match(chat, /COMPOSER_MIN_HEIGHT = 42/)
  assert.match(chat, /COMPOSER_MAX_HEIGHT = 128/)
  assert.match(chat, /textarea\.style\.height = 'auto'/)
  assert.match(chat, /MESSAGE_CACHE_KEY/)
  assert.match(chat, /window\.localStorage\.setItem\(MESSAGE_CACHE_KEY/)
  assert.match(chat, /startNewConversation/)
  assert.match(chat, /새 대화/)
})

test('MONI replaces the native new-chat confirmation with an in-app reset dialog', () => {
  assert.match(polish, /RESET_CONFIRM_MESSAGE/)
  assert.match(polish, /setResetOpen\(true\)/)
  assert.match(polish, /role="dialog"/)
  assert.match(polish, /새 대화를 시작할까요\?/)
  assert.match(polish, /새 대화 시작/)
  assert.match(polish, /localStorage\.removeItem\(THREAD_KEY\)/)
  assert.match(polish, /localStorage\.removeItem\(MESSAGE_CACHE_KEY\)/)
  assert.match(polish, /업무 데이터와 평가·감사 기록은 삭제되지 않습니다/)
})

test('MONI voice bars travel left continuously and use the existing microphone analyser for amplitude', () => {
  assert.match(polish, /moniVoiceTravel/)
  assert.match(polish, /animation: moniVoiceTravel 1\.56s linear infinite/)
  assert.match(polish, /--moni-wave-h13/)
  assert.doesNotMatch(polish, /moniVoiceFlow/)
  assert.doesNotMatch(polish, /scaleY\(/)
  assert.match(runtimeGuard, /getByteTimeDomainData/)
  assert.match(runtimeGuard, /updateVoiceWaveFromRms\(rms\)/)
  assert.match(runtimeGuard, /--moni-wave-h\$\{index \+ 1\}/)
  assert.match(runtimeGuard, /navigator\.mediaDevices\.getUserMedia/)
})

test('MONI new-chat border stays subtly animated and character remains inside mobile safe area', () => {
  assert.match(polish, /moniNewChatBorderGlow/)
  assert.match(polish, /moni-mobile-character/)
  assert.match(polish, /margin-top: 4px/)
})
