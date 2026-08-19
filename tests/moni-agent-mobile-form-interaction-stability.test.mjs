import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const ext = readFileSync('src/components/MoniMobileExtendedFormCard.tsx', 'utf8')
const biz = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')
const raw = readFileSync('src/components/MoniMobileRawMaterialCardV2.tsx', 'utf8')
const intents = readFileSync('src/lib/moni/mobile-extended-intents.ts', 'utf8')

test('extended PC-form inputs retain stable element identity while typing', () => {
  assert.match(ext, /function renderInputField\(item: FieldSchema\)/)
  assert.doesNotMatch(ext, /function InputField\(/)
  assert.doesNotMatch(ext, /<InputField/)
})

test('all three mobile card families protect focused inputs from polling replacement', () => {
  for (const source of [ext, biz, raw]) {
    assert.match(source, /document\.activeElement/)
    assert.match(source, /cardHasFocus/)
  }
})

test('structured text business writes bypass visible THINKING and heartbeat state from the first turn', () => {
  assert.match(chat, /structuredRequest \? '\/api\/moni\/mobile-action-start' : '\/api\/moni\/agent-runtime'/)
  assert.doesNotMatch(chat, /structuredRequest && threadId \? '\/api\/moni\/mobile-action-start'/)
  assert.match(chat, /sending && !structuredSubmitting \? 'thinking'/)
  assert.match(chat, /sending && !structuredSubmitting \? <ThinkingIndicator/)
})

test('a new user turn suppresses stale unfinished cards until a newer card source arrives', () => {
  assert.match(chat, /moni:user-turn-start/)
  for (const source of [ext, biz, raw]) {
    assert.match(source, /suppressedCardSourceRef/)
    assert.match(source, /hideCardForNewTurn/)
  }
})

test('CREATE and UPDATE PC-form actions use correct confirmation wording', () => {
  assert.match(ext, /return '입력 내용 확인'/)
  assert.match(ext, /operation === 'UPDATE'\) return '변경 내용 확인'/)
  assert.match(intents, /'입력 내용 확인'/)
  assert.match(intents, /'변경 내용 확인'/)
})
