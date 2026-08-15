import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')

test('MONI mobile composer grows to a capped height and preserves the active conversation', () => {
  assert.match(chat, /COMPOSER_MIN_HEIGHT = 42/)
  assert.match(chat, /COMPOSER_MAX_HEIGHT = 128/)
  assert.match(chat, /textarea\.style\.height = 'auto'/)
  assert.match(chat, /MESSAGE_CACHE_KEY/)
  assert.match(chat, /window\.localStorage\.setItem\(MESSAGE_CACHE_KEY/)
  assert.match(chat, /startNewConversation/)
  assert.match(chat, /새 대화/)
})

test('MONI mobile voice waveform flows and the new-chat border stays subtly animated', () => {
  assert.match(polish, /aria-label=\\"음성 인식 상태\\"/)
  assert.match(polish, /moniVoiceFlow/)
  assert.match(polish, /mask-image: linear-gradient/)
  assert.match(polish, /moniNewChatBorderGlow/)
  assert.match(polish, /moni-mobile-character/)
})
